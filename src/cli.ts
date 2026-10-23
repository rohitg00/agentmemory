#!/usr/bin/env node

import {
  spawn,
  execFileSync,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, resolve, delimiter as PATH_DELIMITER } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import * as p from "@clack/prompts";
import pc from "picocolors";

// Semantic color helpers. clack strips ANSI for box-width math
// (stripVTControlCharacters + string-width), so coloring inside p.note
// keeps borders aligned. Centralized here so the palette stays consistent
// across every command's output.
const c = {
  url: pc.cyan,
  ok: pc.green,
  warn: pc.yellow,
  err: pc.red,
  cmd: (s: string) => pc.bold(pc.cyan(s)),
  label: pc.bold,
  dim: pc.dim,
  accent: (s: string) => pc.bold(pc.yellow(s)),
};
import { generateId } from "./state/schema.js";
import {
  buildDiagnostics,
  dryRunPlan,
  parseEnvFile,
  type Diagnostic,
  type DiagnosticFixResult,
  type DoctorContext,
  type DoctorEffects,
} from "./cli/doctor-diagnostics.js";
import {
  buildRemovePlan,
  formatPlan,
  legacyLocalBinIii,
  type ConnectManifest,
  type RemoveOptions,
} from "./cli/remove-plan.js";
import { portFlagSuffix } from "./cli/ready-hint.js";
import { expectedIiiSha256, iiiManualInstallCommand, installIiiArchive } from "./cli/engine-install.js";
import {
  runtimeConfigPath,
  redactCredentialUrls,
} from "./cli/engine-launch.js";
import { runtimeMetadataPath } from "./runtime-paths.js";
import { createStartupStderrCapture } from "./cli/startup-stderr.js";
import {
  configStartsAgentmemoryWorker,
  probeEngine,
  probeWorker,
  startWorkerAndWait,
  startupDeadline,
  startupTimeoutMessage,
  startupTimeouts,
  managedComposeReadinessUrl,
  waitForReadiness,
  withinStartupDeadline,
  type StartupDeadline,
} from "./cli/readiness.js";
import {
  engineFlushWaitMs,
  engineStateConfigPaths,
} from "./cli/engine-config.js";
import { SHUTDOWN_HARD_EXIT_MS, registerStartupCleanup, runStartupCleanup } from "./shutdown.js";
import { consoleArgs, defaultConsolePort, parseConsoleArgs } from "./cli/console.js";
import { processStatIsRunning } from "./cli/process-state.js";
import { readUnixProcessExecutable, sameResolvedExecutable } from "./cli/compose-process.js";
import { renderSplash } from "./cli/splash.js";
import { isFirstRun, readPrefs, resetPrefs, writePrefs } from "./cli/preferences.js";
import { runOnboarding } from "./cli/onboarding.js";
import { setBootVerbose } from "./logger.js";
import { getRedisUrl, getStateBackend, hydrateProcessEnvFromFile } from "./config.js";
import { III_PINNED_VERSION, VERSION } from "./version.js";
import { getAllTools, ESSENTIAL_TOOLS } from "./mcp/tools-registry.js";
import { knownAgents } from "./cli/connect/index.js";

const ALL_TOOLS_COUNT = getAllTools().length;
const CORE_TOOLS_COUNT = getAllTools().filter((t) => ESSENTIAL_TOOLS.has(t.name)).length;
import { resolveDataDir } from "./cli-data-dir.js";
import { runCaptureCommand } from "./cli/capture.js";
import { runCompressionCommand } from "./cli/compression.js";
import { runGraphIndexCommand } from "./cli/graph-index.js";
import { bearerHeaders, resolveClientSecret } from "./secret-store.js";
import { assertComposePortsFree, composeCall, composeRegistryFailureMessage, composeStateRegistryFailure, composeWorkerFailureSummary, ownedComposeProject, readComposeLogFromOffset, startComposeDaemon, writeComposeState, type ComposeStatus } from "./cli/compose-control.js";
import { COMPOSE_WORKER_VERSIONS, composeNamespace } from "./cli/compose-project.js";
import { legacyDockerStateMessage, type LegacyDockerEngineState } from "./cli/legacy-docker-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const IS_WINDOWS = platform() === "win32";
const IS_VERBOSE =
  args.includes("--verbose") ||
  args.includes("-v") ||
  process.env["AGENTMEMORY_VERBOSE"] === "1" ||
  process.env["AGENTMEMORY_VERBOSE"] === "true";

// Propagate the resolved verbosity to the worker's boot logger so the
// 25-line `[agentmemory] X registered` stream is either dropped or
// printed verbatim. Without this the worker's default (env-only) would
// disagree with the CLI flag.
setBootVerbose(IS_VERBOSE);

const IS_RESET = args.includes("--reset");

// Fold ~/.agentmemory/.env into process.env before any port/URL read
// (getRestPort/getBaseUrl/getEnginePort) or the --port /
// --instance / --tools handlers below. Only-if-unset, so a real
// process.env value — including one just set by a CLI flag — still wins.
hydrateProcessEnvFromFile();

// --version / -V early exit. Print VERSION + exit before any side effects
// (engine boot, env load, dir mkdir). `-v` is taken by --verbose so we
// reserve `-V` (capital) for version per POSIX convention.
if (args.includes("--version") || args.includes("-V")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

// Pinned iii-engine version. The engine, the iii-sdk and the @iii-dev/helpers
// packages in package.json must stay on the same release: the worker speaks
// that engine's wire protocol and the unpinned installer tracks `latest`.
// Worker Compose supervises registry workers `state` and `http` alongside
// the local agentmemory worker; the CLI relies on this lifecycle to keep
// HTTP routes owned by the reconnecting worker. Bump this constant and
// the two package.json dependencies together.
// AGENTMEMORY_III_VERSION overrides the pin for anyone running a
// self-managed engine.
const IIPINNED_DEFAULT_VERSION = III_PINNED_VERSION;
const IIPINNED_VERSION =
  process.env["AGENTMEMORY_III_VERSION"] || IIPINNED_DEFAULT_VERSION;
const IIIENGINE_INSTALL_CMD = `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=${IIPINNED_VERSION} sh`;

// Map Node platform/arch → the asset name iii-hq/iii ships under
// https://github.com/iii-hq/iii/releases/download/iii/v<version>/<asset>
function iiiReleaseAsset(): string | null {
  const p = platform();
  const a = process.arch;
  if (p === "darwin" && a === "arm64")
    return "iii-aarch64-apple-darwin.tar.gz";
  if (p === "darwin" && a === "x64")
    return "iii-x86_64-apple-darwin.tar.gz";
  if (p === "linux" && a === "x64")
    return "iii-x86_64-unknown-linux-gnu.tar.gz";
  if (p === "linux" && a === "arm64")
    return "iii-aarch64-unknown-linux-gnu.tar.gz";
  if (p === "linux" && a === "arm")
    return "iii-armv7-unknown-linux-gnueabihf.tar.gz";
  if (p === "win32" && a === "x64")
    return "iii-x86_64-pc-windows-msvc.zip";
  if (p === "win32" && a === "arm64")
    return "iii-aarch64-pc-windows-msvc.zip";
  return null;
}

function iiiReleaseUrl(): string | null {
  const asset = iiiReleaseAsset();
  if (!asset) return null;
  // Tag names are monorepo-prefixed: `iii/v<version>`. Slash is URL-encoded
  // by GitHub when serving the download path, hence `iii/v...` not `iii%2Fv...`.
  return `https://github.com/iii-hq/iii/releases/download/iii/v${IIPINNED_VERSION}/${asset}`;
}

function vlog(msg: string): void {
  if (IS_VERBOSE) p.log.info(`[verbose] ${msg}`);
}

function wrapList(items: readonly string[], indent: number, width = 78): string {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const joined = line ? `${line}, ${item}` : item;
    if (line && indent + joined.length > width) {
      lines.push(`${line},`);
      line = item;
    } else {
      line = joined;
    }
  }
  lines.push(line);
  return lines.join(`\n${" ".repeat(indent)}`);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
agentmemory — persistent memory for AI coding agents

Usage: agentmemory [command] [options]

Commands:
  (default)          Start agentmemory via a per-instance Worker Compose project
  init               Copy bundled .env.example to ~/.agentmemory/.env if absent
  connect [agent]    Wire agentmemory into an installed agent
                     (${wrapList(knownAgents(), 21)}).
                     No arg = interactive picker. --all wires every detected agent.
                     --dry-run shows what would change. --force re-installs.
  status             Show connection status, memory count, flags, and health
  console            Launch the iii web console for this engine (workers, functions,
                     triggers, queues, traces). --console-port N, default viewer+1
  doctor             Interactive diagnostic + fixer. [F]ix · [S]kip · [?]more · [Q]uit
                     --all: apply every fix without prompting (CI)
                     --dry-run: show what each fix would do, don't execute
  remove             Cleanly uninstall agentmemory (pidfile, state, .env, binaries).
                     --force: skip confirmations · --keep-data: keep memory data
  demo [--serve]     Seed sample sessions and show recall in action.
                     --serve boots the server, runs the demo, and stops it
                     in one command (no second terminal).
  upgrade            Upgrade local deps + iii runtime (best effort)
  stop [--force]     Stop the running iii-engine started by this CLI.
                     --force bypasses the native engine PID identity guard
                     (use when the engine was started natively but state file is missing).
  mcp                Start standalone MCP shim — opt-in surface for MCP-only clients
                     (Cursor, Gemini CLI, etc). REST always available at :3111.
  capture [--drain]  Show capture health: the local offline spool and the server
                     inbox (pending, retrying, dead letters). --drain sends
                     spooled observations now. --json for machine output.
  compression        Inspect pending or failed observation compression.
                     --session <id> or --project <name> selects the scope.
                     --agent-id <id> narrows it; --limit <N> bounds the batch.
                     --retry explicitly retries compression; --json for machine output.
  graph-index       Inspect bounded graph index status. --json for machine output.
                     migrate --allow-legacy-scan explicitly scans legacy graph data.
                     resume continues a sealed migration without another full scan.
  import-jsonl [p]   Import Claude Code JSONL transcripts (default: ~/.claude/projects)
                     --max-files <N> | --max-files=<N>: override scan cap (default 200, max 1000;
                     out-of-range is rejected; for trees >1000 files, batch by subdirectory)

Options:
  --help, -h         Show this help
  --verbose, -v      Show engine stderr, boot log, and diagnostic info
  --reset            Wipe ~/.agentmemory/preferences.json and re-run onboarding
  --tools all|core   Tool visibility (default: all = ${ALL_TOOLS_COUNT} tools; core = ${CORE_TOOLS_COUNT} essentials)
  --no-engine        Skip auto-starting iii-engine
  --port <N>         Override REST port (default: 3111). Viewer (N+2) and
                     iii engine (N+46023) derive from N for side-by-side instances.
  --instance <N>     Shortcut for --port (3111 + N*100) to run multiple
                     daemons side-by-side without env gymnastics.
                     --instance 1 -> 3211/3213/49234, etc. (max N=50)
  --data-dir <path>  Store iii-engine state outside the current repo

Environment:
  AGENTMEMORY_URL              Full REST base URL (e.g. http://localhost:3111).
                               Honored by status, doctor, and MCP shim commands.
  AGENTMEMORY_DATA_DIR         State directory fallback when --data-dir is not set.
  AGENTMEMORY_III_VERSION      Override pinned iii-engine version (default ${IIPINNED_VERSION}).
  AGENTMEMORY_ENGINE_READY_TIMEOUT_MS
                               Engine readiness deadline in milliseconds (default 120000).
  AGENTMEMORY_READY_TIMEOUT_MS
                               Worker readiness deadline in milliseconds (default 300000).
                               Both deadlines accept integers from 1 through 3600000.
  AGENTMEMORY_ENGINE_MANAGES_WORKER
                               true for custom engine-managed worker wrappers; false
                               for CLI-managed workers. Unset detects direct worker commands.
  AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS
                               Window (seconds) for the smart-search follow-up diagnostic
                               (default 30). Long values overcount, short values undercount.

Quick start:
  npx @agentmemory/agentmemory          # start pinned iii Worker Compose runtime
  npx @agentmemory/agentmemory demo     # see semantic recall in 30 seconds
  npx @agentmemory/agentmemory doctor   # diagnose config + feature flags
  npx @agentmemory/agentmemory status   # health + memory count + flags
  npx @agentmemory/agentmemory upgrade  # upgrade agentmemory + iii runtime
  npx @agentmemory/agentmemory mcp      # standalone MCP server (no engine)
  npx @agentmemory/mcp                  # same as above (shim package)
`);
  process.exit(0);
}

const toolsIdx = args.indexOf("--tools");
if (toolsIdx !== -1 && args[toolsIdx + 1]) {
  const toolsMode = args[toolsIdx + 1]!;
  if (toolsMode !== "all" && toolsMode !== "core") {
    p.log.warn(
      `Unknown --tools value "${toolsMode}" (valid: all, core); falling back to all.`,
    );
  }
  process.env["AGENTMEMORY_TOOLS"] = toolsMode;
}

const URL_CLIENT_COMMANDS = new Set(["status", "doctor", "mcp", "capture", "compression", "graph-index"]);
let hasExplicitLocalPortOverride = false;
let selectedInstance = 0;

function cliArgValue(name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const portValue = cliArgValue("--port");
if (portValue) {
  process.env["III_REST_PORT"] = portValue;
  hasExplicitLocalPortOverride = true;
}

// `--instance N` picks a 100-port block off the 3111 base so multiple
// agentmemory daemons can coexist on one host without env-var
// gymnastics. `--instance 0` keeps the canonical 3111/3113/49134
// ports; `--instance 1` → 3211/3213/49234; etc. REST acts as the
// anchor — viewer and engine derive from it via fixed offsets below
// unless an env explicitly pins each one.
const instanceValue = cliArgValue("--instance");
const hasInstanceArgument = args.some(
  (arg) => arg === "--instance" || arg.startsWith("--instance="),
);
if (hasInstanceArgument) {
  if (instanceValue === undefined || !/^\d+$/.test(instanceValue)) {
    p.log.error("--instance must be an integer between 0 and 50.");
    process.exit(1);
  }
  const n = Number(instanceValue);
  if (!Number.isInteger(n) || n > 50) {
    p.log.error("--instance must be an integer between 0 and 50.");
    process.exit(1);
  }
  selectedInstance = n;
  const base = 3111 + n * 100;
  if (!hasExplicitLocalPortOverride) {
    process.env["III_REST_PORT"] = String(base);
  }
  hasExplicitLocalPortOverride = true;
}

const restPort = parseInt(process.env["III_REST_PORT"] || "3111", 10);
if (Number.isFinite(restPort) && restPort > 0) {
  process.env["III_VIEWER_PORT"] ??= String(restPort + 2);
  const configuredEngineUrl = process.env["III_ENGINE_URL"];
  if (configuredEngineUrl) {
    try {
      const parsedEnginePort = new URL(configuredEngineUrl).port;
      if (parsedEnginePort) {
        process.env["III_ENGINE_PORT"] = parsedEnginePort;
      }
    } catch {}
  } else {
    process.env["III_ENGINE_PORT"] ??= String(restPort + 46023);
  }
  process.env["AGENTMEMORY_METRICS_PORT"] ??= String(restPort + 6353);
}

const dataDirResolution = resolveDataDir({ args });
process.env["AGENTMEMORY_DATA_DIR"] = dataDirResolution.dataDir;
process.env["AGENTMEMORY_RUNTIME_DIR"] = selectedInstance > 0
  ? dataDirResolution.dataDir
  : join(homedir(), ".agentmemory");

const skipEngine = args.includes("--no-engine");

function shouldUseAgentmemoryUrl(): boolean {
  return !hasExplicitLocalPortOverride && URL_CLIENT_COMMANDS.has(args[0] ?? "");
}

function getRestPort(): number {
  const url = shouldUseAgentmemoryUrl()
    ? process.env["AGENTMEMORY_URL"]
    : undefined;
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return parseInt(process.env["III_REST_PORT"] || "3111", 10) || 3111;
}

function getBaseUrl(): string {
  const url = shouldUseAgentmemoryUrl()
    ? process.env["AGENTMEMORY_URL"]
    : undefined;
  if (url) return url.replace(/\/+$/, "");
  return `http://localhost:${getRestPort()}`;
}

function getConfiguredViewerPort(): number {
  return (
    parseInt(process.env["III_VIEWER_PORT"] || "", 10) ||
    getRestPort() + 2
  );
}

let discoveredViewerPort: number | null = null;

export async function discoverViewerPort(): Promise<void> {
  if (discoveredViewerPort !== null) return;
  try {
    const res = await fetch(`${getBaseUrl()}/agentmemory/livez`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      const data = await res.json() as { viewerPort?: number | null };
      if (typeof data.viewerPort === "number") {
        discoveredViewerPort = data.viewerPort;
      }
    }
  } catch {}
}

function getViewerUrl(): string {
  const envUrl = process.env["AGENTMEMORY_VIEWER_URL"];
  if (envUrl) return envUrl.replace(/\/+$/, "");
  
  if (discoveredViewerPort !== null) {
    try {
      const u = new URL(getBaseUrl());
      return `${u.protocol}//${u.hostname}:${discoveredViewerPort}`;
    } catch {
      return `http://localhost:${discoveredViewerPort}`;
    }
  }
  
  try {
    const u = new URL(getBaseUrl());
    const vPort = getConfiguredViewerPort();
    return `${u.protocol}//${u.hostname}:${vPort}`;
  } catch {
    const vPort = getConfiguredViewerPort();
    return `http://localhost:${vPort}`;
  }
}

// Bridge WebSocket port — the iii engine's internal worker bus.
// Defaults derived from REST as REST+46023 so the canonical 3111
// anchor yields 49134 and `--port 3211` auto-picks 49234 without a
// second-instance collision. Overridable via
// `III_ENGINE_PORT` or the legacy `III_ENGINE_URL=ws://host:port`.
function getEnginePort(): number {
  const url = process.env["III_ENGINE_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  const explicit = parseInt(process.env["III_ENGINE_PORT"] || "", 10);
  if (explicit) return explicit;
  return getRestPort() + 46023;
}

async function isEngineRunning(): Promise<boolean> {
  const state = readEngineState();
  const endpoint = state?.kind === "compose" && state.restPort === getRestPort() && !shouldUseAgentmemoryUrl()
    ? `http://127.0.0.1:${state.restPort}`
    : getBaseUrl();
  const result = await withinStartupDeadline(startupDeadline(2000), (signal) => probeEngine(endpoint, signal)).catch(() => null);
  return result?.completed === true && result.value;
}

async function isAgentmemoryReady(): Promise<boolean> {
  const result = await withinStartupDeadline(startupDeadline(2000), workerReadinessProbe).catch(() => null);
  return result?.completed === true && result.value;
}

function workerReadinessProbe(signal: AbortSignal): Promise<boolean> {
  return probeWorker(getBaseUrl(), signal, (port) => { discoveredViewerPort = port; });
}

function warnIfRelocatedDataDir(): void {
  if (!dataDirResolution.relocatedFrom) return;

  try {
    mkdirSync(dataDirResolution.dataDir, { recursive: true });
    const marker = join(dataDirResolution.dataDir, ".cwd-relocation-warning");
    if (existsSync(marker)) return;
    p.log.warn(
      `Default data dir ${dataDirResolution.relocatedFrom} is inside a git worktree; using ${dataDirResolution.dataDir} instead.`,
    );
    writeFileSync(marker, new Date().toISOString());
  } catch {
    p.log.warn(
      `Default data dir ${dataDirResolution.relocatedFrom} is inside a git worktree; using ${dataDirResolution.dataDir} instead.`,
    );
  }
}

function whichBinary(name: string): string | null {
  const cmd = IS_WINDOWS ? "where" : "which";
  try {
    const out = execFileSync(cmd, [name], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return first ?? null;
  } catch {
    return null;
  }
}

// Private install location agentmemory manages itself. Sits under the
// agentmemory state dir (~/.agentmemory/bin) so the pinned engine stays
// isolated from a user-managed iii on PATH or in ~/.local/bin. A
// fresh box with iii 0.16.1 already on PATH refused to boot because the
// hard-pin enforcer told users to overwrite their global install with
// the pinned version. Private install resolves the conflict without touching their
// existing iii.
function agentmemoryBinDir(): string {
  if (IS_WINDOWS) {
    const userProfile = process.env["USERPROFILE"];
    if (!userProfile) return join(homedir(), ".agentmemory", "bin");
    return join(userProfile, ".agentmemory", "bin");
  }
  return join(homedir(), ".agentmemory", "bin");
}

function privateIiiPath(): string {
  return join(agentmemoryBinDir(), IS_WINDOWS ? "iii.exe" : "iii");
}

function fallbackIiiPaths(): string[] {
  if (IS_WINDOWS) {
    const userProfile = process.env["USERPROFILE"];
    const paths = [privateIiiPath()];
    if (userProfile) {
      paths.push(
        join(userProfile, ".local", "bin", "iii.exe"),
        join(userProfile, "bin", "iii.exe"),
      );
    }
    return paths;
  }
  const home = process.env["HOME"];
  const paths = [privateIiiPath()];
  if (home) {
    paths.push(join(home, ".local", "bin", "iii"));
  }
  paths.push("/usr/local/bin/iii");
  return paths;
}

function iiiBinVersion(binPath: string): string | null {
  try {
    const out = execFileSync(binPath, ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const match = out.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
    return match ? match[1]! : null;
  } catch {
    return null;
  }
}

// Resolve a compatible iii binary for the pinned engine version.
//
// Soft-warn lets the worker boot against a mismatched engine and crash at
// runtime (the SDK and engine wire protocol move together; 0.20+ renamed the
// SDK surface entirely). Hard-pin without a fallback leaves the user stuck — they
// either downgrade their global iii (breaking other consumers) or set
// AGENTMEMORY_III_VERSION and hope it works.
//
// Instead: when the candidate iii on PATH is the wrong version, prefer
// the private install under ~/.agentmemory/bin/iii. If the private copy
// is missing or also mismatched, the caller installs the pinned version
// there before retrying. AGENTMEMORY_III_VERSION still overrides
// IIPINNED_VERSION upstream so users who knowingly want a different
// engine can opt in.
function resolveCompatibleIii(iiiBinPath: string | null | undefined): string | null {
  if (!iiiBinPath) return null;
  const detected = iiiBinVersion(iiiBinPath);
  if (detected && detected === IIPINNED_VERSION) return iiiBinPath;

  const privatePath = privateIiiPath();
  if (iiiBinPath !== privatePath && existsSync(privatePath)) {
    const privateVersion = iiiBinVersion(privatePath);
    if (privateVersion === IIPINNED_VERSION) {
      const reason = detected ? `v${detected} mismatches pin` : "probe failed";
      vlog(
        `iii at ${iiiBinPath} ${reason} v${IIPINNED_VERSION}; using private install at ${privatePath}.`,
      );
      return privatePath;
    }
  }

  return null;
}

function enginePidfilePath(): string {
  return runtimeMetadataPath("iii.pid");
}

function engineStatePath(): string {
  return runtimeMetadataPath("engine-state.json");
}

type ComposeEngineState = {
  kind: "compose";
  restPort: number;
  viewerPort: number;
  enginePort: number;
  engineUrl: string;
  namespace: string;
  file: string;
  stateDir: string;
  logFile: string;
  logStartOffset?: number;
  binPath: string;
  composePid?: number;
  enginePid?: number;
  workerBinDir?: string;
  workerFailure?: string;
  workerVersions?: typeof COMPOSE_WORKER_VERSIONS | { local: true };
};

type NativeEngineState = {
  kind: "native";
  configPath: string;
  cwd?: string;
  attached?: boolean;
  binPath?: string;
  restPort?: number;
};


type EngineState = NativeEngineState | LegacyDockerEngineState | ComposeEngineState;

function readEnginePidfile(): number | null {
  try {
    const pidStr = readFileSync(enginePidfilePath(), "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearEnginePidfile(): void {
  try {
    unlinkSync(enginePidfilePath());
  } catch {}
}

function workerPidfilePath(): string {
  return runtimeMetadataPath("worker.pid");
}

function readWorkerPidfile(): number | null {
  try {
    const pidStr = readFileSync(workerPidfilePath(), "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearWorkerPidfile(): void {
  try {
    unlinkSync(workerPidfilePath());
  } catch {}
}

function readEngineState(): EngineState | null {
  try {
    const raw = readFileSync(engineStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<EngineState>;
    if (parsed && (parsed.kind === "native" || parsed.kind === "docker" || parsed.kind === "compose")) {
      return parsed as EngineState;
    }
    return null;
  } catch {
    return null;
  }
}

function clearEngineState(): void {
  try {
    unlinkSync(engineStatePath());
  } catch {}
}

function engineStateRestPort(state: NativeEngineState | ComposeEngineState): number {
  if (state.restPort && Number.isFinite(state.restPort)) return state.restPort;
  if (state.kind === "compose") return 3111;
  try {
    const raw = readFileSync(state.configPath, "utf-8");
    const httpBlock = raw.match(
      /- name:\s*(?:iii-)?http([\s\S]*?)(?=\n\s*- name:|$)/,
    )?.[1];
    const configuredPort = httpBlock?.match(/\n\s*port:\s*(\d+)/)?.[1];
    if (configuredPort) return parseInt(configuredPort, 10);
  } catch {}
  return 3111;
}

async function startWorkerForEngineState(background = false): Promise<void> {
  if (readEngineState()?.kind === "compose") {
    const timeoutMs = startupTimeouts().workerMs;
    const ready = await waitForReadiness(startupDeadline(timeoutMs), workerReadinessProbe, {
      stopped: () => {
        const state = readEngineState();
        if (state?.kind === "compose") {
          try {
            const failure = composeRegistryFailureMessage(readComposeLogFromOffset(state.logFile, state.logStartOffset ?? 0), state.workerBinDir);
            if (failure) startupFailure = { kind: "engine-crashed", stderr: failure };
          } catch {}
        }
        return startupInterrupted || engineStartupFailed() || Boolean(startupFailure?.stderr?.startsWith("Worker registry unavailable"));
      },
    });
    if (!ready) {
      printComposeStartupLogs();
      const state = readEngineState();
      let registryFailure = state?.kind === "compose" ? composeStateRegistryFailure(dataDirResolution.dataDir, state.file) : null;
      if (state?.kind === "compose" && !registryFailure) {
        registryFailure = (() => {
          try { return composeRegistryFailureMessage(readComposeLogFromOffset(state.logFile, state.logStartOffset ?? 0), state.workerBinDir); } catch { return null; }
        })();
      }
      if (state?.kind === "compose" && await isEngineRunning()) {
        try {
          const status = await composeCall<ComposeStatus>({ engineUrl: state.engineUrl, namespace: state.namespace, functionId: "compose::status", file: state.file });
          const project = ownedComposeProject(status, state.file);
          const failures = (project?.containers ?? [])
            .filter((container) => container.state === "failed" || container.last_error)
            .map((container) => {
              let detail = container.last_error ?? container.state ?? "failed";
              if (container.log_path) {
                try {
                  const log = readFileSync(container.log_path, "utf8").trim();
                  if (log) detail += `\n${log.split(/\r?\n/).slice(-12).join("\n")}`;
                } catch {}
              }
              return `${container.container ?? "worker"}: ${detail}`;
            });
          if (failures.length) {
            state.workerFailure = failures.join("\n");
            writeComposeState(engineStatePath(), { ...state, workerVersions: state.workerVersions ?? (state.workerBinDir ? { local: true } : COMPOSE_WORKER_VERSIONS) });
            const aggregate = composeRegistryFailureMessage(state.workerFailure, state.workerBinDir);
            if (aggregate) {
              registryFailure = `${aggregate} Compose reported: ${state.workerFailure}`;
            } else {
              const logTail = readComposeLogFromOffset(state.logFile, state.logStartOffset ?? 0)
                .trim().split(/\r?\n/).slice(-12).join("\n");
              registryFailure = `Worker Compose failed: ${state.workerFailure}${logTail ? `\nRecent Compose output:\n${logTail}` : ""}`;
            }
          }
        } catch {}
      }
      throw new Error(registryFailure || startupFailure?.stderr || startupTimeoutMessage("worker", timeoutMs));
    }
    composeStartupCompleted = true;
    finishStartup();
    return;
  }
  const timeoutMs = startupTimeouts().workerMs;
  startupWorkerFailure = null;
  const ready = await startWorkerAndWait({
    timeoutMs,
    hasLiveWorker: () => {
      const workerPid = readWorkerPidfile();
      return Boolean(workerPid && pidAlive(workerPid));
    },
    engineStartsWorker: configuredEngineMayStartWorker,
    startWorker: async () => {
      if (background) {
        const builtEntry = join(__dirname, "index.mjs");
        const workerArgs = existsSync(builtEntry)
          ? [builtEntry]
          : ["--import", "tsx", join(__dirname, "index.ts")];
        const child = spawn(process.execPath, workerArgs, {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: { ...process.env },
        });
        spawnedStartupWorker = child;
        child.on("error", (error) => {
          if (spawnedStartupWorker === child) startupWorkerFailure = error;
        });
        child.on("exit", (code, signal) => {
          if (spawnedStartupWorker === child) startupWorkerFailure = new Error(`agentmemory worker exited during startup (${signal ?? code}).`);
        });
        child.unref();
      } else {
        importedStartupWorker = true;
        await import("./index.js");
      }
    },
    probe: workerReadinessProbe,
    stopped: () => startupInterrupted || engineStartupFailed() || startupWorkerFailure !== null,
  });
  if (!ready) {
    if (startupWorkerFailure) throw startupWorkerFailure;
    if (engineStartupFailed()) throw new Error("iii-engine exited before the agentmemory worker became ready.");
    throw new Error(startupTimeoutMessage("worker", timeoutMs));
  }
  finishStartup();
}

function configuredEngineMayStartWorker(): boolean {
  const explicit = startupTimeouts().engineManagesWorker;
  if (explicit !== undefined) return explicit;
  const state = readEngineState();
  if (state?.kind !== "native" || state.attached) return false;
  try {
    const raw = readFileSync(state.configPath, "utf-8");
    return configStartsAgentmemoryWorker(raw, join(__dirname, "index.mjs"), state.cwd);
  } catch {
    return false;
  }
}


async function assertRuntimePortOwnership(): Promise<void> {
  const state = readEngineState();
  if (!state) return;
  if (state.kind === "docker") {
    p.log.error(legacyDockerStateMessage(state));
    process.exit(1);
  }
  const ownerPort = engineStateRestPort(state);
  if (state.kind === "compose" && ownerPort !== getRestPort()) return;
  const requestedPort = getRestPort();
  if (ownerPort === requestedPort) return;

  const enginePid = readEnginePidfile();
  const workerPid = readWorkerPidfile();
  let active = Boolean(
    (enginePid &&
      pidAlive(enginePid) &&
      !isForeignPortHolder(pidCommand(enginePid))) ||
    (workerPid && pidAlive(workerPid)),
  );
  if (!active) {
    try {
      await fetch(`http://127.0.0.1:${ownerPort}/`, {
        signal: AbortSignal.timeout(750),
      });
      active = true;
    } catch {}
  }
  if (active) {
    p.log.error(
      `The canonical lifecycle state is owned by a live agentmemory engine on REST port ${ownerPort}. Refusing to reuse it for port ${requestedPort}. Use the original port, or use --instance <N> for an isolated daemon.`,
    );
    process.exit(1);
  }
  clearEnginePidfile();
  clearWorkerPidfile();
  clearEngineState();
}

function isInvokedViaNpx(): boolean {
  if (process.env["npm_lifecycle_event"] === "npx") return true;
  const argv1 = process.argv[1] ?? "";
  if (argv1.includes("_npx")) return true;
  const ua = process.env["npm_config_user_agent"] ?? "";
  if (ua.startsWith("npm/") || ua.includes(" npm/")) return true;
  return false;
}

// First-run global-install prompt. Replaces the previous passive
// `p.log.info` hint that users ignored — typing `agentmemory stop`
// in a new shell would then 404 with `command not found`. We now
// ask once, persist the answer in preferences, and never ask again.
async function maybeOfferGlobalInstall(): Promise<void> {
  if (!isInvokedViaNpx()) return;
  if (!process.stdin.isTTY) return;
  if (process.env["CI"]) return;
  const prefs = readPrefs();
  if (prefs.skipGlobalInstall || prefs.skipNpxHint) return;

  const answer = await p.confirm({
    message:
      "Install agentmemory globally so the bare `agentmemory` command works in any shell? [Y/n]",
    initialValue: true,
  });
  if (p.isCancel(answer)) {
    // Treat Ctrl+C as "not now" rather than "never". Don't persist.
    return;
  }
  if (answer === false) {
    writePrefs({ skipGlobalInstall: true });
    p.log.info(
      "Skipped. Re-run via `npx @agentmemory/agentmemory` or install later with: npm install -g @agentmemory/agentmemory",
    );
    return;
  }

  const npmBin = whichBinary("npm");
  if (!npmBin) {
    p.log.warn(
      "npm not found on PATH. Install manually: npm install -g @agentmemory/agentmemory",
    );
    return;
  }
  const ok = runCommand(
    npmBin,
    ["install", "-g", `@agentmemory/agentmemory@${VERSION}`],
    { label: `Installing @agentmemory/agentmemory@${VERSION} globally` },
  );
  if (ok) {
    p.log.success(
      "Installed globally. `agentmemory stop` etc. will now work in new shells.",
    );
    // Persist so we never re-prompt even if the user happens to npx
    // again from a CI-less TTY.
    writePrefs({ skipGlobalInstall: true });
  } else {
    p.log.warn(
      "Global install failed. Try manually: npm install -g @agentmemory/agentmemory",
    );
  }
}

async function runIiiInstaller(): Promise<{ ok: boolean; binPath: string | null }> {
  const releaseUrl = iiiReleaseUrl();
  const asset = iiiReleaseAsset();
  const isZipAsset = asset?.endsWith(".zip") === true;

  if (!releaseUrl) {
    p.log.warn(
      `iii-engine binary not available for ${platform()}/${process.arch}. Download manually from https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}.`,
    );
    return { ok: false, binPath: null };
  }

  if (IS_WINDOWS || isZipAsset) {
    p.log.info(
      `Auto-install unavailable on ${platform()} — ${asset} isn't tar-compatible. Install manually:\n` +
        `  1. Download ${releaseUrl}\n` +
        `     Its SHA-256 must be ${expectedIiiSha256(IIPINNED_VERSION, asset ?? "") ?? `the value in ${releaseUrl.replace(/\.zip$/, ".sha256")}`}\n` +
        `  2. Extract iii.exe and place it on PATH (e.g. %USERPROFILE%\\.local\\bin)\n` +
        `Install the pinned iii binary from ${releaseUrl}`,
    );
    return { ok: false, binPath: null };
  }

  const shBin = whichBinary("sh");
  const curlBin = whichBinary("curl");
  const tarBin = whichBinary("tar");
  if (!shBin || !curlBin || !tarBin) {
    const missing = [!shBin && "sh", !curlBin && "curl", !tarBin && "tar"]
      .filter(Boolean)
      .join(", ");
    p.log.warn(`${missing} not found. Cannot auto-install iii-engine.`);
    return { ok: false, binPath: null };
  }

  const binDir = agentmemoryBinDir();
  const binPath = privateIiiPath();
  const label = `Installing iii-engine v${IIPINNED_VERSION} (pinned)`;
  const spinner = p.spinner();
  spinner.start(label);
  const outcome = installIiiArchive({
    sh: shBin,
    releaseUrl,
    version: IIPINNED_VERSION,
    asset: asset ?? "",
    binDir,
    binPath,
  });
  if (!outcome.ok) {
    spinner.stop(`${label} ${pc.red("✗")}`);
    const sha256 = expectedIiiSha256(IIPINNED_VERSION, asset ?? "");
    const heading =
      outcome.reason === "checksum"
        ? "iii-engine download failed verification"
        : outcome.reason === "no-checksum"
          ? "iii-engine auto-install skipped"
          : "iii-engine download failed";
    const checksumHint = sha256
      ? ""
      : `Compare the archive against ${releaseUrl.replace(/\.(tar\.gz|zip)$/, ".sha256")} before extracting.\n`;
    p.log.warn(
      `${heading}: ${outcome.detail.slice(0, 300)}\n` +
        `Install it manually, then re-run agentmemory:\n` +
        `  ${iiiManualInstallCommand(releaseUrl, binDir, binPath, sha256)}\n` +
        checksumHint,
    );
    return { ok: false, binPath: null };
  }
  spinner.stop(`${label} ${pc.green("✓")}`);
  return { ok: true, binPath };
}

type StartupFailure = {
  kind: "no-engine" | "engine-crashed";
  stderr?: string;
  binary?: string;
};

let startupFailure: StartupFailure | null = null;
let activeStartupStderr = createStartupStderrCapture();
let spawnedNativeEngine: ChildProcess | null = null;
let spawnedComposeDaemon: ChildProcess | null = null;
let composeStartupCompleted = false;
let importedStartupWorker = false;
let spawnedStartupWorker: ChildProcess | null = null;
let startupWorkerFailure: Error | null = null;
let engineReadinessDeadline: StartupDeadline | null = null;
let startupInterrupted = false;
let finishStartup = (): void => {};

function beginStartup(): void {
  finishStartup();
  startupInterrupted = false;
  const unregister = registerStartupCleanup(cleanupFailedStartup);
  const interrupt = async (exitCode: number): Promise<void> => {
    startupInterrupted = true;
    process.exit(await runStartupCleanup(exitCode).catch(() => exitCode));
  };
  const onInterrupt = () => { void interrupt(130); };
  const onTerminate = () => { void interrupt(143); };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  finishStartup = () => {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    unregister();
    finishStartup = () => {};
  };
}

function engineStartupFailed(): boolean {
  return startupFailure?.kind === "engine-crashed";
}

async function cleanupFailedStartup(): Promise<void> {
  engineReadinessDeadline = null;
  if (importedStartupWorker && readWorkerPidfile() === process.pid) clearWorkerPidfile();
  const worker = spawnedStartupWorker;
  spawnedStartupWorker = null;
  if (worker && typeof worker.pid === "number") {
    if (worker.exitCode === null && worker.signalCode === null && !(await signalAndWait(worker.pid, "SIGTERM", 3000))) {
      p.log.warn(`Started worker pid ${worker.pid} survived shutdown; lifecycle state was preserved.`);
      return;
    }
    if (readWorkerPidfile() === worker.pid) clearWorkerPidfile();
  }
  const composeChild = spawnedComposeDaemon;
  spawnedComposeDaemon = null;
  if (composeChild && typeof composeChild.pid === "number") {
    const stopped = await signalAndWait(composeChild.pid, "SIGTERM", 20_000);
    if (!stopped) p.log.warn(`Compose daemon pid ${composeChild.pid} survived shutdown; lifecycle state was preserved.`);
    else clearEngineState();
  }
  const child = spawnedNativeEngine;
  spawnedNativeEngine = null;
  if (!child || typeof child.pid !== "number") return;
  if (!IS_WINDOWS) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = await signalAndWait(child.pid, "SIGTERM", 3000);
    if (!stopped) {
      p.log.warn(`Started engine pid ${child.pid} survived shutdown; lifecycle state was preserved.`);
      return;
    }
  }
  if (readEnginePidfile() === child.pid) {
    clearEnginePidfile();
    clearEngineState();
  }
}

function printCapturedStartupStderr(): void {
  const stderr = redactCredentialUrls(activeStartupStderr.text().trim());
  if (IS_VERBOSE && stderr) {
    p.note(stderr, "engine stderr");
  }
}

function readComposeStartupLogs(): { path: string; text: string } | null {
  const state = readEngineState();
  if (state?.kind !== "compose") return null;
  try {
    const text = readComposeLogFromOffset(state.logFile, state.logStartOffset ?? 0).trim();
    return { path: state.logFile, text: redactCredentialUrls(text.slice(-16 * 1024)) };
  } catch {
    return { path: state.logFile, text: "(Compose log file could not be read.)" };
  }
}

function printComposeStartupLogs(): void {
  const logs = readComposeStartupLogs();
  if (!logs) return;
  if (logs.text) p.note(`Log file: ${logs.path}\n\n${logs.text}`, "Recent Worker Compose output");
}

function composePidMatches(pid: number, state: ComposeEngineState): boolean {
  try {
    let command = "";
    let executable = "";
    if (IS_WINDOWS) {
      // Preserve the existing PowerShell CIM ExecutablePath check on Windows;
      // if CIM does not provide a path, the process is not considered owned.
      const script = `$process = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($process) { @{ command = $process.CommandLine; executable = $process.ExecutablePath } | ConvertTo-Json -Compress }`;
      const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const processInfo = JSON.parse(result) as { command?: string; executable?: string };
      command = processInfo.command ?? "";
      executable = processInfo.executable ?? "";
    } else if (platform() === "darwin") {
      command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      executable = readUnixProcessExecutable(pid, "darwin");
    } else {
      command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      executable = readUnixProcessExecutable(pid, "linux");
    }
    const expectedCommand = command.includes("compose") &&
      command.includes("compose --namespace") &&
      command.includes(state.namespace) &&
      command.includes(state.file);
    if (!expectedCommand) return false;
    if (!executable) return false;
    return sameResolvedExecutable(executable, state.binPath, IS_WINDOWS);
  } catch {
    return false;
  }
}

function composeChildProcesses(state: ComposeEngineState): Array<{ pid: number; pgid: number; args: string }> {
  if (IS_WINDOWS || !state.composePid) return [];
  try {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,pgid=,command="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((row) => {
        const match = row.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
        return match ? { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), args: match[4]! } : null;
      })
      .filter((row): row is { pid: number; ppid: number; pgid: number; args: string } => row !== null);
    const descendants = new Set([state.composePid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (!descendants.has(row.pid) && descendants.has(row.ppid)) {
          descendants.add(row.pid);
          changed = true;
        }
      }
    }
    return rows
      .filter((row) => row.pid !== state.composePid && descendants.has(row.pid))
      .map(({ pid, pgid, args }) => ({ pid, pgid, args }));
  } catch {
    return [];
  }
}

function composeChildPids(state: ComposeEngineState): number[] {
  return [...new Set(composeChildProcesses(state).map((child) => child.pid))];
}

function composeEnginePid(state: ComposeEngineState): number | undefined {
  return composeChildProcesses(state).find(({ args }) => args.includes(" --config ") && args.includes(state.namespace))?.pid;
}

async function terminateComposeChildren(state: ComposeEngineState): Promise<boolean> {
  if (IS_WINDOWS) return true;
  const groups = [...new Set(composeChildProcesses(state).map((child) => child.pgid).filter((pgid) => pgid !== state.composePid))];
  let stopped = true;
  for (const pgid of groups) {
    try { process.kill(-pgid, "SIGTERM"); } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ESRCH") stopped = false;
      continue;
    }
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try { process.kill(-pgid, 0); } catch { break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    try { process.kill(-pgid, 0); process.kill(-pgid, "SIGKILL"); } catch {}
  }
  for (const pid of composeChildPids(state)) {
    if (pidAlive(pid) && !(await signalAndWait(pid, "SIGTERM", 1000))) stopped = false;
  }
  return stopped;
}

async function startIiiBin(iiiBin: string): Promise<boolean> {
  const workerBinDir = process.env["AGENTMEMORY_WORKER_BIN_DIR"]?.trim() || undefined;
  if (workerBinDir && (!existsSync(resolve(process.cwd(), workerBinDir)) ||
    !["state", "http"].every((name) => existsSync(join(resolve(process.cwd(), workerBinDir), name))))) {
    throw new Error(`AGENTMEMORY_WORKER_BIN_DIR must contain executable state and http binaries: ${workerBinDir}`);
  }
  const envPath = join(homedir(), ".agentmemory", ".env");
  const namespace = composeNamespace(getRestPort());
  const projectRoot = resolve(__dirname, "..");
  const ports = { restPort: getRestPort(), viewerPort: getConfiguredViewerPort(), enginePort: getEnginePort() };
  // Fast, actionable diagnosis before Compose attempts to bind its managed listeners.
  // Only reachable local TCP listeners count; failures to connect mean free/closed.
  await assertComposePortsFree([ports.restPort, ports.viewerPort, ports.enginePort]);
  const compose = startComposeDaemon({
    ports,
    dataDir: dataDirResolution.dataDir,
    projectRoot,
    nodeBin: process.execPath,
    homeDir: homedir(),
    ...(existsSync(envPath) ? { envFile: envPath } : {}),
    ...(workerBinDir ? { workerBinDir } : {}),
    cwd: process.cwd(),
    stateBackend: { kind: getStateBackend() },
    ...(getStateBackend() === "redis" && getRedisUrl() ? { redisUrl: getRedisUrl() } : {}),
    workerEnvironment: process.env,
    disableRestartPolicy: process.env["AGENTMEMORY_DISABLE_COMPOSE_RESTART"] === "1",
    startupTimeoutMs: startupTimeouts().workerMs,
    linux: process.platform === "linux",
    stateDir: join(dataDirResolution.dataDir, "compose-state"),
    logFile: join(homedir(), ".agentmemory", `compose-${getRestPort()}.log`),
    iiiBin,
    env: process.env,
  });
  spawnedComposeDaemon = compose.child;
  composeStartupCompleted = false;
  if (typeof compose.child.pid !== "number") throw new Error("Failed to spawn the iii Compose daemon.");
  const state = {
    kind: "compose" as const,
    restPort: getRestPort(),
    viewerPort: getConfiguredViewerPort(),
    enginePort: getEnginePort(),
    engineUrl: `ws://127.0.0.1:${getEnginePort()}`,
    namespace,
    file: compose.file,
    stateDir: compose.stateDir,
    logFile: compose.logFile,
    logStartOffset: compose.logStartOffset,
    binPath: iiiBin,
    composePid: compose.child.pid,
    ...(workerBinDir ? { workerBinDir: resolve(process.cwd(), workerBinDir) } : {}),
  };
  writeComposeState(engineStatePath(), {
    ...state,
    workerVersions: workerBinDir ? { local: true } : COMPOSE_WORKER_VERSIONS,
  });
  engineReadinessDeadline = startupDeadline(startupTimeouts().engineMs);
  engineReadinessDeadline = startupDeadline(startupTimeouts().engineMs);
  compose.child.on("error", (error) => {
    if (spawnedComposeDaemon === compose.child) {
      startupFailure = { kind: "engine-crashed", stderr: redactCredentialUrls(error.message), binary: iiiBin };
    }
  });
  compose.child.on("exit", (code, signal) => {
    if (spawnedComposeDaemon === compose.child && !composeStartupCompleted && (code !== 0 || signal !== null)) {
      startupFailure = {
        kind: "engine-crashed",
        stderr: signal ? `Compose exited from ${signal}` : `Compose exited with code ${code}`,
        binary: iiiBin,
      };
    }
  });
  const s = p.spinner();
  s.start(`Starting iii Worker Compose: ${iiiBin}`);
  s.stop(c.ok(`Compose daemon started (pid ${compose.child.pid})`));
  return true;
}

// Find a pinned-compatible iii path from a list of candidates. Returns
// the first candidate whose --version matches the pin, OR returns the
// private install path if it exists and matches, OR null if no candidate
// is compatible. Caller (startEngine) auto-installs the pin to the
// private path when this returns null.
function pickCompatibleIii(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const resolved = resolveCompatibleIii(c);
    if (resolved) return resolved;
  }
  return null;
}

async function startEngine(): Promise<boolean> {
  startupFailure = null;
  engineReadinessDeadline = null;
  let stateBackendKind: "file" | "redis";
  try {
    stateBackendKind = getStateBackend();
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  if (stateBackendKind === "redis" && !getRedisUrl()) {
    p.log.error(
      "AGENTMEMORY_STATE_BACKEND=redis requires AGENTMEMORY_REDIS_URL to be set (e.g. redis://localhost:6379). " +
        "Set both in ~/.agentmemory/.env, or unset AGENTMEMORY_STATE_BACKEND to keep the default file store.",
    );
    process.exit(1);
  }
  const persistedState = readEngineState();
  if (persistedState?.kind === "docker") {
    p.log.error(legacyDockerStateMessage(persistedState));
    return false;
  }
  await assertRuntimePortOwnership();
  if (persistedState?.kind === "compose") {
    if (await isEngineRunning()) {
      p.log.error("The managed Worker Compose engine is already running; it should have been reconciled before attempting a fresh start.");
      process.exit(1);
    }
    if (persistedState.restPort === getRestPort()) {
      if (persistedState.composePid && pidAlive(persistedState.composePid)) {
        p.log.error(`Worker Compose daemon ${persistedState.composePid} is still alive. Stop it before retrying.`);
        process.exit(1);
      }
      clearEngineState();
    }
  }
  warnIfRelocatedDataDir();
  const pathIii = whichBinary("iii");
  vlog(`iii binary: ${pathIii ?? "(not on PATH)"}`);

  const fallbacks = fallbackIiiPaths().filter((p) => existsSync(p));
  for (const f of fallbacks) {
    const v = iiiBinVersion(f);
    vlog(`fallback iii at ${f} reports version: ${v ?? "unknown"}`);
  }

  let iiiBin = pickCompatibleIii([pathIii, ...fallbacks]);

  if (iiiBin) {
    if (iiiBin !== pathIii) {
      p.log.info(`Using iii at: ${c.dim(iiiBin)} (v${c.accent(IIPINNED_VERSION)})`);
      process.env["PATH"] = `${dirname(iiiBin)}${PATH_DELIMITER}${process.env["PATH"] ?? ""}`;
    }
    return startIiiBin(iiiBin);
  }

  if (pathIii && !iiiBin) {
    const detected = iiiBinVersion(pathIii);
    vlog(
      `iii on PATH is v${detected ?? "unknown"}, pin is v${IIPINNED_VERSION}. ` +
        `Will install pinned engine to ${privateIiiPath()}.`,
    );
  }

  mkdirSync(dataDirResolution.dataDir, { recursive: true });
  const interactive = !!process.stdin.isTTY && !process.env["CI"];

  type Choice = "install" | "manual";
  let choice: Choice;

  // Wrong-version iii on PATH is a configuration trap: any prompt would
  // confuse the user since they already "have iii installed". Skip the
  // prompt and auto-install pinned engine to the private location.
  const pathIiiMismatch = pathIii !== null && resolveCompatibleIii(pathIii) === null;

  if (pathIiiMismatch) {
    choice = "install";
    const detected = iiiBinVersion(pathIii!);
    p.log.info(
      `iii on PATH is v${detected ?? "unknown"} but agentmemory pins v${IIPINNED_VERSION}. ` +
        `Installing pinned engine to ~/.agentmemory/bin (leaves your existing iii untouched).`,
    );
  } else if (!interactive) {
    choice = "install";
    p.log.info("Non-interactive environment detected — auto-installing iii-engine.");
  } else {
    p.log.warn(`iii-engine binary not found locally.`);
    const options: { value: Choice; label: string; hint?: string }[] = [
      {
        value: "install",
        label: `Install iii v${IIPINNED_VERSION} to ~/.agentmemory/bin (~6MB, ~5s)`,
        hint: "recommended",
      },
    ];
    options.push({ value: "manual", label: "Show manual install steps and exit" });

    const picked = await p.select<Choice>({
      message: "How would you like to start iii-engine?",
      options,
      initialValue: "install",
    });
    if (p.isCancel(picked)) {
      startupFailure = { kind: "no-engine" };
      return false;
    }
    choice = picked;
  }

  if (choice === "manual") {
    startupFailure = { kind: "no-engine" };
    return false;
  }

  if (choice === "install") {
    const result = await runIiiInstaller();
    if (result.ok && result.binPath) {
      process.env["PATH"] = `${dirname(result.binPath)}${PATH_DELIMITER}${process.env["PATH"] ?? ""}`;
      iiiBin = result.binPath;
      return startIiiBin(iiiBin);
    }
    startupFailure = { kind: "no-engine" };
    return false;
  }

  startupFailure = { kind: "no-engine" };
  return false;
}

async function waitForEngine(timeoutMs = startupTimeouts().engineMs): Promise<boolean> {
  const state = readEngineState();
  // A composed engine's websocket port is internal control-plane detail and
  // may be unavailable while its HTTP workers are still binding. The owned
  // loopback REST listener is the readiness contract consumed by the CLI and
  // does not depend on AGENTMEMORY_URL (which is for client commands only).
  const endpoint = state?.kind === "compose"
    ? managedComposeReadinessUrl(state.restPort)
    : getBaseUrl();
  const probe = state?.kind === "compose"
    ? (signal: AbortSignal) => probeEngine(endpoint, signal)
    : (signal: AbortSignal) => probeEngine(endpoint, signal);
  return waitForReadiness(engineReadinessDeadline ?? startupDeadline(timeoutMs), probe, {
    intervalMs: 250,
    probeTimeoutMs: 750,
    stopped: () => startupInterrupted || engineStartupFailed(),
  });
}

async function waitForPersistedNativeEngine(): Promise<boolean> {
  const state = readEngineState();
  const pid = readEnginePidfile();
  if (state?.kind !== "native" || !pid || !pidAlive(pid) || isForeignPortHolder(pidCommand(pid))) return false;
  if (!(await waitForEngine())) throw new Error(startupTimeoutMessage("engine", startupTimeouts().engineMs));
  return true;
}

function installInstructions(): string[] {
  const releaseUrl = iiiReleaseUrl();
  if (IS_WINDOWS) {
    const asset = iiiReleaseAsset() ?? "";
    const sha256 = expectedIiiSha256(IIPINNED_VERSION, asset);
    const verify = sha256
      ? `     Verify before extracting: (Get-FileHash .\\${asset}).Hash must be ${sha256.toUpperCase()}`
      : `     Verify before extracting against the matching .sha256 file on the release page`;
    return [
      `agentmemory needs iii-engine v${IIPINNED_VERSION}. Pick one:`,
      "",
      "  A) Download the prebuilt Windows binary:",
      `     1. Open https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`,
      `     2. Download iii-x86_64-pc-windows-msvc.zip (or iii-aarch64-pc-windows-msvc.zip on ARM)`,
      verify,
      "     3. Extract iii.exe to %USERPROFILE%\\.local\\bin\\iii.exe (or add to PATH)",
      "     4. Re-run: npx @agentmemory/agentmemory",
      "",
      "Or skip the engine entirely (standalone MCP):  npx @agentmemory/agentmemory mcp",
      "",
      "Docs: https://iii.dev/docs",
    ];
  }
  const linuxInstall = releaseUrl
    ? `  A) ${iiiManualInstallCommand(releaseUrl, agentmemoryBinDir(), privateIiiPath(), expectedIiiSha256(IIPINNED_VERSION, iiiReleaseAsset() ?? ""))}`
    : `  A) Manual download: https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`;
  return [
    `agentmemory needs iii-engine v${IIPINNED_VERSION}. Pick one:`,
    "",
    linuxInstall,
    "     Then re-run: npx @agentmemory/agentmemory",
    "",
    "Or skip the engine entirely (standalone MCP):  npx @agentmemory/agentmemory mcp",
    "",
    "Docs: https://iii.dev/docs",
  ];
}

function portInUseDiagnostic(port: number): string {
  return IS_WINDOWS
    ? `  netstat -ano | findstr :${port}`
    : `  lsof -i :${port}   # or: ss -tlnp | grep :${port}`;
}

function printReadyHint(): void {
  const restUrl = getBaseUrl();
  const viewerUrl = getViewerUrl();
  const engineUrl = process.env["III_ENGINE_URL"] || `ws://localhost:${getEnginePort()}`;
  const invocation = isInvokedViaNpx() ? "npx @agentmemory/agentmemory" : "agentmemory";
  const consolePort = defaultConsolePort(getConfiguredViewerPort());
  const portFlags = portFlagSuffix(getRestPort(), selectedInstance);

  const consoleLine = `${c.label("iii console")}  ${c.cmd(`${invocation} console${portFlags}`)}  ${c.dim(`(serves on :${consolePort}; first run downloads the console next to the pinned iii)`)}`;

  const lines = [
    `${c.label("REST API")}     ${c.url(restUrl)}`,
    `${c.label("Viewer")}       ${c.url(viewerUrl)}`,
    `${c.label("Engine")}       ${c.url(engineUrl)}`,
    consoleLine,
  ];
  // p.note renders a bordered panel with a title — same affordance
  // used elsewhere in this CLI for "Troubleshooting" / "Setup
  // required" blocks, so the visual language stays consistent.
  p.note(lines.join("\n"), `agentmemory v${c.accent(VERSION)}`);

  // Pick a runnable form for the suggested next-step. Users invoked
  // via `npx` don't have the bare `agentmemory` command on PATH yet
  // (unless they accepted the global-install prompt and the npm bin
  // dir was already on PATH in this shell), so we suggest the npx
  // form for them; everyone else gets the global form.
  const demoCommand = `${invocation} demo${portFlags}`;
  process.stdout.write(`\n${c.dim("Try:")} ${c.cmd(demoCommand)}\n`);
}

async function reconcilePersistedComposeEngine(): Promise<boolean> {
  const state = readEngineState();
  if (state?.kind !== "compose") return false;
  if (!(await isEngineRunning())) {
    if (state.composePid && pidAlive(state.composePid)) {
      p.log.error(`Worker Compose daemon ${state.composePid} is alive but REST ${state.restPort} is not ready. Inspect ${state.logFile}; use agentmemory stop to reconcile.`);
      process.exit(1);
    }
    if (await isEngineRunning()) {
      p.log.error(`An engine is responding on :${state.restPort}, but the recorded Compose daemon is gone. Refusing to adopt or clear this endpoint automatically.`);
      process.exit(1);
    }
    clearEngineState();
    p.log.info("Found stale Worker Compose lifecycle state; starting a fresh managed instance.");
    return false;
  }
  const version = iiiBinVersion(state.binPath);
  if (state.composePid && !composePidMatches(state.composePid, state)) {
    p.log.error(`Compose metadata points to PID ${state.composePid}, but its process identity does not match the saved engine/file/namespace.`);
    process.exit(1);
  }
  if (version !== IIPINNED_VERSION) {
    p.log.error(`Managed Compose engine is ${version ?? "unverified"}; expected ${IIPINNED_VERSION}. Run agentmemory stop before changing the runtime.`);
    process.exit(1);
  }
  try {
    const status = await composeCall<ComposeStatus>({ engineUrl: state.engineUrl, namespace: state.namespace, functionId: "compose::status", file: state.file });
    if (!ownedComposeProject(status, state.file)) throw new Error("Compose daemon does not report the owned worker-compose.yaml project.");
  } catch (err) {
    p.log.error(`Could not verify the managed Compose project: ${err instanceof Error ? err.message : String(err)}. See ${state.logFile}.`);
    process.exit(1);
  }
  return true;
}

async function main() {
  startupTimeouts();
  await assertRuntimePortOwnership();
  // Booting a second instance next to a live daemon registers a duplicate
  // worker on the running engine, and before iii 0.19.2 the second instance's
  // shutdown tore down the daemon's HTTP trigger routing (every
  // /agentmemory/* route 404s until a full engine restart). Refuse instead.
  // A different --instance resolves to a different port, so multi-instance
  // setups are unaffected.
  try {
    const probe = await fetch(`${getBaseUrl()}/agentmemory/livez`, {
      signal: AbortSignal.timeout(1500),
    });
    if (probe.ok && readEngineState()?.kind !== "compose") {
      p.log.error(
        `agentmemory is already running on port ${getRestPort()}. Starting a second instance here would corrupt the running daemon's REST routing. Use the REST API (or the MCP tools) against the running instance, run a different --instance, or stop it first with \`agentmemory stop\`.`,
      );
      process.exit(1);
    }
  } catch {
    // no live daemon on this port; boot normally
  }

  const legacyState = readEngineState();
  if (legacyState?.kind === "docker") {
    p.intro("agentmemory");
    p.log.error(legacyDockerStateMessage(legacyState));
    process.exit(1);
  }

  // `--reset` wipes preferences before anything else so the onboarding
  // flow below always runs fresh.
  if (IS_RESET) {
    resetPrefs();
  }

  const firstRun = isFirstRun();
  const prefs = readPrefs();
  // Show the splash on the first run, on --reset, or whenever the user
  // hasn't yet opted out via the schema (we set `skipSplash: true`
  // after onboarding completes). Verbose runs always splash since the
  // user explicitly asked for the chatty experience.
  if (firstRun || IS_RESET || IS_VERBOSE || !prefs.skipSplash) {
    renderSplash(VERSION);
  }

  if (firstRun || IS_RESET) {
    await runOnboarding();
  }

  beginStartup();

  if (skipEngine) {
    if (IS_VERBOSE) p.log.info("Skipping engine check (--no-engine)");
    await startWorkerForEngineState();
    await maybeOfferGlobalInstall();
    printReadyHint();
    return;
  }

  if (await reconcilePersistedComposeEngine()) {
    await startWorkerForEngineState();
    await maybeOfferGlobalInstall();
    printReadyHint();
    return;
  }

  if (await isEngineRunning() || await waitForPersistedNativeEngine()) {
    if (IS_VERBOSE) p.log.success("iii-engine is running");
    // Prefer the binary path persisted at launch time over whatever's on
    // PATH now. PATH lookups misfire when a global iii install gets added
    // after agentmemory started (or when the running engine was launched
    // from a path that's no longer first on PATH).
    const persisted = readEngineState();
    const persistedBin =
      persisted?.kind === "native" && persisted.binPath && existsSync(persisted.binPath)
        ? persisted.binPath
        : null;
    const attachedBin =
      persistedBin ??
      whichBinary("iii") ??
      fallbackIiiPaths().find((p) => existsSync(p)) ??
      null;
    const detected = persisted?.kind === "compose" ? iiiBinVersion(persisted.binPath) : attachedBin ? iiiBinVersion(attachedBin) : null;

    // Fail closed: only adopt the running engine when we can positively
    // confirm it is the pinned version. An unknown version (detected === null,
    // e.g. the binary can't be version-probed) is treated as incompatible —
    // adopting a foreign or unverifiable engine hangs the worker in a
    // WebSocket reconnect loop. Worst case here is a re-run that reinstalls
    // the pinned engine, never a silent loop.
    if (detected === IIPINNED_VERSION) {
      p.log.error(`An unmanaged iii engine is already listening on ${getEnginePort()}. Agentmemory will not attach to it; stop that engine explicitly or select another --instance/--port.`);
      process.exit(1);
    }

    const detectedLabel = detected ? `v${detected}` : "an unverified version";

    // An incompatible engine owns the port. Adopting it hangs the worker in a
    // WebSocket reconnect loop (it can't speak that engine's protocol), so stop
    // with the simplest honest remedy. A normal user has no other engine and
    // never sees this; only someone running their own iii does, and for them
    // "stop it, then run normally" is the fix. We do not suggest a different
    // engine version: agentmemory only supports v${IIPINNED_VERSION}.
    const base = isInvokedViaNpx() ? "npx @agentmemory/agentmemory" : "agentmemory";
    p.log.error(
      `Another iii-engine (${detectedLabel}) is running on port ${getEnginePort()}, and agentmemory needs its own pinned v${IIPINNED_VERSION}.`,
    );
    p.note(
      [
        `agentmemory only supports iii-engine v${IIPINNED_VERSION}. It will not adopt or change the running engine (${detectedLabel}).`,
        "",
        c.label("Switch to the pinned engine in two steps:"),
        "",
        `  1. Stop the running engine:`,
        `       ${c.cmd(`${base} stop --force`)}`,
        `     ${c.dim(`(or stop your own iii however you started it — agentmemory leaves your global iii untouched)`)}`,
        "",
        `  2. Start agentmemory. It downloads and runs the pinned`,
        `     v${IIPINNED_VERSION} into ~/.agentmemory/bin automatically:`,
        `       ${c.cmd(base)}`,
        "",
        c.dim(`Step 2 needs no manual install. To install iii v${IIPINNED_VERSION} yourself (replaces your global iii), curl:`),
        `     ${c.cmd(IIIENGINE_INSTALL_CMD)}`,
        `     ${c.dim("or download the release:")} ${c.url(`https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`)}`,
      ].join("\n"),
      "engine conflict",
    );
    process.exit(1);
  }

  const started = await startEngine();
  if (!started) {
    p.log.error("Could not start iii-engine.");
    const lines = installInstructions();
    p.note(lines.join("\n"), "Setup required");
    throw new Error("iii-engine could not be started.");
  }

  const s = p.spinner();
  s.start("Waiting for iii-engine to be ready...");

  const ready = await waitForEngine();
  if (ready) {
    const composeState = readEngineState();
    if (composeState?.kind === "compose") {
      composeState.enginePid = composeEnginePid(composeState);
      writeComposeState(engineStatePath(), { ...composeState, workerVersions: composeState.workerVersions ?? COMPOSE_WORKER_VERSIONS });
    }
  }
  if (!ready) {
    const port = getRestPort();
    let composeState = readEngineState();
    let composeLog = composeState?.kind === "compose" ? readComposeStartupLogs() : null;
    if (composeState?.kind === "compose" && spawnedComposeDaemon?.exitCode !== null) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      composeLog = readComposeStartupLogs() ?? composeLog;
    }
    let registryFailure: string | null = null;
    if (composeState?.kind === "compose") {
      const stateFailure = composeState.workerFailure ?? composeStateRegistryFailure(dataDirResolution.dataDir, composeState.file);
      const logFailure = composeLog ? composeRegistryFailureMessage(composeLog.text, composeState.workerBinDir) : null;
      if (stateFailure) registryFailure = `Worker registry unavailable while resolving state/http; retry later or set AGENTMEMORY_WORKER_BIN_DIR. Compose reported: ${stateFailure}`;
      else registryFailure = logFailure;
    }
    const composeLogTail = composeLog?.text.trim().split(/\r?\n/).slice(-12).join("\n");
    const shortFailure = registryFailure || startupFailure?.stderr ||
      (composeState?.kind === "compose" && composeLogTail
        ? `Worker Compose startup failed. Recent Compose output:\n${composeLogTail}`
        : startupTimeoutMessage("engine", startupTimeouts().engineMs));
    s.stop(shortFailure);
    printComposeStartupLogs();

    if (startupFailure?.kind === "engine-crashed") {
      p.log.error("The iii-engine process crashed on startup.");
      if (startupFailure.binary) {
        p.log.info(`Binary: ${startupFailure.binary}`);
      }
      if (startupFailure.stderr) {
        p.note(startupFailure.stderr, "engine stderr");
      } else {
        p.log.info("No stderr was captured. Re-run with --verbose for more detail.");
      }
      p.note(
        [
          "Common causes:",
          `  - iii-engine version mismatch — reinstall the pinned v${IIPINNED_VERSION} binary`,
          "    (sh script on macOS/Linux, GitHub release zip on Windows)",
          "  - Port already in use (see below)",
          "",
          "See https://iii.dev/docs for current install instructions.",
        ].join("\n"),
        "Troubleshooting",
      );
    } else {
      p.log.error("The engine process started but the REST API never responded.");
      printCapturedStartupStderr();
      p.note(
        [
          `Check whether port ${port} is already bound by another process:`,
          portInUseDiagnostic(port),
          "",
          "If it is, free the port or override: agentmemory --port <N>",
          "",
          "If it isn't, a firewall may be blocking 127.0.0.1:" + port + ".",
          "Re-run with --verbose to see engine stderr.",
        ].join("\n"),
        "Troubleshooting",
      );
    }
    if (composeLog?.text) p.log.error(`Compose log: ${composeLog.path}`);
    throw new Error(shortFailure);
  }

  s.stop(c.ok("iii-engine is ready"));
  await startWorkerForEngineState();
  const managedCompose = readEngineState();
  if (managedCompose?.kind === "compose" && !managedCompose.enginePid) {
    managedCompose.enginePid = composeChildPids(managedCompose)[0];
    writeComposeState(engineStatePath(), { ...managedCompose, workerVersions: managedCompose.workerVersions ?? COMPOSE_WORKER_VERSIONS });
  }
  await maybeOfferGlobalInstall();
  printReadyHint();
  // Mark splash as something to skip on subsequent runs. This is a
  // no-op if onboarding already flipped the flag (idempotent merge).
  writePrefs({ skipSplash: true });
  // Worker Compose owns the service lifecycle independently of this startup
  // launcher. Do not leave readiness-probe keep-alive sockets referenced after
  // printing the ready hint; the daemon and its worker remain detached.
  if (managedCompose?.kind === "compose") {
    await new Promise<void>((resolve) => process.stdout.write("", () => resolve()));
    process.exit(0);
  }
}

async function apiFetch<T = unknown>(base: string, path: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const headers: Record<string, string> = bearerHeaders(base);
    const res = await fetch(`${base}/agentmemory/${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function runStatus() {
  const base = getBaseUrl();
  p.intro("agentmemory status");
  const savedState = readEngineState();
  if (savedState?.kind === "docker") {
    p.log.warn(legacyDockerStateMessage(savedState));
  }

  const up = await isEngineRunning();
  if (!up) {
    if (savedState?.kind === "compose" && savedState.composePid && pidAlive(savedState.composePid)) {
      try {
        const composeStatus = await composeCall<ComposeStatus>({
          engineUrl: savedState.engineUrl,
          namespace: savedState.namespace,
          functionId: "compose::status",
          file: savedState.file,
        });
        const project = ownedComposeProject(composeStatus, savedState.file);
        const failure = composeWorkerFailureSummary(project);
        if (failure) {
          p.log.error(`Worker Compose failed after exhausting restart attempts; REST is unavailable at ${base}.`);
          p.log.error(failure);
          p.log.info(`Inspect ${savedState.logFile}, then run agentmemory stop before retrying.`);
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        p.log.warn(`Worker Compose status unavailable: ${message}`);
      }
    }
    p.log.error(`Not running — no response at ${base}`);
    p.log.info("Start with: npx @agentmemory/agentmemory");
    process.exit(1);
  }

  try {
    const [healthRes, sessionsRes, graphRes, memoriesRes, flagsRes, followupRes] = await Promise.all([
      apiFetch<any>(base, "health"),
      apiFetch<any>(base, "sessions"),
      apiFetch<any>(base, "graph/stats"),
      apiFetch<any>(base, "memories?count=true"),
      apiFetch<any>(base, "config/flags"),
      apiFetch<any>(base, "diagnostics/followup"),
    ]);

    if (typeof healthRes?.viewerPort === "number") {
      discoveredViewerPort = healthRes.viewerPort;
    }
    const h = healthRes?.health;
    const status = healthRes?.status || "unknown";
    const version = healthRes?.version || "?";
    const sessionList = Array.isArray(sessionsRes?.sessions) ? sessionsRes.sessions : [];
    const sessions = sessionList.length;
    const nodes = graphRes?.available === false ? "unknown" : graphRes?.totalNodes ?? graphRes?.nodes ?? graphRes?.nodeCount ?? "unknown";
    const edges = graphRes?.available === false ? "unknown" : graphRes?.totalEdges ?? graphRes?.edges ?? graphRes?.edgeCount ?? "unknown";
    const cb = healthRes?.circuitBreaker?.state || "closed";
    const heapMB = h?.memory ? Math.round(h.memory.heapUsed / 1048576) : 0;
    const uptime = h?.uptimeSeconds ? Math.round(h.uptimeSeconds) : 0;

    const obsCount = sessionList.reduce(
      (sum: number, s: any) => sum + (Number(s?.observationCount) || 0),
      0,
    );
    const memCount = Number(memoriesRes?.latestCount ?? memoriesRes?.total ?? 0) || 0;
    const estFullTokens = obsCount * 80;
    const estInjectedTokens = Math.min(obsCount, 50) * 38;
    const tokensSaved = estFullTokens - estInjectedTokens;
    const pctSaved = estFullTokens > 0 ? Math.round((tokensSaved / estFullTokens) * 100) : 0;

    p.log.success(`Connected — v${version} at ${base}`);

    const lines = [
      `Health:       ${status === "healthy" ? pc.green("✓ healthy") : pc.yellow(status)}`,
      `Sessions:     ${sessions}`,
      `Observations: ${obsCount}`,
      `Memories:     ${memCount}`,
      `Graph:        ${nodes} nodes, ${edges} edges`,
      `Circuit:      ${cb}`,
      `Heap:         ${heapMB} MB`,
      `Uptime:       ${uptime}s`,
      `Viewer:       ${c.url(getViewerUrl())}`,
    ];

    if (obsCount > 0) {
      lines.push("");
      lines.push(`Token savings: ~${tokensSaved.toLocaleString()} tokens saved (${pctSaved}% reduction)`);
      lines.push(`  Full context: ~${estFullTokens.toLocaleString()} tokens`);
      lines.push(`  Injected:     ~${estInjectedTokens.toLocaleString()} tokens`);
    }

    if (flagsRes) {
      const provider = flagsRes.provider === "llm" ? pc.green("✓ llm") : pc.yellow("✗ noop (no key)");
      const embed = flagsRes.embeddingProvider === "embeddings" ? pc.green("✓ embeddings") : pc.dim("bm25-only");
      const flagRows = (flagsRes.flags || []).map((f: { key: string; enabled: boolean; label: string }) =>
        `  ${f.enabled ? pc.green("✓") : pc.dim("✗")} ${pc.bold(f.key.padEnd(32))} ${f.label}`
      );
      lines.push("");
      lines.push(`Provider:     ${provider}`);
      lines.push(`Embeddings:   ${embed}`);
      lines.push(`Flags:`);
      flagRows.forEach((r: string) => lines.push(r));
    }

    if (followupRes && Number.isFinite(followupRes.agentInitiatedSearches)) {
      const total = Number(followupRes.agentInitiatedSearches) || 0;
      const hits = Number(followupRes.followupWithinWindow) || 0;
      const pct = total > 0 ? Math.round((hits / total) * 100) : 0;
      lines.push("");
      lines.push(
        `Followup rate: ${hits}/${total} (${pct}%) within ${followupRes.windowSeconds}s — directional, may overcount on refinement`,
      );
    }

    const managed = readEngineState();
    if (managed?.kind === "compose") {
      try {
        const composeStatus = await composeCall<ComposeStatus>({ engineUrl: managed.engineUrl, namespace: managed.namespace, functionId: "compose::status", file: managed.file });
        const composeProject = ownedComposeProject(composeStatus, managed.file);
        const containers = composeProject?.containers ?? [];
        const failed = composeWorkerFailureSummary(composeProject ?? null);
        if (failed) lines.push("", "Worker Compose failure (restart attempts exhausted):", ...failed.split("\n").map((line) => `  ${line}`));
        lines.push("", "Compose workers:", ...containers.map((container) => `  ${container.container ?? "?"}: ${container.state ?? "unknown"}${container.last_error ? ` — ${container.last_error}` : ""}`));
      } catch (error) {
        lines.push("", `Compose status unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    p.note(lines.join("\n"), "agentmemory");
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

type DoctorCheck = { name: string; ok: boolean; hint?: string };

function formatChecks(checks: DoctorCheck[]): string {
  return checks
    .map((c) => `${c.ok ? pc.green("✓") : pc.red("✗")} ${c.name}${c.hint ? `\n   ${c.hint}` : ""}`)
    .join("\n");
}

type CCHooksCheck =
  | { state: "loaded"; manifestPath?: string }
  | { state: "not-loaded" }
  | { state: "no-debug-log" }
  | { state: "no-cc-dir" };

function findLatestDebugLog(debugDir: string): string | undefined {
  const latestLink = join(debugDir, "latest");
  try {
    if (existsSync(latestLink)) {
      const target = readlinkSync(latestLink);
      const resolved = target.startsWith("/") ? target : join(debugDir, target);
      if (existsSync(resolved)) return resolved;
    }
  } catch {}

  try {
    const newest = readdirSync(debugDir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => ({ f, m: statSync(join(debugDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0];
    if (newest) return join(debugDir, newest.f);
  } catch {}

  return undefined;
}

function checkClaudeCodeHooks(): CCHooksCheck {
  const debugDir = join(homedir(), ".claude", "debug");
  if (!existsSync(debugDir)) return { state: "no-cc-dir" };

  const logPath = findLatestDebugLog(debugDir);
  if (!logPath) return { state: "no-debug-log" };

  let content: string;
  try {
    content = readFileSync(logPath, "utf8");
  } catch {
    return { state: "no-debug-log" };
  }

  const match = content.match(
    /Loaded hooks from standard location for plugin agentmemory:\s*(\S+)/
  );
  if (match) return { state: "loaded", manifestPath: match[1] };
  if (content.includes("Loading hooks from plugin: agentmemory")) return { state: "loaded" };
  return { state: "not-loaded" };
}

// ---------------------------------------------------------------------------
// Doctor v2 — interactive fixer.
//
// The legacy passive check-list (server reachable, flags, knowledge-graph,
// Claude Code hooks) still runs first as an informational summary because
// those checks need a live engine and don't have a one-shot inline fix.
// Then we drive the new diagnostic catalog (see src/cli/doctor-diagnostics.ts)
// which prompts Fix/Skip/More/Quit per failing check, applies the fix
// inline, and re-checks only the affected diagnostic.

function buildDoctorContext(): DoctorContext {
  return {
    baseUrl: getBaseUrl(),
    viewerUrl: getViewerUrl(),
    envPath: join(homedir(), ".agentmemory", ".env"),
    pidfilePath: readEngineState()?.kind === "compose" ? engineStatePath() : enginePidfilePath(),
    enginePath: engineStatePath(),
    pinnedVersion: IIPINNED_VERSION,
  };
}

function buildDoctorEffects(): DoctorEffects {
  return {
    envFileExists: () => existsSync(join(homedir(), ".agentmemory", ".env")),
    readEnvFile: () => {
      try {
        return parseEnvFile(
          readFileSync(join(homedir(), ".agentmemory", ".env"), "utf-8"),
        );
      } catch {
        return {};
      }
    },
    pidfileExists: () => {
      const state = readEngineState();
      return state?.kind === "compose" ? Boolean(state.composePid) : existsSync(enginePidfilePath());
    },
    pidfilePidIsAlive: () => {
      const state = readEngineState();
      if (state?.kind === "compose") return state.composePid ? pidAlive(state.composePid) : null;
      const pid = readEnginePidfile();
      if (pid === null) return null;
      return pidAlive(pid);
    },
    findIiiBinary: () => {
      const state = readEngineState();
      if (state?.kind === "compose") return existsSync(state.binPath) ? state.binPath : null;
      return whichBinary("iii");
    },
    localBinIiiPath: () => {
      const state = readEngineState();
      return state?.kind === "compose" ? state.binPath : privateIiiPath();
    },
    iiiBinaryVersion: (binPath: string) => iiiBinVersion(binPath),
    viewerReachable: async (timeoutMs = 2000) => {
      try {
        await discoverViewerPort();
        const res = await fetch(getViewerUrl(), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    runInit: async () => {
      try {
        await runInit();
        return { ok: true, message: "Wrote ~/.agentmemory/.env" };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    openEditor: async (path: string) => {
      const editor = process.env["EDITOR"] || process.env["VISUAL"] || "nano";
      p.log.info(`Opening ${path} in ${editor}…`);
      try {
        // Inherit stdio so the user actually sees the editor.
        const result = spawnSync(editor, [path], { stdio: "inherit" });
        if (result.error) {
          return {
            ok: false,
            message: `Failed to launch ${editor}: ${result.error.message}`,
          };
        }
        if ((result.status ?? 0) !== 0) {
          return {
            ok: false,
            message: `${editor} exited with code ${result.status}`,
          };
        }
        return { ok: true, message: `Saved ${path}` };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    runIiiInstaller: async () => {
      const r = await runIiiInstaller();
      return {
        ok: r.ok,
        message: r.ok
          ? `Installed iii v${IIPINNED_VERSION} to ${r.binPath}`
          : "iii installer failed (see warnings above)",
      };
    },
    runStop: async () => {
      try {
        startupTimeouts();
        if (readEngineState()?.kind === "compose") {
          await runStop();
          return { ok: true, message: "Worker Compose project stopped." };
        }
        // runStop calls process.exit on its own — guard against that here
        // by short-circuiting when there's nothing to stop.
        const port = getRestPort();
        const portPids = findEnginePidsByPort(port);
        const pidfilePid = readEnginePidfile();
        if (portPids.length === 0 && pidfilePid === null) {
          clearEnginePidfile();
          clearEngineState();
          return { ok: true, message: "Nothing to stop." };
        }
        const candidates = new Set<number>();
        if (pidfilePid) candidates.add(pidfilePid);
        for (const pid of portPids) candidates.add(pid);
        let allStopped = true;
        for (const pid of candidates) {
          const ok = await signalAndWait(pid, "SIGTERM", 3000);
          if (!ok) allStopped = false;
        }
        clearEnginePidfile();
        clearEngineState();
        return {
          ok: allStopped,
          message: allStopped ? "Engine stopped." : "Some engine pids survived.",
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    runStart: async () => {
      try {
        startupTimeouts();
        beginStartup();
        const started = await startEngine();
        if (!started) throw new Error("iii-engine could not be started.");
        if (!(await waitForEngine())) throw new Error(startupTimeoutMessage("engine", startupTimeouts().engineMs));
        await startWorkerForEngineState(true);
        return { ok: true, message: "Engine and agentmemory worker ready" };
      } catch (err) {
        await runStartupCleanup(1);
        finishStartup();
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    clearEnginePidAndState: () => {
      clearEnginePidfile();
      clearEngineState();
    },
  };
}

async function passiveServerChecks(): Promise<DoctorCheck[]> {
  const base = getBaseUrl();
  const checks: DoctorCheck[] = [];

  const serverUp = await isEngineRunning();
  checks.push({
    name: "Server reachable",
    ok: serverUp,
    hint: serverUp
      ? undefined
      : `Start with: npx @agentmemory/agentmemory (tried ${base})`,
  });
  if (!serverUp) return checks;

  const [health, flags, graph] = await Promise.all([
    apiFetch<any>(base, "health", 3000),
    apiFetch<any>(base, "config/flags", 3000),
    apiFetch<any>(base, "graph/stats", 3000),
  ]);

  const hasLlm = flags?.provider === "llm";
  const hasEmbed = flags?.embeddingProvider === "embeddings";
  const graphNodeCount = graph?.available === false ? null : graph?.totalNodes ?? graph?.nodes ?? graph?.nodeCount ?? null;
  const graphHas = typeof graphNodeCount === "number" && graphNodeCount > 0;

  checks.push(
    {
      name: "Health status",
      ok: health?.status === "healthy",
      hint:
        health?.status === "healthy"
          ? undefined
          : `Status: ${health?.status || "unknown"}`,
    },
    {
      name: "LLM provider",
      ok: hasLlm,
      hint: hasLlm ? undefined : "set ANTHROPIC_API_KEY (or GEMINI/OPENROUTER/MINIMAX) in ~/.agentmemory/.env",
    },
    {
      name: "Embedding provider",
      ok: hasEmbed,
      hint: hasEmbed
        ? undefined
        : "Running BM25-only. Set EMBEDDING_PROVIDER=local for on-device semantic search, or add OPENAI_API_KEY / VOYAGE_API_KEY / COHERE_API_KEY / OLLAMA_HOST",
    },
  );

  for (const f of (flags?.flags || []) as {
    label: string;
    enabled: boolean;
    enableHow: string;
  }[]) {
    checks.push({
      name: f.label,
      ok: f.enabled,
      hint: f.enabled ? undefined : f.enableHow,
    });
  }

  const cc = checkClaudeCodeHooks();
  const ccCheck = (() => {
    switch (cc.state) {
      case "loaded":
        return {
          ok: true,
          hint: cc.manifestPath ? `manifest: ${cc.manifestPath}` : undefined,
        };
      case "not-loaded":
        return {
          ok: false,
          hint:
            "Plugin enabled but hooks not loaded by Claude Code. Try: /plugin uninstall agentmemory@agentmemory && /plugin install agentmemory@agentmemory, then restart the session.",
        };
      case "no-debug-log":
        return {
          ok: false,
          hint:
            'Cannot verify — no Claude Code debug log found. Run once with `claude --debug -p "x"`, then re-run doctor.',
        };
      case "no-cc-dir":
        return undefined;
    }
  })();
  if (ccCheck) checks.push({ name: "Claude Code plugin hooks registered", ...ccCheck });

  checks.push({
    name: "Knowledge graph populated",
    ok: graphHas,
    hint: graphHas
      ? undefined
      : graphNodeCount === null
        ? "Graph counts are unavailable. Run agentmemory graph-index status."
        : "Graph is empty. Run a session with GRAPH_EXTRACTION_ENABLED=true.",
  });

  return checks;
}

type DoctorAction = "fix" | "skip" | "more" | "quit";

async function askFixAction(d: Diagnostic): Promise<DoctorAction> {
  const choice = await p.select<DoctorAction>({
    message: `[${d.id}] ${d.message}`,
    options: [
      { value: "fix", label: "F  Fix", hint: d.fixPreview },
      { value: "skip", label: "S  Skip" },
      { value: "more", label: "?  More info" },
      { value: "quit", label: "Q  Quit doctor" },
    ],
    initialValue: "fix",
  });
  if (p.isCancel(choice)) return "quit";
  return choice;
}

async function applyFixWithReport(
  d: Diagnostic,
  ctx: DoctorContext,
  dryRun: boolean,
): Promise<DiagnosticFixResult> {
  if (dryRun) {
    p.log.info(`[dry-run] would: ${d.fixPreview}`);
    return { ok: true, message: "(dry-run)" };
  }
  const result = await d.fix(ctx);
  if (result.ok) {
    p.log.success(result.message ?? `${d.id} fixed.`);
  } else {
    p.log.error(result.message ?? `${d.id} fix failed.`);
  }
  return result;
}

async function runDoctor() {
  p.intro("agentmemory doctor");
  const applyAll = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  if (applyAll && dryRun) {
    p.log.error("Cannot combine --all and --dry-run.");
    process.exit(2);
  }

  // Passive server checks (informational).
  const passive = await passiveServerChecks();
  const passivePassed = passive.filter((c) => c.ok).length;
  p.note(formatChecks(passive), `server: ${passivePassed}/${passive.length} passing`);

  // Doctor v2 interactive catalog.
  const ctx = buildDoctorContext();
  const effects = buildDoctorEffects();
  const diagnostics = buildDiagnostics(effects);

  if (dryRun) {
    const results: Array<{ diagnostic: Diagnostic; status: { ok: boolean; detail?: string } }> = [];
    for (const d of diagnostics) results.push({ diagnostic: d, status: await d.check(ctx) });
    const lines = dryRunPlan(ctx, results);
    p.note(lines.join("\n"), "dry-run plan");
    p.outro("Dry-run complete. Re-run without --dry-run to apply.");
    return;
  }

  let failed = 0;
  let fixed = 0;
  let skipped = 0;
  let quit = false;

  for (const d of diagnostics) {
    if (quit) {
      skipped++;
      continue;
    }
    const status = await d.check(ctx);
    if (status.ok) {
      p.log.success(`${d.id} ✓${status.detail ? ` (${status.detail})` : ""}`);
      continue;
    }
    failed++;
    p.log.warn(`${d.id} ✗ ${status.detail ?? ""}`.trim());
    p.log.info(`why: ${d.fixPreview}`);

    if (d.manualOnly) {
      p.log.info(`(manual fix only — see "${d.id}" docs)`);
    }

    if (applyAll) {
      const r = await applyFixWithReport(d, ctx, false);
      if (r.ok) fixed++;
      // Re-check only this diagnostic.
      const after = await d.check(ctx);
      if (!after.ok) p.log.warn(`${d.id} still failing after fix.`);
      continue;
    }

    // Interactive prompt loop — allow [?] More info without leaving the check.
    while (true) {
      const action = await askFixAction(d);
      if (action === "fix") {
        const r = await applyFixWithReport(d, ctx, false);
        if (r.ok) {
          const after = await d.check(ctx);
          if (after.ok) {
            fixed++;
          } else {
            p.log.warn(`${d.id} still failing after fix: ${after.detail ?? ""}`);
          }
        }
        break;
      }
      if (action === "skip") {
        skipped++;
        break;
      }
      if (action === "more") {
        p.note(d.moreInfo, `[${d.id}] more info`);
        continue;
      }
      if (action === "quit") {
        quit = true;
        break;
      }
    }
  }

  const summary = `${diagnostics.length} checks · ${failed} failing · ${fixed} fixed · ${skipped} skipped`;
  if (quit) {
    p.outro(`Quit early. ${summary}`);
    process.exit(1);
  }
  if (failed === 0) {
    p.outro("All diagnostics passing. agentmemory is healthy.");
    return;
  }
  if (failed - fixed === 0) {
    p.outro(`All fixes applied. ${summary}`);
    return;
  }
  p.outro(summary);
  process.exit(1);
}

type DemoObservation = {
  toolName: string;
  toolInput: Record<string, string>;
  toolOutput: string;
};

type DemoSession = {
  id: string;
  title: string;
  observations: DemoObservation[];
};

type SearchResult = { query: string; hits: number; topTitle: string };

function buildDemoSessions(): DemoSession[] {
  return [
    {
      id: generateId("demo"),
      title: "Session 1: JWT auth setup",
      observations: [
        {
          toolName: "Write",
          toolInput: { file_path: "src/middleware/auth.ts" },
          toolOutput:
            "Created JWT middleware using jose library. Tokens expire after 30 days. Chose jose over jsonwebtoken for Edge compatibility.",
        },
        {
          toolName: "Write",
          toolInput: { file_path: "test/auth.test.ts" },
          toolOutput:
            "Added token validation tests covering expired, malformed, and valid cases.",
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          toolOutput: "All 12 auth tests passing.",
        },
      ],
    },
    {
      id: generateId("demo"),
      title: "Session 2: Database migration debugging",
      observations: [
        {
          toolName: "Read",
          toolInput: { file_path: "prisma/schema.prisma" },
          toolOutput:
            "Found N+1 query issue in user relations. Need to add include on posts query.",
        },
        {
          toolName: "Edit",
          toolInput: { file_path: "src/api/users.ts" },
          toolOutput:
            "Fixed N+1 by adding Prisma include. Query time dropped from 450ms to 28ms.",
        },
      ],
    },
    {
      id: generateId("demo"),
      title: "Session 3: Rate limiting",
      observations: [
        {
          toolName: "Write",
          toolInput: { file_path: "src/middleware/ratelimit.ts" },
          toolOutput:
            "Added rate limiting middleware with 100 req/min default. Uses in-memory store for dev, Redis for prod.",
        },
      ],
    },
  ];
}

async function postJson<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bearerHeaders(url) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

async function postJsonStrict<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearerHeaders(url) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const suffix = errBody ? ` — ${errBody.slice(0, 200)}` : "";
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}${suffix}`);
  }
  return (await res.json().catch(() => null)) as T | null;
}

async function seedDemoSession(
  base: string,
  project: string,
  session: DemoSession,
): Promise<number> {
  await postJsonStrict(`${base}/agentmemory/session/start`, {
    sessionId: session.id,
    project,
    cwd: project,
  });

  let stored = 0;
  for (const obs of session.observations) {
    const url = `${base}/agentmemory/observe`;
    const payload = {
      hookType: "post_tool_use",
      sessionId: session.id,
      project,
      cwd: project,
      timestamp: new Date().toISOString(),
      data: {
        tool_name: obs.toolName,
        tool_input: obs.toolInput,
        tool_output: obs.toolOutput,
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bearerHeaders(url) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        stored++;
      } else {
        const body = await res.text().catch(() => "");
        p.log.warn(
          `observe failed for ${obs.toolName}: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 160)}` : ""}`,
        );
      }
    } catch (err) {
      p.log.warn(
        `observe request failed for ${obs.toolName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await postJsonStrict(`${base}/agentmemory/session/end`, { sessionId: session.id, final: true });
  return stored;
}

async function runDemoSearch(base: string, query: string): Promise<SearchResult> {
  const data = await postJson<{ results?: Array<{ title?: string }> }>(
    `${base}/agentmemory/smart-search`,
    { query, limit: 5 },
    10000,
  );
  const items = data?.results ?? [];
  return {
    query,
    hits: items.length,
    topTitle: items[0]?.title ?? "(no results)",
  };
}

// Prefer the packaged `.env.example` (next to `dist/cli.mjs`); fall back to
// the repo root when running from a source checkout.
function findEnvExample(): string | null {
  const candidates = [
    join(__dirname, "..", ".env.example"),
    join(__dirname, ".env.example"),
    join(process.cwd(), ".env.example"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function runInit() {
  p.intro("agentmemory init");
  const target = join(homedir(), ".agentmemory", ".env");
  const template = findEnvExample();
  if (!template) {
    p.log.error(
      "Could not locate .env.example in the package. Re-install with: npm i -g @agentmemory/agentmemory",
    );
    process.exit(1);
  }
  const dir = dirname(target);
  const { mkdir, copyFile } = await import("node:fs/promises");
  const { constants: fsConstants } = await import("node:fs");
  try {
    await mkdir(dir, { recursive: true });
    // COPYFILE_EXCL collapses the exists-check + copy into one syscall —
    // an existsSync(target) + copyFile() pair races with a parallel init
    // (or any other process touching ~/.agentmemory/.env between the two
    // calls) and would silently overwrite a config the operator just
    // wrote. EEXIST out of copyFile is the only "already configured"
    // signal we trust.
    await copyFile(template, target, fsConstants.COPYFILE_EXCL);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      p.log.warn(`${target} already exists — leaving it untouched.`);
      p.log.info(
        `Compare against the latest template: diff ${target} ${template}`,
      );
      p.outro("Nothing changed.");
      return;
    }
    p.log.error(
      `Failed to copy template: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  p.log.success(`Wrote ${target}`);
  p.note(
    [
      "All keys are commented out by default. Uncomment the ones you want.",
      "",
      "Common next steps:",
      "  1. Pick an LLM provider key (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / etc.)",
      "  2. Run `npx @agentmemory/agentmemory doctor` to verify the daemon sees them",
      "  3. Run `npx @agentmemory/agentmemory` to start the worker",
    ].join("\n"),
    "Next steps",
  );
  p.outro(`Edit ${target} and you're set.`);
}

async function startServerForDemo(): Promise<() => Promise<void>> {
  startupTimeouts();
  await assertRuntimePortOwnership();
  if (await isAgentmemoryReady()) {
    return async () => {};
  }

  beginStartup();

  const startedEngine = !skipEngine && !(await isEngineRunning() || await waitForPersistedNativeEngine());
  if (startedEngine) {
    const ok = await startEngine();
    if (!ok) {
      p.log.error("Could not start iii-engine for the demo.");
      p.note(installInstructions().join("\n"), "Setup required");
      throw new Error("iii-engine could not be started for the demo.");
    }
    if (!(await waitForEngine())) {
      printCapturedStartupStderr();
      throw new Error(startupTimeoutMessage("engine", startupTimeouts().engineMs));
    }
  }

  await startWorkerForEngineState();

  return async () => {
    if (importedStartupWorker && readWorkerPidfile() === process.pid) clearWorkerPidfile();
    if (startedEngine) await cleanupFailedStartup();
  };
}

async function runDemo() {
  const port = getRestPort();
  const base = `http://localhost:${port}`;
  p.intro("agentmemory demo");

  const serve = args.includes("--serve");
  let teardown: () => Promise<void> = async () => {};

  if (serve) {
    teardown = await startServerForDemo();
  } else if (!(await isAgentmemoryReady())) {
    p.log.error(
      `agentmemory worker not reachable on port ${port} (livez probe failed). Something may be on the port but it isn't serving /agentmemory/*.`,
    );
    p.log.info("Start it with: npx @agentmemory/agentmemory");
    p.log.info("Or run a one-command demo with: npx @agentmemory/agentmemory demo --serve");
    process.exit(1);
  }

  try {
    await runDemoBody(base);
  } finally {
    await teardown();
  }

  if (serve) {
    process.exit(0);
  }
}

async function runDemoBody(base: string) {
  const demoProject = "/tmp/agentmemory-demo";
  const sessions = buildDemoSessions();

  const sSeed = p.spinner();
  sSeed.start("Seeding 3 demo sessions with realistic observations...");

  let totalObs = 0;
  for (const session of sessions) {
    totalObs += await seedDemoSession(base, demoProject, session);
  }

  sSeed.stop(`Seeded ${totalObs} observations across ${sessions.length} sessions`);

  const queries = [
    "jwt auth middleware",
    "database performance optimization",
    "rate limiting",
  ];

  const sQuery = p.spinner();
  sQuery.start(`Running ${queries.length} smart-search queries...`);

  const results: SearchResult[] = [];
  for (const query of queries) {
    results.push(await runDemoSearch(base, query));
  }

  sQuery.stop("Search complete");

  // Only claim the semantic-recall win when the search actually hit.
  // Without an embedding key this query returns 0 hits, and asserting
  // success over a visibly failed search reads as a lie.
  const semanticHits =
    results.find((r) => r.query === "database performance optimization")
      ?.hits ?? 0;
  const lines = [
    `Project:       ${demoProject}`,
    `Sessions:      ${sessions.length} seeded (${totalObs} observations)`,
    "",
    c.label("Search results:"),
    ...results.flatMap((r) => [
      `  ${c.label(`"${r.query}"`)}`,
      `    ${c.dim("→")} ${c.ok(`${r.hits} hit(s)`)}, top: ${r.topTitle.slice(0, 60)}`,
    ]),
    "",
    ...(semanticHits > 0
      ? [
          c.accent(`Notice: searching "database performance optimization"`),
          c.accent(`found the N+1 query fix — keyword matching can't do that.`),
        ]
      : [
          c.dim(`Note: "database performance optimization" found nothing —`),
          c.dim(`set EMBEDDING_PROVIDER=local for on-device semantic recall,`),
          c.dim(`or add an embedding API key in ~/.agentmemory/.env.`),
        ]),
    "",
    `Viewer:        ${c.url(getViewerUrl())}`,
    `Clean up with: ${c.dim(`curl -X DELETE "${base}/agentmemory/sessions?project=${demoProject}"`)}`,
  ];

  p.note(lines.join("\n"), "demo complete");
  p.log.success("agentmemory is working. Point your agent at it and get back to coding.");
}

function runCommand(
  command: string,
  commandArgs: string[],
  options: { cwd?: string; label: string; optional?: boolean; timeoutMs?: number } = { label: "command" },
): boolean {
  const spinner = p.spinner();
  spinner.start(options.label);
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    stdio: "pipe",
    encoding: "utf-8",
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs, killSignal: "SIGKILL" as const } : {}),
  });

  if (result.status === 0) {
    spinner.stop(`${options.label} ${pc.green("✓")}`);
    return true;
  }

  const stderr = (result.stderr || "").toString().trim();
  const stdout = (result.stdout || "").toString().trim();
  const msg = stderr || stdout || "unknown error";

  if (options.optional) {
    spinner.stop(`${options.label} (skipped)`);
    p.log.warn(msg.slice(0, 300));
    return false;
  }

  spinner.stop(`${options.label} ${pc.red("✗")}`);
  p.log.error(msg.slice(0, 300));
  return false;
}

async function runUpgrade() {
  p.intro("agentmemory upgrade");

  const cwd = process.cwd();
  const hasPackageJson = existsSync(join(cwd, "package.json"));
  const hasPnpmLock = existsSync(join(cwd, "pnpm-lock.yaml"));

  const pnpmBin = whichBinary("pnpm");
  const npmBin = whichBinary("npm");

  p.log.info(`Working directory: ${cwd}`);
  const requireSuccess = (ok: boolean, label: string): void => {
    if (!ok) {
      p.log.error(`Upgrade aborted: ${label} failed.`);
      process.exit(1);
    }
  };

  if (hasPackageJson) {
    const usePnpm = !!pnpmBin && hasPnpmLock;
    if (usePnpm && pnpmBin) {
      const installOk = runCommand(pnpmBin, ["install"], {
        label: "Refreshing dependencies (pnpm install)",
      });
      requireSuccess(installOk, "pnpm install");
      runCommand(
        pnpmBin,
        [
          "up",
          `iii-sdk@${IIPINNED_DEFAULT_VERSION}`,
          `@iii-dev/helpers@${IIPINNED_DEFAULT_VERSION}`,
        ],
        {
          label: `Pinning iii-sdk and @iii-dev/helpers at ${IIPINNED_DEFAULT_VERSION}`,
          optional: true,
        },
      );
    } else if (npmBin) {
      const installOk = runCommand(npmBin, ["install"], {
        label: "Refreshing dependencies (npm install)",
      });
      requireSuccess(installOk, "npm install");
      runCommand(
        npmBin,
        [
          "install",
          `iii-sdk@${IIPINNED_DEFAULT_VERSION}`,
          `@iii-dev/helpers@${IIPINNED_DEFAULT_VERSION}`,
        ],
        {
          label: `Pinning iii-sdk and @iii-dev/helpers at ${IIPINNED_DEFAULT_VERSION}`,
          optional: true,
        },
      );
    } else {
      p.log.warn("No package manager found (pnpm/npm). Skipping JS dependency upgrade.");
    }
  } else {
    p.log.warn("No package.json in current directory. Skipping JS dependency upgrade.");
  }

  const upgradeEngine = await p.confirm({
    message: "Re-run the iii-engine install script (curl | sh)?",
    initialValue: true,
  });
  if (p.isCancel(upgradeEngine)) {
    p.cancel("Cancelled.");
    return process.exit(0);
  }
  if (upgradeEngine === true) {
    await runIiiInstaller();
  } else {
    p.log.info("Skipped iii-engine installer.");
  }

  p.note(
    [
      "Upgrade flow completed.",
      "",
      "Recommended next steps:",
      "  1) agentmemory status",
      "  2) npm/pnpm test",
      "  3) restart agentmemory process",
    ].join("\n"),
    "agentmemory upgrade",
  );
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (!IS_WINDOWS) {
      try {
        const stat = execFileSync("ps", ["-p", String(pid), "-o", "stat="], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        if (stat.trim() && !processStatIsRunning(stat)) return false;
      } catch {}
    }
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

async function signalAndWait(
  pid: number,
  initialSignal: NodeJS.Signals,
  timeoutMs: number,
): Promise<boolean> {
  try {
    process.kill(pid, initialSignal);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ESRCH") return true;
    if (code === "EPERM") {
      p.log.warn(`No permission to signal pid ${pid}. Try: kill ${pid}`);
      return false;
    }
    vlog(`${initialSignal} ${pid}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!pidAlive(pid)) return true;
  try {
    process.kill(pid, "SIGKILL");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ESRCH") return true;
    vlog(`SIGKILL ${pid}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  await new Promise((r) => setTimeout(r, 200));
  return !pidAlive(pid);
}

// Shared worker-reap: SIGTERM with a grace window sized for the worker's
// shutdown flush (index snapshots land via the engine, so the worker must
// die before the engine does, with time to commit).
async function waitForEngineFlush(): Promise<void> {
  let stateBackend: "file" | "redis" = "file";
  try {
    stateBackend = getStateBackend();
  } catch {}
  const composeState = readEngineState();
  if (composeState?.kind === "compose") {
    const isolatedRuntime = dataDirResolution.dataDir !== join(homedir(), ".agentmemory");
    await new Promise((resolve) => setTimeout(resolve, getStateBackend() === "redis" || isolatedRuntime ? 0 : 3500));
    return;
  }
  const runtimePath = runtimeConfigPath(dataDirResolution.dataDir);
  const configTexts: string[] = [];
  for (const path of engineStateConfigPaths(dataDirResolution.dataDir, runtimePath)) {
    try {
      configTexts.push(readFileSync(path, "utf-8"));
    } catch {}
  }
  const waitMs = engineFlushWaitMs(stateBackend, configTexts);
  if (waitMs <= 0) return;
  const s = p.spinner();
  s.start(`Waiting ${(waitMs / 1000).toFixed(1)}s for iii-engine to write state to disk...`);
  await new Promise((r) => setTimeout(r, waitMs));
  s.stop("iii-engine state flush window passed");
}

async function stopWorkerPid(pid: number, graceMs: number): Promise<boolean> {
  const s = p.spinner();
  s.start(`Stopping agentmemory worker (pid ${pid})... [flushing state]`);
  const ok = await signalAndWait(pid, "SIGTERM", graceMs);
  s.stop(ok ? `Stopped worker pid ${pid}` : `Failed to stop worker pid ${pid}`);
  return ok;
}

type NativeRemovalStopResult =
  | { ok: true; stoppedEnginePids: number }
  | { ok: false; reason: string };

async function stopNativeEngineForRemoval(): Promise<NativeRemovalStopResult> {
  const port = getRestPort();
  const workerPid = readWorkerPidfile();
  const enginePids = new Set<number>(findEnginePidsByPort(port));
  const pidfilePid = readEnginePidfile();
  if (pidfilePid) enginePids.add(pidfilePid);
  if (workerPid) enginePids.delete(workerPid);

  const foreign = [...enginePids]
    .map((pid) => ({ pid, comm: pidCommand(pid) }))
    .filter(({ comm }) => isForeignPortHolder(comm));
  if (foreign.length > 0) {
    return {
      ok: false,
      reason: `refusing to signal non-iii process(es): ${foreign.map(({ pid, comm }) => `${pid} (${comm})`).join(", ")}`,
    };
  }

  if (workerPid) {
    if (!(await stopWorkerPid(workerPid, 5000))) {
      return {
        ok: false,
        reason: `worker pid ${workerPid} could not be stopped; no engine or files were removed`,
      };
    }
    clearWorkerPidfile();
  }

  for (const pid of enginePids) {
    const s = p.spinner();
    s.start(`Stopping iii-engine (pid ${pid})...`);
    const ok = await signalAndWait(pid, "SIGTERM", 3000);
    s.stop(ok ? `Stopped pid ${pid}` : `Failed to stop pid ${pid}`);
    if (!ok) {
      return {
        ok: false,
        reason: `engine pid ${pid} survived shutdown; lifecycle state and files were preserved`,
      };
    }
  }

  clearEnginePidfile();
  clearEngineState();
  clearWorkerPidfile();
  return { ok: true, stoppedEnginePids: enginePids.size };
}

function pidCommand(pid: number): string {
  if (IS_WINDOWS) return "";
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// Positive identity beats a denylist: the engine is always the `iii`
// binary (spawned from PATH or ~/.agentmemory/bin), so any other process
// holding the port — an SSH forward or a stray dev server, for example —
// must not be adopted or signaled. A denylist failed open for every name
// it did not know.
function isForeignPortHolder(comm: string): boolean {
  if (!comm) return false;
  const base = comm.split("/").pop() || comm;
  return base !== "iii" && !base.startsWith("iii-");
}

function findEnginePidsByPort(port: number): number[] {
  if (IS_WINDOWS) return [];
  const lsof = whichBinary("lsof");
  if (!lsof) return [];
  // -sTCP:LISTEN restricts to listening server sockets only. Without
  // this, lsof also returns client-side PIDs (any process with an
  // active TCP connection to :port), which includes the agentmemory
  // CLI itself thanks to the keep-alive fetch in isEngineRunning().
  // signalAndWait would then SIGKILL its own parent — exit code 137.
  const selfPid = process.pid;
  try {
    const out = execFileSync(lsof, ["-i", `:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split(/\s+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== selfPid);
  } catch (err) {
    vlog(`lsof :${port}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function runStop(): Promise<void> {
  const savedState = readEngineState();
  if (savedState?.kind === "docker") {
    p.intro("agentmemory stop");
    p.log.error(legacyDockerStateMessage(savedState));
    process.exit(1);
  }
  if (savedState?.kind === "compose" && engineStateRestPort(savedState) !== getRestPort()) {
    p.intro("agentmemory stop");
    p.log.error(`Saved Compose lifecycle state belongs to REST port ${engineStateRestPort(savedState)}, not requested port ${getRestPort()}. Refusing to signal processes or clear metadata.`);
    process.exit(1);
  }
  await assertRuntimePortOwnership();
  p.intro("agentmemory stop");
  const port = getRestPort();
  const state = readEngineState();
  const running = await isEngineRunning();
  const force = args.includes("--force");

  if (state?.kind === "compose") {
    const ownedDaemonAlive = Boolean(state.composePid && pidAlive(state.composePid));
    if (ownedDaemonAlive && !composePidMatches(state.composePid!, state)) {
      p.log.error(`Recorded Compose pid ${state.composePid} does not match the saved daemon identity; refusing to invoke Compose control or signal it. Lifecycle state was preserved.`);
      process.exit(1);
    }
    if (running && !ownedDaemonAlive) {
      p.log.error("The REST endpoint is responding, but the recorded Compose daemon is not alive. Refusing to stop or clear an engine that may be unrelated; restore the owning daemon or inspect the endpoint manually.");
      process.exit(1);
    }
    if (running && ownedDaemonAlive) {
      try {
        await composeCall({ engineUrl: state.engineUrl, namespace: state.namespace, functionId: "compose::down", file: state.file, timeoutMs: 60_000 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("ENGINE_RESTART_REQUIRED")) {
          p.log.error(`compose::down failed for ${state.file}: ${message}. Lifecycle state was preserved.`);
          process.exit(1);
        }
        p.log.warn("Compose requested an engine restart while stopping; terminating its verified owning daemon to finish shutdown.");
      }
    }
    if (ownedDaemonAlive) {
      const childrenStopped = await terminateComposeChildren(state);
      if (!childrenStopped) {
        p.log.error(`One or more child workers of Compose ${state.composePid} did not stop; lifecycle state was preserved.`);
        process.exit(1);
      }
      if (!(await signalAndWait(state.composePid!, "SIGTERM", 20_000))) {
        p.log.error(`Worker Compose daemon pid ${state.composePid} did not stop; lifecycle state was preserved. Inspect ${state.logFile}.`);
        process.exit(1);
      }
    }
    clearEnginePidfile();
    clearWorkerPidfile();
    clearEngineState();
    p.outro("Stopped Worker Compose, engine, and agentmemory workers. Data was preserved.");
    return;
  }

  const portPids = findEnginePidsByPort(port);
  const pidfilePid = readEnginePidfile();
  // read the worker pid up front so the engine-down branch
  // can still reap an orphaned worker process (the common failure mode
  // where a wrapper script kept the worker alive across engine restarts).
  const workerPid = readWorkerPidfile();

  if (!running) {
    if (portPids.length === 0 && pidfilePid === null && workerPid === null) {
      clearEnginePidfile();
      clearEngineState();
      clearWorkerPidfile();
      p.outro("Nothing to stop.");
      return;
    }
    if (workerPid !== null && portPids.length === 0 && pidfilePid === null) {
      // Engine already gone but worker is lingering — reap it directly
      // instead of preserving for manual cleanup.
      const s = p.spinner();
      s.start(`Stopping orphaned agentmemory worker (pid ${workerPid})...`);
      const ok = await signalAndWait(workerPid, "SIGTERM", SHUTDOWN_HARD_EXIT_MS + 1000);
      s.stop(ok ? `Stopped worker pid ${workerPid}` : `Failed to stop worker pid ${workerPid}`);
      clearEnginePidfile();
      clearEngineState();
      clearWorkerPidfile();
      if (!ok) {
        p.log.error(`Worker pid ${workerPid} survived SIGKILL. Investigate with \`ps\`.`);
        process.exit(1);
      }
      p.outro("Stopped orphaned worker. Memories persisted to disk.");
      return;
    }
    const survivors = new Set<number>(portPids);
    if (pidfilePid) survivors.add(pidfilePid);
    if (workerPid) survivors.add(workerPid);
    p.log.warn(
      `Engine not responding on :${port}, but ${survivors.size} process(es) still hold the port or pidfile: ${[...survivors].join(", ")}`,
    );
    p.log.info(
      `Preserving ~/.agentmemory/iii.pid + worker.pid. Investigate before manual cleanup:\n  ps -p ${[...survivors].join(",")} -o pid,ppid,comm,etime\n  ${IS_WINDOWS ? "netstat -ano | findstr :" + port : "lsof -i :" + port}`,
    );
    process.exit(1);
  }

  const candidates = new Set<number>();
  if (pidfilePid) candidates.add(pidfilePid);
  for (const pid of portPids) candidates.add(pid);

  // stop must also reap the agentmemory worker process
  // (`node dist/index.mjs`). If only the engine is killed, the worker can
  // survive (detached spawn / signal not propagated) and reconnect to the
  // next engine as a duplicate registration. workerPid was read above so
  // the engine-down branch could also reap orphans.
  const workerCandidates = new Set<number>();
  if (workerPid) workerCandidates.add(workerPid);

  if (candidates.size === 0 && workerCandidates.size === 0) {
    p.log.error(
      `Could not locate engine process. Try:\n  ${IS_WINDOWS ? "netstat -ano | findstr :" + port : "lsof -i :" + port + " -t | xargs kill -9"}`,
    );
    process.exit(1);
  }

  let allStopped = true;
  // stop worker first, then engine. The worker's shutdown
  // handler calls indexPersistence.save() -> kv.set() -> iii state::set
  // to flush BM25/vector snapshots + audit rows. Killing iii first
  // leaves those writes with no engine to land on, and the index +
  // observations end up as in-memory state the iii process never
  // persists. Worker SIGTERM grace bumped 3s -> 5s to give a large
  // index a real chance to commit before the engine goes away.
  for (const pid of workerCandidates) {
    if (!(await stopWorkerPid(pid, SHUTDOWN_HARD_EXIT_MS + 1000))) allStopped = false;
  }
  if (workerCandidates.size > 0 && [...candidates].some((pid) => !workerCandidates.has(pid))) {
    await waitForEngineFlush();
  }
  const skippedForeign: Array<{ pid: number; comm: string }> = [];
  for (const pid of candidates) {
    if (workerCandidates.has(pid)) continue;
    // Last-line guard against a stale/poisoned pidfile or a port-forward
    // holding :port — signaling its process could stop unrelated services.
    const comm = pidCommand(pid);
    if (!force && isForeignPortHolder(comm)) {
      skippedForeign.push({ pid, comm });
      continue;
    }
    const s = p.spinner();
    s.start(`Stopping iii-engine (pid ${pid})...`);
    const ok = await signalAndWait(pid, "SIGTERM", 3000);
    s.stop(ok ? `Stopped pid ${pid}` : `Failed to stop pid ${pid}`);
    if (!ok) allStopped = false;
  }

  clearEnginePidfile();
  clearEngineState();
  clearWorkerPidfile();
  if (skippedForeign.length > 0) {
    const list = skippedForeign
      .map((sf) => `  pid ${sf.pid}  ${sf.comm}`)
      .join("\n");
    p.log.error(
      `Refused to signal process(es) holding :${port} that are not the iii engine:\n${list}\n\nInspect those processes and stop the engine with its owning runtime.\nOr re-run with --force to signal them anyway.`,
    );
    process.exit(1);
  }
  if (!allStopped) {
    p.log.error("One or more processes survived SIGKILL. Investigate with `ps`.");
    process.exit(1);
  }
  p.outro("Stopped. Memories persisted to disk; restart anytime with: npx @agentmemory/agentmemory");
}

async function runMcp(): Promise<void> {
  await import("./mcp/standalone.js");
}

async function runConnectCmd(): Promise<void> {
  const { runConnect } = await import("./cli/connect/index.js");
  await runConnect(args.slice(1));
}

async function runImportJsonl(): Promise<void> {
  // Long-form flags that take a value. Their value tokens must be
  // consumed alongside the flag so they don't leak into positional
  // args (e.g. `--port 3114 import-jsonl` would otherwise turn
  // 3114 into pathArg).
  const VALUE_FLAGS = new Set(["--port", "--tools", "--data-dir"]);
  let maxFiles: number | undefined;
  const tail = args.slice(1);
  const positional: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const a = tail[i]!;
    if (a === "--max-files") {
      const raw = tail[i + 1];
      const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
      if (Number.isInteger(parsed) && parsed > 0) {
        maxFiles = parsed;
      } else if (raw !== undefined) {
        p.log.warn(`Ignoring --max-files ${raw}: expected a positive integer.`);
      }
      i++;
      continue;
    }
    if (a.startsWith("--max-files=")) {
      const raw = a.slice("--max-files=".length);
      const parsed = parseInt(raw, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        maxFiles = parsed;
      } else {
        p.log.warn(`Ignoring --max-files=${raw}: expected a positive integer.`);
      }
      continue;
    }
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  const pathArg = positional[0];

  const port = getRestPort();
  const base = `http://localhost:${port}`;

  let probeOk = false;
  let probeDetail = "";
  try {
    const probe = await fetch(`${base}/agentmemory/livez`, {
      signal: AbortSignal.timeout(2000),
    });
    probeOk = probe.ok;
    if (!probeOk) {
      const probeBody = await probe.text().catch(() => "");
      probeDetail = `reachable but unhealthy (HTTP ${probe.status}${probeBody ? `: ${probeBody.slice(0, 200)}` : ""})`;
    }
  } catch (err) {
    probeOk = false;
    const msg = err instanceof Error ? err.message : String(err);
    probeDetail = `unreachable (${msg})`;
  }
  if (!probeOk) {
    p.log.error(
      `agentmemory livez probe failed on port ${port}: ${probeDetail}. Start it with \`npx @agentmemory/agentmemory\` in another terminal, then re-run this command.`,
    );
    process.exit(1);
  }

  const body: Record<string, unknown> = {};
  if (pathArg) body["path"] = resolve(pathArg.startsWith("~") ? join(homedir(), pathArg.slice(1)) : pathArg);
  if (maxFiles !== undefined) body["maxFiles"] = maxFiles;

  const headers: Record<string, string> = { "content-type": "application/json", ...bearerHeaders(base) };

  p.log.info(`Importing JSONL from ${pathArg || "~/.claude/projects"}…`);
  const spinner = p.spinner();
  spinner.start("scanning files");

  try {
    const res = await fetch(`${base}/agentmemory/replay/import-jsonl`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let json: {
      success?: boolean;
      error?: string;
      imported?: number;
      sessionIds?: string[];
      observations?: number;
      discovered?: number;
      truncated?: boolean;
      traversalCapped?: boolean;
      maxFiles?: number;
      maxFilesUpperBound?: number;
    } = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        spinner.stop("failed");
        p.log.error(
          `server returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
        );
        process.exit(1);
      }
    }
    if (!res.ok || json.success !== true) {
      spinner.stop("failed");
      const detail =
        json.error ||
        (text.length === 0
          ? "empty response body"
          : json.success === undefined
            ? `HTTP ${res.status} (response missing success field)`
            : `HTTP ${res.status}`);
      if (res.status === 401) {
        p.log.error(
          `${detail}. Set AGENTMEMORY_SECRET to match the server's secret and re-run.`,
        );
      } else if (res.status === 404) {
        p.log.error(
          `${detail}. The running agentmemory server does not expose /agentmemory/replay/import-jsonl — upgrade to v0.8.13 or later.`,
        );
      } else {
        p.log.error(detail);
      }
      process.exit(1);
    }
    spinner.stop(
      `imported ${json.imported ?? 0} file(s), ${json.observations ?? 0} observation(s) across ${json.sessionIds?.length || 0} session(s)`,
    );
    if (json.truncated) {
      const cap = json.maxFiles ?? 200;
      const upper = json.maxFilesUpperBound ?? 1000;
      const discovered = json.discovered ?? 0;
      const skipped = discovered - (json.imported ?? 0);
      const discoveredLabel = json.traversalCapped
        ? `${discovered}+ (traversal halted at safety cap)`
        : String(discovered);
      const baseMsg = `Hit the ${cap}-file scan cap; ${skipped} of ${discoveredLabel} discovered file(s) were skipped.`;
      // If we already saw more than the server's hard cap (or the
      // walker stopped early), bumping --max-files won't help on its
      // own — recommend batching by subdirectory.
      if (discovered > upper || json.traversalCapped) {
        p.log.warn(
          `${baseMsg} Tree exceeds the server's --max-files limit of ${upper}; ` +
            `batch by subdirectory (run import-jsonl once per project under ~/.claude/projects).`,
        );
      } else {
        const suggested = Math.min(
          Math.max((discovered || cap) + 100, cap * 2),
          upper,
        );
        p.log.warn(
          `${baseMsg} Re-run with --max-files=${suggested} (max ${upper}) or batch by subdirectory.`,
        );
      }
    }
    if (json.sessionIds && json.sessionIds.length > 0) {
      p.log.info(`View at ${getViewerUrl()} → Replay tab`);
    }
  } catch (err) {
    spinner.stop("failed");
    if (err instanceof Error && err.name === "TimeoutError") {
      p.log.error("import timed out after 2 minutes");
    } else {
      p.log.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// `agentmemory remove` — clean uninstall.
//
// Planning logic lives in src/cli/remove-plan.ts so it's testable without
// touching $HOME. This function loads the manifest, builds the plan,
// double-confirms, then executes step by step.

function loadConnectManifest(home: string): ConnectManifest | null {
  const path = join(home, ".agentmemory", "backups", "connect-manifest.json");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ConnectManifest>;
    if (Array.isArray(parsed?.installed)) {
      return { installed: parsed.installed };
    }
    return null;
  } catch {
    return null;
  }
}

function probeLocalBinIiiVersion(home: string): string | null {
  const path = legacyLocalBinIii(home);
  if (!existsSync(path)) return null;
  return iiiBinVersion(path);
}

function safeDelete(path: string): { ok: boolean; message: string } {
  try {
    if (!existsSync(path)) return { ok: true, message: `not present (${path})` };
    const st = statSync(path);
    if (st.isDirectory()) {
      rmSync(path, { recursive: true, force: true });
    } else {
      unlinkSync(path);
    }
    return { ok: true, message: `deleted ${path}` };
  } catch (err) {
    return {
      ok: false,
      message: `failed ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runRemove(): Promise<void> {
  if (selectedInstance !== 0) {
    p.intro("agentmemory remove");
    p.log.error(
      `remove is a global uninstall and cannot target instance ${selectedInstance}. Stop that daemon with \`agentmemory stop --instance ${selectedInstance}\`, then run \`agentmemory remove\` without --instance when you intend to uninstall shared assets.`,
    );
    process.exit(1);
  }
  await assertRuntimePortOwnership();
  p.intro("agentmemory remove");
  const force = args.includes("--force");
  const keepData = args.includes("--keep-data");
  const ownedState = readEngineState();
  if (ownedState?.kind === "compose") {
    p.log.error("Stop the Worker Compose project with `agentmemory stop` before removing agentmemory; its data and daemon ownership are preserved.");
    process.exit(1);
  }
  if (ownedState?.kind === "docker") {
    p.log.error(legacyDockerStateMessage(ownedState));
    process.exit(1);
  }

  const home = homedir();
  const connectManifest = loadConnectManifest(home);
  const localBinIiiVersion = probeLocalBinIiiVersion(home);

  const options: RemoveOptions = {
    force,
    keepData,
  };
  const plan = buildRemovePlan(
    {
      home,
      runtimeDir: dirname(engineStatePath()),
      dataDir: dataDirResolution.dataDir,
      pinnedVersion: IIPINNED_VERSION,
      localBinIiiVersion,
      connectManifest,
    },
    options,
  );

  const applicable = plan.filter((it) => it.applicable);
  if (applicable.length === 0) {
    p.outro("Nothing to remove. agentmemory is already gone.");
    return;
  }

  p.note(formatPlan(plan), "destruction plan");

  if (!force) {
    const proceed = await p.confirm({
      message: "Proceed with these deletions?",
      initialValue: false,
    });
    if (p.isCancel(proceed) || proceed !== true) {
      p.cancel("Cancelled. Nothing was deleted.");
      return;
    }
    const sure = await p.confirm({
      message: "This is irreversible. Continue?",
      initialValue: false,
    });
    if (p.isCancel(sure) || sure !== true) {
      p.cancel("Cancelled. Nothing was deleted.");
      return;
    }
  }

  for (const item of plan) {
    if (!item.applicable) continue;

    // alwaysAsk items get a per-item confirmation even with --force.
    if (item.alwaysAsk) {
      const ok = await p.confirm({
        message: `${item.description} — really delete${item.path ? ` ${item.path}` : ""}?`,
        initialValue: false,
      });
      if (p.isCancel(ok) || ok !== true) {
        p.log.info(`skipped: ${item.id}`);
        continue;
      }
    }

    if (item.id === "stop-engine") {
      const stopped = await stopNativeEngineForRemoval();
      if (!stopped.ok) {
        p.log.error(`Removal aborted: ${stopped.reason}.`);
        process.exit(1);
      }
      p.log.success(
        stopped.stoppedEnginePids > 0
          ? `stopped engine (${stopped.stoppedEnginePids} pid${stopped.stoppedEnginePids === 1 ? "" : "s"})`
          : "no engine running",
      );
      continue;
    }

    if (!item.path) continue;
    const r = safeDelete(item.path);
    if (r.ok) p.log.success(r.message);
    else p.log.error(r.message);
  }

  p.outro(
    "Done. agentmemory cleanly removed. The npm package itself: npm uninstall -g @agentmemory/agentmemory",
  );
}

async function runConsole(): Promise<void> {
  const iiiBin = pickCompatibleIii([
    whichBinary("iii"),
    ...fallbackIiiPaths().filter((candidate) => existsSync(candidate)),
  ]);
  if (!iiiBin) {
    p.log.error(
      `No iii v${IIPINNED_VERSION} found. Start agentmemory once so it installs the pinned engine into ${privateIiiPath()}, then run this again.`,
    );
    process.exit(1);
  }
  let parsed: ReturnType<typeof parseConsoleArgs>;
  try {
    parsed = parseConsoleArgs(
      args.slice(1),
      defaultConsolePort(getConfiguredViewerPort()),
    );
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const launch = {
    iiiBin,
    consolePort: parsed.consolePort,
    restPort: getRestPort(),
    enginePort: getEnginePort(),
    extraArgs: parsed.extraArgs,
  };
  if (!(await isEngineRunning())) {
    p.log.warn(
      `No engine responding on port ${launch.restPort}. The console starts anyway and connects once agentmemory is up.`,
    );
  }
  p.log.info(
    `iii console: http://127.0.0.1:${launch.consolePort} (engine REST ${launch.restPort}, bridge ${launch.enginePort}). The first run downloads the console binary next to the pinned iii.`,
  );
  const child = spawn(iiiBin, consoleArgs(launch), {
    stdio: "inherit",
    detached: true,
  });
  const forward = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      child.kill(signal);
    }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => forward(signal));
  }
  const code = await new Promise<number>((resolve) => {
    child.on("exit", (status, signal) => resolve(status ?? (signal ? 1 : 0)));
    child.on("error", (err) => {
      p.log.error(err.message);
      resolve(1);
    });
  });
  process.exit(code);
}

async function runCapture(): Promise<void> {
  const code = await runCaptureCommand({
    base: getBaseUrl(),
    args: args.slice(1),
    secret: resolveClientSecret(getBaseUrl()),
  });
  process.exit(code);
}

async function runCompression(): Promise<void> {
  const base = getBaseUrl();
  const code = await runCompressionCommand({
    base,
    args: args.slice(1),
    secret: resolveClientSecret(base),
  });
  process.exit(code);
}

async function runGraphIndex(): Promise<void> {
  const base = getBaseUrl();
  process.exit(await runGraphIndexCommand({ base, args: args.slice(1), secret: resolveClientSecret(base) }));
}

const commands: Record<string, () => Promise<void>> = {
  init: runInit,
  connect: runConnectCmd,
  status: runStatus,
  console: runConsole,
  doctor: runDoctor,
  demo: runDemo,
  upgrade: runUpgrade,
  stop: runStop,
  remove: runRemove,
  mcp: runMcp,
  "import-jsonl": runImportJsonl,
  capture: runCapture,
  compression: runCompression,
  "graph-index": runGraphIndex,
};

const first = args[0] ?? "";
async function unknownCommand(): Promise<void> {
  p.log.error(
    `Unknown command: ${first}. Supported: ${Object.keys(commands).join(", ")}. Run \`agentmemory\` with no arguments to start the memory server, or \`agentmemory --help\` for usage.`,
  );
  process.exit(1);
}
// Only a bare invocation or flag-style args boot the server; an unrecognized
// word is an error. Previously any typo (or a guessed subcommand like
// `agentmemory consolidate`) fell through to the full server boot and could
// break a running daemon.
const handler = commands[first] ?? (first && !first.startsWith("-") ? unknownCommand : main);
handler().catch(async (err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  const exitCode = await runStartupCleanup(1).catch(() => 1);
  process.exit(exitCode);
});
