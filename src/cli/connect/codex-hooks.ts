import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Workaround for openai/codex#16430 — Codex Desktop does not dispatch
 * plugin-local `hooks.json` even though both `CodexHooks` and `PluginHooks`
 * feature flags are stable + default-enabled in
 * `codex-rs/features/src/lib.rs`. Until upstream fixes plugin-scope
 * dispatch, the same hook commands can be mirrored into the global
 * `~/.codex/hooks.json`, which is loaded reliably.
 *
 * This module builds that mirror, with `${CLAUDE_PLUGIN_ROOT}` resolved to
 * the bundled `plugin/` directory so the user-scope file does not depend
 * on env-var expansion (Codex only injects `CLAUDE_PLUGIN_ROOT` for
 * plugin-scope hooks).
 *
 * Identification on re-install: every command we write contains the
 * resolved `<pluginRoot>/scripts/` prefix, so subsequent installs can
 * strip our entries and re-add cleanly without touching the user's other
 * hook entries.
 */

type HookHandler = { type: string; command: string };
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
 *   1. Strip any entry from `existing` whose first hook command points
 *      under `<pluginRoot>/scripts/`. This lets us re-install idempotently
 *      without leaving stale references.
 *   2. Append fresh entries from the bundled Codex manifest with
 *      `${CLAUDE_PLUGIN_ROOT}` rewritten to the absolute plugin path.
 *      Matcher values from the bundled manifest are preserved so PreToolUse
 *      event routing keeps working.
 */
export function buildMergedHooks(
  existing: HookManifest | null,
  pluginRoot: string,
): HookManifest {
  const codexManifestPath = join(pluginRoot, "hooks", "hooks.codex.json");
  const ours = JSON.parse(readFileSync(codexManifestPath, "utf-8")) as HookManifest;
  const scriptsDir = join(pluginRoot, "scripts");

  const out: HookManifest = { hooks: {} };

  if (existing?.hooks) {
    for (const [event, entries] of Object.entries(existing.hooks)) {
      const kept = entries.filter((entry) => !isAgentmemoryEntry(entry, scriptsDir));
      if (kept.length > 0) out.hooks[event] = kept;
    }
  }

  for (const [event, entries] of Object.entries(ours.hooks)) {
    const resolvedEntries: HookEntry[] = entries.map((entry) => {
      const next: HookEntry = {
        hooks: entry.hooks.map((handler) => ({
          type: handler.type,
          command: handler.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot),
        })),
      };
      if (entry.matcher !== undefined) next.matcher = entry.matcher;
      return next;
    });
    out.hooks[event] = [...(out.hooks[event] ?? []), ...resolvedEntries];
  }

  return out;
}

function isAgentmemoryEntry(entry: HookEntry, scriptsDir: string): boolean {
  return entry.hooks.some((handler) => handler.command.includes(scriptsDir));
}
