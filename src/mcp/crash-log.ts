import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { redactCredentialUrls } from "../cli/engine-launch.js";

export function mcpCrashLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env["AGENTMEMORY_DATA_DIR"] || join(homedir(), ".agentmemory"), "mcp-crash.log");
}

export function formatFatal(kind: string, reason: unknown, now: Date = new Date()): string {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  return redactCredentialUrls(`[${now.toISOString()}] pid=${process.pid} ${kind}: ${detail}\n`);
}

export function reportFatal(kind: string, reason: unknown, logPath: string = mcpCrashLogPath()): string {
  const line = formatFatal(kind, reason);
  try {
    process.stderr.write(`[@agentmemory/mcp] fatal ${line}`);
  } catch {}
  try {
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    appendFileSync(logPath, line, { mode: 0o600 });
  } catch (err) {
    try {
      const detail = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[@agentmemory/mcp] crash log not written to ${logPath}: ${detail}\n`);
    } catch {}
    return line;
  }
  try {
    chmodSync(logPath, 0o600);
  } catch {}
  try {
    process.stderr.write(`[@agentmemory/mcp] crash log: ${logPath}\n`);
  } catch {}
  return line;
}

export function installCrashHandlers(onFatal: () => void): void {
  process.on("uncaughtException", (err) => {
    reportFatal("uncaughtException", err);
    onFatal();
  });
  process.on("unhandledRejection", (reason) => {
    reportFatal("unhandledRejection", reason);
    onFatal();
  });
}
