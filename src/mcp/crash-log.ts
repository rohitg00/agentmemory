import { appendFileSync, chmodSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { redactCredentialUrls } from "../cli/engine-launch.js";

export const MAX_CRASH_LOG_BYTES = 1024 * 1024;

export type StderrWriter = (text: string) => void;

export interface FatalHooks {
  persist: () => void;
  exit?: (code: number) => void;
  write?: StderrWriter;
  logPath?: string;
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

export function appendCrashLog(line: string, logPath: string = mcpCrashLogPath()): string[] {
  try {
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    if (existsSync(logPath)) {
      if (statSync(logPath).size >= MAX_CRASH_LOG_BYTES) {
        renameSync(logPath, `${logPath}.1`);
        try {
          chmodSync(`${logPath}.1`, 0o600);
        } catch {}
      } else {
        try {
          chmodSync(logPath, 0o600);
        } catch (err) {
          return [`[@agentmemory/mcp] crash log ${logPath} could not be made owner-only, so it was not written: ${describe(err)}\n`];
        }
      }
    }
    appendFileSync(logPath, line, { mode: 0o600 });
    return [`[@agentmemory/mcp] crash log: ${logPath}\n`];
  } catch (err) {
    return [`[@agentmemory/mcp] crash log not written to ${logPath}: ${describe(err)}\n`];
  }
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
  let notices: string[] = [];
  try {
    notices = appendCrashLog(line, hooks.logPath ?? mcpCrashLogPath());
  } catch {}
  try {
    hooks.persist();
  } catch {}
  if (!(hooks.stderrMayBlock ?? stderrWriteMayBlock())) {
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
