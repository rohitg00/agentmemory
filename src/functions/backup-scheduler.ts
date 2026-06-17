import type { ISdk } from "iii-sdk";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getEnvVar } from "../config.js";
import { logger } from "../logger.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 2_147_483_647;
const BACKUP_FILE_RE = /^agentmemory-backup-\d{4}-\d{2}-\d{2}T\d{9}Z\.json$/;

type BackupEnv = Partial<Record<string, string>>;
type BackupDirent = { name: string; isFile: () => boolean };
type BackupFs = {
  mkdir: typeof mkdir;
  readdir: (path: string, options: { withFileTypes: true }) => Promise<BackupDirent[]>;
  rename: typeof rename;
  rm: typeof rm;
  stat: typeof stat;
  writeFile: typeof writeFile;
};

const nodeFs: BackupFs = {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
};

export type BackupSchedulerConfig = {
  enabled: boolean;
  dir: string | null;
  intervalMs: number;
  retentionDays: number | null;
};

export type BackupRunResult = {
  success: boolean;
  filePath?: string;
  removed?: number;
  error?: string;
};

export function loadBackupSchedulerConfig(
  env?: BackupEnv,
): BackupSchedulerConfig {
  const enabled = isTrue(envValue(env, "AGENTMEMORY_BACKUP_ENABLED"));
  const dir = firstRealValue(envValue(env, "AGENTMEMORY_BACKUP_DIR"));
  const intervalMs = backupIntervalMs(
    envValue(env, "AGENTMEMORY_BACKUP_INTERVAL_MS"),
    DEFAULT_INTERVAL_MS,
  );
  const retentionDays = optionalPositiveInt(
    firstRealValue(envValue(env, "AGENTMEMORY_BACKUP_RETENTION_DAYS")),
  );

  return {
    enabled,
    dir: dir ? resolvePath(dir) : null,
    intervalMs,
    retentionDays,
  };
}

export async function runBackupOnce(
  sdk: ISdk,
  config: BackupSchedulerConfig,
  now = new Date(),
  fs: BackupFs = nodeFs,
): Promise<BackupRunResult> {
  if (!config.enabled || !config.dir) {
    return { success: false, error: "backup scheduler is not configured" };
  }

  try {
    await fs.mkdir(config.dir, { recursive: true, mode: 0o700 });
    const exportData = await sdk.trigger({
      function_id: "mem::export",
      payload: {},
    });
    const fileName = `agentmemory-backup-${backupTimestamp(now)}.json`;
    const filePath = join(config.dir, fileName);
    const tmpPath = join(
      config.dir,
      `.${fileName}.${process.pid}.${Date.now()}.tmp`,
    );
    await fs.writeFile(tmpPath, `${JSON.stringify(exportData, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.rename(tmpPath, filePath);

    const removed = config.retentionDays
      ? await pruneOldBackups(config.dir, config.retentionDays, now, fs)
      : 0;
    logger.info("Backup export complete", { filePath, removed });
    return { success: true, filePath, removed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Backup export failed", { error: msg });
    return { success: false, error: msg };
  }
}

export async function pruneOldBackups(
  dir: string,
  retentionDays: number,
  now = new Date(),
  fs: BackupFs = nodeFs,
): Promise<number> {
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !BACKUP_FILE_RE.test(entry.name)) continue;
    const filePath = join(dir, entry.name);
    const info = await fs.stat(filePath);
    if (info.mtimeMs >= cutoffMs) continue;
    await fs.rm(filePath, { force: true });
    removed++;
  }

  return removed;
}

export function startBackupScheduler(
  sdk: ISdk,
  env?: BackupEnv,
  config = loadBackupSchedulerConfig(env),
): ReturnType<typeof setInterval> | null {
  if (!config.enabled) return null;
  if (!config.dir) {
    logger.warn(
      "Backup scheduler enabled without AGENTMEMORY_BACKUP_DIR; backups disabled",
    );
    return null;
  }

  const handle = setInterval(() => {
    void runBackupOnce(sdk, config);
  }, config.intervalMs);
  handle.unref?.();
  logger.info("Backup scheduler enabled", {
    dir: config.dir,
    intervalMs: config.intervalMs,
    retentionDays: config.retentionDays,
  });
  return handle;
}

function envValue(env: BackupEnv | undefined, key: string): string | undefined {
  return env ? env[key] : getEnvVar(key);
}

function isTrue(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function firstRealValue(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function backupIntervalMs(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  if (parsed < MIN_INTERVAL_MS || parsed > MAX_INTERVAL_MS) return fallback;
  return parsed;
}

function optionalPositiveInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolvePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

function backupTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "").replace(".", "");
}
