import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEntry, AuditMigrationState, AuditQueryResult } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { logger } from "../logger.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { getEnvVar, getAuditMigrateMaxBytes } from "../config.js";
import { runtimeConfigPath } from "../cli/engine-launch.js";
import { configuredSaveIntervalMs } from "../cli/engine-config.js";

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
const AUDIT_MIGRATION_COPY_CONCURRENCY = 32;
const AUDIT_MIGRATION_DELETE_CONCURRENCY = 8;
const AUDIT_MONTHS_LOCK = KV.auditMonths;
const AUDIT_MIGRATION_LOCK = "mem:audit:migration-lock";
export const AUDIT_MIGRATION_STATE_KEY = "migration";
const DEFAULT_SAVE_INTERVAL_MS = 5000;
const AUDIT_MIGRATION_DELETE_WAIT_INTERVALS = 2;
const STATE_STORE_DIR_NAME = "state_store.db";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeStateIndexSegment(index: string): string {
  let out = "";
  for (const byte of Buffer.from(index, "utf8")) {
    const ch = String.fromCharCode(byte);
    out += /^[A-Za-z0-9\-_.]$/.test(ch)
      ? ch
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

function legacyAuditStateFilePath(dataDir: string): string {
  return join(dataDir, STATE_STORE_DIR_NAME, `${encodeStateIndexSegment(KV.audit)}.bin`);
}

export type LegacyAuditProbe =
  | { safe: true; empty: true }
  | { safe: true; empty: false; sizeBytes: number }
  | { safe: false; reason: "too-large"; sizeBytes: number }
  | { safe: false; reason: "unreadable" };

export async function probeLegacyAuditFile(): Promise<LegacyAuditProbe> {
  const dataDir = getEnvVar("AGENTMEMORY_DATA_DIR");
  if (!dataDir) return { safe: false, reason: "unreadable" };

  const storeDir = join(dataDir, STATE_STORE_DIR_NAME);
  try {
    await stat(storeDir);
  } catch {
    return { safe: false, reason: "unreadable" };
  }

  let fileStat;
  try {
    fileStat = await stat(legacyAuditStateFilePath(dataDir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { safe: true, empty: true };
    }
    return { safe: false, reason: "unreadable" };
  }

  if (fileStat.size > getAuditMigrateMaxBytes()) {
    return { safe: false, reason: "too-large", sizeBytes: fileStat.size };
  }
  return { safe: true, empty: false, sizeBytes: fileStat.size };
}

async function auditMigrationDeleteDelayMs(): Promise<number> {
  const dataDir = getEnvVar("AGENTMEMORY_DATA_DIR");
  if (!dataDir) return DEFAULT_SAVE_INTERVAL_MS * AUDIT_MIGRATION_DELETE_WAIT_INTERVALS;
  try {
    const rendered = await readFile(runtimeConfigPath(dataDir), "utf-8");
    const interval = configuredSaveIntervalMs(rendered) ?? DEFAULT_SAVE_INTERVAL_MS;
    return interval * AUDIT_MIGRATION_DELETE_WAIT_INTERVALS;
  } catch {
    return DEFAULT_SAVE_INTERVAL_MS * AUDIT_MIGRATION_DELETE_WAIT_INTERVALS;
  }
}

async function readAuditMigrationState(kv: StateKV): Promise<AuditMigrationState | null> {
  return kv.get<AuditMigrationState>(KV.auditMonths, AUDIT_MIGRATION_STATE_KEY);
}

async function writeAuditMigrationState(
  kv: StateKV,
  state: AuditMigrationState,
): Promise<void> {
  await kv.set(KV.auditMonths, AUDIT_MIGRATION_STATE_KEY, state);
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
  const index = await kv.get<{ months: string[] }>(KV.auditMonths, "index");
  return index?.months ?? [];
}

async function markAuditMonth(kv: StateKV, month: string): Promise<void> {
  await withKeyedLock(AUDIT_MONTHS_LOCK, async () => {
    const months = await readAuditMonthIndex(kv);
    if (months.includes(month)) return;
    const next = [...months, month].sort();
    await kv.set(KV.auditMonths, "index", { months: next });
  });
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
): Promise<AuditQueryResult> {
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

  const seenIds = new Set<string>();
  const collected: AuditEntry[] = [];
  const addIfNew = (row: AuditEntry): void => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);
    if (matches(row)) collected.push(row);
  };

  const months = await listAuditMonthsDesc(kv);
  for (const month of months) {
    if (collected.length >= limit) break;
    if (toMs !== undefined && monthStartMs(month) > toMs) continue;
    if (fromMs !== undefined && monthEndMs(month) < fromMs) break;
    const rows = await kv.list<AuditEntry>(KV.auditMonth(month));
    for (const row of rows) addIfNew(row);
  }

  let legacyFrozen = false;
  let legacyFrozenBytes: number | undefined;

  if (collected.length < limit) {
    const migrationState = await readAuditMigrationState(kv);
    if (migrationState?.safeToListLegacy) {
      const legacyRows = await kv.list<AuditEntry>(KV.audit);
      for (const row of legacyRows) addIfNew(row);
    } else if (migrationState && migrationState.status !== "done") {
      legacyFrozen = true;
      legacyFrozenBytes = migrationState.legacySizeBytes;
    }
  }

  collected.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return {
    entries: collected.slice(0, limit),
    legacyFrozen,
    legacyFrozenBytes,
  };
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

export interface AuditMigrationDeps {
  probe?: () => Promise<LegacyAuditProbe>;
  deleteDelayMs?: () => Promise<number>;
}

export async function startAuditMigration(
  kv: StateKV,
  deps: AuditMigrationDeps = {},
): Promise<void> {
  const runProbe = deps.probe ?? probeLegacyAuditFile;
  const runDeleteDelayMs = deps.deleteDelayMs ?? auditMigrationDeleteDelayMs;

  const marker = await readAuditMigrationState(kv);
  if (marker?.status === "done") return;

  const probe = await runProbe();

  if (probe.safe && probe.empty) {
    await writeAuditMigrationState(kv, {
      status: "done",
      safeToListLegacy: true,
      legacySizeBytes: 0,
      migrated: marker?.migrated ?? 0,
      purged: marker?.purged ?? 0,
      summaryWritten: marker?.summaryWritten ?? true,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (!probe.safe) {
    await writeAuditMigrationState(kv, {
      status: probe.reason,
      safeToListLegacy: false,
      legacySizeBytes: probe.reason === "too-large" ? probe.sizeBytes : marker?.legacySizeBytes,
      migrated: marker?.migrated ?? 0,
      purged: marker?.purged ?? 0,
      summaryWritten: marker?.summaryWritten ?? false,
      checkedAt: new Date().toISOString(),
    });
    logger.warn("legacy audit log left frozen; migration only reads it locally and under a size cap", {
      reason: probe.reason,
      sizeBytes: probe.reason === "too-large" ? probe.sizeBytes : undefined,
    });
    return;
  }

  let migrated = marker?.migrated ?? 0;
  let purged = marker?.purged ?? 0;

  if (marker?.status !== "copied") {
    let legacy: AuditEntry[];
    try {
      legacy = await kv.list<AuditEntry>(KV.audit);
    } catch (err) {
      logger.warn("audit migration could not read the legacy audit log", {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (legacy.length === 0) {
      await writeAuditMigrationState(kv, {
        status: "done",
        safeToListLegacy: true,
        legacySizeBytes: 0,
        migrated,
        purged,
        summaryWritten: marker?.summaryWritten ?? true,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    const seen = new Set<string>();
    const deduped = legacy.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    const kept = deduped.filter((entry) => entry.operation !== "index_persist");
    purged = deduped.length - kept.length;
    migrated = kept.length;

    try {
      const months = new Set<string>();
      await inParallel(kept, AUDIT_MIGRATION_COPY_CONCURRENCY, async (entry) => {
        const month = auditMonthOf(entry.timestamp);
        await kv.set(KV.auditMonth(month), entry.id, entry);
        months.add(month);
      });
      for (const month of months) await markAuditMonth(kv, month);
    } catch (err) {
      logger.warn(
        "audit migration stopped before finishing the copy pass; it resumes on the next boot",
        { error: err instanceof Error ? err.message : String(err) },
      );
      return;
    }

    await writeAuditMigrationState(kv, {
      status: "copied",
      safeToListLegacy: false,
      legacySizeBytes: probe.sizeBytes,
      migrated,
      purged,
      summaryWritten: false,
      checkedAt: new Date().toISOString(),
    });
  }

  await sleep(await runDeleteDelayMs());

  let remaining: AuditEntry[];
  try {
    remaining = await kv.list<AuditEntry>(KV.audit);
  } catch (err) {
    logger.warn(
      "audit migration could not re-read the legacy audit log before deleting; it resumes on the next boot",
      { error: err instanceof Error ? err.message : String(err) },
    );
    return;
  }

  try {
    await inParallel(
      remaining.slice().reverse(),
      AUDIT_MIGRATION_DELETE_CONCURRENCY,
      async (entry) => {
        await kv.delete(KV.audit, entry.id);
      },
    );
  } catch (err) {
    logger.warn(
      "audit migration stopped before finishing the delete pass; it resumes on the next boot",
      { error: err instanceof Error ? err.message : String(err) },
    );
    return;
  }

  await withKeyedLock(AUDIT_MIGRATION_LOCK, async () => {
    const current = await readAuditMigrationState(kv);
    if (current?.summaryWritten) return;
    if (purged > 0) {
      await safeAudit(kv, "audit_migrate", AUDIT_MIGRATE_FUNCTION_ID, [], {
        reason: "index_persist rows predate opt-in auditing",
        purged,
        migrated,
      });
    }
    await writeAuditMigrationState(kv, {
      status: "done",
      safeToListLegacy: true,
      legacySizeBytes: 0,
      migrated,
      purged,
      summaryWritten: true,
      checkedAt: new Date().toISOString(),
    });
  });

  logger.info("audit log moved to monthly scopes", { migrated, purged });
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
    for (const row of rows.slice().reverse()) {
      await kv.delete(KV.auditMonth(month), row.id);
      droppedRows++;
    }
  }

  await withKeyedLock(AUDIT_MONTHS_LOCK, async () => {
    const current = await readAuditMonthIndex(kv);
    const remaining = current.filter((month) => !toDrop.includes(month)).sort();
    await kv.set(KV.auditMonths, "index", { months: remaining });
  });

  return { droppedMonths: toDrop, droppedRows };
}
