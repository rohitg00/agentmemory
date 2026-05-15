// JSON-backed CLI preferences.
//
// Lives at `~/.agentmemory/preferences.json`. The agentmemory daemon
// already owns `~/.agentmemory/.env`, `iii.pid`, `engine-state.json` —
// adding one more sibling here keeps the install-state surface in one
// place.
//
// All functions are synchronous, mirroring the pidfile / engine-state
// helpers in src/cli.ts. We never throw: read failures collapse to
// defaults; write failures swallow silently. Preferences are a UX
// nicety, not data — corrupting `iii.pid` matters, corrupting this
// file does not.
//
// Writes are atomic via tmp + rename so a Ctrl+C between the open and
// the final write can't leave a half-written JSON blob on disk that
// the next read would refuse to parse.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Prefs {
  schemaVersion: 1;
  // Most recently picked single agent (for "use last agent" style flows).
  lastAgent: string | null;
  // The full multi-select set from the last onboarding run.
  lastAgents: string[];
  // Most recently picked LLM provider; `null` means BM25-only mode.
  lastProvider: string | null;
  // Once true, splash is rendered only on first run / explicit --reset.
  // The first onboarding sets this to true so the second invocation
  // skips the banner.
  skipSplash: boolean;
  // Reserved for a later "do not nag me about the npx vs install
  // tradeoff" toggle. Kept on the schema so we don't have to bump
  // schemaVersion when we ship the flag.
  skipNpxHint: boolean;
  // Set to true when the user declines the "install agentmemory
  // globally?" prompt on first npx run. We never ask again on this
  // machine so the prompt stays a one-time DX nudge, not a nag.
  skipGlobalInstall: boolean;
  // Set to true when the user declines the "install iii console?"
  // prompt. iii console is first-class engine UI but optional at the
  // install step — once the user says no, we stop asking.
  skipConsoleInstall: boolean;
  // ISO timestamp of the first time onboarding completed. Set once,
  // never updated, so we can show "you joined agentmemory N days ago"
  // copy in /status later without keeping a separate file.
  firstRunAt: string | null;
}

const DEFAULTS: Prefs = {
  schemaVersion: 1,
  lastAgent: null,
  lastAgents: [],
  lastProvider: null,
  skipSplash: false,
  skipNpxHint: false,
  skipGlobalInstall: false,
  skipConsoleInstall: false,
  firstRunAt: null,
};

export function prefsDir(): string {
  return join(homedir(), ".agentmemory");
}

export function prefsPath(): string {
  return join(prefsDir(), "preferences.json");
}

export function readPrefs(): Prefs {
  try {
    if (!existsSync(prefsPath())) return { ...DEFAULTS };
    const raw = readFileSync(prefsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed, schemaVersion: 1 };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePrefs(p: Partial<Prefs>): void {
  try {
    const dir = prefsDir();
    mkdirSync(dir, { recursive: true });
    const current = readPrefs();
    const next: Prefs = { ...current, ...p, schemaVersion: 1 };
    const target = prefsPath();
    const tmp = target + ".tmp";
    // Open + write + fsync + rename ensures a Ctrl+C between any two
    // syscalls either leaves the old file intact (rename is atomic on
    // POSIX) or leaves only a .tmp behind that the next writePrefs
    // overwrites. We never end up with a truncated `preferences.json`
    // that readPrefs would have to discard.
    const fd = openSync(tmp, "w", 0o600);
    try {
      writeSync(fd, JSON.stringify(next, null, 2) + "\n");
      try {
        fsyncSync(fd);
      } catch {
        // fsync isn't available on every filesystem (e.g. some Docker
        // overlays). The rename below is still atomic; we just can't
        // guarantee durability against a power loss.
      }
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, target);
  } catch {
    // Preferences are best-effort. Don't crash the CLI for them.
  }
}

export function resetPrefs(): void {
  try {
    unlinkSync(prefsPath());
  } catch {
    // Already gone — that's exactly the state we wanted.
  }
}

export function isFirstRun(): boolean {
  // "First run" means: the preferences file doesn't exist OR exists
  // but `firstRunAt` was never recorded. The latter handles users who
  // had `.agentmemory/preferences.json` from a much older agentmemory
  // build that wrote a different schema — we treat them as new.
  if (!existsSync(prefsPath())) return true;
  return readPrefs().firstRunAt === null;
}
