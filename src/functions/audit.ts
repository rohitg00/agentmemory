import { createHash } from "node:crypto";
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


export interface AuditReceiptEntry {
  auditIdHash: string;
  timestamp: string;
  operation: AuditEntry["operation"];
  functionId: string;
  targetCount: number;
  targetIdHashes: string[];
  detailKeys: string[];
  qualityScore?: number;
  userIdHash?: string;
}

export interface AuditReceipt {
  schema: "agentmemory.audit.receipt.v1";
  generatedAt: string;
  privacy: {
    rawTargetIdsIncluded: false;
    rawDetailsIncluded: false;
    rawUserIdsIncluded: false;
  };
  entryCount: number;
  entries: AuditReceiptEntry[];
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeDetailKeys(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  return Object.keys(details).sort();
}

export function buildAuditReceipt(entries: AuditEntry[]): AuditReceipt {
  return {
    schema: "agentmemory.audit.receipt.v1",
    generatedAt: new Date().toISOString(),
    privacy: {
      rawTargetIdsIncluded: false,
      rawDetailsIncluded: false,
      rawUserIdsIncluded: false,
    },
    entryCount: entries.length,
    entries: entries.map((entry) => ({
      auditIdHash: digest(entry.id),
      timestamp: entry.timestamp,
      operation: entry.operation,
      functionId: entry.functionId,
      targetCount: entry.targetIds.length,
      targetIdHashes: entry.targetIds.map(digest),
      detailKeys: safeDetailKeys(entry.details),
      qualityScore: entry.qualityScore,
      userIdHash: entry.userId ? digest(entry.userId) : undefined,
    })),
  };
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
