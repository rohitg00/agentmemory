// `agentmemory remove` — destruction plan.
//
// Generating the plan is a pure function of the on-disk state (which files
// exist, whether ~/.local/bin/iii matches the version we installed, the
// connect-manifest contents). All side effects live in src/cli.ts; this
// module owns only the planning logic so it's unit-testable without
// touching $HOME.
//
// CLI surface:
//   agentmemory remove                 # interactive, double-confirms
//   agentmemory remove --force         # skip confirmations
//   agentmemory remove --keep-data     # remove binaries+symlinks, keep memory data

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type RemovePlanItem = {
  /** Stable id, used in tests and CLI output. */
  id: string;
  /** Human-readable description of the action. */
  description: string;
  /** Absolute path being acted on (or null for non-fs actions). */
  path: string | null;
  /** Whether this item is `ask-again` even with --force (e.g. memory data). */
  alwaysAsk: boolean;
  /** Whether the file actually exists / action is meaningful. Plan-time hint. */
  applicable: boolean;
  /** Bytes (for files) or -1 (unknown / dir). Pure metadata. */
  sizeBytes: number;
};

export type RemoveOptions = {
  /** Skip confirmations (still asks separately about always-ask items). */
  force: boolean;
  /** Keep ~/.agentmemory/* user data; only remove binaries/symlinks. */
  keepData: boolean;
};

export type RemoveContext = {
  /** $HOME (so tests can sandbox). */
  home: string;
  /** Pinned engine version we expect ~/.local/bin/iii to match. */
  pinnedVersion: string;
  /**
   * `iii --version` result for ~/.local/bin/iii, or null if it's missing /
   * unreadable / not executable. Passed in so the plan module stays pure.
   */
  localBinIiiVersion: string | null;
  /** Loaded connect manifest, or null if missing. */
  connectManifest: ConnectManifest | null;
};

/**
 * The `agentmemory connect` PR writes this manifest at
 * ~/.agentmemory/backups/connect-manifest.json. We tolerate it being absent
 * (older versions, fresh installs) by treating it as `{ installed: [] }`.
 */
export type ConnectManifest = {
  installed: Array<{
    /** Target path the connect command wrote (symlink or file). */
    target: string;
    /** Agent label, e.g. "claude-code", "cursor". */
    agent?: string;
    /** Whether this was a symlink (true) or copy (false). */
    symlink?: boolean;
  }>;
};

export function pidfilePath(home: string): string {
  return join(home, ".agentmemory", "iii.pid");
}

export function enginePath(home: string): string {
  return join(home, ".agentmemory", "engine-state.json");
}

export function envPath(home: string): string {
  return join(home, ".agentmemory", ".env");
}

export function preferencesPath(home: string): string {
  return join(home, ".agentmemory", "preferences.json");
}

export function backupsDir(home: string): string {
  return join(home, ".agentmemory", "backups");
}

export function dataDir(home: string): string {
  return join(home, ".agentmemory", "data");
}

export function localBinIii(home: string): string {
  return join(home, ".local", "bin", "iii");
}

function safeSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
}

function pathExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Build the destruction plan for `agentmemory remove`.
 *
 * Plan items are returned regardless of whether `applicable` is true — the
 * caller can decide whether to skip-and-log or hide entirely. This keeps
 * the structure stable for tests.
 */
export function buildRemovePlan(
  ctx: RemoveContext,
  options: RemoveOptions,
): RemovePlanItem[] {
  const { home, pinnedVersion, localBinIiiVersion, connectManifest } = ctx;
  const plan: RemovePlanItem[] = [];

  plan.push({
    id: "stop-engine",
    description: "Stop running iii-engine (if any) cleanly",
    path: null,
    alwaysAsk: false,
    applicable: pathExists(pidfilePath(home)) || pathExists(enginePath(home)),
    sizeBytes: -1,
  });

  plan.push({
    id: "pidfile",
    description: "Delete pidfile",
    path: pidfilePath(home),
    alwaysAsk: false,
    applicable: pathExists(pidfilePath(home)),
    sizeBytes: safeSize(pidfilePath(home)),
  });

  plan.push({
    id: "engine-state",
    description: "Delete engine-state.json",
    path: enginePath(home),
    alwaysAsk: false,
    applicable: pathExists(enginePath(home)),
    sizeBytes: safeSize(enginePath(home)),
  });

  // .env holds the user's API keys. Always ask before deleting, even on
  // --force. --keep-data keeps it as part of "user data".
  plan.push({
    id: "env",
    description: "Delete .env (your API keys) — will ask separately",
    path: envPath(home),
    alwaysAsk: true,
    applicable: !options.keepData && pathExists(envPath(home)),
    sizeBytes: safeSize(envPath(home)),
  });

  plan.push({
    id: "preferences",
    description: "Delete preferences.json",
    path: preferencesPath(home),
    alwaysAsk: false,
    applicable: !options.keepData && pathExists(preferencesPath(home)),
    sizeBytes: safeSize(preferencesPath(home)),
  });

  plan.push({
    id: "backups",
    description: "Delete backups/ directory (connect manifest + backups)",
    path: backupsDir(home),
    alwaysAsk: false,
    applicable: !options.keepData && pathExists(backupsDir(home)),
    sizeBytes: -1,
  });

  // Iterate over connect-installed agent symlinks. We always honor these
  // (even with --keep-data, since they're outside ~/.agentmemory/).
  if (connectManifest?.installed?.length) {
    for (const entry of connectManifest.installed) {
      plan.push({
        id: `connect:${entry.target}`,
        description: `Remove agent connection (${entry.agent ?? "unknown"})`,
        path: entry.target,
        alwaysAsk: false,
        applicable: pathExists(entry.target),
        sizeBytes: safeSize(entry.target),
      });
    }
  }

  // ~/.local/bin/iii — only remove if it matches the version we installed.
  // Heuristic: spawn `iii --version`; if it returns pinnedVersion, safe to
  // remove. Otherwise mark `alwaysAsk` so the operator confirms explicitly.
  const localIii = localBinIii(home);
  if (pathExists(localIii)) {
    const matches = localBinIiiVersion === pinnedVersion;
    plan.push({
      id: "local-bin-iii",
      description: matches
        ? `Delete ~/.local/bin/iii (matches pinned v${pinnedVersion})`
        : `Delete ~/.local/bin/iii (version ${localBinIiiVersion ?? "unknown"} != pinned v${pinnedVersion}) — will ask`,
      path: localIii,
      alwaysAsk: !matches,
      applicable: true,
      sizeBytes: safeSize(localIii),
    });
  }

  // Memory data dir — ALWAYS asks separately, even with --force. Default
  // behavior is keep.
  plan.push({
    id: "data-dir",
    description:
      "Delete memory data directory (~/.agentmemory/data/) — will ask separately",
    path: dataDir(home),
    alwaysAsk: true,
    applicable: !options.keepData && pathExists(dataDir(home)),
    sizeBytes: -1,
  });

  return plan;
}

/** Format a plan for the user — one line per item. */
export function formatPlan(plan: RemovePlanItem[]): string {
  return plan
    .filter((p) => p.applicable)
    .map((p, i) => {
      const tag = p.alwaysAsk ? " [asks]" : "";
      const sz =
        p.sizeBytes > 0 ? ` (${humanBytes(p.sizeBytes)})` : "";
      return `  ${i + 1}. ${p.description}${tag}${sz}${p.path ? `\n     ${p.path}` : ""}`;
    })
    .join("\n");
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
