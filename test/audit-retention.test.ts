import { describe, it, expect, beforeEach, vi } from "vitest";

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
} from "../src/functions/audit.js";
import { KV } from "../src/state/schema.js";
import { mockKV } from "./helpers/mocks.js";
import { getAuditRetentionMonths } from "../src/config.js";
import type { AuditEntry } from "../src/types.js";

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
    const entries = await queryAudit(kv as never, { limit: 2 });

    expect(entries.map((e) => e.id).sort()).toEqual(["aug_1", "aug_2"]);
    const listedScopes = listSpy.mock.calls.map((call) => call[0]);
    expect(listedScopes).toContain(KV.auditMonth("2026-08"));
    expect(listedScopes).not.toContain(KV.auditMonth("2026-07"));
    expect(listedScopes).not.toContain(KV.auditMonth("2026-06"));
  });

  it("falls back to legacy rows once month scopes are exhausted", async () => {
    await seedMonthIndex(kv, ["2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.audit, "2026-05-01T00:00:00.000Z", { id: "legacy_1" });

    const entries = await queryAudit(kv as never, { limit: 5 });
    expect(entries.map((e) => e.id).sort()).toEqual(["aug_1", "legacy_1"]);
  });

  it("never falls back to legacy once the month scopes already satisfy the limit", async () => {
    await seedMonthIndex(kv, ["2026-08"]);
    seedEntry(kv, KV.auditMonth("2026-08"), "2026-08-01T00:00:00.000Z", {
      id: "aug_1",
    });
    seedEntry(kv, KV.audit, "2026-05-01T00:00:00.000Z", { id: "legacy_1" });

    const listSpy = vi.spyOn(kv, "list");
    const entries = await queryAudit(kv as never, { limit: 1 });

    expect(entries.map((e) => e.id)).toEqual(["aug_1"]);
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

    const entries = await queryAudit(kv as never, {
      operation: "delete",
      limit: 10,
    });
    expect(entries.map((e) => e.id)).toEqual(["july_delete"]);
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

    await startAuditMigration(kv as never);

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
  });

  it("records no summary row when there is nothing to purge", async () => {
    seedEntry(kv, KV.audit, "2020-03-01T00:00:00.000Z", {
      id: "keep_1",
      operation: "delete",
    });

    await startAuditMigration(kv as never);

    const currentMonth = auditMonthOf(new Date().toISOString());
    const currentMonthRows = await kv.list<AuditEntry>(
      KV.auditMonth(currentMonth),
    );
    expect(
      currentMonthRows.filter((r) => r.operation === "audit_migrate"),
    ).toHaveLength(0);
  });

  it("is a no-op on a store with no legacy audit rows", async () => {
    await startAuditMigration(kv as never);
    const months = await listAuditMonthsDesc(kv as never);
    expect(months).toHaveLength(0);
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
});
