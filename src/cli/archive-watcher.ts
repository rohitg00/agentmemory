import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { promises as fs } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";

export type ArchiveWatcherMode = "background" | "once";
export type ArchiveHistoryPolicy = "process" | "new-only";
export type ArchiveWatcherStatus = "pending" | "completed" | "terminal";
export type ArchiveErrorClass =
  | "awaiting_stability"
  | "service_unavailable"
  | "transient_http"
  | "transient_read"
  | "invalid_archive"
  | "missing_archive"
  | "historical_skipped"
  | "completed";

export interface ArchiveWatcherStateEntry {
  fileHash: string;
  sessionId: string;
  status: ArchiveWatcherStatus;
  reason: string;
  errorClass?: ArchiveErrorClass;
  lastError?: string;
  retryCount: number;
  nextRetryAt?: string;
  stableCount: number;
  sizeBytes?: number;
  mtimeMs?: number;
  seenAt: string;
  ledgerResult?: "processed" | "skipped_completed";
}

export interface ArchiveWatcherState {
  version: 2;
  historyPolicy?: ArchiveHistoryPolicy;
  initializedAt?: string;
  seen: Record<string, ArchiveWatcherStateEntry>;
  nextHealthCheckAt?: string;
  healthRetryCount: number;
  lastHealthError?: string;
  lastRun?: {
    pid: number;
    runId: string;
    mode: ArchiveWatcherMode;
    startedAt: string;
    completedAt?: string;
  };
}

interface ArchiveSnapshot {
  path: string;
  fileHash: string;
  sessionId: string;
  sizeBytes: number;
  mtimeMs: number;
  parseError?: string;
}

interface ArchiveInventory {
  total: number;
  parseable: number;
  invalid: number;
  files: string[];
}

interface WatcherConfig {
  archiveRoot: string;
  statePath: string;
  maintenanceLockPath: string;
  logPath: string;
  restUrl: string;
  secret: string;
  pollMs: number;
}

const STATE_VERSION = 2 as const;
const DEFAULT_POLL_MS = 30_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 300_000;
const HEALTH_TIMEOUT_MS = 2_000;
const PROCESS_TIMEOUT_MS = 120_000;
const REQUIRED_STABLE_ROUNDS = 2;
const ARCHIVE_TASK_NAME = "AgentMemory Autostart";

function defaultConfig(): WatcherConfig {
  const root = homedir();
  const env = readAgentMemoryEnv();
  const restUrl =
    process.env["AGENTMEMORY_URL"] || env["AGENTMEMORY_URL"] || "http://127.0.0.1:3111";
  return {
    archiveRoot: resolve(
      process.env["AGENTMEMORY_ARCHIVE_ROOT"] || join(root, ".codex", "archived_sessions"),
    ),
    statePath: resolve(
      process.env["AGENTMEMORY_ARCHIVE_WATCHER_STATE"] ||
        join(root, ".agentmemory", "archive-watcher-state.json"),
    ),
    maintenanceLockPath: resolve(
      process.env["AGENTMEMORY_MAINTENANCE_LOCK"] || join(root, ".agentmemory", "MAINTENANCE.lock"),
    ),
    logPath: resolve(
      process.env["AGENTMEMORY_ARCHIVE_WATCHER_LOG"] ||
        join(tmpdir(), "agentmemory-autostart", "archive-watcher.log"),
    ),
    restUrl: restUrl.replace(/\/$/, ""),
    secret: process.env["AGENTMEMORY_SECRET"] || env["AGENTMEMORY_SECRET"] || "",
    pollMs: parsePositiveInt(process.env["AGENTMEMORY_ARCHIVE_POLL_SECONDS"], 30) * 1000,
  };
}

function readAgentMemoryEnv(): Record<string, string> {
  const envPath = join(homedir(), ".agentmemory", ".env");
  if (!existsSync(envPath)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function backoffMs(retryCount: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, retryCount - 1));
}

function retryAt(retryCount: number): string {
  return new Date(Date.now() + backoffMs(retryCount)).toISOString();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function emptyState(): ArchiveWatcherState {
  return {
    version: STATE_VERSION,
    seen: {},
    healthRetryCount: 0,
  };
}

function normalizeEntry(value: unknown): ArchiveWatcherStateEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const oldReason = typeof row.reason === "string" ? row.reason : "legacy_state";
  const rawStatus = row.status;
  let status: ArchiveWatcherStatus =
    rawStatus === "completed" || rawStatus === "terminal" || rawStatus === "pending"
      ? rawStatus
      : "pending";
  if (oldReason === "initial-seed" || oldReason === "initial_seed") status = "pending";
  return {
    fileHash: typeof row.fileHash === "string" ? row.fileHash : "",
    sessionId: typeof row.sessionId === "string" ? row.sessionId : "",
    status,
    reason: status === "pending" && oldReason.startsWith("initial") ? "legacy_recheck" : oldReason,
    errorClass: isErrorClass(row.errorClass) ? row.errorClass : undefined,
    lastError: typeof row.lastError === "string" ? row.lastError : undefined,
    retryCount: typeof row.retryCount === "number" && row.retryCount >= 0 ? row.retryCount : 0,
    nextRetryAt: typeof row.nextRetryAt === "string" ? row.nextRetryAt : undefined,
    stableCount: typeof row.stableCount === "number" && row.stableCount >= 0 ? row.stableCount : 0,
    sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : undefined,
    mtimeMs: typeof row.mtimeMs === "number" ? row.mtimeMs : undefined,
    seenAt: typeof row.seenAt === "string" ? row.seenAt : nowIso(),
    ledgerResult:
      row.ledgerResult === "processed" || row.ledgerResult === "skipped_completed"
        ? row.ledgerResult
        : undefined,
  };
}

function isErrorClass(value: unknown): value is ArchiveErrorClass {
  return [
    "awaiting_stability",
    "service_unavailable",
    "transient_http",
    "transient_read",
    "invalid_archive",
    "missing_archive",
    "historical_skipped",
    "completed",
  ].includes(value as ArchiveErrorClass);
}

async function loadState(path: string): Promise<ArchiveWatcherState> {
  if (!existsSync(path)) return emptyState();
  const parsed = safeJsonParse<Record<string, unknown>>(await fs.readFile(path, "utf8"));
  if (!parsed) return emptyState();
  const state = emptyState();
  state.historyPolicy = parsed.historyPolicy === "new-only" ? "new-only" : parsed.historyPolicy === "process" ? "process" : undefined;
  state.initializedAt = typeof parsed.initializedAt === "string" ? parsed.initializedAt : undefined;
  state.nextHealthCheckAt = typeof parsed.nextHealthCheckAt === "string" ? parsed.nextHealthCheckAt : undefined;
  state.healthRetryCount = typeof parsed.healthRetryCount === "number" ? parsed.healthRetryCount : 0;
  state.lastHealthError = typeof parsed.lastHealthError === "string" ? parsed.lastHealthError : undefined;
  if (parsed.lastRun && typeof parsed.lastRun === "object") {
    const run = parsed.lastRun as Record<string, unknown>;
    if (typeof run.pid === "number" && typeof run.runId === "string" && (run.mode === "once" || run.mode === "background") && typeof run.startedAt === "string") {
      state.lastRun = {
        pid: run.pid,
        runId: run.runId,
        mode: run.mode,
        startedAt: run.startedAt,
        completedAt: typeof run.completedAt === "string" ? run.completedAt : undefined,
      };
    }
  }
  if (parsed.seen && typeof parsed.seen === "object") {
    for (const [pathKey, value] of Object.entries(parsed.seen)) {
      const entry = normalizeEntry(value);
      if (entry) state.seen[pathKey] = entry;
    }
  }
  return state;
}

async function saveState(path: string, state: ArchiveWatcherState): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify({ ...state, version: STATE_VERSION }, null, 2), "utf8");
    renameSync(tempPath, path);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function log(config: WatcherConfig, level: "info" | "warn" | "error", message: string, context: Record<string, unknown> = {}): void {
  mkdirSync(dirname(config.logPath), { recursive: true });
  const entry = {
    timestamp: nowIso(),
    level,
    ...context,
    message,
  };
  const line = JSON.stringify(entry);
  process.stdout.write(`${line}\n`);
  try {
    writeFileSync(config.logPath, `${line}\n`, { encoding: "utf8", flag: "a" });
  } catch {
    // Logging must not stop archive processing.
  }
}

function headers(config: WatcherConfig): Record<string, string> {
  const result: Record<string, string> = { "content-type": "application/json" };
  if (config.secret) result.authorization = `Bearer ${config.secret}`;
  return result;
}

async function healthCheck(config: WatcherConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${config.restUrl}/agentmemory/health`, {
      headers: headers(config),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function listArchives(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(root, name))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function extractSessionId(record: unknown): string {
  if (!record || typeof record !== "object") return "";
  const row = record as Record<string, unknown>;
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  for (const candidate of [payload.session_id, payload.id, row.sessionId]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

async function snapshot(path: string): Promise<ArchiveSnapshot> {
  const before = await fs.stat(path);
  const text = await fs.readFile(path, "utf8");
  const after = await fs.stat(path);
  const fileHash = sha256(text);
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
  const record = safeJsonParse<unknown>(firstLine);
  const sessionId = extractSessionId(record);
  const changedDuringRead = before.size !== after.size || before.mtimeMs !== after.mtimeMs;
  return {
    path,
    fileHash,
    sessionId,
    sizeBytes: after.size,
    mtimeMs: after.mtimeMs,
    parseError: changedDuringRead
      ? "archive_changed_during_read"
      : !record
        ? "invalid_first_json_line"
        : !sessionId
          ? "missing_session_id"
          : undefined,
  };
}

async function inventory(config: WatcherConfig): Promise<ArchiveInventory> {
  const files = listArchives(config.archiveRoot);
  let parseable = 0;
  for (const path of files) {
    try {
      const item = await snapshot(path);
      if (!item.parseError) parseable++;
    } catch {
      // Inventory is advisory; the watcher will classify the file on a real round.
    }
  }
  return { total: files.length, parseable, invalid: files.length - parseable, files };
}

function isDue(entry: ArchiveWatcherStateEntry | undefined): boolean {
  if (entry?.errorClass === "awaiting_stability") return true;
  if (!entry?.nextRetryAt) return true;
  const at = Date.parse(entry.nextRetryAt);
  return !Number.isFinite(at) || at <= Date.now();
}

function maintenanceLocked(config: WatcherConfig): boolean {
  return existsSync(config.maintenanceLockPath);
}

function markPending(entry: ArchiveWatcherStateEntry, reason: string, errorClass: ArchiveErrorClass, error?: string): void {
  entry.status = "pending";
  entry.reason = reason;
  entry.errorClass = errorClass;
  entry.lastError = error;
  entry.retryCount += 1;
  entry.nextRetryAt = retryAt(entry.retryCount);
  entry.seenAt = nowIso();
}

function classifyResponse(status: number, reason: string): ArchiveErrorClass {
  const lower = reason.toLowerCase();
  if (lower.includes("missing")) return "missing_archive";
  if (lower.includes("invalid") || lower.includes("outside") || lower.includes("symlink")) return "invalid_archive";
  if (status >= 500 || status === 408 || status === 429 || status === 401 || status === 403) return "transient_http";
  return "transient_http";
}

async function processArchive(config: WatcherConfig, path: string, entry: ArchiveWatcherStateEntry, run: { pid: number; runId: string; mode: ArchiveWatcherMode }): Promise<void> {
  if (maintenanceLocked(config)) return;
  const requestId = randomUUID();
  try {
    const response = await fetch(`${config.restUrl}/agentmemory/archive/process`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(PROCESS_TIMEOUT_MS),
    });
    const bodyText = await response.text();
    const body = safeJsonParse<Record<string, unknown>>(bodyText) || {};
    const processed = Array.isArray(body.processed) ? body.processed as Array<Record<string, unknown>> : [];
    const skipped = Array.isArray(body.skipped) ? body.skipped as Array<Record<string, unknown>> : [];
    const skippedReason = typeof skipped[0]?.reason === "string" ? skipped[0].reason : "";
    const ledgerResult = processed.length > 0
      ? "processed"
      : skippedReason === "already_completed"
        ? "skipped_completed"
        : undefined;
    if (response.ok && body.success === true && ledgerResult) {
      entry.status = "completed";
      entry.reason = "completed";
      entry.errorClass = "completed";
      entry.lastError = undefined;
      entry.retryCount = 0;
      entry.nextRetryAt = undefined;
      entry.ledgerResult = ledgerResult;
      entry.sessionId = String(processed[0]?.sessionId || skipped[0]?.sessionId || entry.sessionId);
      entry.seenAt = nowIso();
      log(config, "info", "archive acknowledged", {
        pid: run.pid,
        runId: run.runId,
        mode: run.mode,
        archivePath: path,
        sessionId: entry.sessionId,
        requestId,
        httpStatus: response.status,
        ledgerResult,
      });
      return;
    }
    const reason = skippedReason || (typeof body.error === "string" ? body.error : `http_${response.status}`);
    const errorClass = classifyResponse(response.status, reason);
    if (errorClass === "invalid_archive" || errorClass === "missing_archive") {
      entry.status = "terminal";
      entry.reason = reason;
      entry.errorClass = errorClass;
      entry.lastError = reason;
      entry.nextRetryAt = undefined;
      entry.seenAt = nowIso();
    } else {
      markPending(entry, "forward_failed", errorClass, reason);
    }
    log(config, "warn", "archive forward failed", {
      pid: run.pid,
      runId: run.runId,
      mode: run.mode,
      archivePath: path,
      sessionId: entry.sessionId,
      requestId,
      httpStatus: response.status,
      errorClass,
      error: reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markPending(entry, "forward_failed", "transient_http", message);
    log(config, "warn", "archive forward unavailable", {
      pid: run.pid,
      runId: run.runId,
      mode: run.mode,
      archivePath: path,
      sessionId: entry.sessionId,
      requestId,
      errorClass: "transient_http",
      error: message,
    });
  }
}

async function scanRound(config: WatcherConfig, state: ArchiveWatcherState, run: { pid: number; runId: string; mode: ArchiveWatcherMode }): Promise<number> {
  if (maintenanceLocked(config)) {
    log(config, "info", "scan skipped", { pid: run.pid, runId: run.runId, mode: run.mode, reason: "maintenance_lock" });
    return 0;
  }

  const health = await healthCheck(config);
  if (!health.ok) {
    state.healthRetryCount += 1;
    state.lastHealthError = health.error;
    state.nextHealthCheckAt = retryAt(state.healthRetryCount);
    for (const entry of Object.values(state.seen)) {
      if (entry.status === "pending" && isDue(entry)) markPending(entry, "service_unavailable", "service_unavailable", health.error);
    }
    log(config, "warn", "scan skipped because service is unavailable", {
      pid: run.pid,
      runId: run.runId,
      mode: run.mode,
      errorClass: "service_unavailable",
      error: health.error,
      nextRetryAt: state.nextHealthCheckAt,
    });
    return 0;
  }
  state.healthRetryCount = 0;
  state.nextHealthCheckAt = undefined;
  state.lastHealthError = undefined;

  for (const [path, entry] of Object.entries(state.seen)) {
    if (entry.status === "pending" && !existsSync(path)) {
      entry.status = "terminal";
      entry.reason = "missing_archive";
      entry.errorClass = "missing_archive";
      entry.lastError = "archive file is no longer present";
      entry.nextRetryAt = undefined;
      entry.seenAt = nowIso();
    }
  }

  let acknowledged = 0;
  for (const path of listArchives(config.archiveRoot)) {
    if (maintenanceLocked(config)) {
      log(config, "info", "scan stopped", { pid: run.pid, runId: run.runId, mode: run.mode, reason: "maintenance_lock" });
      break;
    }
    let current: ArchiveSnapshot;
    try {
      current = await snapshot(path);
    } catch (error) {
      const entry = state.seen[path] || newEntry();
      state.seen[path] = entry;
      markPending(entry, "read_failed", "transient_read", error instanceof Error ? error.message : String(error));
      continue;
    }

    let entry = state.seen[path];
    const sameSnapshot = entry && entry.fileHash === current.fileHash && entry.sizeBytes === current.sizeBytes && entry.mtimeMs === current.mtimeMs;
    if (sameSnapshot && entry && (entry.status === "completed" || entry.status === "terminal")) continue;
    if (!entry || !sameSnapshot) {
      entry = entry || newEntry();
      entry.fileHash = current.fileHash;
      entry.sessionId = current.sessionId;
      entry.sizeBytes = current.sizeBytes;
      entry.mtimeMs = current.mtimeMs;
      entry.stableCount = sameSnapshot ? entry.stableCount + 1 : 1;
      entry.status = entry.status === "completed" || entry.status === "terminal" ? "pending" : entry.status;
      entry.reason = "awaiting_stability";
      entry.errorClass = "awaiting_stability";
      entry.nextRetryAt = new Date(Date.now() + config.pollMs).toISOString();
      entry.seenAt = nowIso();
      state.seen[path] = entry;
    } else if (entry.stableCount < REQUIRED_STABLE_ROUNDS) {
      entry.stableCount += 1;
    }

    if (state.historyPolicy === "new-only" && entry.reason === "historical_skipped") continue;
    if (entry.stableCount < REQUIRED_STABLE_ROUNDS) continue;
    if (!isDue(entry)) continue;

    if (current.parseError === "archive_changed_during_read") {
      markPending(entry, "awaiting_stability", "awaiting_stability", current.parseError);
      continue;
    }
    if (current.parseError) {
      entry.status = "terminal";
      entry.reason = current.parseError;
      entry.errorClass = "invalid_archive";
      entry.lastError = current.parseError;
      entry.nextRetryAt = undefined;
      continue;
    }
    if (maintenanceLocked(config)) continue;
    await processArchive(config, path, entry, run);
    if (entry.status === "completed") acknowledged++;
  }
  return acknowledged;
}

function newEntry(): ArchiveWatcherStateEntry {
  return {
    fileHash: "",
    sessionId: "",
    status: "pending",
    reason: "awaiting_stability",
    errorClass: "awaiting_stability",
    retryCount: 0,
    stableCount: 0,
    seenAt: nowIso(),
  };
}

function locatePluginRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "plugin", "scripts");
    if (existsSync(candidate)) return join(dir, "plugin");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate bundled plugin scripts.");
}

function runPowerShell(script: string, args: string[], dryRun: boolean): void {
  if (platform() !== "win32") throw new Error("Archive watcher task management is supported on Windows only.");
  if (dryRun) {
    console.log(`[dry-run] powershell -File ${script} ${args.join(" ")}`);
    return;
  }
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "PowerShell command failed").trim());
}

async function installWatcher(args: string[], config: WatcherConfig): Promise<void> {
  const yes = args.includes("--yes");
  const newOnly = args.includes("--new-only");
  const dryRun = args.includes("--dry-run");
  if (yes && newOnly) throw new Error("--yes and --new-only are mutually exclusive.");
  const state = await loadState(config.statePath);
  const firstInstall = !state.historyPolicy;
  const report = await inventory(config);
  console.log(`Archive root: ${config.archiveRoot}`);
  console.log(`Archives: ${report.total} total, ${report.parseable} parseable, ${report.invalid} invalid`);
  console.log(`Existing watcher state entries: ${Object.keys(state.seen).length}`);
  console.log("Server ledger: authoritative; duplicate (sessionId,fileHash) imports are acknowledged safely.");

  let policy = state.historyPolicy || "process";
  if (firstInstall && report.total > 0) {
    if (newOnly) policy = "new-only";
    else if (yes) policy = "process";
    else if (dryRun) policy = "process";
    else if (process.stdin.isTTY && process.stdout.isTTY) {
      const answer = await p.confirm({ message: "Process existing historical archives?", initialValue: true });
      if (p.isCancel(answer)) throw new Error("Installation cancelled.");
      if (answer !== true) throw new Error("Use --yes to process history or --new-only to monitor only future archives.");
      policy = "process";
    } else {
      throw new Error("Historical archives found. Re-run with --yes or --new-only.");
    }
  } else if (newOnly) {
    policy = "new-only";
  }

  if (dryRun) {
    console.log(`[dry-run] history policy: ${policy}`);
    console.log(`[dry-run] would ${platform() === "win32" ? "register/update" : "require"} the AgentMemory Autostart task.`);
    return;
  }

  state.historyPolicy = policy;
  state.initializedAt ||= nowIso();
  if (policy === "new-only") {
    for (const path of report.files) {
      try {
        const current = await snapshot(path);
        const entry = state.seen[path] || newEntry();
        entry.fileHash = current.fileHash;
        entry.sessionId = current.sessionId;
        entry.status = "terminal";
        entry.reason = "historical_skipped";
        entry.errorClass = "historical_skipped";
        entry.lastError = undefined;
        entry.nextRetryAt = undefined;
        entry.stableCount = REQUIRED_STABLE_ROUNDS;
        entry.seenAt = nowIso();
        state.seen[path] = entry;
      } catch {
        const entry = state.seen[path] || newEntry();
        entry.status = "terminal";
        entry.reason = "historical_skipped";
        entry.errorClass = "historical_skipped";
        entry.nextRetryAt = undefined;
        state.seen[path] = entry;
      }
    }
  }
  const pluginRoot = locatePluginRoot();
  runPowerShell(join(pluginRoot, "scripts", "install-archive-watcher.ps1"), ["-TaskName", ARCHIVE_TASK_NAME], false);
  await saveState(config.statePath, state);
  console.log(`Archive watcher installed with history policy: ${policy}`);
}

async function uninstallWatcher(config: WatcherConfig): Promise<void> {
  const pluginRoot = locatePluginRoot();
  runPowerShell(join(pluginRoot, "scripts", "uninstall-archive-watcher.ps1"), ["-TaskName", ARCHIVE_TASK_NAME], false);
  console.log(`Removed task ${ARCHIVE_TASK_NAME}. State and canonical data were preserved.`);
}

async function runWatcher(mode: ArchiveWatcherMode, config: WatcherConfig): Promise<void> {
  const state = await loadState(config.statePath);
  if (!state.historyPolicy) throw new Error("Archive watcher is not initialized. Run `agentmemory archive-watcher install --yes` or `--new-only` first.");
  const run = { pid: process.pid, runId: randomUUID(), mode };
  state.lastRun = { ...run, startedAt: nowIso() };
  await saveState(config.statePath, state);
  log(config, "info", "watcher started", { pid: run.pid, runId: run.runId, mode: run.mode });
  try {
    do {
      await scanRound(config, state, run);
      await saveState(config.statePath, state);
      if (mode === "once") break;
      const healthWait = state.nextHealthCheckAt ? Math.max(0, Date.parse(state.nextHealthCheckAt) - Date.now()) : 0;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.max(config.pollMs, healthWait)));
    } while (mode === "background");
  } finally {
    state.lastRun.completedAt = nowIso();
    await saveState(config.statePath, state);
    log(config, "info", "watcher stopped", { pid: run.pid, runId: run.runId, mode: run.mode });
  }
}

export function parseArchiveWatcherArgs(args: string[]): { action: "install" | "run" | "uninstall"; mode?: ArchiveWatcherMode; flags: string[] } {
  const action = args[0] as "install" | "run" | "uninstall" | undefined;
  if (action !== "install" && action !== "run" && action !== "uninstall") throw new Error("Usage: agentmemory archive-watcher install|run|uninstall");
  const flags = args.slice(1);
  if (action === "run") {
    const modeIndex = flags.indexOf("--mode");
    const modeValue = modeIndex >= 0 ? flags[modeIndex + 1] : "background";
    if (modeValue !== "background" && modeValue !== "once") throw new Error("--mode must be background or once.");
    return { action, mode: modeValue, flags };
  }
  return { action, flags };
}

export async function runArchiveWatcherCommand(args: string[]): Promise<void> {
  const parsed = parseArchiveWatcherArgs(args);
  const config = defaultConfig();
  if (parsed.action === "install") return installWatcher(parsed.flags, config);
  if (parsed.action === "uninstall") return uninstallWatcher(config);
  if (platform() === "win32" && !parsed.flags.includes("--no-mutex")) {
    const pluginRoot = locatePluginRoot();
    runPowerShell(
      join(pluginRoot, "scripts", "archive-watcher-mutex.ps1"),
      ["-Mode", parsed.mode || "background"],
      false,
    );
    return;
  }
  return runWatcher(parsed.mode || "background", config);
}

export const archiveWatcherTestValues = {
  backoffMs,
  REQUIRED_STABLE_ROUNDS,
  STATE_VERSION,
};
