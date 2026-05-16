// Doctor v2 diagnostic catalog.
//
// Each entry is a self-describing diagnostic: a check function that returns
// `{ ok, detail? }`, a human-readable message, an inline fix preview, and
// an `apply` function that runs the fix. The list is exported as a pure
// data structure so unit tests can assert on shape without bringing
// @clack/prompts into the test harness.
//
// The runtime (src/cli.ts -> runDoctor) iterates the list, prompts the user
// per check, and only re-runs the SAME diagnostic after a fix — never the
// whole suite. Each fix returns `{ ok, message? }` so we can show a one-line
// outcome before moving on.
//
// Doctor v2 surface:
//   agentmemory doctor             # interactive: Fix/Skip/More/Quit per failed check
//   agentmemory doctor --all       # apply every available fix without prompting (CI)
//   agentmemory doctor --dry-run   # show what each fix WOULD do; execute nothing

export type DiagnosticStatus = {
  ok: boolean;
  /** Short status detail (one line). Shown alongside the check name. */
  detail?: string;
};

export type DiagnosticFixResult = {
  ok: boolean;
  message?: string;
};

export type DoctorContext = {
  /** Base URL for the running engine, e.g. http://localhost:3111 */
  baseUrl: string;
  /** Viewer URL, e.g. http://localhost:3113 */
  viewerUrl: string;
  /** Path to ~/.agentmemory/.env */
  envPath: string;
  /** Path to ~/.agentmemory/iii.pid */
  pidfilePath: string;
  /** Path to ~/.agentmemory/engine-state.json */
  enginePath: string;
  /** Pinned engine version (e.g. "0.11.2"). */
  pinnedVersion: string;
};

export type Diagnostic = {
  /** Stable id. Used in --json and tests. */
  id: string;
  /** One-line problem statement shown to the user. */
  message: string;
  /** One-line description of WHAT the fix will do. Shown before the prompt. */
  fixPreview: string;
  /** Longer explanation shown when the user picks [?] More info. */
  moreInfo: string;
  /** Run the check; return ok=true if everything's fine, ok=false otherwise. */
  check: (ctx: DoctorContext) => Promise<DiagnosticStatus>;
  /** Apply the fix. Returns ok=true on success. */
  fix: (ctx: DoctorContext) => Promise<DiagnosticFixResult>;
  /** True when there's nothing to auto-fix (we only suggest). */
  manualOnly?: boolean;
};

// Diagnostic ids are stable for testing and machine-readable doctor output.
export const DIAGNOSTIC_IDS = [
  "env-missing",
  "no-llm-provider-key",
  "engine-version-mismatch",
  "viewer-unreachable",
  "stale-pidfile",
  "env-placeholder-keys",
  "iii-on-path-not-local-bin",
] as const;

export type DiagnosticId = (typeof DIAGNOSTIC_IDS)[number];

// Pure helpers (no I/O) — exported for direct unit testing.
// ---------------------------------------------------------------------------

/** Common placeholder values shipped in .env.example. */
const PLACEHOLDER_VALUES = new Set([
  "",
  "your-key-here",
  "sk-ant-...",
  "sk-...",
  "changeme",
  "todo",
  "xxx",
]);

const PROVIDER_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "MINIMAX_API_KEY",
] as const;

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Returns the list of provider keys that look real (non-placeholder). */
export function realProviderKeys(env: Record<string, string>): string[] {
  return PROVIDER_KEY_NAMES.filter((k) => {
    const v = (env[k] ?? "").trim();
    if (!v) return false;
    if (PLACEHOLDER_VALUES.has(v.toLowerCase())) return false;
    // Reject values that are just dots/placeholders like "xxxx-xxxx".
    if (/^x+$/i.test(v.replace(/[-_]/g, ""))) return false;
    return true;
  });
}

/** Returns the list of provider key NAMES that exist but are placeholders. */
export function placeholderProviderKeys(env: Record<string, string>): string[] {
  return PROVIDER_KEY_NAMES.filter((k) => {
    const v = (env[k] ?? "").trim();
    if (!v) return false;
    if (PLACEHOLDER_VALUES.has(v.toLowerCase())) return true;
    if (/^x+$/i.test(v.replace(/[-_]/g, ""))) return true;
    return false;
  });
}

/**
 * Build the canonical diagnostic catalog.
 *
 * The factory takes the side-effect helpers as injected functions so tests
 * can swap them with stubs. Production callers pass real implementations
 * from src/cli.ts.
 */
export type DoctorEffects = {
  /** Does ~/.agentmemory/.env exist? */
  envFileExists: () => boolean;
  /** Read ~/.agentmemory/.env and return parsed key=value pairs. */
  readEnvFile: () => Record<string, string>;
  /** Is the iii engine PID in the pidfile still alive? */
  pidfilePidIsAlive: () => boolean | null;
  /** Does the pidfile exist on disk? */
  pidfileExists: () => boolean;
  /** Resolve the iii binary on PATH; return null if not found. */
  findIiiBinary: () => string | null;
  /** Path to ~/.local/bin/iii (the location we install to). */
  localBinIiiPath: () => string;
  /** Run `iii --version`; null if it fails. */
  iiiBinaryVersion: (binPath: string) => string | null;
  /** Probe the viewer URL; true if it returns OK within timeoutMs. */
  viewerReachable: (timeoutMs?: number) => Promise<boolean>;
  /** Run init logic (copies .env.example). */
  runInit: () => Promise<DiagnosticFixResult>;
  /** Open a file in $EDITOR (or fallback). Resolves when editor exits. */
  openEditor: (path: string) => Promise<DiagnosticFixResult>;
  /** Run the iii installer. */
  runIiiInstaller: () => Promise<DiagnosticFixResult>;
  /** Stop the running engine cleanly. */
  runStop: () => Promise<DiagnosticFixResult>;
  /** Start the engine (waits for /livez). */
  runStart: () => Promise<DiagnosticFixResult>;
  /** Clear pidfile + engine-state. */
  clearEnginePidAndState: () => void;
};

export function buildDiagnostics(effects: DoctorEffects): Diagnostic[] {
  return [
    {
      id: "env-missing",
      message: "~/.agentmemory/.env is missing.",
      fixPreview: "Copy .env.example into ~/.agentmemory/.env (your keys file).",
      moreInfo:
        "agentmemory reads provider API keys (Anthropic, OpenAI, Gemini, …) from ~/.agentmemory/.env. " +
        "Without this file the daemon falls back to BM25-only search and no LLM-backed enrichment runs.",
      check: async () => ({
        ok: effects.envFileExists(),
        detail: effects.envFileExists() ? undefined : "no env file",
      }),
      fix: () => effects.runInit(),
    },
    {
      id: "no-llm-provider-key",
      message: "No LLM provider API key found in ~/.agentmemory/.env.",
      fixPreview: "Open ~/.agentmemory/.env in $EDITOR and paste your key, then re-check.",
      moreInfo:
        "Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, " +
        "OPENROUTER_API_KEY, MINIMAX_API_KEY. The daemon picks the first that resolves " +
        "to a real (non-placeholder) value at startup.",
      check: async () => {
        if (!effects.envFileExists()) {
          return { ok: false, detail: "env file missing (run env-missing fix first)" };
        }
        const env = effects.readEnvFile();
        const real = realProviderKeys(env);
        return {
          ok: real.length > 0,
          detail: real.length > 0 ? `found: ${real.join(", ")}` : "no provider key set",
        };
      },
      fix: (ctx) => effects.openEditor(ctx.envPath),
    },
    {
      id: "engine-version-mismatch",
      message: "iii binary on PATH doesn't match the version agentmemory pins to.",
      fixPreview:
        "Re-run the iii installer for the pinned version and restart the engine.",
      moreInfo:
        "agentmemory pins the iii engine to a specific release because newer engines " +
        "use a different worker model. Running a mismatched binary surfaces as EPIPE " +
        "reconnect loops and empty search results.",
      check: async (ctx) => {
        const bin = effects.findIiiBinary();
        if (!bin) return { ok: false, detail: "iii not on PATH" };
        const v = effects.iiiBinaryVersion(bin);
        if (!v) return { ok: false, detail: "iii on PATH but --version failed" };
        return {
          ok: v === ctx.pinnedVersion,
          detail: `${v} (pinned ${ctx.pinnedVersion})`,
        };
      },
      fix: async () => {
        const r = await effects.runIiiInstaller();
        if (!r.ok) return r;
        // Best-effort restart: stop then start.
        await effects.runStop();
        return effects.runStart();
      },
    },
    {
      id: "viewer-unreachable",
      message: "Viewer port not reachable.",
      fixPreview: "Stop the engine, restart it, and retry the viewer probe.",
      moreInfo:
        "The viewer is served on REST port + 2 (default 3113). If it never came up " +
        "the most common cause is port collision; a sibling PR ships auto-bump for " +
        "this case. If that lands first this check just verifies; otherwise restart " +
        "the engine to retry binding.",
      check: async () => ({
        ok: await effects.viewerReachable(),
        detail: undefined,
      }),
      fix: async () => {
        const stopped = await effects.runStop();
        if (!stopped.ok) return stopped;
        return effects.runStart();
      },
    },
    {
      id: "stale-pidfile",
      message: "Stale pidfile: pid recorded but the process is gone.",
      fixPreview: "Clear ~/.agentmemory/iii.pid + engine-state.json, then restart.",
      moreInfo:
        "When the engine crashes hard (kill -9, OOM, host reboot) the pidfile sticks " +
        "around. agentmemory refuses to start a second engine on top of a stale pid, " +
        "so this state must be cleared explicitly.",
      check: async () => {
        if (!effects.pidfileExists()) return { ok: true, detail: "no pidfile" };
        const alive = effects.pidfilePidIsAlive();
        if (alive === null) return { ok: true, detail: "pidfile unreadable" };
        return {
          ok: alive,
          detail: alive ? "pid is alive" : "pid is gone",
        };
      },
      fix: async () => {
        effects.clearEnginePidAndState();
        return effects.runStart();
      },
    },
    {
      id: "env-placeholder-keys",
      message: "~/.agentmemory/.env contains placeholder/empty API keys.",
      fixPreview: "Open ~/.agentmemory/.env in $EDITOR to paste real values.",
      moreInfo:
        "Lines like ANTHROPIC_API_KEY=sk-ant-... or =your-key-here are treated as " +
        "absent. The daemon will fall back to BM25-only search. Replace placeholders " +
        "with real keys or comment the line out.",
      check: async () => {
        if (!effects.envFileExists()) {
          return { ok: true, detail: "env file missing (handled by env-missing)" };
        }
        const env = effects.readEnvFile();
        const placeholders = placeholderProviderKeys(env);
        return {
          ok: placeholders.length === 0,
          detail:
            placeholders.length === 0
              ? undefined
              : `placeholder: ${placeholders.join(", ")}`,
        };
      },
      fix: (ctx) => effects.openEditor(ctx.envPath),
    },
    {
      id: "iii-on-path-not-local-bin",
      message:
        "iii is on PATH but not in ~/.local/bin/iii (where we install).",
      fixPreview:
        "Suggest re-installing the pinned version via the installer — won't touch your PATH.",
      moreInfo:
        "agentmemory's installer writes to ~/.local/bin/iii. When a user-managed iii " +
        "lives somewhere else (homebrew, cargo, $XDG_BIN) we don't auto-overwrite it. " +
        "If you want our pinned build, run the installer; otherwise this is informational.",
      manualOnly: true,
      check: async () => {
        const bin = effects.findIiiBinary();
        if (!bin) return { ok: true, detail: "iii not on PATH (handled elsewhere)" };
        const localBin = effects.localBinIiiPath();
        return {
          ok: bin === localBin,
          detail: bin === localBin ? undefined : `iii at: ${bin}`,
        };
      },
      fix: async () =>
        effects.runIiiInstaller().then((r) => ({
          ok: r.ok,
          message:
            r.message ??
            "Installer wrote to ~/.local/bin/iii. Your PATH wasn't modified — adjust it yourself if needed.",
        })),
    },
  ];
}

export type DoctorRunMode = "interactive" | "all" | "dry-run";

/**
 * Run all diagnostics and return their initial status (no fixes applied).
 * Useful for tests and for `--dry-run` mode.
 */
export async function runAllChecks(
  ctx: DoctorContext,
  diagnostics: Diagnostic[],
): Promise<Array<{ diagnostic: Diagnostic; status: DiagnosticStatus }>> {
  const results: Array<{ diagnostic: Diagnostic; status: DiagnosticStatus }> = [];
  for (const d of diagnostics) {
    const status = await d.check(ctx);
    results.push({ diagnostic: d, status });
  }
  return results;
}

/**
 * Dry-run output: each failing check's fix preview, prefixed by the diagnostic
 * message. Pure function so we can snapshot-test the format.
 */
export function dryRunPlan(
  ctx: DoctorContext,
  results: Array<{ diagnostic: Diagnostic; status: DiagnosticStatus }>,
): string[] {
  const lines: string[] = [];
  let n = 0;
  for (const { diagnostic, status } of results) {
    if (status.ok) continue;
    n++;
    lines.push(`${n}. [${diagnostic.id}] ${diagnostic.message}`);
    lines.push(`   would fix: ${diagnostic.fixPreview}`);
    if (status.detail) lines.push(`   detail: ${status.detail}`);
  }
  if (lines.length === 0) {
    lines.push(`All checks passing for ${ctx.baseUrl} — no fixes to run.`);
  }
  return lines;
}
