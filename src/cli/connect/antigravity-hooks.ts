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
 *       "PreToolUse": [ { "matcher": "…", "hooks": [ { type, command, timeout } ] } ]
 *     }
 *   }
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
 * Source: antigravity.google/docs/hooks
 */

type HookHandler = { type: string; command: string; timeout?: number };
type HookEntry = { matcher?: string; hooks: HookHandler[] };
export type NamedHook = { enabled?: boolean } & Record<
  string,
  boolean | HookEntry[] | undefined
>;
export type AntigravityHookManifest = Record<string, NamedHook>;

/** Events Antigravity dispatches. Anything else in a bundle is metadata. */
const EVENT_KEYS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PreInvocation",
  "PostInvocation",
  "Stop",
]);

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

function eventEntries(bundle: NamedHook): HookEntry[][] {
  return Object.entries(bundle)
    .filter(([key, value]) => EVENT_KEYS.has(key) && Array.isArray(value))
    .map(([, value]) => value as HookEntry[]);
}

function isAgentmemoryBundle(bundle: unknown, scriptsDir: string): boolean {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return false;
  }
  const normalizedScriptsDir = normalizePathForCommandMatch(scriptsDir);
  return eventEntries(bundle as NamedHook).some((entries) =>
    entries.some((entry) =>
      (entry?.hooks ?? []).some((handler) =>
        normalizePathForCommandMatch(handler?.command ?? "").includes(
          normalizedScriptsDir,
        ),
      ),
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
    out[key] = (value as HookEntry[]).map((entry) => {
      const next: HookEntry = {
        hooks: entry.hooks.map((handler) => ({
          type: handler.type,
          command: handler.command.replace(
            /\$\{CLAUDE_PLUGIN_ROOT\}/g,
            pluginRoot,
          ),
          ...(handler.timeout !== undefined && { timeout: handler.timeout }),
        })),
      };
      if (entry.matcher !== undefined) next.matcher = entry.matcher;
      return next;
    });
  }
  return out;
}

function normalizePathForCommandMatch(value: string): string {
  return value.replace(/\\/g, "/");
}
