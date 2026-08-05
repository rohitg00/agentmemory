import type { ISdk } from "iii-sdk";
import type { Memory, GovernanceFilter, AuditEntry } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { recordAudit, safeAudit, queryAudit } from "./audit.js";
import { deleteAccessLog } from "./access-tracker.js";
import { getSearchIndex, vectorIndexRemove, flushIndexSave } from "./search.js";
import { stripMemoryReferences } from "../state/memory-utils.js";
import { logger } from "../logger.js";

/**
 * After memories are deleted, clear now-dangling `supersedes`/`parentId`/
 * `relatedIds` back-references in the *surviving* memories. Returns the IDs of
 * memories that were repaired and how many references were dropped, for audit
 * and result reporting. Indexes are not touched: reference fields are not part
 * of the search/vector observation shape.
 *
 * Each survivor is repaired under its per-memory keyed lock
 * (`mem:memory:<id>`, the same key diagnostics heal uses) with a fresh read
 * immediately before stripping/writing, so a concurrent update to a survivor
 * (e.g. a new `supersedes` added between the list and the write) is preserved
 * rather than clobbered by a stale snapshot.
 */
async function clearDanglingMemoryReferences(
  kv: StateKV,
  deletedIds: string[],
): Promise<{ repairedReferrers: string[]; removedCount: number }> {
  if (deletedIds.length === 0) {
    return { repairedReferrers: [], removedCount: 0 };
  }
  const removed = new Set(deletedIds);
  // List once to pick candidate survivors; the authoritative read happens per
  // memory inside the lock below.
  const snapshot = await kv.list<Memory>(KV.memories);
  const candidateIds = snapshot
    .filter((m) => !removed.has(m.id))
    .map((m) => m.id);
  const repairedReferrers: string[] = [];
  let removedCount = 0;
  for (const id of candidateIds) {
    const droppedHere = await withKeyedLock(`mem:memory:${id}`, async () => {
      const fresh = await kv.get<Memory>(KV.memories, id);
      if (!fresh) return 0;
      const { memory: next, changed, removed: dropped } =
        stripMemoryReferences(fresh, removed);
      if (!changed) return 0;
      next.updatedAt = new Date().toISOString();
      await kv.set(KV.memories, next.id, next);
      return dropped.length;
    });
    if (droppedHere > 0) {
      repairedReferrers.push(id);
      removedCount += droppedHere;
    }
  }
  return { repairedReferrers, removedCount };
}

export function registerGovernanceFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::governance-delete", 
    async (data: { memoryIds: string[]; reason?: string }) => {
      if (
        !data.memoryIds ||
        !Array.isArray(data.memoryIds) ||
        data.memoryIds.length === 0
      ) {
        return { success: false, error: "memoryIds array is required" };
      }

      let deleted = 0;
      const deletedIds: string[] = [];
      for (const id of data.memoryIds) {
        const mem = await kv.get<Memory>(KV.memories, id);
        if (mem) {
          await kv.delete(KV.memories, id);
          await deleteAccessLog(kv, id);
          getSearchIndex().remove(id);
          vectorIndexRemove(id);
          deleted++;
          deletedIds.push(id);
        }
      }

      if (deleted > 0) await flushIndexSave();

      // Prevent the delete from leaving dangling supersedes/parentId/
      // relatedIds back-references in surviving memories. Without this, every
      // governance-delete would mint new memory-missing-supersedes warnings.
      const { repairedReferrers, removedCount } =
        await clearDanglingMemoryReferences(kv, deletedIds);

      await recordAudit(
        kv,
        "delete",
        "mem::governance-delete",
        data.memoryIds,
        {
          reason: data.reason || "manual deletion",
          deleted,
          repairedReferrers: repairedReferrers.length > 0 ? repairedReferrers : undefined,
          removedReferences: removedCount > 0 ? removedCount : undefined,
        },
      );

      logger.info("Governance delete", {
        requested: data.memoryIds.length,
        deleted,
        repairedReferrers: repairedReferrers.length,
        removedReferences: removedCount,
      });
      return {
        success: true,
        deleted,
        total: data.memoryIds.length,
        repairedReferrers,
        removedReferences: removedCount,
      };
    },
  );

  sdk.registerFunction("mem::governance-bulk", 
    async (data: GovernanceFilter & { dryRun?: boolean }) => {

      const hasFilter =
        (data.type && data.type.length > 0) ||
        data.dateFrom ||
        data.dateTo ||
        data.qualityBelow !== undefined;
      if (!hasFilter && !data.dryRun) {
        return {
          success: false,
          error: "At least one filter is required for non-dryRun bulk delete",
        };
      }

      const memories = await kv.list<Memory>(KV.memories);
      let candidates = memories;

      if (data.type && data.type.length > 0) {
        candidates = candidates.filter((m) => data.type!.includes(m.type));
      }
      if (data.dateFrom) {
        const from = new Date(data.dateFrom).getTime();
        if (Number.isNaN(from)) {
          return { success: false, error: "Invalid dateFrom format" };
        }
        candidates = candidates.filter(
          (m) => new Date(m.createdAt).getTime() >= from,
        );
      }
      if (data.dateTo) {
        const to = new Date(data.dateTo).getTime();
        if (Number.isNaN(to)) {
          return { success: false, error: "Invalid dateTo format" };
        }
        candidates = candidates.filter(
          (m) => new Date(m.createdAt).getTime() <= to,
        );
      }
      if (data.qualityBelow !== undefined) {
        candidates = candidates.filter((m) => m.strength < data.qualityBelow!);
      }

      if (data.dryRun) {
        return {
          success: true,
          dryRun: true,
          wouldDelete: candidates.length,
          ids: candidates.map((m) => m.id),
        };
      }

      const BATCH_SIZE = 50;
      const successfulIds: string[] = [];
      const failures: Array<{ id: string; error: string }> = [];
      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (mem) => {
            await kv.delete(KV.memories, mem.id);
            await deleteAccessLog(kv, mem.id);
            getSearchIndex().remove(mem.id);
            vectorIndexRemove(mem.id);
          }),
        );
        results.forEach((result, j) => {
          const mem = batch[j];
          if (result.status === "fulfilled") {
            successfulIds.push(mem.id);
          } else {
            logger.warn("Governance bulk delete failed", {
              memoryId: mem.id,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
            failures.push({
              id: mem.id,
              error: "delete_failed",
            });
          }
        });
      }

      if (successfulIds.length > 0) await flushIndexSave();

      // Same dangling-reference cleanup as the single governance-delete path,
      // applied to the batch of successfully deleted memories.
      const { repairedReferrers, removedCount } =
        await clearDanglingMemoryReferences(kv, successfulIds);

      await safeAudit(
        kv,
        "delete",
        "mem::governance-bulk",
        successfulIds,
        {
          filter: data,
          deleted: successfulIds.length,
          failed: failures.length,
          failures: failures.length > 0 ? failures : undefined,
          repairedReferrers: repairedReferrers.length > 0 ? repairedReferrers : undefined,
          removedReferences: removedCount > 0 ? removedCount : undefined,
        },
      );

      logger.info("Governance bulk delete", {
        deleted: successfulIds.length,
        failed: failures.length,
        repairedReferrers: repairedReferrers.length,
        removedReferences: removedCount,
      });
      return {
        success: failures.length === 0,
        deleted: successfulIds.length,
        failed: failures.length,
        failures: failures.length > 0 ? failures : undefined,
        repairedReferrers,
        removedReferences: removedCount,
      };
    },
  );

  sdk.registerFunction("mem::audit-query", 
    async (data?: {
      operation?: AuditEntry["operation"];
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      accessContext?: unknown;
    }) => {
      return queryAudit(kv, data);
    },
  );
}
