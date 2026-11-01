import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type HookHandler = { type: string; command?: string; [key: string]: unknown };
type HookEntry = { matcher?: string; hooks: HookHandler[] };
export type HookManifest = { hooks: Record<string, HookEntry[]> };

/**
 * Locate the bundled `plugin/` directory at runtime. Walks up from the
 * module's own location looking for `plugin/scripts/` + `plugin/hooks/`,
 * both shipped via the npm `files` field. Works for both `dist/cli.mjs`
 * (bundled) and `src/cli/connect/codex-hooks.ts` (dev) layouts.
 */
export function findPluginRoot(startUrl: string = import.meta.url): string {
  const here = dirname(fileURLToPath(startUrl));
  let dir = here;
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "plugin", "scripts")) &&
      existsSync(join(dir, "plugin", "hooks"))
    ) {
      return resolve(join(dir, "plugin"));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `agentmemory: could not locate bundled plugin/ directory (searched up from ${here})`,
  );
}

/**
 * Build the merged hooks.json content.
 *
 *   1. Strip every handler in `existing` whose command points under
 *      `<pluginRoot>/scripts/`, and an entry only once nothing else is left
 *      in it. This lets us re-install idempotently without leaving stale
 *      references or dropping the user's own handlers.
 *   2. Append fresh entries from the bundled Codex manifest with
 *      `${CLAUDE_PLUGIN_ROOT}` rewritten to the absolute plugin path.
 *      Matchers and the other handler fields from the bundled manifest are
 *      preserved so PreToolUse event routing keeps working.
 */
export function buildMergedHooks(
  existing: HookManifest | null,
  pluginRoot: string,
  manifestFile = "hooks.codex.json",
): HookManifest {
  const bundledManifestPath = join(pluginRoot, "hooks", manifestFile);
  const ours = JSON.parse(readFileSync(bundledManifestPath, "utf-8")) as HookManifest;
  const scriptsDir = join(pluginRoot, "scripts");

  const out: HookManifest = { hooks: {} };

  if (existing?.hooks) {
    for (const [event, entries] of Object.entries(existing.hooks)) {
      const kept = entries.flatMap((entry) => {
        const hooks = entry.hooks.filter(
          (handler) => !isAgentmemoryHandler(handler, scriptsDir),
        );
        if (hooks.length === entry.hooks.length) return [entry];
        return hooks.length > 0 ? [{ ...entry, hooks }] : [];
      });
      if (kept.length > 0) out.hooks[event] = kept;
    }
  }

  for (const [event, entries] of Object.entries(ours.hooks)) {
    const resolvedEntries: HookEntry[] = entries.map((entry) => {
      const next: HookEntry = {
        hooks: entry.hooks.map((handler) => ({
          ...handler,
          command: handler.command?.replace(
            /\$\{CLAUDE_PLUGIN_ROOT\}/g,
            () => pluginRoot,
          ),
        })),
      };
      if (entry.matcher !== undefined) next.matcher = entry.matcher;
      return next;
    });
    out.hooks[event] = [...(out.hooks[event] ?? []), ...resolvedEntries];
  }

  return out;
}

function isAgentmemoryHandler(handler: HookHandler, scriptsDir: string): boolean {
  return (
    typeof handler.command === "string" &&
    normalizePathForCommandMatch(handler.command).includes(
      normalizePathForCommandMatch(scriptsDir),
    )
  );
}

function normalizePathForCommandMatch(value: string): string {
  return value.replace(/\\/g, "/");
}
