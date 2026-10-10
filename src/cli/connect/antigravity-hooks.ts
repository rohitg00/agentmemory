import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Merge engine for Antigravity CLI's `hooks.json`.
 *
 * Antigravity does not use the `{ hooks: { <Event>: [...] } }` envelope
 * that `codex-hooks.ts` handles for Claude Code, Codex and Droid. Its file
 * is a map of *named* hook bundles at the root:
 *
 *   {
 *     "<hook-name>": {
 *       "enabled": true,
 *       "PreToolUse": [ { "matcher": "…", "hooks": [ { type, command, timeout } ] } ],
 *       "Stop": [ { type, command, timeout } ]
 *     }
 *   }
 *
 * The two shapes are not a typo: tool events take the `{ matcher, hooks }`
 * wrapper, lifecycle events a flat handler list. Wrapping a lifecycle event
 * makes agy read the wrapper as a handler and reject the *whole file*
 * (`command hook must specify 'command'`), disabling every other bundle in
 * it too.
 *
 * Named bundles make the merge simpler than the Codex one: agentmemory owns
 * exactly the top-level keys whose commands point under
 * `<pluginRoot>/scripts/`, so a re-install drops those wholesale and re-adds
 * a fresh bundle, preserving user keys and their order.
 *
 * `${CLAUDE_PLUGIN_ROOT}` is resolved at install time — agy expands no env
 * vars and requires absolute paths. The resolved path must also be bare and
 * space-free: agy runs no shell and strips no quotes, so `node "<root>/…"`
 * looks for a module whose name starts with a quote, and a space truncates
 * the argument with no escaping form that works.
 *
 * Behaviour above verified against agy 1.0.15.
 * Source: antigravity.google/docs/hooks
 */

type HookHandler = { type: string; command: string; timeout?: number };
type HookEntry = { matcher?: string; hooks: HookHandler[] };
export type NamedHook = { enabled?: boolean } & Record<
  string,
  boolean | HookEntry[] | HookHandler[] | undefined
>;
export type AntigravityHookManifest = Record<string, NamedHook>;

/** Tool events: `[ { matcher, hooks: [...] } ]`. */
const TOOL_EVENT_KEYS = new Set(["PreToolUse", "PostToolUse"]);

/** Lifecycle events: a flat `[ { type, command } ]` handler list. */
const LIFECYCLE_EVENT_KEYS = new Set([
  "PreInvocation",
  "PostInvocation",
  "Stop",
]);

/** Events Antigravity dispatches. Anything else in a bundle is metadata. */
const EVENT_KEYS = new Set([...TOOL_EVENT_KEYS, ...LIFECYCLE_EVENT_KEYS]);

export function buildMergedAntigravityHooks(
  existing: AntigravityHookManifest | null,
  pluginRoot: string,
  manifestFile = "hooks.antigravity.json",
): AntigravityHookManifest {
  const ours = JSON.parse(
    readFileSync(join(pluginRoot, "hooks", manifestFile), "utf-8"),
  ) as AntigravityHookManifest;
  const scriptsDir = join(pluginRoot, "scripts");

  const out: AntigravityHookManifest = {};

  for (const [name, bundle] of Object.entries(existing ?? {})) {
    if (isAgentmemoryBundle(bundle, scriptsDir)) continue;
    out[name] = bundle;
  }

  for (const [name, bundle] of Object.entries(ours)) {
    out[name] = resolveBundle(bundle, pluginRoot);
  }

  return out;
}

/** True when `pluginRoot` cannot be expressed in an Antigravity `command`. */
export function containsSpaces(pluginRoot: string): boolean {
  return /\s/.test(pluginRoot);
}

/**
 * Every handler in a bundle, across both event shapes: an entry that carries
 * no `hooks` array is itself the handler.
 */
function allHandlers(bundle: NamedHook): HookHandler[] {
  const out: HookHandler[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    if (!EVENT_KEYS.has(key) || !Array.isArray(value)) continue;
    for (const entry of value as (HookEntry | HookHandler)[]) {
      if (!entry || typeof entry !== "object") continue;
      const nested = (entry as HookEntry).hooks;
      if (Array.isArray(nested)) out.push(...nested);
      else out.push(entry as HookHandler);
    }
  }
  return out;
}

function isAgentmemoryBundle(bundle: unknown, scriptsDir: string): boolean {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return false;
  }
  const normalizedScriptsDir = normalizePathForCommandMatch(scriptsDir);
  return allHandlers(bundle as NamedHook).some((handler) =>
    normalizePathForCommandMatch(handler?.command ?? "").includes(
      normalizedScriptsDir,
    ),
  );
}

function resolveBundle(bundle: NamedHook, pluginRoot: string): NamedHook {
  const out: NamedHook = {};
  for (const [key, value] of Object.entries(bundle)) {
    if (!EVENT_KEYS.has(key) || !Array.isArray(value)) {
      out[key] = value as boolean;
      continue;
    }
    if (LIFECYCLE_EVENT_KEYS.has(key)) {
      out[key] = (value as HookHandler[]).map((handler) =>
        resolveHandler(handler, pluginRoot),
      );
      continue;
    }
    out[key] = (value as HookEntry[]).map((entry) => {
      const next: HookEntry = {
        hooks: entry.hooks.map((handler) => resolveHandler(handler, pluginRoot)),
      };
      if (entry.matcher !== undefined) next.matcher = entry.matcher;
      return next;
    });
  }
  return out;
}

function resolveHandler(
  handler: HookHandler,
  pluginRoot: string,
): HookHandler {
  return {
    type: handler.type,
    // Replacer function, not a string: a plugin path containing `$$`, `$&`,
    // "$`" or `$'` would otherwise be read as a replacement pattern and
    // silently mangle the installed command.
    command: handler.command.replace(
      /\$\{CLAUDE_PLUGIN_ROOT\}/g,
      () => pluginRoot,
    ),
    ...(handler.timeout !== undefined && { timeout: handler.timeout }),
  };
}

function normalizePathForCommandMatch(value: string): string {
  return value.replace(/\\/g, "/");
}
