import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { Memory, MemoryRelation } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerRelationsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::relate",
      description: "Create a relationship between memories",
    },
    async (data: {
      sourceId: string;
      targetId: string;
      type: MemoryRelation["type"];
    }) => {
      const ctx = getContext();

      const source = await kv.get<Memory>(KV.memories, data.sourceId);
      const target = await kv.get<Memory>(KV.memories, data.targetId);
      if (!source || !target) {
        return { success: false, error: "source or target memory not found" };
      }

      const relation: MemoryRelation = {
        type: data.type,
        sourceId: data.sourceId,
        targetId: data.targetId,
        createdAt: new Date().toISOString(),
      };

      const relationId = generateId("rel");
      await kv.set(KV.relations, relationId, relation);

      if (!source.relatedIds) source.relatedIds = [];
      if (!source.relatedIds.includes(data.targetId)) {
        source.relatedIds.push(data.targetId);
        await kv.set(KV.memories, data.sourceId, source);
      }

      if (!target.relatedIds) target.relatedIds = [];
      if (!target.relatedIds.includes(data.sourceId)) {
        target.relatedIds.push(data.sourceId);
        await kv.set(KV.memories, data.targetId, target);
      }

      ctx.logger.info("Memory relation created", {
        relationId,
        type: data.type,
        source: data.sourceId,
        target: data.targetId,
      });
      return { success: true, relationId, relation };
    },
  );

  sdk.registerFunction(
    { id: "mem::evolve", description: "Create a new version of a memory" },
    async (data: {
      memoryId: string;
      newContent: string;
      newTitle?: string;
    }) => {
      const ctx = getContext();

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

      await kv.set(KV.memories, evolved.id, evolved);

      existing.isLatest = false;
      await kv.set(KV.memories, existing.id, existing);

      const relation: MemoryRelation = {
        type: "supersedes",
        sourceId: evolved.id,
        targetId: existing.id,
        createdAt: now,
      };
      await kv.set(KV.relations, generateId("rel"), relation);

      ctx.logger.info("Memory evolved", {
        oldId: existing.id,
        newId: evolved.id,
        version: evolved.version,
      });
      return { success: true, memory: evolved, previousId: existing.id };
    },
  );

  sdk.registerFunction(
    {
      id: "mem::get-related",
      description: "Get related memories within N hops",
    },
    async (data: { memoryId: string; maxHops?: number }) => {
      const ctx = getContext();
      const maxHops = data.maxHops ?? 2;

      const visited = new Set<string>();
      const result: Array<{ memory: Memory; hop: number }> = [];
      const queue: Array<{ id: string; hop: number }> = [
        { id: data.memoryId, hop: 0 },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.id) || current.hop > maxHops) continue;
        visited.add(current.id);

        const memory = await kv.get<Memory>(KV.memories, current.id);
        if (!memory) continue;

        if (current.hop > 0) {
          result.push({ memory, hop: current.hop });
        }

        const relatedIds = memory.relatedIds || [];
        const supersedes = memory.supersedes || [];
        const parentId = memory.parentId ? [memory.parentId] : [];

        const kvRelations = await kv
          .list<MemoryRelation>(KV.relations)
          .catch(() => []);
        const kvLinked = kvRelations
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

      ctx.logger.info("Related memories retrieved", {
        memoryId: data.memoryId,
        found: result.length,
      });
      return { results: result };
    },
  );
}
