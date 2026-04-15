import type { ISdk } from "iii-sdk";
import type { Memory, MemoryRelation } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { safeAudit } from "./audit.js";
import { recordAccessBatch } from "./access-tracker.js";
import { logger } from "../logger.js";

function computeConfidence(
  source: Memory,
  target: Memory,
  relationType: MemoryRelation["type"],
): number {
  let score = 0.5;

  const sharedSessions = source.sessionIds.filter((sid) =>
    target.sessionIds.includes(sid),
  );
  score += Math.min(sharedSessions.length * 0.1, 0.3);

  const now = Date.now();
  const sourceAge = now - new Date(source.updatedAt).getTime();
  const targetAge = now - new Date(target.updatedAt).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  if (sourceAge < sevenDays && targetAge < sevenDays) {
    score += 0.1;
  } else if (sourceAge > ninetyDays && targetAge > ninetyDays) {
    score -= 0.1;
  }

  if (relationType === "supersedes") score += 0.1;
  if (relationType === "contradicts") score -= 0.05;

  return Math.max(0, Math.min(1, score));
}

export function registerRelationsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::relate", 
    async (data: {
      sourceId: string;
      targetId: string;
      type: MemoryRelation["type"];
      confidence?: number;
    }) => {
      const [firstId, secondId] = [data.sourceId, data.targetId].sort();
      const lockKey =
        firstId === secondId ? `mem:${firstId}` : `mem:${firstId}:${secondId}`;

      return withKeyedLock(lockKey, async () => {
        const source = await kv.get<Memory>(KV.memories, data.sourceId);
        const target = await kv.get<Memory>(KV.memories, data.targetId);
        if (!source || !target) {
          return {
            success: false,
            error: "source or target memory not found",
          };
        }

        const confidence =
          data.confidence !== undefined
            ? Math.max(0, Math.min(1, data.confidence))
            : computeConfidence(source, target, data.type);

        const relation: MemoryRelation = {
          type: data.type,
          sourceId: data.sourceId,
          targetId: data.targetId,
          createdAt: new Date().toISOString(),
          confidence,
        };

        const relationId = generateId("rel");
        await kv.set(KV.relations, relationId, relation);

        if (!source.relatedIds) source.relatedIds = [];
        let sourceUpdated = false;
        if (!source.relatedIds.includes(data.targetId)) {
          source.relatedIds.push(data.targetId);
          await kv.set(KV.memories, data.sourceId, source);
          sourceUpdated = true;
        }

        if (!target.relatedIds) target.relatedIds = [];
        let targetUpdated = false;
        if (!target.relatedIds.includes(data.sourceId)) {
          target.relatedIds.push(data.sourceId);
          await kv.set(KV.memories, data.targetId, target);
          targetUpdated = true;
        }

        await safeAudit(kv, "relation_create", "mem::relate", [relationId], {
          type: data.type,
          sourceId: data.sourceId,
          targetId: data.targetId,
          confidence,
        });
        if (sourceUpdated) {
          await safeAudit(
            kv,
            "relation_update",
            "mem::relate",
            [data.sourceId],
            { relationId, updatedRelatedId: data.targetId },
          );
        }
        if (targetUpdated) {
          await safeAudit(
            kv,
            "relation_update",
            "mem::relate",
            [data.targetId],
            { relationId, updatedRelatedId: data.sourceId },
          );
        }

        logger.info("Memory relation created", {
          relationId,
          type: data.type,
          source: data.sourceId,
          target: data.targetId,
        });
        return { success: true, relationId, relation };
      });
    },
  );

  sdk.registerFunction("mem::evolve", 
    async (data: {
      memoryId: string;
      newContent: string;
      newTitle?: string;
    }) => {

      const existing = await kv.get<Memory>(KV.memories, data.memoryId);
      if (!existing) {
        return { success: false, error: "memory not found" };
      }

      const now = new Date().toISOString();
      const evolved: Memory = {
        ...existing,
        id: generateId("mem"),
        createdAt: now,
        updatedAt: now,
        title: data.newTitle || existing.title,
        content: data.newContent,
        version: (existing.version || 1) + 1,
        parentId: existing.id,
        supersedes: [existing.id, ...(existing.supersedes || [])],
        isLatest: true,
      };

      existing.isLatest = false;
      await kv.set(KV.memories, existing.id, existing);
      await safeAudit(kv, "evolve", "mem::evolve", [existing.id], {
        operation: "evolve",
        action: "mark_non_latest",
        newId: evolved.id,
      });

      await kv.set(KV.memories, evolved.id, evolved);
      await safeAudit(kv, "evolve", "mem::evolve", [evolved.id], {
        operation: "evolve",
        oldId: existing.id,
        newId: evolved.id,
        version: evolved.version,
      });

      const relation: MemoryRelation = {
        type: "supersedes",
        sourceId: evolved.id,
        targetId: existing.id,
        createdAt: now,
        confidence: 1.0,
      };
      const relationId = generateId("rel");
      await kv.set(KV.relations, relationId, relation);
      await safeAudit(kv, "evolve", "mem::evolve", [relationId], {
        operation: "supersedes",
        oldId: existing.id,
        newId: evolved.id,
      });

      logger.info("Memory evolved", {
        oldId: existing.id,
        newId: evolved.id,
        version: evolved.version,
      });
      return { success: true, memory: evolved, previousId: existing.id };
    },
  );

  sdk.registerFunction("mem::get-related", 
    async (data: {
      memoryId: string;
      maxHops?: number;
      minConfidence?: number;
    }) => {
      const maxHops = Math.min(data.maxHops ?? 2, 5);
      const MAX_VISITED = 500;
      const rawMinConf = Number(data.minConfidence);
      const minConfidence = Number.isFinite(rawMinConf)
        ? Math.max(0, Math.min(1, rawMinConf))
        : 0;

      const allRelations = await kv
        .list<MemoryRelation>(KV.relations)
        .catch(() => []);

      const visited = new Set<string>();
      const result: Array<{
        memory: Memory;
        hop: number;
        confidence: number;
      }> = [];
      const queue: Array<{ id: string; hop: number }> = [
        { id: data.memoryId, hop: 0 },
      ];

      while (queue.length > 0 && visited.size < MAX_VISITED) {
        const current = queue.shift()!;
        if (visited.has(current.id) || current.hop > maxHops) continue;
        visited.add(current.id);

        const memory = await kv.get<Memory>(KV.memories, current.id);
        if (!memory) continue;

        if (current.hop > 0) {
          const matchingRelations = allRelations.filter(
            (r) =>
              (r.sourceId === current.id && visited.has(r.targetId)) ||
              (r.targetId === current.id && visited.has(r.sourceId)),
          );
          const confidence =
            matchingRelations.length > 0
              ? Math.max(...matchingRelations.map((r) => r.confidence ?? 0.5))
              : 0.5;
          if (confidence >= minConfidence) {
            result.push({ memory, hop: current.hop, confidence });
          }
        }

        const relatedIds = memory.relatedIds || [];
        const supersedes = memory.supersedes || [];
        const parentId = memory.parentId ? [memory.parentId] : [];

        const kvLinked = allRelations
          .filter((r) => r.sourceId === current.id || r.targetId === current.id)
          .map((r) => (r.sourceId === current.id ? r.targetId : r.sourceId));

        const allLinks = [
          ...new Set([...relatedIds, ...supersedes, ...parentId, ...kvLinked]),
        ];

        for (const nextId of allLinks) {
          if (!visited.has(nextId)) {
            queue.push({ id: nextId, hop: current.hop + 1 });
          }
        }
      }

      result.sort((a, b) => b.confidence - a.confidence);

      void recordAccessBatch(
        kv,
        result.map((r) => r.memory.id),
      );

      logger.info("Related memories retrieved", {
        memoryId: data.memoryId,
        found: result.length,
      });
      return { results: result };
    },
  );
}
