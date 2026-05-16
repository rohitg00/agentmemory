import type { ISdk } from "iii-sdk";
import type { Memory, GovernanceFilter, AuditEntry, GraphNode, GraphEdge } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit, safeAudit, queryAudit } from "./audit.js";
import { deleteAccessLog } from "./access-tracker.js";
import { logger } from "../logger.js";

async function cascadeStale(kv: StateKV, memoryIds: Iterable<string>): Promise<void> {
  const deletedIds = new Set(memoryIds);
  if (deletedIds.size === 0) return;

  const now = new Date().toISOString();
  const nodes = await kv.list<GraphNode>(KV.graphNodes);
  const edges = await kv.list<GraphEdge>(KV.graphEdges);

  const nodeUpdates: Promise<unknown>[] = [];
  for (const node of nodes) {
    if (!node.stale && node.sourceObservationIds.some((id) => deletedIds.has(id))) {
      node.stale = true;
      node.updatedAt = now;
      nodeUpdates.push(kv.set(KV.graphNodes, node.id, node));
    }
  }

  const edgeUpdates: Promise<unknown>[] = [];
  for (const edge of edges) {
    if (!edge.stale && edge.sourceObservationIds.some((id) => deletedIds.has(id))) {
      edge.stale = true;
      edge.updatedAt = now;
      edgeUpdates.push(kv.set(KV.graphEdges, edge.id, edge));
    }
  }

  await Promise.all([...nodeUpdates, ...edgeUpdates]);
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
      const opTimestamp = new Date().toISOString();
      for (const id of data.memoryIds) {
        const mem = await kv.get<Memory>(KV.memories, id);
        if (mem && !mem.deleted) {
          mem.deleted = true;
          mem.updatedAt = opTimestamp;
          await kv.set(KV.memories, id, mem);
          await deleteAccessLog(kv, id);
          await cascadeStale(kv, [id]);
          deleted++;
        }
      }

      await recordAudit(
        kv,
        "delete",
        "mem::governance-delete",
        data.memoryIds,
        {
          reason: data.reason || "manual deletion",
          deleted,
        },
      );

      logger.info("Governance delete", {
        requested: data.memoryIds.length,
        deleted,
      });
      return { success: true, deleted, total: data.memoryIds.length };
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
      const opTimestamp = new Date().toISOString();
      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (mem) => {
            if (mem.deleted) return "skipped";
            mem.deleted = true;
            mem.updatedAt = opTimestamp;
            await kv.set(KV.memories, mem.id, mem);
            await deleteAccessLog(kv, mem.id);
            return "deleted";
          }),
        );
        const deletedIds = new Set<string>();
        results.forEach((result, j) => {
          const mem = batch[j];
          if (result.status === "fulfilled" && result.value === "deleted") {
            successfulIds.push(mem.id);
            deletedIds.add(mem.id);
          } else if (result.status === "fulfilled") {
            return;
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
        await cascadeStale(kv, deletedIds);
      }

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
        },
      );

      logger.info("Governance bulk delete", {
        deleted: successfulIds.length,
        failed: failures.length,
      });
      return {
        success: failures.length === 0,
        deleted: successfulIds.length,
        failed: failures.length,
        failures: failures.length > 0 ? failures : undefined,
      };
    },
  );

  sdk.registerFunction("mem::audit-query", 
    async (data?: {
      operation?: AuditEntry["operation"];
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    }) => {
      return queryAudit(kv, data);
    },
  );
}
