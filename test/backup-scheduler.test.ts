import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportData } from "../src/types.js";
import {
  loadBackupSchedulerConfig,
  pruneOldBackups,
  runBackupOnce,
  startBackupScheduler,
} from "../src/functions/backup-scheduler.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentmemory-backup-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.useRealTimers();
});

function exportData(): ExportData {
  return {
    version: "0.9.27",
    exportedAt: "2026-06-17T12:00:00.000Z",
    sessions: [],
    observations: {},
    memories: [],
    summaries: [],
  };
}

describe("backup scheduler", () => {
  it("is disabled by default", () => {
    const config = loadBackupSchedulerConfig({});

    expect(config.enabled).toBe(false);
    expect(startBackupScheduler({ trigger: vi.fn() } as never, {})).toBeNull();
  });

  it("ignores generic backup env vars and bounds unsafe intervals", () => {
    expect(
      loadBackupSchedulerConfig({
        BACKUP_ENABLED: "true",
        BACKUP_DIR: "/tmp/backups",
        BACKUP_INTERVAL_MS: "60000",
      }),
    ).toMatchObject({ enabled: false, dir: null });

    expect(
      loadBackupSchedulerConfig({
        AGENTMEMORY_BACKUP_ENABLED: "true",
        AGENTMEMORY_BACKUP_DIR: "/tmp/backups",
        AGENTMEMORY_BACKUP_INTERVAL_MS: "2147483648",
      }).intervalMs,
    ).toBe(86_400_000);
    expect(
      loadBackupSchedulerConfig({
        AGENTMEMORY_BACKUP_ENABLED: "true",
        AGENTMEMORY_BACKUP_DIR: "/tmp/backups",
        AGENTMEMORY_BACKUP_INTERVAL_MS: "25",
      }).intervalMs,
    ).toBe(86_400_000);
  });

  it("does not start when enabled without a backup directory", () => {
    const sdk = { trigger: vi.fn() };

    const handle = startBackupScheduler(
      sdk as never,
      { AGENTMEMORY_BACKUP_ENABLED: "true" },
    );

    expect(handle).toBeNull();
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("writes a timestamped JSON export backup atomically", async () => {
    const dir = makeTempDir();
    const sdk = { trigger: vi.fn(async () => exportData()) };

    const result = await runBackupOnce(
      sdk as never,
      loadBackupSchedulerConfig({
        AGENTMEMORY_BACKUP_ENABLED: "true",
        AGENTMEMORY_BACKUP_DIR: dir,
      }),
      new Date("2026-06-17T12:34:56.789Z"),
    );

    expect(result.success).toBe(true);
    expect(result.filePath).toBe(
      join(dir, "agentmemory-backup-2026-06-17T123456789Z.json"),
    );
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::export",
      payload: {},
    });
    expect(readdirSync(dir)).toEqual([
      "agentmemory-backup-2026-06-17T123456789Z.json",
    ]);
    expect(JSON.parse(readFileSync(result.filePath!, "utf-8"))).toEqual(
      exportData(),
    );
  });

  it("writes through a temp file before renaming into place", async () => {
    const calls: string[] = [];
    const sdk = { trigger: vi.fn(async () => exportData()) };
    const fs = {
      mkdir: vi.fn(async () => {
        calls.push("mkdir");
      }),
      writeFile: vi.fn(async (path: string) => {
        calls.push(`write:${path}`);
      }),
      rename: vi.fn(async (from: string, to: string) => {
        calls.push(`rename:${from}->${to}`);
      }),
      readdir: vi.fn(),
      stat: vi.fn(),
      rm: vi.fn(),
    };

    const result = await runBackupOnce(
      sdk as never,
      {
        enabled: true,
        dir: "/tmp/agentmemory-backups",
        intervalMs: 60_000,
        retentionDays: null,
      },
      new Date("2026-06-17T12:34:56.789Z"),
      fs as never,
    );

    const finalPath =
      "/tmp/agentmemory-backups/agentmemory-backup-2026-06-17T123456789Z.json";
    const tmpPath = fs.writeFile.mock.calls[0][0];
    expect(result).toMatchObject({ success: true, filePath: finalPath });
    expect(tmpPath).toContain(
      "/tmp/agentmemory-backups/.agentmemory-backup-2026-06-17T123456789Z.json.",
    );
    expect(fs.rename).toHaveBeenCalledWith(tmpPath, finalPath);
    expect(calls[0]).toBe("mkdir");
    expect(calls[1]).toMatch(/^write:/);
    expect(calls[2]).toMatch(/^rename:/);
  });

  it("retains only matching backup files newer than the retention window", async () => {
    const dir = makeTempDir();
    const oldBackup = join(dir, "agentmemory-backup-2026-06-01T000000000Z.json");
    const freshBackup = join(dir, "agentmemory-backup-2026-06-16T000000000Z.json");
    const unrelated = join(dir, "manual-export-2026-06-01.json");
    writeFileSync(oldBackup, "{}");
    writeFileSync(freshBackup, "{}");
    writeFileSync(unrelated, "{}");

    const oldTime = new Date("2026-06-01T00:00:00.000Z");
    utimesSync(oldBackup, oldTime, oldTime);
    utimesSync(unrelated, oldTime, oldTime);

    const removed = await pruneOldBackups(
      dir,
      7,
      new Date("2026-06-17T00:00:00.000Z"),
    );

    expect(removed).toBe(1);
    expect(existsSync(oldBackup)).toBe(false);
    expect(existsSync(freshBackup)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("returns a failed result instead of throwing when export fails", async () => {
    const dir = makeTempDir();
    const sdk = {
      trigger: vi.fn(async () => {
        throw new Error("export down");
      }),
    };

    await expect(
      runBackupOnce(
        sdk as never,
        loadBackupSchedulerConfig({
          AGENTMEMORY_BACKUP_ENABLED: "true",
          AGENTMEMORY_BACKUP_DIR: dir,
        }),
        new Date("2026-06-17T12:34:56.789Z"),
      ),
    ).resolves.toMatchObject({ success: false, error: "export down" });
  });

  it("runs backups on the configured schedule", async () => {
    const dir = makeTempDir();
    const sdk = { trigger: vi.fn(async () => exportData()) };

    const handle = startBackupScheduler(
      sdk as never,
      {},
      {
        enabled: true,
        dir,
        intervalMs: 10,
        retentionDays: null,
      },
    );

    expect(handle).not.toBeNull();
    try {
      await vi.waitFor(() =>
        expect(sdk.trigger).toHaveBeenCalledWith({
          function_id: "mem::export",
          payload: {},
        }),
      );
    } finally {
      clearInterval(handle!);
    }
  });
});
