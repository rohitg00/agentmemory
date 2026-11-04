import { appendFileSync, chmodSync, mkdirSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { redactCredentialUrls } from "../cli/engine-launch.js";

export type StderrWriter = (text: string) => void;

export function writeStderrSync(text: string): void {
  writeSync(2, text);
}

export function mcpCrashLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env["AGENTMEMORY_DATA_DIR"] || join(homedir(), ".agentmemory"), "mcp-crash.log");
}

export function formatFatal(kind: string, reason: unknown, now: Date = new Date()): string {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  return redactCredentialUrls(`[${now.toISOString()}] pid=${process.pid} ${kind}: ${detail}\n`);
}

function emit(write: StderrWriter, text: string): void {
  try {
    write(text);
  } catch {}
}

export function reportFatal(
  kind: string,
  reason: unknown,
  logPath: string = mcpCrashLogPath(),
  write: StderrWriter = writeStderrSync,
): string {
  const line = formatFatal(kind, reason);
  emit(write, `[@agentmemory/mcp] fatal ${line}`);
  try {
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    appendFileSync(logPath, line, { mode: 0o600 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    emit(write, `[@agentmemory/mcp] crash log not written to ${logPath}: ${detail}\n`);
    return line;
  }
  try {
    chmodSync(logPath, 0o600);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    emit(write, `[@agentmemory/mcp] crash log ${logPath} could not be made owner-only: ${detail}\n`);
  }
  emit(write, `[@agentmemory/mcp] crash log: ${logPath}\n`);
  return line;
}

export function installCrashHandlers(onFatal: () => void): void {
  const handle = (kind: string, reason: unknown) => {
    try {
      reportFatal(kind, reason);
    } catch {
      emit(writeStderrSync, `[@agentmemory/mcp] fatal ${kind}\n`);
    } finally {
      onFatal();
    }
  };
  process.on("uncaughtException", (err) => handle("uncaughtException", err));
  process.on("unhandledRejection", (reason) => handle("unhandledRejection", reason));
}
