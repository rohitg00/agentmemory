import type { AuditEntry } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { logger } from "../logger.js";
import { getEnvVar } from "../config.js";

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

/**
 * The audit log has no retention of its own: it grows for the life of the
 * install, and because the KV adapter rewrites a whole scope on every set, each
 * audit write costs more as the log gets longer. Keep the most recent
 * AGENTMEMORY_AUDIT_MAX rows (0 disables the bound), checked every
 * TRIM_INTERVAL writes so the common path stays a single set.
 */
const DEFAULT_AUDIT_MAX = 5000;
const TRIM_INTERVAL = 100;
let writesSinceTrim = 0;

function auditMax(): number {
  const raw = parseInt(getEnvVar("AGENTMEMORY_AUDIT_MAX") || "", 10);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_AUDIT_MAX;
}

async function trimAuditLog(kv: StateKV): Promise<void> {
  const max = auditMax();
  if (max === 0) return;
  const all = await kv.list<AuditEntry>(KV.audit);
  if (all.length <= max) return;
  const stale = [...all]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .slice(0, all.length - max);
  for (const old of stale) {
    await kv.delete(KV.audit, old.id).catch(() => {});
  }
  logger.info("audit log trimmed", { removed: stale.length, kept: max });
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
  await kv.set(KV.audit, entry.id, entry);
  if (++writesSinceTrim >= TRIM_INTERVAL) {
    writesSinceTrim = 0;
    // Never fail the audited operation because pruning failed.
    await trimAuditLog(kv).catch((err) => {
      logger.warn("audit log trim failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
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
  const all = await kv.list<AuditEntry>(KV.audit);
  let entries = [...all].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (filter?.operation) {
    entries = entries.filter((e) => e.operation === filter.operation);
  }
  if (filter?.dateFrom) {
    const from = new Date(filter.dateFrom).getTime();
    if (Number.isNaN(from)) {
      throw new Error(`Invalid dateFrom: ${filter.dateFrom}`);
    }
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= from);
  }
  if (filter?.dateTo) {
    const to = new Date(filter.dateTo).getTime();
    if (Number.isNaN(to)) {
      throw new Error(`Invalid dateTo: ${filter.dateTo}`);
    }
    entries = entries.filter((e) => new Date(e.timestamp).getTime() <= to);
  }

  return entries.slice(0, filter?.limit || 100);
}
