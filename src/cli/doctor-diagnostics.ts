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

import {
  detectLlmProviderKind,
  embeddingOptInHint,
  isRealProviderKey,
  LLM_PROVIDER_KEYS,
  llmOptInHint,
  parseEnvContent,
} from "../config.js";
import { DEFAULT_START_COMMAND, ENGINE_ONLY_DOCKER_GUIDE, engineOnlyFix, UNRECOGNIZED_DOCKER_NOTE, UNRECOGNIZED_SERVICE_FIX, type WorkerConnection } from "./worker-connection.js";

export type DiagnosticStatus = {
  ok: boolean;
  /** Short status detail (one line). Shown alongside the check name. */
  detail?: string;
  manualFix?: string;
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
  /** Pinned engine version. */
  pinnedVersion: string;
  startCommand?: string;
  targetArgs?: string;
};

export type DoctorWorkerConnection = WorkerConnection | "managed-worker-down";

function managedEngineRunningMessage(targetArgs = ""): string {
  return `A managed agentmemory engine is running from the iii binary the installer would replace. Run agentmemory stop${targetArgs} first, then run the fix again.`;
}

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

export function canAutoFix(d: Diagnostic, status?: DiagnosticStatus): boolean {
  return !d.manualOnly && !status?.manualFix;
}

export function failureReport(d: Diagnostic, status: DiagnosticStatus): { problem: string; fix: string } {
  return {
    problem: `${d.id} ✗ ${d.message}${status.detail ? ` (${status.detail})` : ""}`,
    fix: `${canAutoFix(d, status) ? "fix" : "manual fix"}: ${status.manualFix ?? d.fixPreview}`,
  };
}

export function doctorPromptsAllowed(
  env: NodeJS.ProcessEnv,
  stdinIsTTY: boolean | undefined,
  stdoutIsTTY: boolean | undefined,
): boolean {
  return Boolean(stdinIsTTY) && Boolean(stdoutIsTTY) && !env["CI"];
}

// Diagnostic ids are stable for testing and machine-readable doctor output.
export const DIAGNOSTIC_IDS = [
  "env-missing",
  "no-llm-provider-key",
  "embedding-provider-not-chosen",
  "engine-version-mismatch",
  "worker-not-connected",
  "viewer-unreachable",
  "stale-pidfile",
  "env-placeholder-keys",
  "iii-on-path-not-local-bin",
  "duplicate-workers",
] as const;

export type DiagnosticId = (typeof DIAGNOSTIC_IDS)[number];

// Pure helpers (no I/O) — exported for direct unit testing.
// ---------------------------------------------------------------------------

const PROVIDER_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "MINIMAX_API_KEY",
] as const;

export const parseEnvFile = parseEnvContent;

/** Returns the list of provider keys that look real (non-placeholder). */
export function realProviderKeys(env: Record<string, string>): string[] {
  return PROVIDER_KEY_NAMES.filter((k) => isRealProviderKey(env, k));
}

/** Returns the list of provider key NAMES that exist but are placeholders. */
export function placeholderProviderKeys(env: Record<string, string>): string[] {
  return PROVIDER_KEY_NAMES.filter((k) => (env[k] ?? "").trim() !== "" && !isRealProviderKey(env, k));
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
  processEnv: () => Record<string, string | undefined>;
  /** Is the iii engine PID in the pidfile still alive? */
  pidfilePidIsAlive: () => boolean | null;
  /** Does the pidfile exist on disk? */
  pidfileExists: () => boolean;
  /** Resolve the iii binary on PATH; return null if not found. */
  findIiiBinary: () => string | null;
  /** Path to ~/.agentmemory/bin/iii (the private install location). */
  localBinIiiPath: () => string;
  /** Run `iii --version`; null if it fails. */
  iiiBinaryVersion: (binPath: string) => string | null;
  externalEngineRunning: () => Promise<boolean>;
  managedEngineRunning: () => Promise<boolean>;
  workerConnection: () => Promise<DoctorWorkerConnection>;
  /** Probe the viewer URL; true if it returns OK within timeoutMs. */
  viewerReachable: (timeoutMs?: number) => Promise<boolean>;
  /** Fetch the running daemon's status report; null when unreachable. */
  daemonStatus: () => Promise<{ runtime?: { duplicateWorkers?: { count: number; workerIds: string[] } | null } } | null>;
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
        "Without this file, and without a provider key exported in the environment, the daemon " +
        "falls back to BM25-only search and no LLM-backed enrichment runs.",
      check: async () => ({
        ok: effects.envFileExists(),
        detail: effects.envFileExists() ? undefined : "no env file",
      }),
      fix: () => effects.runInit(),
    },
    {
      id: "no-llm-provider-key",
      message: "No LLM provider chosen for agentmemory in ~/.agentmemory/.env or the environment.",
      fixPreview:
        "Open ~/.agentmemory/.env in $EDITOR, set AGENTMEMORY_LLM_PROVIDER and that provider's key, then re-check.",
      moreInfo:
        "agentmemory sends session content to an LLM provider only after you choose one: set " +
        "AGENTMEMORY_LLM_PROVIDER to anthropic, openai, gemini, openrouter or minimax, and set that " +
        "provider's key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or GOOGLE_API_KEY, " +
        "OPENROUTER_API_KEY, MINIMAX_API_KEY). A key alone never turns LLM use on. Placeholder " +
        "values count as missing. AGENTMEMORY_ALLOW_AGENT_SDK=true needs no key. A value exported " +
        "in the environment wins over the file, but only for a daemon started from that environment.",
      check: async () => {
        const file = effects.readEnvFile();
        const env: Record<string, string> = { ...file };
        for (const [k, v] of Object.entries(effects.processEnv())) {
          if (v !== undefined) env[k] = v;
        }
        if (detectLlmProviderKind(env) !== "llm") {
          const hint = llmOptInHint(env);
          if (hint) return { ok: false, detail: hint };
          return {
            ok: false,
            detail: effects.envFileExists()
              ? "no provider chosen"
              : "no provider chosen (run env-missing fix first)",
          };
        }
        const selected = (env.AGENTMEMORY_LLM_PROVIDER ?? "").trim().toLowerCase();
        const selectedKeys: readonly string[] =
          selected in LLM_PROVIDER_KEYS ? LLM_PROVIDER_KEYS[selected as keyof typeof LLM_PROVIDER_KEYS] : [];
        const real = realProviderKeys(env).filter((k) => selectedKeys.includes(k));
        const fromEnv = real.filter((k) => file[k] !== env[k]);
        const named = real.map((k) => (fromEnv.includes(k) ? `${k} (environment)` : k));
        if (named.length === 0) return { ok: true, detail: "agent-sdk fallback, no API key" };
        const caveat =
          fromEnv.length > 0 ? "; a daemon started elsewhere will not see it" : "";
        return { ok: true, detail: `found: ${named.join(", ")}${caveat}` };
      },
      fix: (ctx) => effects.openEditor(ctx.envPath),
    },
    {
      id: "embedding-provider-not-chosen",
      message: "Cloud embeddings are not set up: EMBEDDING_PROVIDER does not choose a present key, or names a provider whose key is missing.",
      fixPreview:
        "Open ~/.agentmemory/.env in $EDITOR and set EMBEDDING_PROVIDER (local, openai, voyage, cohere, gemini or openrouter).",
      moreInfo:
        "Cloud embeddings send memory text to that provider, so agentmemory uses them only when " +
        "EMBEDDING_PROVIDER names the provider. A key alone never turns them on. " +
        "EMBEDDING_PROVIDER=local runs on-device. Without a provider, search is keyword and graph only.",
      check: async () => {
        const env: Record<string, string> = { ...effects.readEnvFile() };
        for (const [k, v] of Object.entries(effects.processEnv())) {
          if (v !== undefined) env[k] = v;
        }
        const hint = embeddingOptInHint(env);
        return hint ? { ok: false, detail: hint } : { ok: true };
      },
      fix: (ctx) => effects.openEditor(ctx.envPath),
    },
    {
      id: "engine-version-mismatch",
      message: "No iii binary matches the version agentmemory pins to.",
      fixPreview:
        "Reinstall the pinned iii-engine and restart the managed Worker Compose project.",
      moreInfo:
        "agentmemory manages its pinned iii engine and workers through Worker Compose; " +
        "a foreign process on PATH is not the instance binary. " +
        "Running a mismatched binary surfaces as EPIPE " +
        "reconnect loops and empty search results. Before an instance is configured, " +
        "a matching private install at ~/.agentmemory/bin/iii can satisfy the pin.",
      check: async (ctx) => {
        if (await effects.externalEngineRunning()) {
          return {
            ok: false,
            detail: "external engine version is unknown",
            manualFix: "Verify the external engine version, or stop it before starting a managed instance.",
          };
        }
        const privateVersion = effects.iiiBinaryVersion(effects.localBinIiiPath());
        const bin = effects.findIiiBinary();
        const pathVersion = bin ? effects.iiiBinaryVersion(bin) : null;
        if (privateVersion === ctx.pinnedVersion) {
          const note =
            pathVersion && pathVersion !== ctx.pinnedVersion
              ? `; PATH iii is ${pathVersion}; the pinned private install is available for startup`
              : "";
          return {
            ok: true,
            detail: `private install ${privateVersion} (pinned ${ctx.pinnedVersion})${note}`,
          };
        }
        if (!bin) {
          return { ok: false, detail: "iii not on PATH and no private install" };
        }
        if (!pathVersion) {
          return { ok: false, detail: "iii on PATH but --version failed" };
        }
        return {
          ok: pathVersion === ctx.pinnedVersion,
          detail: `${pathVersion} (pinned ${ctx.pinnedVersion})`,
        };
      },
      fix: async (ctx) => {
        if (await effects.externalEngineRunning()) {
          return { ok: false, message: "Verify or stop the external engine manually." };
        }
        if (await effects.managedEngineRunning()) {
          return { ok: false, message: managedEngineRunningMessage(ctx.targetArgs) };
        }
        const r = await effects.runIiiInstaller();
        if (!r.ok) return r;
        // Best-effort restart: stop then start.
        await effects.runStop();
        return effects.runStart();
      },
    },
    {
      id: "worker-not-connected",
      message: "The server answers, but the agentmemory worker routes return 404.",
      fixPreview: engineOnlyFix(),
      moreInfo:
        "The REST port answers, but /agentmemory/livez and /agentmemory/health return 404. " +
        "Only the agentmemory worker registers those routes, so the engine runs alone: status shows " +
        "no version and no health, and the viewer is not served. Old Docker images from the legacy " +
        "CLI Docker mode ran only the engine. Migration guide: " +
        ENGINE_ONLY_DOCKER_GUIDE,
      manualOnly: true,
      check: async (ctx) => {
        const connection = await effects.workerConnection();
        const startCommand = ctx.startCommand ?? DEFAULT_START_COMMAND;
        const targetArgs = ctx.targetArgs ?? "";
        if (connection === "engine-only") {
          return {
            ok: false,
            detail: `engine at ${ctx.baseUrl} has no agentmemory routes (404)`,
            manualFix: engineOnlyFix(startCommand),
          };
        }
        if (connection === "managed-worker-down") {
          return {
            ok: false,
            detail: `managed Worker Compose engine at ${ctx.baseUrl} has no agentmemory routes (404)`,
            manualFix: `Run agentmemory status${targetArgs} to see the Worker Compose failure report, then run agentmemory stop${targetArgs} and start again with: ${startCommand}.`,
          };
        }
        if (connection === "unrecognized") {
          return {
            ok: false,
            detail: `server at ${ctx.baseUrl} returns 404 for the agentmemory routes and the iii engine port does not answer`,
            manualFix: `${UNRECOGNIZED_SERVICE_FIX} ${UNRECOGNIZED_DOCKER_NOTE}`,
          };
        }
        if (connection === "unreachable") return { ok: true, detail: "server not reachable (see Server reachable)" };
        return { ok: true };
      },
      fix: async (ctx) => ({ ok: false, message: engineOnlyFix(ctx.startCommand) }),
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
      fixPreview: "Verify the Compose daemon ownership record and restart only the managed project.",
      moreInfo:
        "When a managed Compose daemon crashes hard (kill -9, OOM, host reboot), its " +
        "ownership PID can stick around. The check uses the saved Compose process, " +
        "never a legacy iii.pid from a previous lifecycle.",
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
        "agentmemory's own iii at ~/.agentmemory/bin/iii is missing or a different version, and another iii is on your PATH.",
      fixPreview:
        "Run npx -y @agentmemory/agentmemory@latest. It installs the pinned iii to ~/.agentmemory/bin/iii and does not change your PATH or the other iii.",
      moreInfo:
        "agentmemory keeps its pinned engine at ~/.agentmemory/bin/iii so a " +
        "user-managed iii on PATH (homebrew, cargo, manual install) stays untouched. " +
        "When that copy is missing or has a different version, startup uses the iii on PATH " +
        "if it matches the pin. If the PATH iii has a different version, startup installs the " +
        "pinned copy into ~/.agentmemory/bin first. The engine-version-mismatch check shows " +
        "which version each binary reports.",
      manualOnly: true,
      check: async (ctx) => {
        const bin = effects.findIiiBinary();
        if (!bin) return { ok: true, detail: "iii not on PATH (handled elsewhere)" };
        const localBin = effects.localBinIiiPath();
        if (bin === localBin) return { ok: true };
        const privateVersion = effects.iiiBinaryVersion(localBin);
        if (privateVersion === ctx.pinnedVersion) {
          return {
            ok: true,
            detail: `private install pinned; PATH iii at ${bin} stays untouched`,
          };
        }
        const pathVersion = effects.iiiBinaryVersion(bin);
        const detail = `PATH iii at ${bin} is ${pathVersion ?? "an unknown version"} (pinned ${ctx.pinnedVersion})`;
        if (pathVersion === ctx.pinnedVersion) {
          return {
            ok: false,
            detail,
            manualFix:
              "The PATH iii is the pinned version, so startup can use it and no action is needed. To give agentmemory its own copy in ~/.agentmemory/bin, run npx -y @agentmemory/agentmemory@latest upgrade and accept the iii-engine install step.",
          };
        }
        return { ok: false, detail };
      },
      fix: async (ctx) => {
        if (await effects.managedEngineRunning()) {
          return { ok: false, message: managedEngineRunningMessage(ctx.targetArgs) };
        }
        return effects.runIiiInstaller().then((r) => ({
          ok: r.ok,
          message:
            r.message ??
            "Installer wrote to ~/.agentmemory/bin/iii. Your PATH wasn't modified.",
        }));
      },
    },
    {
      id: "duplicate-workers",
      message: "More than one agentmemory worker is registered to the engine.",
      fixPreview: "Stop the extra daemon with `agentmemory stop`, or run `agentmemory status` to see the registered workers.",
      moreInfo:
        "The engine owns each function id to one worker per namespace, so a second agentmemory worker " +
        "is rejected and fails. This happens when two daemons (or a stale process from an older install) " +
        "share one engine and namespace.",
      manualOnly: true,
      check: async () => {
        const status = await effects.daemonStatus();
        const dup = status?.runtime?.duplicateWorkers;
        if (dup && dup.count > 1) {
          return { ok: false, detail: `${dup.count} workers: ${dup.workerIds.join(", ")}` };
        }
        return { ok: true, detail: status === null ? "status endpoint unreachable; check skipped" : undefined };
      },
      fix: async () => ({
        ok: false,
        message: "Stop the extra daemon with `agentmemory stop`, then restart with `agentmemory start`.",
      }),
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
    lines.push(`   ${canAutoFix(diagnostic, status) ? "would fix" : "manual fix"}: ${status.manualFix ?? diagnostic.fixPreview}`);
    if (status.detail) lines.push(`   detail: ${status.detail}`);
  }
  if (lines.length === 0) {
    lines.push(`All checks passing for ${ctx.baseUrl} — no fixes to run.`);
  }
  return lines;
}
