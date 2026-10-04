import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Separate from `codex-hooks.ts` because Klaat Code's hooks file is flat and
 * snake_case rather than the nested Claude-Code shape `buildMergedHooks`
 * handles. Loader: KlaatAI/klaatcode `src/screens/repl.ts`.
 *
 * Klaat Code never injects `${CLAUDE_PLUGIN_ROOT}` — the token is the shared
 * placeholder in every bundled manifest, resolved here so the written file
 * needs no env expansion.
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
