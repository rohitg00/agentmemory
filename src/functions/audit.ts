import type { AuditEntry } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { logger } from "../logger.js";

// Audit coverage policy (issue #125).
//
// Every structural deletion of a memory, observation, session, or
// semantic row MUST call recordAudit. Two shapes are allowed, keyed to
// whether the caller is scoped or bulk:
//
//   Scoped deletions — a user-visible, per-call action removing a
//   bounded set of items. Emit ONE audit row per call with targetIds
//   populated. Examples: mem::governance-delete, mem::forget.
//
//   Bulk deletions — automatic sweeps (retention, TTL eviction,
//   auto-forget) that can remove hundreds of rows per invocation.
//   Emit ONE batched audit row per invocation with targetIds listing
//   every removed id and details.evicted holding the count. Per-item
//   audit rows would flood the audit log during routine sweeps.
//
//   Either shape is required; silent deletes are not acceptable.
//
// operation field:
//   - "delete"          — permanent removal (governance, retention sweep, evict).
//   - "forget"          — forget/removal flows. Scoped when emitted by
//                         mem::forget (user-initiated); bulk-batched when
//                         emitted by mem::auto-forget (automatic sweep).
//   - everything else   — see AuditEntry["operation"] union in src/types.ts.
//
// When adding a new deletion path, add an explicit recordAudit call
// BEFORE kv.delete(...) and match one of the two shapes above.

const AUDIT_MIGRATE_FUNCTION_ID = "mem::audit-migrate";
const AUDIT_MIGRATION_CONCURRENCY = 32;

interface AuditMonthIndex {
  months: string[];
}

export function auditMonthOf(timestamp: string): string {
  const parsed = new Date(timestamp);
  const iso = Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
  return iso.slice(0, 7);
}

function monthStartMs(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return Date.UTC(year, mon - 1, 1);
}

function monthEndMs(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return Date.UTC(year, mon, 1) - 1;
}

function monthNMonthsAgo(count: number): string {
  const now = new Date();
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count, 1),
  );
  return cutoff.toISOString().slice(0, 7);
}

async function readAuditMonthIndex(kv: StateKV): Promise<string[]> {
  const index = await kv.get<AuditMonthIndex>(KV.auditMonths, "index");
  return index?.months ?? [];
}

async function markAuditMonth(kv: StateKV, month: string): Promise<void> {
  const months = await readAuditMonthIndex(kv);
  if (months.includes(month)) return;
  const next = [...months, month].sort();
  await kv.set(KV.auditMonths, "index", { months: next });
}

export async function listAuditMonthsDesc(kv: StateKV): Promise<string[]> {
  const months = await readAuditMonthIndex(kv);
  return [...months].sort().reverse();
}

export async function recordAudit(
  kv: StateKV,
  operation: AuditEntry["operation"],
  functionId: string,
  targetIds: string[],
  details: Record<string, unknown> = {},
  qualityScore?: number,
  userId?: string,
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: generateId("aud"),
    timestamp: new Date().toISOString(),
    operation,
    userId,
    functionId,
    targetIds,
    details,
    qualityScore,
  };
  const month = auditMonthOf(entry.timestamp);
  await kv.set(KV.auditMonth(month), entry.id, entry);
  await markAuditMonth(kv, month);
  return entry;
}

export async function safeAudit(
  kv: StateKV,
  operation: AuditEntry["operation"],
  functionId: string,
  targetIds: string[],
  details: Record<string, unknown> = {},
  qualityScore?: number,
  userId?: string,
): Promise<void> {
  try {
    await recordAudit(kv, operation, functionId, targetIds, details, qualityScore, userId);
  } catch (err) {
    try {
      logger.warn("audit write failed", {
        functionId,
        operation,
        targetIds,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {}
  }
}

export async function queryAudit(
  kv: StateKV,
  filter?: {
    operation?: AuditEntry["operation"];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  },
): Promise<AuditEntry[]> {
  const limit = filter?.limit || 100;

  let fromMs: number | undefined;
  if (filter?.dateFrom) {
    fromMs = new Date(filter.dateFrom).getTime();
    if (Number.isNaN(fromMs)) {
      throw new Error(`Invalid dateFrom: ${filter.dateFrom}`);
    }
  }

  let toMs: number | undefined;
  if (filter?.dateTo) {
    toMs = new Date(filter.dateTo).getTime();
    if (Number.isNaN(toMs)) {
      throw new Error(`Invalid dateTo: ${filter.dateTo}`);
    }
  }

  const matches = (entry: AuditEntry): boolean => {
    if (filter?.operation && entry.operation !== filter.operation) return false;
    const t = new Date(entry.timestamp).getTime();
    if (fromMs !== undefined && t < fromMs) return false;
    if (toMs !== undefined && t > toMs) return false;
    return true;
  };

  const collected: AuditEntry[] = [];
  const months = await listAuditMonthsDesc(kv);
  for (const month of months) {
    if (collected.length >= limit) break;
    if (toMs !== undefined && monthStartMs(month) > toMs) continue;
    if (fromMs !== undefined && monthEndMs(month) < fromMs) break;
    const rows = await kv.list<AuditEntry>(KV.auditMonth(month));
    for (const row of rows) {
      if (matches(row)) collected.push(row);
    }
  }

  if (collected.length < limit) {
    const legacyRows = await kv.list<AuditEntry>(KV.audit);
    for (const row of legacyRows) {
      if (matches(row)) collected.push(row);
    }
  }

  collected.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return collected.slice(0, limit);
}

async function inParallel<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(runners);
}

export async function startAuditMigration(kv: StateKV): Promise<void> {
  let legacy: AuditEntry[];
  try {
    legacy = await kv.list<AuditEntry>(KV.audit);
  } catch (err) {
    logger.warn("audit migration could not read the legacy audit log", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (legacy.length === 0) return;

  const kept = legacy.filter((entry) => entry.operation !== "index_persist");
  const purged = legacy.length - kept.length;

  try {
    const months = new Set<string>();
    await inParallel(kept, AUDIT_MIGRATION_CONCURRENCY, async (entry) => {
      const month = auditMonthOf(entry.timestamp);
      await kv.set(KV.auditMonth(month), entry.id, entry);
      months.add(month);
    });
    for (const month of months) await markAuditMonth(kv, month);
    await inParallel(legacy, AUDIT_MIGRATION_CONCURRENCY, async (entry) => {
      await kv.delete(KV.audit, entry.id);
    });
  } catch (err) {
    logger.warn("audit migration stopped before finishing; it resumes on the next boot", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  logger.info("audit log moved to monthly scopes", { migrated: kept.length, purged });
  if (purged > 0) {
    await safeAudit(kv, "audit_migrate", AUDIT_MIGRATE_FUNCTION_ID, [], {
      reason: "index_persist rows predate opt-in auditing",
      purged,
      migrated: kept.length,
    });
  }
}

export async function runAuditRetentionSweep(
  kv: StateKV,
  retentionMonths: number,
): Promise<{ droppedMonths: string[]; droppedRows: number }> {
  if (!Number.isFinite(retentionMonths) || retentionMonths <= 0) {
    return { droppedMonths: [], droppedRows: 0 };
  }

  const months = await readAuditMonthIndex(kv);
  const cutoff = monthNMonthsAgo(retentionMonths);
  const toDrop = months.filter((month) => month < cutoff).sort();
  if (toDrop.length === 0) {
    return { droppedMonths: [], droppedRows: 0 };
  }

  let droppedRows = 0;
  for (const month of toDrop) {
    const rows = await kv.list<AuditEntry>(KV.auditMonth(month));
    for (const row of rows) {
      await kv.delete(KV.auditMonth(month), row.id);
      droppedRows++;
    }
  }

  const remaining = months.filter((month) => !toDrop.includes(month)).sort();
  await kv.set(KV.auditMonths, "index", { months: remaining });

  return { droppedMonths: toDrop, droppedRows };
}
