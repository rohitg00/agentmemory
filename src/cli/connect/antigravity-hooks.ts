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
 * The two events above are not a typo. Only the tool events (`PreToolUse`,
 * `PostToolUse`) take the `{ matcher, hooks }` wrapper; the lifecycle events
 * (`PreInvocation`, `PostInvocation`, `Stop`) take a flat handler list, since
 * there is no tool name to match on. Wrapping a lifecycle event makes agy
 * read the wrapper itself as a handler and reject the *whole file* with
 * `invalid hook "<name>": command hook must specify 'command'` — so one
 * mis-shaped event silently disables every other hook in the bundle,
 * including hooks other tools installed. Verified on agy 1.0.15.
 *
 * The naming is what makes the merge simpler than the Codex one: instead
 * of filtering entries event by event, agentmemory owns exactly the
 * top-level keys whose commands point under `<pluginRoot>/scripts/`, so a
 * re-install drops those keys wholesale and re-adds a fresh bundle. Keys
 * the user authored are copied through untouched, and key order is
 * preserved so re-running `connect` produces a minimal diff.
 *
 * As with the Codex manifest, `${CLAUDE_PLUGIN_ROOT}` is an internal
 * placeholder for the bundled `plugin/` dir — Antigravity does not expand
 * env vars in `command`, and its docs require absolute paths, so the token
 * is resolved at install time.
 *
 * `command` is *not* run through a shell, and agy does not strip quotes
 * before splitting it, so the resolved path must be bare: `node "<root>/…"`
 * makes node look for a module whose name literally starts with a double
 * quote. Verified against agy 1.0.15, which fails such a hook with
 * `Cannot find module 'C:\Users\…\.gemini\config\"C:\…\bridge.mjs"'` — note
 * both the quotes and that the relative resolution base is the hooks.json
 * directory, not the workspace. The flip side is that a plugin path
 * containing spaces cannot be expressed at all: quoted and unquoted both
 * fail, so `containsSpaces` lets the installer say so instead of writing a
 * bundle that silently never fires.
 *
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

/**
 * True when `pluginRoot` cannot be expressed in an Antigravity `command`.
 * agy splits the string itself without honouring quotes, so a space in the
 * path always truncates the argument — there is no escaping form that works.
 */
export function containsSpaces(pluginRoot: string): boolean {
  return /\s/.test(pluginRoot);
}

/**
 * Every handler in a bundle, flattened across both event shapes. A tool
 * event nests its handlers under `hooks`; a lifecycle event *is* the handler
 * list, so an entry that carries no `hooks` array is itself the handler.
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
