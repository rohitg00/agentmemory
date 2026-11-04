import { appendFileSync, chmodSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { redactCredentialUrls } from "../cli/engine-launch.js";

export const MAX_CRASH_LOG_BYTES = 1024 * 1024;

export type StderrWriter = (text: string) => void;

export interface FatalHooks {
  persist: () => void;
  exit?: (code: number) => void;
  write?: StderrWriter;
  logPath?: string;
  fallbackLogPath?: string;
  stderrMayBlock?: boolean;
}

function writeStderr(text: string): void {
  process.stderr.write(text);
}

export function stderrWriteMayBlock(platform: NodeJS.Platform = process.platform, isTTY = process.stderr.isTTY): boolean {
  return platform === "win32" && !isTTY;
}

export function mcpCrashLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env["AGENTMEMORY_DATA_DIR"] || join(homedir(), ".agentmemory"), "mcp-crash.log");
}

export function formatFatal(kind: string, reason: unknown, now: Date = new Date()): string {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  return redactCredentialUrls(`[${now.toISOString()}] pid=${process.pid} ${kind}: ${detail}\n`);
}

function safeFormat(kind: string, reason: unknown): string {
  try {
    return formatFatal(kind, reason);
  } catch {
    return `[${new Date().toISOString()}] pid=${process.pid} ${kind}: (the error could not be formatted)\n`;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface CrashLogResult {
  written: boolean;
  notices: string[];
}

export function rotateCrashLog(logPath: string, notices: string[]): void {
  const rotated = `${logPath}.1`;
  try {
    renameSync(logPath, rotated);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  try {
    chmodSync(rotated, 0o600);
  } catch (err) {
    notices.push(`[@agentmemory/mcp] rotated crash log ${rotated} could not be made owner-only: ${describe(err)}\n`);
  }
}

export function writeCrashLog(line: string, logPath: string = mcpCrashLogPath()): CrashLogResult {
  const notices: string[] = [];
  try {
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    if (existsSync(logPath)) {
      if (statSync(logPath).size >= MAX_CRASH_LOG_BYTES) {
        rotateCrashLog(logPath, notices);
      } else {
        try {
          chmodSync(logPath, 0o600);
        } catch (err) {
          notices.push(`[@agentmemory/mcp] crash log ${logPath} could not be made owner-only, so it was not written: ${describe(err)}\n`);
          return { written: false, notices };
        }
      }
    }
    appendFileSync(logPath, line, { mode: 0o600 });
    notices.push(`[@agentmemory/mcp] crash log: ${logPath}\n`);
    return { written: true, notices };
  } catch (err) {
    notices.push(`[@agentmemory/mcp] crash log not written to ${logPath}: ${describe(err)}\n`);
    return { written: false, notices };
  }
}

export function appendCrashLog(line: string, logPath: string = mcpCrashLogPath()): string[] {
  return writeCrashLog(line, logPath).notices;
}

export function fallbackCrashLogPath(): string {
  return join(tmpdir(), "agentmemory-mcp-crash.log");
}

export function reportFatal(
  kind: string,
  reason: unknown,
  logPath: string = mcpCrashLogPath(),
  write: StderrWriter = writeStderr,
): string {
  const line = safeFormat(kind, reason);
  const notices = appendCrashLog(line, logPath);
  for (const text of [`[@agentmemory/mcp] fatal ${line}`, ...notices]) {
    try {
      write(text);
    } catch {}
  }
  return line;
}

export function handleFatal(kind: string, reason: unknown, hooks: FatalHooks): void {
  const line = safeFormat(kind, reason);
  const stderrMayBlock = hooks.stderrMayBlock ?? stderrWriteMayBlock();
  let result: CrashLogResult = { written: false, notices: [] };
  try {
    result = writeCrashLog(line, hooks.logPath ?? mcpCrashLogPath());
  } catch {}
  const notices = result.notices;
  if (!result.written && stderrMayBlock) {
    try {
      appendFileSync(hooks.fallbackLogPath ?? fallbackCrashLogPath(), line + notices.join(""), { mode: 0o600 });
    } catch {}
  }
  try {
    hooks.persist();
  } catch {}
  if (!stderrMayBlock) {
    const write = hooks.write ?? writeStderr;
    for (const text of [`[@agentmemory/mcp] fatal ${line}`, ...notices]) {
      try {
        write(text);
      } catch {}
    }
  }
  (hooks.exit ?? ((code: number) => process.exit(code)))(1);
}

export function installCrashHandlers(hooks: FatalHooks): void {
  process.on("uncaughtException", (err) => handleFatal("uncaughtException", err, hooks));
  process.on("unhandledRejection", (reason) => handleFatal("unhandledRejection", reason, hooks));
}
