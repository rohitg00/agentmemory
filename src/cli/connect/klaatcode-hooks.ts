import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Merge engine for Klaat Code's hooks file (`~/.klaatai/hooks.json`).
 *
 * Klaat Code does not use the nested Claude-Code hook shape that
 * `codex-hooks.ts#buildMergedHooks` handles. Its config is flat — event
 * name maps straight to a list of entries, where an entry is either a bare
 * shell string (v1) or `{ command, matcher?, timeout? }` (v2):
 *
 *   { "session_start": ["cmd"],
 *     "before_tool": [{ "command": "…", "matcher": "^edit_file$", "timeout": 5 }] }
 *
 * Event names differ too (`session_start` / `before_tool` / … rather than
 * `SessionStart` / `PreToolUse` / …), so the bundled manifest for Klaat Code
 * is authored in its native shape and this module only resolves paths and
 * de-duplicates. See KlaatAI/klaatcode `src/screens/repl.ts` for the loader.
 *
 * The two guarantees match the Codex/Claude engine:
 *   1. `${CLAUDE_PLUGIN_ROOT}` is rewritten to the absolute bundled
 *      `plugin/` path, so the written file needs no env expansion (Klaat
 *      Code does not inject that variable — it is used here purely as the
 *      internal placeholder token every bundled manifest shares).
 *   2. Re-installs are idempotent: any pre-existing entry whose command
 *      points under `<pluginRoot>/scripts/` is stripped before ours are
 *      appended, so upgrading never leaves stale duplicates and never
 *      touches the user's own hooks.
 */

export type KlaatcodeHookEvent =
  | "before_tool"
  | "after_tool"
  | "before_message"
  | "after_message"
  | "session_start"
  | "session_end";

export type KlaatcodeHookEntry =
  | string
  | { command: string; matcher?: string; timeout?: number };

export type KlaatcodeHooksConfig = Partial<
  Record<KlaatcodeHookEvent, KlaatcodeHookEntry[]>
>;

function entryCommand(entry: KlaatcodeHookEntry): string {
  return typeof entry === "string" ? entry : entry.command;
}

function normalizePathForCommandMatch(value: string): string {
  return value.replace(/\\/g, "/");
}

function isAgentmemoryEntry(
  entry: KlaatcodeHookEntry,
  scriptsDir: string,
): boolean {
  return normalizePathForCommandMatch(entryCommand(entry)).includes(
    normalizePathForCommandMatch(scriptsDir),
  );
}

function resolveEntry(
  entry: KlaatcodeHookEntry,
  pluginRoot: string,
): KlaatcodeHookEntry {
  const command = entryCommand(entry).replace(
    /\$\{CLAUDE_PLUGIN_ROOT\}/g,
    pluginRoot,
  );
  if (typeof entry === "string") return command;
  const next: { command: string; matcher?: string; timeout?: number } = {
    command,
  };
  if (entry.matcher !== undefined) next.matcher = entry.matcher;
  if (entry.timeout !== undefined) next.timeout = entry.timeout;
  return next;
}

export function buildMergedKlaatcodeHooks(
  existing: KlaatcodeHooksConfig | null,
  pluginRoot: string,
  manifestFile = "hooks.klaatcode.json",
): KlaatcodeHooksConfig {
  const ours = JSON.parse(
    readFileSync(join(pluginRoot, "hooks", manifestFile), "utf-8"),
  ) as KlaatcodeHooksConfig;
  const scriptsDir = join(pluginRoot, "scripts");

  const out: KlaatcodeHooksConfig = {};

  if (existing) {
    for (const [event, entries] of Object.entries(existing) as [
      KlaatcodeHookEvent,
      KlaatcodeHookEntry[],
    ][]) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter(
        (entry) => !isAgentmemoryEntry(entry, scriptsDir),
      );
      if (kept.length > 0) out[event] = kept;
    }
  }

  for (const [event, entries] of Object.entries(ours) as [
    KlaatcodeHookEvent,
    KlaatcodeHookEntry[],
  ][]) {
    const resolved = entries.map((entry) => resolveEntry(entry, pluginRoot));
    out[event] = [...(out[event] ?? []), ...resolved];
  }

  return out;
}
