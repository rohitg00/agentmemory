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
import { runtimeConfigPath } from "./engine-launch.js";

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
  /** Keep engine ownership metadata needed to recover retained Docker data. */
  preserveRuntimeState?: boolean;
};

export type RemoveContext = {
  /** $HOME (so tests can sandbox). */
  home: string;
  /** Resolved directory containing pidfiles and engine ownership state. */
  runtimeDir: string;
  /** Resolved iii-engine data directory selected for this invocation. */
  dataDir: string;
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

export function pidfilePath(runtimeDir: string): string {
  return join(runtimeDir, "iii.pid");
}

export function workerPidfilePath(runtimeDir: string): string {
  return join(runtimeDir, "worker.pid");
}

export function enginePath(runtimeDir: string): string {
  return join(runtimeDir, "engine-state.json");
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

// Platform-aware binary name. Windows requires the .exe suffix or the
// existsSync probe misses the installed binary.
function iiiBinFile(): string {
  return process.platform === "win32" ? "iii.exe" : "iii";
}

// Legacy install location. Older agentmemory versions wrote the pinned iii
// engine here. Kept so `agentmemory remove` can still clean up after them.
export function legacyLocalBinIii(home: string): string {
  return join(home, ".local", "bin", iiiBinFile());
}

// Current private install location. Lives under ~/.agentmemory/ so it
// stays isolated from any user-managed iii on PATH.
export function privateIiiBin(home: string): string {
  return join(home, ".agentmemory", "bin", iiiBinFile());
}

// Back-compat shim for any caller still importing the old name.
export const localBinIii = privateIiiBin;

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
  const {
    home,
    runtimeDir,
    dataDir,
    pinnedVersion,
    localBinIiiVersion,
    connectManifest,
  } = ctx;
  const plan: RemovePlanItem[] = [];

  plan.push({
    id: "stop-engine",
    description: "Stop running iii-engine (if any) cleanly",
    path: null,
    alwaysAsk: false,
    applicable:
      pathExists(pidfilePath(runtimeDir)) ||
      pathExists(workerPidfilePath(runtimeDir)) ||
      pathExists(enginePath(runtimeDir)),
    sizeBytes: -1,
  });

  plan.push({
    id: "pidfile",
    description: "Delete pidfile",
    path: pidfilePath(runtimeDir),
    alwaysAsk: false,
    applicable: pathExists(pidfilePath(runtimeDir)),
    sizeBytes: safeSize(pidfilePath(runtimeDir)),
  });

  plan.push({
    id: "worker-pidfile",
    description: "Delete worker pidfile",
    path: workerPidfilePath(runtimeDir),
    alwaysAsk: false,
    applicable: pathExists(workerPidfilePath(runtimeDir)),
    sizeBytes: safeSize(workerPidfilePath(runtimeDir)),
  });

  plan.push({
    id: "engine-state",
    description: "Delete engine-state.json",
    path: enginePath(runtimeDir),
    alwaysAsk: false,
    applicable:
      !options.preserveRuntimeState && pathExists(enginePath(runtimeDir)),
    sizeBytes: safeSize(enginePath(runtimeDir)),
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

  plan.push({
    id: "runtime-config",
    description: "Delete generated iii-config.runtime.yaml",
    path: runtimeConfigPath(dataDir),
    alwaysAsk: false,
    applicable: pathExists(runtimeConfigPath(dataDir)),
    sizeBytes: safeSize(runtimeConfigPath(dataDir)),
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

  // Private install (~/.agentmemory/bin/iii) — agentmemory owns this path,
  // so it's always safe to remove. The version check still gates the
  // legacy ~/.local/bin/iii path which may be a user-managed install we
  // don't own.
  const privIii = privateIiiBin(home);
  if (pathExists(privIii)) {
    plan.push({
      id: "private-bin-iii",
      description: `Delete ~/.agentmemory/bin/iii (agentmemory's private install)`,
      path: privIii,
      alwaysAsk: false,
      applicable: true,
      sizeBytes: safeSize(privIii),
    });
  }

  // Legacy ~/.local/bin/iii — only remove if it matches the version we
  // installed. Older agentmemory wrote here; newer versions don't but the
  // file may still be a leftover from a previous install.
  // Heuristic: spawn `iii --version`; if it returns pinnedVersion, safe to
  // remove. Otherwise mark `alwaysAsk` so the operator confirms explicitly.
  const legacyIii = legacyLocalBinIii(home);
  if (pathExists(legacyIii)) {
    const matches = localBinIiiVersion === pinnedVersion;
    plan.push({
      id: "legacy-local-bin-iii",
      description: matches
        ? `Delete ~/.local/bin/iii (legacy install location, matches pinned v${pinnedVersion})`
        : `Delete ~/.local/bin/iii (legacy install location, version ${localBinIiiVersion ?? "unknown"} != pinned v${pinnedVersion}) — will ask`,
      path: legacyIii,
      alwaysAsk: !matches,
      applicable: true,
      sizeBytes: safeSize(legacyIii),
    });
  }

  // Memory data dir — ALWAYS asks separately, even with --force. Default
  // behavior is keep.
  plan.push({
    id: "data-dir",
    description: `Delete memory data directory (${dataDir}) — will ask separately`,
    path: dataDir,
    alwaysAsk: true,
    applicable: !options.keepData && pathExists(dataDir),
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
