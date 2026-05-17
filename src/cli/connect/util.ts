import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import * as p from "@clack/prompts";

export const AGENTMEMORY_MCP_BLOCK = {
  command: "npx",
  args: ["-y", "@agentmemory/mcp"],
  env: {
    AGENTMEMORY_URL: "http://localhost:3111",
  },
};

export function backupsDir(): string {
  return join(homedir(), ".agentmemory", "backups");
}

export function ensureBackupsDir(): string {
  const dir = backupsDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function backupFile(
  sourcePath: string,
  agent: string,
  ext = "json",
): string {
  ensureBackupsDir();
  const stamp = timestampSlug();
  const target = join(backupsDir(), `${agent}-${stamp}.${ext}`);
  copyFileSync(sourcePath, target);
  return target;
}

export function readJsonSafe<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

export function logInstalled(label: string, target: string): void {
  p.log.success(`${label} → wired into ${target}`);
}

export function logAlreadyWired(label: string, target: string): void {
  p.log.info(`${label} already wired in ${target} (use --force to re-install)`);
}

export function logBackup(target: string): void {
  p.log.info(`Backup: ${target}`);
}
