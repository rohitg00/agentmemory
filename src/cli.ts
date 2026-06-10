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
import { join, dirname, delimiter as PATH_DELIMITER } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import * as p from "@clack/prompts";
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
import { renderSplash } from "./cli/splash.js";
import { isFirstRun, readPrefs, resetPrefs, writePrefs } from "./cli/preferences.js";
import { runOnboarding } from "./cli/onboarding.js";
import { setBootVerbose } from "./logger.js";
import { VERSION } from "./version.js";
import { getAllTools, ESSENTIAL_TOOLS } from "./mcp/tools-registry.js";
import { knownAgents } from "./cli/connect/index.js";

const ALL_TOOLS_COUNT = getAllTools().length;
const CORE_TOOLS_COUNT = getAllTools().filter((t) => ESSENTIAL_TOOLS.has(t.name)).length;

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

// --version / -V early exit. Print VERSION + exit before any side effects
// (engine boot, env load, dir mkdir). `-v` is taken by --verbose so we
// reserve `-V` (capital) for version per POSIX convention.
if (args.includes("--version") || args.includes("-V")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

// Pinned iii-engine version. The unpinned `install.iii.dev/iii/main/install.sh`
// script tracks `latest`, which made every fresh agentmemory install pull
// engine 0.11.6 — and 0.11.6 introduces a new sandbox-everything-via-
// `iii worker add` worker model that agentmemory hasn't been refactored
// for yet (we still use the old `iii-exec watch` config-file model). The
// architectural mismatch surfaces as EPIPE reconnect loops and empty
// search results after save. Pin to v0.11.2 — the last engine that runs
// agentmemory's current worker model cleanly — until the refactor lands.
// Override env var AGENTMEMORY_III_VERSION lets users on the sandbox
// model already point at a newer engine without us cutting a release.
const IIPINNED_VERSION =
  process.env["AGENTMEMORY_III_VERSION"] || "0.11.2";

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
  // Tag name is monorepo-prefixed: `iii/v0.11.2`. Slash is URL-encoded
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
  (default)          Start agentmemory worker
  init               Copy bundled .env.example to ~/.agentmemory/.env if absent
  connect [agent]    Wire agentmemory into an installed agent
                     (${wrapList(knownAgents(), 21)}).
                     No arg = interactive picker. --all wires every detected agent.
                     --dry-run shows what would change. --force re-installs.
  status             Show connection status, memory count, flags, and health
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
                     --force bypasses the Docker-heuristic guard and signals
                     whatever pidfile+lsof report on the REST port (use when
                     the engine was started natively but state file is missing).
  mcp                Start standalone MCP shim — opt-in surface for MCP-only clients
                     (Cursor, Gemini CLI, etc). REST always available at :3111.
  import-jsonl [p]   Import Claude Code JSONL transcripts (default: ~/.claude/projects)
                     --max-files <N> | --max-files=<N>: override scan cap (default 200, max 1000;
                     out-of-range is rejected; for trees >1000 files, batch by subdirectory)

Options:
  --help, -h         Show this help
  --verbose, -v      Show engine stderr, boot log, and diagnostic info
  --reset            Wipe ~/.agentmemory/preferences.json and re-run onboarding
  --tools all|core   Tool visibility (default: all = ${ALL_TOOLS_COUNT} tools; core = ${CORE_TOOLS_COUNT} essentials)
  --no-engine        Skip auto-starting iii-engine
  --port <N>         Override REST port (default: 3111). Streams (N+1), viewer
                     (N+2), and iii engine (N+46023) auto-derive from N so a
                     single flag relocates the whole quartet.
  --instance <N>     Shortcut for --port (3111 + N*100) to run multiple
                     daemons side-by-side without env gymnastics.
                     --instance 1 -> 3211/3212/3213/49234, etc. (max N=50)

Environment:
  AGENTMEMORY_URL              Full REST base URL (e.g. http://localhost:3111).
                               Honored by status, doctor, and MCP shim commands.
  AGENTMEMORY_USE_DOCKER=1     Prefer the bundled docker-compose path over the
                               native iii-engine binary on first run.
  AGENTMEMORY_III_VERSION      Override pinned iii-engine version (default ${IIPINNED_VERSION}).
  AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS
                               Window (seconds) for the smart-search follow-up diagnostic
                               (default 30). Long values overcount, short values undercount.

Quick start:
  npx @agentmemory/agentmemory          # start with local iii-engine or Docker
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

const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env["III_REST_PORT"] = args[portIdx + 1];
}

// `--instance N` picks a 100-port block off the 3111 base so multiple
// agentmemory daemons can coexist on one host without env-var
// gymnastics (#750). `--instance 0` keeps the canonical 3111/3112/3113/49134
// quartet; `--instance 1` → 3211/3212/3213/49234; etc. REST acts as the
// anchor — streams/viewer/engine derive from it via fixed offsets below
// unless an env explicitly pins each one.
const instanceIdx = args.indexOf("--instance");
if (instanceIdx !== -1 && args[instanceIdx + 1]) {
  const n = parseInt(args[instanceIdx + 1] || "", 10);
  if (Number.isFinite(n) && n >= 0 && n <= 50) {
    const base = 3111 + n * 100;
    if (!process.env["III_REST_PORT"]) {
      process.env["III_REST_PORT"] = String(base);
    }
  }
}

const skipEngine = args.includes("--no-engine");

function getRestPort(): number {
  const url = process.env["AGENTMEMORY_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return parseInt(process.env["III_REST_PORT"] || "3111", 10) || 3111;
}

function getBaseUrl(): string {
  const url = process.env["AGENTMEMORY_URL"];
  if (url) return url.replace(/\/+$/, "");
  return `http://localhost:${getRestPort()}`;
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
    const vPort =
      parseInt(process.env["III_VIEWER_PORT"] || "", 10) ||
      (parseInt(u.port || "3111", 10) || 3111) + 2;
    return `${u.protocol}//${u.hostname}:${vPort}`;
  } catch {
    const vPort =
      parseInt(process.env["III_VIEWER_PORT"] || "", 10) ||
      getRestPort() + 2;
    return `http://localhost:${vPort}`;
  }
}

// WebSocket streams port. Engine writes here; the SDK and viewer
// subscribe. Honors both `III_STREAM_PORT` (the singular name the
// engine docs use post-0.11) and `III_STREAMS_PORT` (the name our
// own config.ts has used since 0.7) so a single source of truth in
// either form lights up the ready panel. Falls back to REST+1 so
// `--port 3211` auto-picks 3212 instead of colliding on 3112 (#750).
function getStreamPort(): number {
  return (
    parseInt(process.env["III_STREAM_PORT"] || "", 10) ||
    parseInt(process.env["III_STREAMS_PORT"] || "", 10) ||
    getRestPort() + 1
  );
}

// Bridge WebSocket port — the iii engine's internal worker bus.
// Defaults derived from REST as REST+46023 so the canonical 3111
// anchor yields 49134 and `--port 3211` auto-picks 49234 without a
// second-instance collision (#750). Overridable via
// `III_ENGINE_PORT` or the legacy `III_ENGINE_URL=ws://host:port`.
function getEnginePort(): number {
  const explicit = parseInt(process.env["III_ENGINE_PORT"] || "", 10);
  if (explicit) return explicit;
  const url = process.env["III_ENGINE_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return getRestPort() + 46023;
}

async function isEngineRunning(): Promise<boolean> {
  try {
    await fetch(`${getBaseUrl()}/`, {
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

async function isAgentmemoryReady(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/agentmemory/livez`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    try {
      const data = await res.json() as { viewerPort?: number | null; viewerSkipped?: boolean };
      if (typeof data.viewerPort === "number") {
        discoveredViewerPort = data.viewerPort;
        return true;
      }
      if (data.viewerSkipped) return true;
      return false;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function findIiiConfig(): string {
  // Precedence (user-overridable wins): explicit env > project cwd >
  // ~/.agentmemory/ > bundled. The bundled config used to win
  // unconditionally, so users hitting the observability log-feedback
  // loop (#519) had no way to drop a tamer config in place without
  // editing node_modules.
  const envPath = process.env["AGENTMEMORY_III_CONFIG"];
  const candidates = [
    ...(envPath ? [envPath] : []),
    join(process.cwd(), "iii-config.yaml"),
    join(homedir(), ".agentmemory", "iii-config.yaml"),
    join(__dirname, "iii-config.yaml"),
    join(__dirname, "..", "iii-config.yaml"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "";
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
// isolated from a user-managed iii on PATH or in ~/.local/bin. #752: a
// fresh box with iii 0.16.1 already on PATH refused to boot because the
// hard-pin enforcer told users to overwrite their global install with
// v0.11.2. Private install resolves the conflict without touching their
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
// runtime (state::list-not-found on v0.13.0+, sandbox-everything trap on
// v0.11.6+). Hard-pin without a fallback leaves the user stuck — they
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
  return join(homedir(), ".agentmemory", "iii.pid");
}

function engineStatePath(): string {
  return join(homedir(), ".agentmemory", "engine-state.json");
}

type EngineState =
  | { kind: "native"; configPath: string; attached?: boolean; binPath?: string }
  | { kind: "docker"; composeFile: string };

function writeEnginePidfile(pid: number): void {
  try {
    const pidPath = enginePidfilePath();
    mkdirSync(dirname(pidPath), { recursive: true });
    writeFileSync(pidPath, `${pid}\n`, { encoding: "utf-8" });
  } catch (err) {
    vlog(`writeEnginePidfile: ${err instanceof Error ? err.message : String(err)}`);
  }
}

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

// Worker pidfile (#640, #474): the agentmemory worker process
// (`node dist/index.mjs`) is spawned by iii-exec inside the engine. When
// `agentmemory stop` kills only the engine pid, the worker can survive
// (detached spawn, signal not propagated, or kept alive by a wrapper
// script). On the next start, the orphaned worker reconnects to the new
// engine and shows up as a duplicate registration. We write the worker
// pid from src/index.ts on boot so stop can find and reap it.
function workerPidfilePath(): string {
  return join(homedir(), ".agentmemory", "worker.pid");
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

function writeEngineState(state: EngineState): void {
  try {
    const statePath = engineStatePath();
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state)}\n`, { encoding: "utf-8" });
  } catch (err) {
    vlog(`writeEngineState: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readEngineState(): EngineState | null {
  try {
    const raw = readFileSync(engineStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<EngineState>;
    if (parsed && (parsed.kind === "native" || parsed.kind === "docker")) {
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

function discoverComposeFile(): string | null {
  const candidates = [
    join(__dirname, "..", "docker-compose.yml"),
    join(__dirname, "docker-compose.yml"),
    join(process.cwd(), "docker-compose.yml"),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
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

// iii-console install state.
//   "installed" — `iii-console` is on PATH or at `~/.local/bin/iii-console`
//   "missing"   — binary not found anywhere we look
// We deliberately do NOT probe the console's HTTP port: the binary
// being on disk is the signal we care about (it's not auto-started by
// agentmemory and its default port 3113 collides with our viewer, so
// "is it listening?" is the wrong question at boot time).
type IiiConsoleState =
  | { kind: "installed"; binPath: string }
  | { kind: "missing" };

function detectIiiConsole(): IiiConsoleState {
  const onPath = whichBinary("iii-console");
  if (onPath) return { kind: "installed", binPath: onPath };
  const fallback = IS_WINDOWS
    ? join(process.env["USERPROFILE"] ?? "", ".local", "bin", "iii-console.exe")
    : join(homedir(), ".local", "bin", "iii-console");
  if (fallback && existsSync(fallback)) {
    return { kind: "installed", binPath: fallback };
  }
  return { kind: "missing" };
}

// The upstream install script reads `VERSION` as an env var (see
// install.iii.dev/iii/main/install.sh: `engine_version="${VERSION:-}"`).
// Pin to IIPINNED_VERSION so a fresh boot can never pull a newer iii
// console that talks a different protocol than our pinned engine
// (root cause of #712-class drift).
const III_CONSOLE_INSTALL_CMD =
  `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=${IIPINNED_VERSION} sh`;

// Display-only renderer. The internal `runCommand(shBin, ["-c", ...])`
// path uses III_CONSOLE_INSTALL_CMD verbatim (POSIX shell). Anywhere
// that PRINTS the command to a user has to handle Windows separately
// since `VERSION=X sh` and the pipe-to-sh idiom aren't valid in
// cmd.exe / PowerShell.
function iiiConsoleInstallHint(): string {
  if (!IS_WINDOWS) return III_CONSOLE_INSTALL_CMD;
  return (
    `# PowerShell:\n` +
    `  $env:VERSION = "${IIPINNED_VERSION}"\n` +
    `  iwr -useb https://install.iii.dev/iii/main/install.sh -OutFile install.sh\n` +
    `  bash install.sh   # WSL or Git Bash required\n` +
    `# Or grab the pinned release directly:\n` +
    `  https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`
  );
}

async function ensureIiiConsole(): Promise<IiiConsoleState> {
  const state = detectIiiConsole();
  if (state.kind === "installed") return state;

  // Non-interactive contexts get the panel hint but no prompt.
  if (!process.stdin.isTTY || process.env["CI"]) return state;
  const prefs = readPrefs();
  if (prefs.skipConsoleInstall) return state;

  const answer = await p.confirm({
    message:
      "iii console gives engine-level visibility (workers, functions, queues, traces). Install now?",
    initialValue: true,
  });
  if (p.isCancel(answer)) return state;
  if (answer === false) {
    writePrefs({ skipConsoleInstall: true });
    return state;
  }

  const shBin = whichBinary("sh");
  const curlBin = whichBinary("curl");
  if (!shBin || !curlBin) {
    p.log.warn(
      `curl or sh not found. Install manually:\n  ${iiiConsoleInstallHint()}`,
    );
    return state;
  }
  const ok = runCommand(shBin, ["-c", III_CONSOLE_INSTALL_CMD], {
    label: "Installing iii console",
  });
  if (!ok) {
    p.log.warn(
      `iii console install failed. Re-run manually:\n  ${iiiConsoleInstallHint()}`,
    );
    return state;
  }
  // Re-detect rather than trust install-script output paths.
  return detectIiiConsole();
}

function adoptRunningEngine(): void {
  try {
    const existingState = readEngineState();
    const existingPid = readEnginePidfile();
    if (existingState && existingPid) return;

    const pids = findEnginePidsByPort(getRestPort());
    const enginePid = pids[0];
    if (enginePid && !existingPid) {
      writeEnginePidfile(enginePid);
    }
    if (!existingState) {
      writeEngineState({
        kind: "native",
        configPath: findIiiConfig() || "",
        attached: true,
      });
    }
    if (enginePid && !existingPid) {
      p.log.info(`Attached to existing iii-engine (pid ${enginePid})`);
    }
  } catch (err) {
    vlog(`adoptRunningEngine: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runIiiInstaller(): Promise<{ ok: boolean; binPath: string | null }> {
  const releaseUrl = iiiReleaseUrl();
  const asset = iiiReleaseAsset();
  const isZipAsset = asset?.endsWith(".zip") === true;

  if (!releaseUrl) {
    p.log.warn(
      `iii-engine binary not available for ${platform()}/${process.arch}. Use Docker (\`docker pull iiidev/iii:${IIPINNED_VERSION}\`) or download manually from https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}.`,
    );
    return { ok: false, binPath: null };
  }

  if (IS_WINDOWS || isZipAsset) {
    p.log.info(
      `Auto-install unavailable on ${platform()} — ${asset} isn't tar-compatible. Install manually:\n` +
        `  1. Download ${releaseUrl}\n` +
        `  2. Extract iii.exe and place it on PATH (e.g. %USERPROFILE%\\.local\\bin)\n` +
        `Or use Docker: docker pull iiidev/iii:${IIPINNED_VERSION}`,
    );
    return { ok: false, binPath: null };
  }

  const shBin = whichBinary("sh");
  const curlBin = whichBinary("curl");
  if (!shBin || !curlBin) {
    p.log.warn("curl or sh not found. Cannot auto-install iii-engine.");
    return { ok: false, binPath: null };
  }

  const binDir = agentmemoryBinDir();
  const binPath = privateIiiPath();
  const installCmd = [
    `mkdir -p "${binDir}"`,
    `curl -fsSL "${releaseUrl}" | tar -xz -C "${binDir}"`,
    `chmod +x "${binPath}"`,
  ].join(" && ");
  const installerOk = runCommand(shBin, ["-c", installCmd], {
    label: `Installing iii-engine v${IIPINNED_VERSION} (pinned)`,
    optional: true,
  });
  if (!installerOk) {
    p.log.warn(
      `iii-engine installer failed. Fallbacks: Docker (\`docker pull iiidev/iii:${IIPINNED_VERSION}\`) or download manually from https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}.`,
    );
    return { ok: false, binPath: null };
  }
  return { ok: true, binPath };
}

type StartupFailure = {
  kind: "no-engine" | "no-docker-compose" | "engine-crashed" | "docker-crashed";
  stderr?: string;
  binary?: string;
};

let startupFailure: StartupFailure | null = null;

// Spawn a background engine and collect any startup stderr for a short
// window. The process is unref'd so the CLI parent can exit cleanly; we
// only care about stderr that shows up BEFORE the health check succeeds,
// which is what surfaces early crash/config-parse errors on all platforms.
function spawnEngineBackground(
  bin: string,
  spawnArgs: string[],
  label: string,
): ChildProcess {
  vlog(`spawn: ${bin} ${spawnArgs.join(" ")}`);
  const child = spawn(bin, spawnArgs, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const isDocker = label.includes("Docker");
  if (!isDocker && typeof child.pid === "number") {
    writeEnginePidfile(child.pid);
  }
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  const MAX_STDERR_CAPTURE = 16 * 1024;
  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderrBytes >= MAX_STDERR_CAPTURE) return;
    const slice = chunk.subarray(0, MAX_STDERR_CAPTURE - stderrBytes);
    stderrChunks.push(slice);
    stderrBytes += slice.length;
  });
  child.on("exit", (code, signal) => {
    const abnormal =
      (code !== null && code !== 0) || (code === null && signal !== null);
    if (abnormal) {
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      startupFailure = {
        kind: isDocker ? "docker-crashed" : "engine-crashed",
        stderr:
          stderr.trim() ||
          (signal
            ? `process killed by signal ${signal}`
            : `process exited with code ${code}`),
        binary: bin,
      };
      vlog(`engine exited early: code=${code} signal=${signal}`);
      if (IS_VERBOSE && stderr.trim()) {
        p.log.error(`engine stderr:\n${stderr}`);
      }
      if (!isDocker) clearEnginePidfile();
      clearEngineState();
    }
  });
  child.unref();
  return child;
}

function startIiiBin(iiiBin: string, configPath: string): boolean {
  const s = p.spinner();
  s.start(`Starting iii-engine: ${iiiBin}`);
  writeEngineState({ kind: "native", configPath, binPath: iiiBin });
  spawnEngineBackground(iiiBin, ["--config", configPath], "iii-engine");
  s.stop("iii-engine process started");
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
  const configPath = findIiiConfig();
  const pathIii = whichBinary("iii");
  vlog(`iii binary: ${pathIii ?? "(not on PATH)"}, config: ${configPath || "(not found)"}`);

  const fallbacks = fallbackIiiPaths().filter((p) => existsSync(p));
  for (const f of fallbacks) {
    const v = iiiBinVersion(f);
    vlog(`fallback iii at ${f} reports version: ${v ?? "unknown"}`);
  }

  let iiiBin = pickCompatibleIii([pathIii, ...fallbacks]);

  if (iiiBin && configPath) {
    if (iiiBin !== pathIii) {
      p.log.info(`Using iii at: ${iiiBin} (v${IIPINNED_VERSION})`);
      process.env["PATH"] = `${dirname(iiiBin)}${PATH_DELIMITER}${process.env["PATH"] ?? ""}`;
    }
    return startIiiBin(iiiBin, configPath);
  }

  if (pathIii && !iiiBin) {
    const detected = iiiBinVersion(pathIii);
    vlog(
      `iii on PATH is v${detected ?? "unknown"}, pin is v${IIPINNED_VERSION}. ` +
        `Will install pinned engine to ${privateIiiPath()}.`,
    );
  }

  if (!configPath) {
    startupFailure = { kind: "no-engine" };
    return false;
  }

  const dockerBin = whichBinary("docker");
  vlog(`docker binary: ${dockerBin ?? "(not on PATH)"}`);
  const dockerComposeCandidates = [
    join(__dirname, "..", "docker-compose.yml"),
    join(__dirname, "docker-compose.yml"),
    join(process.cwd(), "docker-compose.yml"),
  ];
  const composeFile = dockerComposeCandidates.find((c) => existsSync(c));
  vlog(`docker-compose.yml: ${composeFile ?? "(not found)"}`);

  const dockerOptIn =
    process.env["AGENTMEMORY_USE_DOCKER"] === "1" ||
    process.env["AGENTMEMORY_USE_DOCKER"] === "true";
  const interactive = !!process.stdin.isTTY && !process.env["CI"];

  type Choice = "install" | "docker" | "manual";
  let choice: Choice;

  // Wrong-version iii on PATH is a configuration trap: any prompt would
  // confuse the user since they already "have iii installed". Skip the
  // prompt and auto-install pinned engine to the private location.
  const pathIiiMismatch = pathIii !== null && resolveCompatibleIii(pathIii) === null;

  if (dockerOptIn && dockerBin && composeFile) {
    choice = "docker";
  } else if (pathIiiMismatch) {
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
    if (dockerBin && composeFile) {
      options.push({ value: "docker", label: "Use Docker compose", hint: "advanced" });
    }
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
      return startIiiBin(iiiBin, configPath);
    }
    if (dockerBin && composeFile && interactive) {
      const fallback = await p.confirm({
        message: "Auto-install failed. Try Docker compose instead?",
        initialValue: true,
      });
      if (p.isCancel(fallback) || fallback !== true) {
        startupFailure = { kind: "no-engine" };
        return false;
      }
      choice = "docker";
    } else {
      startupFailure = { kind: "no-engine" };
      return false;
    }
  }

  if (choice === "docker" && dockerBin && composeFile) {
    const s = p.spinner();
    s.start("Starting iii-engine via Docker...");
    writeEngineState({ kind: "docker", composeFile });
    spawnEngineBackground(
      dockerBin,
      ["compose", "-f", composeFile, "up", "-d"],
      "iii-engine via Docker",
    );
    s.stop("Docker compose started");
    return true;
  }

  if (!composeFile && dockerBin) {
    startupFailure = { kind: "no-docker-compose" };
  } else {
    startupFailure = { kind: "no-engine" };
  }
  return false;
}

async function waitForEngine(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isEngineRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function installInstructions(): string[] {
  const releaseUrl = iiiReleaseUrl();
  if (IS_WINDOWS) {
    return [
      `agentmemory needs iii-engine v${IIPINNED_VERSION}. Pick one:`,
      "",
      "  A) Download the prebuilt Windows binary:",
      `     1. Open https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`,
      `     2. Download iii-x86_64-pc-windows-msvc.zip (or iii-aarch64-pc-windows-msvc.zip on ARM)`,
      "     3. Extract iii.exe to %USERPROFILE%\\.local\\bin\\iii.exe (or add to PATH)",
      "     4. Re-run: npx @agentmemory/agentmemory",
      "",
      `  B) Docker: docker pull iiidev/iii:${IIPINNED_VERSION}`,
      "     Re-run with AGENTMEMORY_USE_DOCKER=1 npx @agentmemory/agentmemory",
      "",
      "Or skip the engine entirely (standalone MCP):  npx @agentmemory/agentmemory mcp",
      "",
      "Docs: https://iii.dev/docs",
    ];
  }
  const linuxInstall = releaseUrl
    ? `  A) mkdir -p ~/.agentmemory/bin && curl -fsSL "${releaseUrl}" | tar -xz -C ~/.agentmemory/bin && chmod +x ~/.agentmemory/bin/iii`
    : `  A) Manual download: https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`;
  return [
    `agentmemory needs iii-engine v${IIPINNED_VERSION}. Pick one:`,
    "",
    linuxInstall,
    "     Then re-run: npx @agentmemory/agentmemory",
    "",
    `  B) Docker: docker pull iiidev/iii:${IIPINNED_VERSION}`,
    "     Re-run with AGENTMEMORY_USE_DOCKER=1 npx @agentmemory/agentmemory",
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

async function waitForAgentmemoryReady(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isAgentmemoryReady()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// Derive a host string for the streams/engine WebSocket lines from
// the configured engine URL (`III_ENGINE_URL`) or REST base
// (`AGENTMEMORY_URL`) so a remote-bind setup like
// `III_ENGINE_URL=ws://my-host:49134` doesn't print misleading
// localhost addresses. Falls back to localhost.
function getEngineHost(): string {
  for (const envKey of ["III_ENGINE_URL", "AGENTMEMORY_URL"]) {
    const raw = process.env[envKey];
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.hostname) return parsed.hostname;
    } catch {}
  }
  return "localhost";
}

function printReadyHint(consoleState: IiiConsoleState): void {
  // REST goes through getBaseUrl which already honors AGENTMEMORY_URL
  // for full host+protocol overrides. Streams/Engine are derived from
  // III_ENGINE_URL so a remote bind reads correctly in the panel.
  const restUrl = getBaseUrl();
  const viewerUrl = getViewerUrl();
  const engineHost = getEngineHost();
  const streamUrl = `ws://${engineHost}:${getStreamPort()}`;
  const engineUrl = `ws://${engineHost}:${getEnginePort()}`;

  const consoleLine =
    consoleState.kind === "installed"
      ? // We can't safely probe iii-console's port (default 3113
        // collides with our viewer) so we surface the binary location
        // and let the user start it on a port of their choice. Use
        // the detected binary path so `(run: ...)` is executable as-
        // is, even when the binary isn't on PATH under the bare
        // name `iii-console`.
        `iii console  ${consoleState.binPath}  (run: ${consoleState.binPath} -p <port>)`
      : `iii console  (install: ${iiiConsoleInstallHint()})`;

  const lines = [
    `REST API     ${restUrl}`,
    `Viewer       ${viewerUrl}`,
    `Streams      ${streamUrl}`,
    `Engine       ${engineUrl}`,
    consoleLine,
  ];
  // p.note renders a bordered panel with a title — same affordance
  // used elsewhere in this CLI for "Troubleshooting" / "Setup
  // required" blocks, so the visual language stays consistent.
  p.note(lines.join("\n"), `agentmemory v${VERSION}`);

  // Pick a runnable form for the suggested next-step. Users invoked
  // via `npx` don't have the bare `agentmemory` command on PATH yet
  // (unless they accepted the global-install prompt and the npm bin
  // dir was already on PATH in this shell), so we suggest the npx
  // form for them; everyone else gets the global form.
  const demoCommand = isInvokedViaNpx()
    ? "npx @agentmemory/agentmemory demo"
    : "agentmemory demo";
  process.stdout.write(`\nTry: ${demoCommand}\n`);
}

async function main() {
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

  if (skipEngine) {
    if (IS_VERBOSE) p.log.info("Skipping engine check (--no-engine)");
    await import("./index.js");
    if (await waitForAgentmemoryReady(15000)) {
      const consoleState = await ensureIiiConsole();
      await maybeOfferGlobalInstall();
      printReadyHint(consoleState);
    }
    return;
  }

  if (await isEngineRunning()) {
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
    if (attachedBin) {
      const detected = iiiBinVersion(attachedBin);
      if (detected && detected !== IIPINNED_VERSION) {
        p.log.warn(
          `iii on PATH is v${detected} (from ${attachedBin}) but agentmemory v${VERSION} pins v${IIPINNED_VERSION}. ` +
            `agentmemory will use its own pinned engine in ~/.agentmemory/bin and leaves ${attachedBin} untouched. ` +
            `If you want agentmemory to track a different engine, set AGENTMEMORY_III_VERSION=${detected}.`,
        );
      }
    }
    adoptRunningEngine();
    await import("./index.js");
    if (await waitForAgentmemoryReady(15000)) {
      const consoleState = await ensureIiiConsole();
      await maybeOfferGlobalInstall();
      printReadyHint(consoleState);
    }
    return;
  }

  const started = await startEngine();
  if (!started) {
    p.log.error("Could not start iii-engine.");
    const lines = installInstructions();
    if (startupFailure?.kind === "no-docker-compose") {
      lines.unshift(
        "Docker is installed but docker-compose.yml is missing from this",
        "install. Re-install with: npm install -g @agentmemory/agentmemory",
        "",
      );
    }
    p.note(lines.join("\n"), "Setup required");
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Waiting for iii-engine to be ready...");

  const ready = await waitForEngine(15000);
  if (!ready) {
    const port = getRestPort();
    s.stop("iii-engine did not become ready within 15s");

    if (startupFailure?.kind === "engine-crashed" || startupFailure?.kind === "docker-crashed") {
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
          "  - Docker Desktop not running (if you're using the Docker path)",
          "  - Port already in use (see below)",
          "",
          "See https://iii.dev/docs for current install instructions.",
        ].join("\n"),
        "Troubleshooting",
      );
    } else {
      p.log.error("The engine process started but the REST API never responded.");
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
    process.exit(1);
  }

  s.stop("iii-engine is ready");
  await import("./index.js");
  if (await waitForAgentmemoryReady(15000)) {
    const consoleState = await ensureIiiConsole();
    await maybeOfferGlobalInstall();
    printReadyHint(consoleState);
  }
  // Mark splash as something to skip on subsequent runs. This is a
  // no-op if onboarding already flipped the flag (idempotent merge).
  writePrefs({ skipSplash: true });
}

async function apiFetch<T = unknown>(base: string, path: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    const secret = process.env["AGENTMEMORY_SECRET"];
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
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
  const port = getRestPort();
  const base = getBaseUrl();
  p.intro("agentmemory status");

  const up = await isEngineRunning();
  if (!up) {
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
    const nodes = Number(graphRes?.totalNodes ?? graphRes?.nodes ?? graphRes?.nodeCount ?? 0);
    const edges = Number(graphRes?.totalEdges ?? graphRes?.edges ?? graphRes?.edgeCount ?? 0);
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
      `Health:       ${status === "healthy" ? "✓ healthy" : status}`,
      `Sessions:     ${sessions}`,
      `Observations: ${obsCount}`,
      `Memories:     ${memCount}`,
      `Graph:        ${nodes} nodes, ${edges} edges`,
      `Circuit:      ${cb}`,
      `Heap:         ${heapMB} MB`,
      `Uptime:       ${uptime}s`,
      `Viewer:       ${getViewerUrl()}`,
    ];

    if (obsCount > 0) {
      lines.push("");
      lines.push(`Token savings: ~${tokensSaved.toLocaleString()} tokens saved (${pctSaved}% reduction)`);
      lines.push(`  Full context: ~${estFullTokens.toLocaleString()} tokens`);
      lines.push(`  Injected:     ~${estInjectedTokens.toLocaleString()} tokens`);
    }

    if (flagsRes) {
      const provider = flagsRes.provider === "llm" ? "✓ llm" : "✗ noop (no key)";
      const embed = flagsRes.embeddingProvider === "embeddings" ? "✓ embeddings" : "bm25-only";
      const flagRows = (flagsRes.flags || []).map((f: { key: string; enabled: boolean; label: string }) =>
        `  ${f.enabled ? "✓" : "✗"} ${f.key.padEnd(32)} ${f.label}`
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

    p.note(lines.join("\n"), "agentmemory");
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

type DoctorCheck = { name: string; ok: boolean; hint?: string };

function formatChecks(checks: DoctorCheck[]): string {
  return checks
    .map((c) => `${c.ok ? "✓" : "✗"} ${c.name}${c.hint ? `\n   ${c.hint}` : ""}`)
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
    pidfilePath: enginePidfilePath(),
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
    pidfileExists: () => existsSync(enginePidfilePath()),
    pidfilePidIsAlive: () => {
      const pid = readEnginePidfile();
      if (pid === null) return null;
      return pidAlive(pid);
    },
    findIiiBinary: () => whichBinary("iii"),
    localBinIiiPath: () => privateIiiPath(),
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
        const started = await startEngine();
        if (!started) return { ok: false, message: "startEngine() returned false" };
        const ready = await waitForEngine(15000);
        return {
          ok: ready,
          message: ready ? "Engine ready" : "Engine did not become ready within 15s",
        };
      } catch (err) {
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
  const graphNodeCount = Number(
    graph?.totalNodes ?? graph?.nodes ?? graph?.nodeCount ?? 0,
  );
  const graphHas = graphNodeCount > 0;

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
        : "Running BM25-only. Add OPENAI_API_KEY / VOYAGE_API_KEY / COHERE_API_KEY / OLLAMA_HOST",
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
      headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

  await postJsonStrict(`${base}/agentmemory/session/end`, { sessionId: session.id });
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
  if (await isAgentmemoryReady()) {
    return async () => {};
  }

  const startedEngine = !(await isEngineRunning());
  if (startedEngine) {
    const ok = await startEngine();
    if (!ok) {
      p.log.error("Could not start iii-engine for the demo.");
      p.note(installInstructions().join("\n"), "Setup required");
      process.exit(1);
    }
    if (!(await waitForEngine(15000))) {
      p.log.error("iii-engine did not become ready within 15s.");
      process.exit(1);
    }
  }

  await import("./index.js");
  if (!(await waitForAgentmemoryReady(15000))) {
    p.log.error("agentmemory worker did not become ready within 15s.");
    process.exit(1);
  }

  return async () => {
    if (!startedEngine) return;
    const port = getRestPort();
    const state = readEngineState();
    if (state?.kind === "docker") {
      await stopDockerEngine(state.composeFile, port).catch(() => {});
      return;
    }
    const pids = new Set<number>(findEnginePidsByPort(port));
    const pidfilePid = readEnginePidfile();
    if (pidfilePid) pids.add(pidfilePid);
    for (const pid of pids) {
      await signalAndWait(pid, "SIGTERM", 3000).catch(() => {});
    }
    clearEnginePidfile();
    clearEngineState();
    clearWorkerPidfile();
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

  const lines = [
    `Project:       ${demoProject}`,
    `Sessions:      ${sessions.length} seeded (${totalObs} observations)`,
    "",
    "Search results:",
    ...results.flatMap((r) => [
      `  "${r.query}"`,
      `    → ${r.hits} hit(s), top: ${r.topTitle.slice(0, 60)}`,
    ]),
    "",
    `Notice: searching "database performance optimization"`,
    `found the N+1 query fix — keyword matching can't do that.`,
    "",
    `Viewer:        ${getViewerUrl()}`,
    `Clean up with: curl -X DELETE "${base}/agentmemory/sessions?project=${demoProject}"`,
  ];

  p.note(lines.join("\n"), "demo complete");
  p.log.success("agentmemory is working. Point your agent at it and get back to coding.");
}

function runCommand(
  command: string,
  commandArgs: string[],
  options: { cwd?: string; label: string; optional?: boolean } = { label: "command" },
): boolean {
  const spinner = p.spinner();
  spinner.start(options.label);
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (result.status === 0) {
    spinner.stop(`${options.label} ✓`);
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

  spinner.stop(`${options.label} ✗`);
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
  const dockerBin = whichBinary("docker");

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
      runCommand(pnpmBin, ["up", "iii-sdk@0.11.2"], {
        label: "Pinning iii-sdk@0.11.2",
        optional: true,
      });
    } else if (npmBin) {
      const installOk = runCommand(npmBin, ["install"], {
        label: "Refreshing dependencies (npm install)",
      });
      requireSuccess(installOk, "npm install");
      runCommand(npmBin, ["install", "iii-sdk@0.11.2"], {
        label: "Pinning iii-sdk@0.11.2",
        optional: true,
      });
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

  if (dockerBin) {
    runCommand(dockerBin, ["pull", `iiidev/iii:${IIPINNED_VERSION}`], {
      label: `Pulling iii Docker image v${IIPINNED_VERSION} (pinned)`,
      optional: true,
    });
  } else {
    p.log.info("Docker not found. Skipping Docker image refresh.");
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

async function stopDockerEngine(composeFile: string, port: number): Promise<void> {
  const dockerBin = whichBinary("docker");
  if (!dockerBin) {
    p.log.error(
      `Engine was started via Docker compose, but \`docker\` is no longer on PATH. Stop it manually:\n  docker compose -f ${composeFile} down`,
    );
    process.exit(1);
  }
  if (!existsSync(composeFile)) {
    p.log.error(
      `Engine state references ${composeFile}, but the file is gone. Stop it manually:\n  docker compose down  (from the dir holding the original docker-compose.yml)`,
    );
    process.exit(1);
  }
  const ok = runCommand(dockerBin, ["compose", "-f", composeFile, "down"], {
    label: `docker compose -f ${composeFile} down`,
  });
  clearEnginePidfile();
  clearEngineState();
  clearWorkerPidfile();
  if (!ok) {
    p.log.error(
      `docker compose down failed. The engine may still be running on :${port}. Inspect with:\n  docker compose -f ${composeFile} ps`,
    );
    process.exit(1);
  }
  p.outro("Stopped. Memories persisted to disk; restart anytime with: npx @agentmemory/agentmemory");
}

async function runStop(): Promise<void> {
  p.intro("agentmemory stop");
  const port = getRestPort();
  const state = readEngineState();
  const running = await isEngineRunning();
  const force = args.includes("--force");

  if (state?.kind === "docker") {
    if (!running) {
      p.log.info(`No engine responding on port ${port}.`);
      clearEnginePidfile();
      clearEngineState();
      clearWorkerPidfile();
      p.outro("Nothing to stop.");
      return;
    }
    await stopDockerEngine(state.composeFile, port);
    return;
  }

  const portPids = findEnginePidsByPort(port);
  const pidfilePid = readEnginePidfile();
  // #640 + #474: read the worker pid up front so the engine-down branch
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
      const ok = await signalAndWait(workerPid, "SIGTERM", 3000);
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

  if (!state) {
    const compose = discoverComposeFile();
    if (compose && pidfilePid === null) {
      if (force) {
        p.log.warn(
          `--force: bypassing Docker-heuristic guard. Falling back to native pidfile + lsof on :${port}.`,
        );
      } else {
        p.log.error(
          `Engine is running on :${port} but no pidfile or state file is present. It may have been started via Docker compose by a different shell. Refusing to signal host PIDs.\n\nStop it with:\n  docker compose -f ${compose} down\n\nOr re-run with --force to signal whatever lsof finds on :${port}, or AGENTMEMORY_USE_DOCKER=1 to record state next time.`,
        );
        process.exit(1);
      }
    }
  }

  const candidates = new Set<number>();
  if (pidfilePid) candidates.add(pidfilePid);
  for (const pid of portPids) candidates.add(pid);

  // #640 + #474: stop must also reap the agentmemory worker process
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
  // #843: stop worker first, then engine. The worker's shutdown
  // handler calls indexPersistence.save() -> kv.set() -> iii state::set
  // to flush BM25/vector snapshots + audit rows. Killing iii first
  // leaves those writes with no engine to land on, and the index +
  // observations end up as in-memory state the iii process never
  // persists. Worker SIGTERM grace bumped 3s -> 5s to give a large
  // index a real chance to commit before the engine goes away.
  for (const pid of workerCandidates) {
    const s = p.spinner();
    s.start(`Stopping agentmemory worker (pid ${pid})... [flushing state]`);
    const ok = await signalAndWait(pid, "SIGTERM", 5000);
    s.stop(ok ? `Stopped worker pid ${pid}` : `Failed to stop worker pid ${pid}`);
    if (!ok) allStopped = false;
  }
  for (const pid of candidates) {
    if (workerCandidates.has(pid)) continue;
    const s = p.spinner();
    s.start(`Stopping iii-engine (pid ${pid})...`);
    const ok = await signalAndWait(pid, "SIGTERM", 3000);
    s.stop(ok ? `Stopped pid ${pid}` : `Failed to stop pid ${pid}`);
    if (!ok) allStopped = false;
  }

  clearEnginePidfile();
  clearEngineState();
  clearWorkerPidfile();
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
  // args (e.g. `--port 3112 import-jsonl` would otherwise turn
  // 3112 into pathArg).
  const VALUE_FLAGS = new Set(["--port", "--tools"]);
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
  if (pathArg) body["path"] = pathArg;
  if (maxFiles !== undefined) body["maxFiles"] = maxFiles;

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env["AGENTMEMORY_SECRET"];
  if (secret) headers["authorization"] = `Bearer ${secret}`;

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
  p.intro("agentmemory remove");
  const force = args.includes("--force");
  const keepData = args.includes("--keep-data");

  const home = homedir();
  const connectManifest = loadConnectManifest(home);
  const localBinIiiVersion = probeLocalBinIiiVersion(home);

  const options: RemoveOptions = { force, keepData };
  const plan = buildRemovePlan(
    {
      home,
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
      try {
        const port = getRestPort();
        const portPids = findEnginePidsByPort(port);
        const pidfilePid = readEnginePidfile();
        const cands = new Set<number>();
        if (pidfilePid) cands.add(pidfilePid);
        for (const pid of portPids) cands.add(pid);
        for (const pid of cands) await signalAndWait(pid, "SIGTERM", 3000);
        clearEnginePidfile();
        clearEngineState();
        p.log.success(
          cands.size > 0
            ? `stopped engine (${cands.size} pid${cands.size === 1 ? "" : "s"})`
            : "no engine running",
        );
      } catch (err) {
        p.log.warn(
          `engine stop best-effort: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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

const commands: Record<string, () => Promise<void>> = {
  init: runInit,
  connect: runConnectCmd,
  status: runStatus,
  doctor: runDoctor,
  demo: runDemo,
  upgrade: runUpgrade,
  stop: runStop,
  remove: runRemove,
  mcp: runMcp,
  "import-jsonl": runImportJsonl,
};

const handler = commands[args[0] ?? ""] ?? main;
handler().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
