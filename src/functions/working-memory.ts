import type { ISdk } from "iii-sdk";
import type { Memory, CompressedObservation, ContextBlock } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { recordAccessBatch } from "./access-tracker.js";
import { logger } from "../logger.js";

const CORE_SCOPE = "mem:core-memory";

interface CoreMemoryEntry {
  id: string;
  content: string;
  importance: number;
  pinned: boolean;
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function scoreEntry(entry: CoreMemoryEntry, now: number): number {
  const recencyMs = now - new Date(entry.lastAccessedAt).getTime();
  const recencyDays = recencyMs / (1000 * 60 * 60 * 24);
  const recencyScore = 1 / (1 + recencyDays * 0.1);
  const accessScore = Math.log2(entry.accessCount + 1) / 10;
  const importanceScore = entry.importance / 10;
  return importanceScore * 0.5 + recencyScore * 0.3 + accessScore * 0.2;
}

export function registerWorkingMemoryFunctions(
  sdk: ISdk,
  kv: StateKV,
  tokenBudget: number,
): void {
  sdk.registerFunction("mem::core-add", 
    async (data: {
      content: string;
      importance?: number;
      pinned?: boolean;
    }) => {
      if (!data?.content?.trim()) {
        return { success: false, error: "content is required" };
      }
      const now = new Date().toISOString();
      const entry: CoreMemoryEntry = {
        id: generateId("core"),
        content: data.content.trim(),
        importance: Math.min(10, Math.max(1, data.importance ?? 7)),
        pinned: data.pinned ?? false,
        accessCount: 0,
        lastAccessedAt: now,
        createdAt: now,
      };
      await kv.set(CORE_SCOPE, entry.id, entry);

      try {
        await recordAudit(kv, "core_add", "mem::core-add", [entry.id], {
          content: entry.content.slice(0, 100),
          importance: entry.importance,
          pinned: entry.pinned,
        });
      } catch {}

      return { success: true, id: entry.id };
    },
  );

  sdk.registerFunction("mem::core-remove", 
    async (data: { id: string }) => {
      if (!data?.id) return { success: false, error: "id is required" };
      await kv.delete(CORE_SCOPE, data.id);

      try {
        await recordAudit(kv, "core_remove", "mem::core-remove", [data.id], {});
      } catch {}

      return { success: true };
    },
  );

  sdk.registerFunction("mem::core-list", 
    async () => {
      const entries = await kv.list<CoreMemoryEntry>(CORE_SCOPE);
      entries.sort((a, b) => b.importance - a.importance);
      return {
        success: true,
        entries,
        totalTokens: entries.reduce(
          (sum, e) => sum + estimateTokens(e.content),
          0,
        ),
      };
    },
  );

  sdk.registerFunction("mem::working-context", 
    async (data: { budget?: number }) => {
      const budget = data.budget || tokenBudget;
      const now = Date.now();
      let usedTokens = 0;

      const coreEntries = await kv.list<CoreMemoryEntry>(CORE_SCOPE);

      const pinned = coreEntries.filter((e) => e.pinned);
      const unpinned = coreEntries
        .filter((e) => !e.pinned)
        .sort((a, b) => scoreEntry(b, now) - scoreEntry(a, now));

      const coreLines: string[] = [];
      const coreBudget = Math.floor(budget * 0.3);
      const accessUpdates: Array<{ id: string; entry: CoreMemoryEntry }> = [];
      const accessTimestamp = new Date().toISOString();

      for (const entry of [...pinned, ...unpinned]) {
        const tokens = estimateTokens(entry.content);
        if (usedTokens + tokens > coreBudget && !entry.pinned) continue;
        coreLines.push(`- ${entry.content}`);
        usedTokens += tokens;

        entry.accessCount++;
        entry.lastAccessedAt = accessTimestamp;
        accessUpdates.push({ id: entry.id, entry });
      }

      Promise.allSettled(
        accessUpdates.map(({ id, entry }) => kv.set(CORE_SCOPE, id, entry)),
      ).catch(() => {});

      const archivalLines: string[] = [];

      const memories = await kv.list<Memory>(KV.memories);
      const active = memories
        .filter((m) => m.isLatest !== false)
        .sort((a, b) => {
          const strengthDiff = b.strength - a.strength;
          if (Math.abs(strengthDiff) > 0.2) return strengthDiff;
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        });

      const archivalIds: string[] = [];
      for (const mem of active) {
        const tokens = estimateTokens(mem.content);
        if (usedTokens + tokens > budget) continue;
        archivalLines.push(`- [${mem.type}] ${mem.title}: ${mem.content}`);
        archivalIds.push(mem.id);
        usedTokens += tokens;
      }

      void recordAccessBatch(kv, archivalIds);

      const pagedOut = active.length - archivalLines.length;

      const sections: string[] = [];
      if (coreLines.length > 0) {
        sections.push(`## Core Memory\n${coreLines.join("\n")}`);
      }
      if (archivalLines.length > 0) {
        sections.push(`## Archival Memory\n${archivalLines.join("\n")}`);
      }
      if (pagedOut > 0) {
        sections.push(
          `_${pagedOut} memories paged to archival (use mem::search to retrieve)_`,
        );
      }

      const context = sections.join("\n\n");

      logger.info("Working context built", {
        coreEntries: coreLines.length,
        archivalEntries: archivalLines.length,
        pagedOut,
        tokens: usedTokens,
        budget,
      });

      return {
        success: true,
        context,
        coreEntries: coreLines.length,
        archivalEntries: archivalLines.length,
        pagedOut,
        tokens: usedTokens,
        budget,
      };
    },
  );

  sdk.registerFunction("mem::auto-page", 
    async (data: { budget?: number }) => {
      const budget = data?.budget || tokenBudget;
      const coreBudget = Math.floor(budget * 0.3);

      const entries = await kv.list<CoreMemoryEntry>(CORE_SCOPE);
      let totalTokens = entries.reduce(
        (sum, e) => sum + estimateTokens(e.content),
        0,
      );

      if (totalTokens <= coreBudget) {
        return { success: true, paged: 0, totalTokens, budget: coreBudget };
      }

      const now = Date.now();
      const unpinned = entries
        .filter((e) => !e.pinned)
        .sort((a, b) => scoreEntry(a, now) - scoreEntry(b, now));

      let paged = 0;
      const pagedIds: string[] = [];
      for (const entry of unpinned) {
        if (totalTokens <= coreBudget) break;
        const tokens = estimateTokens(entry.content);

        const archivalMemory: Memory = {
          id: generateId("mem"),
          createdAt: entry.createdAt,
          updatedAt: new Date().toISOString(),
          type: "fact",
          title: entry.content.slice(0, 80),
          content: entry.content,
          concepts: [],
          files: [],
          sessionIds: [],
          strength: entry.importance / 10,
          version: 1,
          isLatest: true,
        };
        await kv.set(KV.memories, archivalMemory.id, archivalMemory);
        await kv.delete(CORE_SCOPE, entry.id);

        totalTokens -= tokens;
        paged++;
        pagedIds.push(entry.id);
      }

      if (paged > 0) {
        try {
          await recordAudit(kv, "auto_page", "mem::auto-page", pagedIds, {
            paged,
            budget: coreBudget,
          });
        } catch {}
      }

      return { success: true, paged, totalTokens, budget: coreBudget };
    },
  );
}
