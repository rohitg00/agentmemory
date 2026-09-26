import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  recordAudit,
  queryAudit,
  auditMonthOf,
  listAuditMonthsDesc,
  startAuditMigration,
  runAuditRetentionSweep,
  probeLegacyAuditFile,
  AUDIT_MIGRATION_STATE_KEY,
} from "../src/functions/audit.js";
import { KV } from "../src/state/schema.js";
import { mockKV } from "./helpers/mocks.js";
import { getAuditRetentionMonths } from "../src/config.js";
import type { AuditEntry, AuditMigrationState } from "../src/types.js";

function seedEntry(
  kv: ReturnType<typeof mockKV>,
  scope: string,
  timestamp: string,
  overrides: Partial<AuditEntry> = {},
): AuditEntry {
  const entry: AuditEntry = {
    id: overrides.id ?? `aud_${Math.random().toString(36).slice(2)}`,
    timestamp,
    operation: overrides.operation ?? "delete",
    functionId: overrides.functionId ?? "mem::test",
    targetIds: overrides.targetIds ?? [],
    details: overrides.details ?? {},
    userId: overrides.userId,
    qualityScore: overrides.qualityScore,
  };
  kv.store.set(
    scope,
    (kv.store.get(scope) ?? new Map()).set(entry.id, entry),
  );
  return entry;
}

async function seedMonthIndex(
  kv: ReturnType<typeof mockKV>,
  months: string[],
): Promise<void> {
  await kv.set(KV.auditMonths, "index", { months });
}

async function seedMigrationState(
  kv: ReturnType<typeof mockKV>,
  state: AuditMigrationState,
): Promise<void> {
  await kv.set(KV.auditMonths, AUDIT_MIGRATION_STATE_KEY, state);
}

const SMALL_STORE_PROBE = async () =>
  ({ safe: true, empty: false, sizeBytes: 1024 }) as const;
const EMPTY_STORE_PROBE = async () => ({ safe: true, empty: true }) as const;
const NO_DELAY = async () => 0;

describe("audit month buckets", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("recordAudit writes into the UTC month scope of the entry timestamp", async () => {
    const entry = await recordAudit(kv as never, "delete", "mem::test", ["a"]);
    const month = auditMonthOf(entry.timestamp);

    const rows = await kv.list<AuditEntry>(KV.auditMonth(month));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(entry.id);

    const legacy = await kv.list<AuditEntry>(KV.audit);
    expect(legacy).toHaveLength(0);
  });

  it("recordAudit registers the month in the month index exactly once", async () => {
    await recordAudit(kv as never, "delete", "mem::test", ["a"]);
    await recordAudit(kv as never, "delete", "mem::test", ["b"]);

    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toHaveLength(1);
    expect(months[0]).toBe(auditMonthOf(new Date().toISOString()));
  });

  it("auditMonthOf derives the month in UTC", () => {
    expect(auditMonthOf("2026-01-31T23:30:00.000Z")).toBe("2026-01");
    expect(auditMonthOf("2026-02-01T00:00:00.000Z")).toBe("2026-02");
  });
});

describe("queryAudit across months", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("reads the newest month first and stops once the limit is reached", async () => {
    await seedMonthIndex(kv, ["2026-06", "2026-07", "2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-06"), "2026-06-15T00:00:00.000Z", {
      id: "june_1",
    });
    seedEntry(kv, KV.auditMonth("2026-07"), "2026-07-15T00:00:00.000Z", {
      id: "july_1",
    });
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-02T00:00:00.000Z", {
      id: "aug_2",
    });

    const listSpy = vi.spyOn(kv, "list");
    const { entries } = await queryAudit(kv as never, { limit: 2 });

    expect(entries.map((e) => e.id).sort()).toEqual(["aug_1", "aug_2"]);
    const listedScopes = listSpy.mock.calls.map((call) => call[0]);
    expect(listedScopes).toContain(KV.auditMonth("2026-08"));
    expect(listedScopes).not.toContain(KV.auditMonth("2026-07"));
    expect(listedScopes).not.toContain(KV.auditMonth("2026-06"));
  });

  it("falls back to legacy rows when the migration marker says the legacy scope is safe to read", async () => {
    await seedMonthIndex(kv, ["2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.audit, "2026-05-01T00:00:00.000Z", { id: "legacy_1" });
    await seedMigrationState(kv, {
      status: "done",
      safeToListLegacy: true,
      legacySizeBytes: 0,
      migrated: 0,
      purged: 0,
      summaryWritten: true,
      checkedAt: new Date().toISOString(),
    });

    const { entries, legacyFrozen } = await queryAudit(kv as never, { limit: 5 });
    expect(entries.map((e) => e.id).sort()).toEqual(["aug_1", "legacy_1"]);
    expect(legacyFrozen).toBe(false);
  });

  it("never falls back to legacy once the month scopes already satisfy the limit", async () => {
    await seedMonthIndex(kv, ["2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.audit, "2026-05-01T00:00:00.000Z", { id: "legacy_1" });

    const listSpy = vi.spyOn(kv, "list");
    const { entries } = await queryAudit(kv as never, { limit: 1 });

    expect(entries.map((e) => e.id)).toEqual(["aug_1"]);
    const listedScopes = listSpy.mock.calls.map((call) => call[0]);
    expect(listedScopes).not.toContain(KV.audit);
  });

  it("does not list the legacy scope, and reports it frozen, when no marker says it is safe", async () => {
    await seedMonthIndex(kv, ["2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.audit, "2026-05-01T00:00:00.000Z", { id: "legacy_1" });

    const listSpy = vi.spyOn(kv, "list");
    const { entries, legacyFrozen, legacyFrozenBytes } = await queryAudit(kv as never, {
      limit: 5,
    });

    expect(entries.map((e) => e.id)).toEqual(["aug_1"]);
    expect(legacyFrozen).toBe(false);
    expect(legacyFrozenBytes).toBeUndefined();
    const listedScopes = listSpy.mock.calls.map((call) => call[0]);
    expect(listedScopes).not.toContain(KV.audit);
  });

  it("reports the legacy scope as frozen when the migration marker says it is unsafe to read", async () => {
    await seedMonthIndex(kv, ["2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.audit, "2026-05-01T00:00:00.000Z", { id: "legacy_1" });
    await seedMigrationState(kv, {
      status: "too-large",
      safeToListLegacy: false,
      legacySizeBytes: 99999999,
      migrated: 0,
      purged: 0,
      summaryWritten: false,
      checkedAt: new Date().toISOString(),
    });

    const listSpy = vi.spyOn(kv, "list");
    const { entries, legacyFrozen, legacyFrozenBytes } = await queryAudit(kv as never, {
      limit: 5,
    });

    expect(entries.map((e) => e.id)).toEqual(["aug_1"]);
    expect(legacyFrozen).toBe(true);
    expect(legacyFrozenBytes).toBe(99999999);
    const listedScopes = listSpy.mock.calls.map((call) => call[0]);
    expect(listedScopes).not.toContain(KV.audit);
  });

  it("respects operation and date filters across months", async () => {
    await seedMonthIndex(kv, ["2026-07", "2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-07"), "2026-07-10T00:00:00.000Z", {
      id: "july_delete",
      operation: "delete",
    });
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-10T00:00:00.000Z", {
      id: "aug_forget",
      operation: "forget",
    });

    const { entries } = await queryAudit(kv as never, {
      operation: "delete",
      limit: 10,
    });
    expect(entries.map((e) => e.id)).toEqual(["july_delete"]);
  });
});

describe("probeLegacyAuditFile", () => {
  let dir: string;
  let originalDataDir: string | undefined;
  let originalMaxBytes: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "am-audit-probe-"));
    originalDataDir = process.env["AGENTMEMORY_DATA_DIR"];
    originalMaxBytes = process.env["AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES"];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env["AGENTMEMORY_DATA_DIR"];
    else process.env["AGENTMEMORY_DATA_DIR"] = originalDataDir;
    if (originalMaxBytes === undefined) delete process.env["AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES"];
    else process.env["AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES"] = originalMaxBytes;
  });

  it("reports unreadable when AGENTMEMORY_DATA_DIR is not set", async () => {
    delete process.env["AGENTMEMORY_DATA_DIR"];
    const result = await probeLegacyAuditFile();
    expect(result).toEqual({ safe: false, reason: "unreadable" });
  });

  it("reports unreadable when the engine's state store directory is not local", async () => {
    process.env["AGENTMEMORY_DATA_DIR"] = join(dir, "does-not-exist");
    const result = await probeLegacyAuditFile();
    expect(result).toEqual({ safe: false, reason: "unreadable" });
  });

  it("reports empty when the state store exists but the legacy scope file was never written", async () => {
    mkdirSync(join(dir, "state_store.db"), { recursive: true });
    process.env["AGENTMEMORY_DATA_DIR"] = dir;
    const result = await probeLegacyAuditFile();
    expect(result).toEqual({ safe: true, empty: true });
  });

  it("reports safe with the measured size when the legacy scope file is under the cap", async () => {
    mkdirSync(join(dir, "state_store.db"), { recursive: true });
    const content = JSON.stringify({ aud_1: { id: "aud_1" } });
    writeFileSync(join(dir, "state_store.db", "mem%3Aaudit.bin"), content);
    process.env["AGENTMEMORY_DATA_DIR"] = dir;

    const result = await probeLegacyAuditFile();
    expect(result.safe).toBe(true);
    if (result.safe && !result.empty) {
      expect(result.sizeBytes).toBe(Buffer.byteLength(content));
    } else {
      throw new Error("expected a non-empty safe probe result");
    }
  });

  it("reports too-large when the legacy scope file exceeds AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES", async () => {
    mkdirSync(join(dir, "state_store.db"), { recursive: true });
    writeFileSync(join(dir, "state_store.db", "mem%3Aaudit.bin"), "x".repeat(1000));
    process.env["AGENTMEMORY_DATA_DIR"] = dir;
    process.env["AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES"] = "10";

    const result = await probeLegacyAuditFile();
    expect(result).toEqual({ safe: false, reason: "too-large", sizeBytes: 1000 });
  });
});

describe("startAuditMigration", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("moves legacy rows into their month scopes and purges index_persist noise", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", {
      id: "keep_1",
      operation: "delete",
      targetIds: ["mem_a"],
    });
    seedEntry(kv, KV.audit, "2020-04-01T00:00:00.000Z", {
      id: "keep_2",
      operation: "forget",
      targetIds: ["mem_b"],
    });
    seedEntry(kv, KV.audit, "2020-03-05T00:00:00.000Z", {
      id: "noise_1",
      operation: "index_persist",
    });
    seedEntry(kv, KV.audit, "2020-03-06T00:00:00.000Z", {
      id: "noise_2",
      operation: "index_persist",
    });

    await startAuditMigration(kv as never, {
      probe: SMALL_STORE_PROBE,
      deleteDelayMs: NO_DELAY,
    });

    const legacyRemaining = await kv.list<AuditEntry>(KV.audit);
    expect(legacyRemaining).toHaveLength(0);

    const marchRows = await kv.list<AuditEntry>(KV.auditMonth("2020-03"));
    expect(marchRows.map((r) => r.id)).toEqual(["keep_1"]);

    const aprilRows = await kv.list<AuditEntry>(KV.auditMonth("2020-04"));
    expect(aprilRows.map((r) => r.id)).toEqual(["keep_2"]);

    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toContain("2020-03");
    expect(months).toContain("2020-04");

    const currentMonth = auditMonthOf(new Date().toISOString());
    const currentMonthRows = await kv.list<AuditEntry>(
      KV.auditMonth(currentMonth),
    );
    const summaryRows = currentMonthRows.filter(
      (r) => r.operation === "audit_migrate",
    );
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0].details.purged).toBe(2);
    expect(summaryRows[0].details.migrated).toBe(2);

    const marker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(marker?.status).toBe("done");
    expect(marker?.safeToListLegacy).toBe(true);
  });

  it("records no summary row when there is nothing to purge", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", {
      id: "keep_1",
      operation: "delete",
    });

    await startAuditMigration(kv as never, {
      probe: SMALL_STORE_PROBE,
      deleteDelayMs: NO_DELAY,
    });

    const currentMonth = auditMonthOf(new Date().toISOString());
    const currentMonthRows = await kv.list<AuditEntry>(
      KV.auditMonth(currentMonth),
    );
    expect(
      currentMonthRows.filter((r) => r.operation === "audit_migrate"),
    ).toHaveLength(0);
  });

  it("is a no-op on a store with no legacy audit rows", async () => {
    await startAuditMigration(kv as never, {
      probe: EMPTY_STORE_PROBE,
      deleteDelayMs: NO_DELAY,
    });
    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toHaveLength(0);
    const marker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(marker?.status).toBe("done");
  });

  it("leaves the legacy scope untouched and frozen when the probe reports too-large", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", { id: "keep_1" });

    await startAuditMigration(kv as never, {
      probe: async () => ({ safe: false, reason: "too-large", sizeBytes: 99999999 }),
      deleteDelayMs: NO_DELAY,
    });

    const legacy = await kv.list<AuditEntry>(KV.audit);
    expect(legacy.map((r) => r.id)).toEqual(["keep_1"]);

    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toHaveLength(0);

    const marker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(marker).toEqual({
      status: "too-large",
      safeToListLegacy: false,
      legacySizeBytes: 99999999,
      migrated: 0,
      purged: 0,
      summaryWritten: false,
      checkedAt: marker?.checkedAt,
    });
  });

  it("leaves the legacy scope untouched and frozen when the probe reports unreadable", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", { id: "keep_1" });

    await startAuditMigration(kv as never, {
      probe: async () => ({ safe: false, reason: "unreadable" }),
      deleteDelayMs: NO_DELAY,
    });

    const legacy = await kv.list<AuditEntry>(KV.audit);
    expect(legacy.map((r) => r.id)).toEqual(["keep_1"]);

    const marker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(marker?.status).toBe("unreadable");
    expect(marker?.safeToListLegacy).toBe(false);
  });

  it("waits before deleting so the legacy rows survive until the delay elapses", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", { id: "keep_1" });

    let releaseDelay: () => void = () => {};
    const delayGate = new Promise<void>((resolve) => {
      releaseDelay = resolve;
    });

    const migration = startAuditMigration(kv as never, {
      probe: SMALL_STORE_PROBE,
      deleteDelayMs: async () => {
        await delayGate;
        return 0;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const marker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(marker?.status).toBe("copied");

    const midLegacy = await kv.list<AuditEntry>(KV.audit);
    expect(midLegacy.map((r) => r.id)).toEqual(["keep_1"]);
    const midMonthRows = await kv.list<AuditEntry>(KV.auditMonth("2020-03"));
    expect(midMonthRows.map((r) => r.id)).toEqual(["keep_1"]);

    releaseDelay();
    await migration;

    const finalLegacy = await kv.list<AuditEntry>(KV.audit);
    expect(finalLegacy).toHaveLength(0);
  });

  it("deletes legacy rows in reverse insertion order", async () => {
    const first = seedEntry(kv, KV.audit, "2020-01-01T00:00:00.000Z", {
      id: "first",
    });
    const second = seedEntry(kv, KV.audit, "2020-01-02T00:00:00.000Z", {
      id: "second",
    });
    const third = seedEntry(kv, KV.audit, "2020-01-03T00:00:00.000Z", {
      id: "third",
    });
    void first;
    void second;
    void third;

    const deleteOrder: string[] = [];
    const orderedKv = {
      ...kv,
      delete: async (scope: string, key: string) => {
        if (scope === KV.audit) deleteOrder.push(key);
        return kv.delete(scope, key);
      },
    };

    await startAuditMigration(orderedKv as never, {
      probe: SMALL_STORE_PROBE,
      deleteDelayMs: NO_DELAY,
    });

    expect(deleteOrder).toEqual(["third", "second", "first"]);
  });

  it("resumes after a crash mid-delete without double-counting or double-writing the summary", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", {
      id: "keep_1",
      operation: "delete",
    });
    seedEntry(kv, KV.audit, "2020-03-02T00:00:00.000Z", {
      id: "keep_2",
      operation: "delete",
    });
    seedEntry(kv, KV.audit, "2020-03-03T00:00:00.000Z", {
      id: "noise_1",
      operation: "index_persist",
    });

    let deleteCalls = 0;
    const crashingKv = {
      ...kv,
      delete: async (scope: string, key: string) => {
        if (scope === KV.audit) {
          deleteCalls++;
          if (deleteCalls === 2) throw new Error("simulated crash");
        }
        return kv.delete(scope, key);
      },
    };

    await startAuditMigration(crashingKv as never, {
      probe: SMALL_STORE_PROBE,
      deleteDelayMs: NO_DELAY,
    });

    const midLegacy = await kv.list<AuditEntry>(KV.audit);
    expect(midLegacy.length).toBeGreaterThan(0);

    const midMarker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(midMarker?.status).toBe("copied");
    expect(midMarker?.summaryWritten).toBe(false);

    await startAuditMigration(kv as never, {
      probe: SMALL_STORE_PROBE,
      deleteDelayMs: NO_DELAY,
    });

    const finalLegacy = await kv.list<AuditEntry>(KV.audit);
    expect(finalLegacy).toHaveLength(0);

    const marchRows = await kv.list<AuditEntry>(KV.auditMonth("2020-03"));
    expect(marchRows.map((r) => r.id).sort()).toEqual(["keep_1", "keep_2"]);

    const currentMonth = auditMonthOf(new Date().toISOString());
    const currentMonthRows = await kv.list<AuditEntry>(
      KV.auditMonth(currentMonth),
    );
    const summaryRows = currentMonthRows.filter(
      (r) => r.operation === "audit_migrate",
    );
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0].details.purged).toBe(1);
    expect(summaryRows[0].details.migrated).toBe(2);

    const finalMarker = await kv.get<AuditMigrationState>(
      KV.auditMonths,
      AUDIT_MIGRATION_STATE_KEY,
    );
    expect(finalMarker?.status).toBe("done");
    expect(finalMarker?.summaryWritten).toBe(true);
  });
});

describe("audit retention sweep", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("defaults to 0 (keep forever) when unset", () => {
    expect(getAuditRetentionMonths()).toBe(0);
  });

  it("drops nothing when retentionMonths is 0", async () => {
    await seedMonthIndex(kv, ["2020-01"]);
    seedEntry(kv, KV.auditMonth("2020-01"), "2020-01-01T00:00:00.000Z");

    const result = await runAuditRetentionSweep(kv as never, 0);
    expect(result).toEqual({ droppedMonths: [], droppedRows: 0 });

    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toEqual(["2020-01"]);
  });

  it("drops whole month scopes older than the retention window", async () => {
    const now = new Date();
    const oldMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1),
    )
      .toISOString()
      .slice(0, 7);
    const recentMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    )
      .toISOString()
      .slice(0, 7);

    await seedMonthIndex(kv, [oldMonth, recentMonth]);
    seedEntry(kv, KV.auditMonth(oldMonth), `${oldMonth}-05T00:00:00.000Z`, {
      id: "old_1",
    });
    seedEntry(
      kv,
      KV.auditMonth(recentMonth),
      `${recentMonth}-05T00:00:00.000Z`,
      { id: "recent_1" },
    );

    const result = await runAuditRetentionSweep(kv as never, 12);

    expect(result.droppedMonths).toEqual([oldMonth]);
    expect(result.droppedRows).toBe(1);

    const remainingMonths = await listAuditMonthsDesc(kv as never);
    expect(remainingMonths).toEqual([recentMonth]);

    const oldRows = await kv.list<AuditEntry>(KV.auditMonth(oldMonth));
    expect(oldRows).toHaveLength(0);

    const recentRows = await kv.list<AuditEntry>(KV.auditMonth(recentMonth));
    expect(recentRows).toHaveLength(1);
  });

  it("deletes dropped rows in reverse insertion order", async () => {
    const oldMonth = "2020-01";
    await seedMonthIndex(kv, [oldMonth]);
    seedEntry(kv, KV.auditMonth(oldMonth), "2020-01-01T00:00:00.000Z", {
      id: "first",
    });
    seedEntry(kv, KV.auditMonth(oldMonth), "2020-01-02T00:00:00.000Z", {
      id: "second",
    });
    seedEntry(kv, KV.auditMonth(oldMonth), "2020-01-03T00:00:00.000Z", {
      id: "third",
    });

    const deleteOrder: string[] = [];
    const orderedKv = {
      ...kv,
      delete: async (scope: string, key: string) => {
        deleteOrder.push(key);
        return kv.delete(scope, key);
      },
    };

    await runAuditRetentionSweep(orderedKv as never, 1);
    expect(deleteOrder).toEqual(["third", "second", "first"]);
  });

  it("does not drop a month added by another writer while the sweep is running", async () => {
    const oldMonth = "2020-01";
    const currentMonth = auditMonthOf(new Date().toISOString());
    await seedMonthIndex(kv, [oldMonth]);
    seedEntry(kv, KV.auditMonth(oldMonth), `${oldMonth}-05T00:00:00.000Z`, {
      id: "old_1",
    });

    let injected = false;
    const raceKv = {
      ...kv,
      list: async <T>(scope: string): Promise<T[]> => {
        if (!injected && scope === KV.auditMonth(oldMonth)) {
          injected = true;
          await recordAudit(kv as never, "delete", "mem::test", ["concurrent"]);
        }
        return kv.list<T>(scope);
      },
    };

    const result = await runAuditRetentionSweep(raceKv as never, 1);
    expect(result.droppedMonths).toEqual([oldMonth]);

    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toEqual([currentMonth]);
  });
});

describe("markAuditMonth concurrency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps both months when two writers race different months onto the index", async () => {
    const kv = mockKV();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-15T00:00:00.000Z"));
    const pA = recordAudit(kv as never, "delete", "mem::test", ["a"]);
    vi.setSystemTime(new Date("2020-02-15T00:00:00.000Z"));
    const pB = recordAudit(kv as never, "delete", "mem::test", ["b"]);
    await Promise.all([pA, pB]);
    vi.useRealTimers();

    const months = await listAuditMonthsDesc(kv as never);
    expect([...months].sort()).toEqual(["2020-01", "2020-02"]);
  });
});
