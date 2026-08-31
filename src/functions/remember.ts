import { TriggerAction, type ISdk } from "iii-sdk";
import type { Memory } from "../types.js";
import { KV, generateId, jaccardSimilarity } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { deleteAccessLog } from "./access-tracker.js";
import { recordAudit } from "./audit.js";
import { getSearchIndex, isMemoryIndexReady, vectorIndexAddGuarded, vectorIndexRemove, flushIndexSave } from "./search.js";
import { getAgentId } from "../config.js";
import { logger } from "../logger.js";

// Slicing by UTF-16 code unit can cut an astral character (emoji, some CJK
// extensions) mid surrogate pair, leaving a lone high surrogate that renders
// as a replacement glyph. Drop a dangling trailing high surrogate so the
// title stays valid.
function safeSlice(text: string, length: number): string {
  const sliced = text.slice(0, length);
  return /[\uD800-\uDBFF]$/.test(sliced) ? sliced.slice(0, -1) : sliced;
}

export function registerRememberFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::remember", 
    async (data: {
      content: string;
      type?: string;
      concepts?: string[];
      files?: string[];
      ttlDays?: number;
      sourceObservationIds?: string[];
      agentId?: string;
      project?: string;
    }) => {
      if (
        !data.content ||
        typeof data.content !== "string" ||
        !data.content.trim()
      ) {
        return { success: false, error: "content is required" };
      }
      if (data.files && !Array.isArray(data.files)) {
        return { success: false, error: "files must be an array" };
      }
      if (data.concepts && !Array.isArray(data.concepts)) {
        return { success: false, error: "concepts must be an array" };
      }
      if (data.sourceObservationIds && !Array.isArray(data.sourceObservationIds)) {
        return { success: false, error: "sourceObservationIds must be an array" };
      }
      const validTypes = new Set([
        "pattern",
        "preference",
        "architecture",
        "bug",
        "workflow",
        "fact",
      ]);
      const memType = validTypes.has(data.type || "")
        ? (data.type as Memory["type"])
        : "fact";

      const now = new Date().toISOString();
      // Normalize project early so every subsequent comparison and storage
      // operation uses the same cleaned value. Raw data.project must not be
      // referenced below this point.
      const project =
        typeof data.project === "string" && data.project.trim().length > 0
          ? data.project.trim()
          : undefined;

      return withKeyedLock("mem:remember", async () => {
        // Candidate generation: query the BM25 index with the new content
        // and Jaccard-compare only the top hits, instead of walking the
        // full memory corpus on every save. The index receives every
        // memory at save time and is rebuilt at boot, so it covers the
        // corpus whenever it is non-empty; a cold, never-queried index
        // falls back to the full scan so supersession never silently
        // stops working.
        const idx = getSearchIndex();
        let candidateMemories: Memory[];
        try {
          if (isMemoryIndexReady() && idx.size > 0) {
            // 50 hits, not 20: the shared index also holds observations,
            // which occupy slots but never resolve to memories below. A
            // >0.7-Jaccard duplicate shares most tokens with the query so
            // it ranks near the top regardless. Only mem_-prefixed ids can
            // resolve in KV.memories, so skip the guaranteed-miss lookups.
            const hits = idx
              .search(data.content, 50)
              .filter((h) => h.obsId.startsWith("mem_"));
            const loaded = await Promise.all(
              hits.map((h) =>
                kv.get<Memory>(KV.memories, h.obsId).catch(() => null),
              ),
            );
            candidateMemories = loaded.filter((m): m is Memory => m !== null);
          } else {
            candidateMemories = await kv.list<Memory>(KV.memories);
          }
        } catch (err) {
          // Candidate generation is an optimization; a failure here must
          // never block the save itself.
          logger.warn("supersession candidate lookup failed, using full scan", {
            error: err instanceof Error ? err.message : JSON.stringify(err),
          });
          candidateMemories = await kv.list<Memory>(KV.memories);
        }
        let supersededId: string | undefined;
        let supersededVersion = 1;
        let supersededMemory: Memory | undefined;
        // Track the closest sub-threshold match: not similar enough to
        // supersede, but similar enough that the caller may want to
        // consolidate. Reported back as a hint; never acted on here.
        let nearMatch: { id: string; title: string; similarity: number } | undefined;
        const lowerContent = data.content.toLowerCase();
        for (const existing of candidateMemories) {
          if (existing.isLatest === false) continue;
          // Never supersede a memory that belongs to a different project.
          // Both sides must have an explicit project for the guard to engage;
          // an unscoped memory (legacy, no project field) is treated as a
          // wildcard so pre-existing data is not stranded.
          if (project && existing.project && existing.project !== project) {
            continue;
          }
          const similarity = jaccardSimilarity(
            lowerContent,
            existing.content.toLowerCase(),
          );
          if (similarity > 0.7) {
            supersededId = existing.id;
            supersededVersion = existing.version ?? 1;
            supersededMemory = existing;
            break;
          }
          if (
            similarity > 0.4 &&
            (!nearMatch || similarity > nearMatch.similarity)
          ) {
            nearMatch = { id: existing.id, title: existing.title, similarity };
          }
        }

        // stamp the agent role on the memory so future recall can
        // filter by agent. Request body wins (multi-agent runtimes
        // explicitly tagging at write time), env AGENT_ID fallback,
        // none → memory is unscoped (legacy behavior).
        const callAgentId =
          typeof data.agentId === "string" && data.agentId.trim().length > 0
            ? data.agentId.trim().slice(0, 128)
            : getAgentId();

        const memory: Memory = {
          id: generateId("mem"),
          createdAt: now,
          updatedAt: now,
          type: memType,
          title: safeSlice(data.content, 80),
          content: data.content,
          concepts: data.concepts || [],
          files: data.files || [],
          sessionIds: [],
          strength: 7,
          version: supersededId ? supersededVersion + 1 : 1,
          parentId: supersededId,
          supersedes: supersededId ? [supersededId] : [],
          sourceObservationIds: (data.sourceObservationIds || []).filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
          isLatest: true,
          origin: { channel: "agent", capturedAt: now },
          ...(callAgentId ? { agentId: callAgentId } : {}),
          ...(project !== undefined && { project }),
        };

        if (data.ttlDays && typeof data.ttlDays === "number" && data.ttlDays > 0) {
          memory.forgetAfter = new Date(Date.now() + data.ttlDays * 86400000).toISOString();
        }

        if (supersededMemory) {
          supersededMemory.isLatest = false;
          await kv.set(KV.memories, supersededMemory.id, supersededMemory);
          // The superseded version stays in KV (the viewer's version
          // chain reads it there) but leaves both search indexes:
          // recall returning an outdated fact as if current is worse
          // than returning nothing.
          try {
            getSearchIndex().remove(supersededMemory.id);
          } catch {}
          vectorIndexRemove(supersededMemory.id);
        }
        await kv.set(KV.memories, memory.id, memory);

        // Without this, mem::remember persists the row but the BM25
        // index never sees it, so memory_smart_search and memory_recall
        // return empty even seconds after save (#257). Use try/catch so
        // an indexing failure doesn't block the save itself — the
        // restart-time rebuild will pick the memory up either way.
        try {
          getSearchIndex().add(memoryToObservation(memory));
        } catch (err) {
          logger.warn("Failed to index saved memory into BM25", {
            memId: memory.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        await vectorIndexAddGuarded(
          memory.id,
          memory.sessionIds?.[0] ?? "memory",
          memory.title + " " + memory.content,
          { kind: "memory", logId: memory.id },
        );

        if (supersededId) {
          await sdk.trigger({
            function_id: "mem::cascade-update",
            payload: {
              supersededMemoryId: supersededId,
            },
            action: TriggerAction.Void(),
          });
        }

        logger.info("Memory saved", {
          memId: memory.id,
          type: memory.type,
          project: memory.project,
        });
        // similarTo is advisory only: a close-but-not-superseding match
        // the caller may want to consolidate via memory_update/forget.
        return {
          success: true,
          memory,
          ...(nearMatch && !supersededId
            ? {
                similarTo: {
                  ...nearMatch,
                  similarity: Math.round(nearMatch.similarity * 100) / 100,
                },
              }
            : {}),
        };
      });
    },
  );

  sdk.registerFunction("mem::forget",
    async (data: {
      sessionId?: string;
      observationIds?: string[];
      memoryId?: string;
    }) => {
      let deleted = 0;
      const deletedMemoryIds: string[] = [];
      const deletedObservationIds: string[] = [];
      let deletedSession = false;
      const { decrementImageRef } = await import("./image-refs.js");

      if (data.memoryId) {
        const mem = await kv.get<Memory>(KV.memories, data.memoryId);
        if (mem) {
          await kv.delete(KV.memories, data.memoryId);
          if (mem.imageRef) {
            await decrementImageRef(kv, sdk, mem.imageRef);
          }
          await deleteAccessLog(kv, data.memoryId);
          getSearchIndex().remove(data.memoryId);
          vectorIndexRemove(data.memoryId);
          deletedMemoryIds.push(data.memoryId);
          deleted++;
        }
      }

      if (
        data.sessionId &&
        data.observationIds &&
        data.observationIds.length > 0
      ) {
        for (const obsId of data.observationIds) {
          const obs = await kv.get<{ imageData?: string; imageRef?: string }>(
            KV.observations(data.sessionId),
            obsId,
          );
          await kv.delete(KV.observations(data.sessionId), obsId);
          if (obs?.imageData) await decrementImageRef(kv, sdk, obs.imageData);
          if (obs?.imageRef && obs.imageRef !== obs.imageData) {
            await decrementImageRef(kv, sdk, obs.imageRef);
          }
          getSearchIndex().remove(obsId);
          vectorIndexRemove(obsId);
          deletedObservationIds.push(obsId);
          deleted++;
        }
      }

      if (
        data.sessionId &&
        (!data.observationIds || data.observationIds.length === 0) &&
        !data.memoryId
      ) {
        const observations = await kv.list<{ id: string; imageData?: string; imageRef?: string }>(
          KV.observations(data.sessionId),
        );
        for (const obs of observations) {
          await kv.delete(KV.observations(data.sessionId), obs.id);
          if (obs.imageData) await decrementImageRef(kv, sdk, obs.imageData);
          if (obs.imageRef && obs.imageRef !== obs.imageData) {
            await decrementImageRef(kv, sdk, obs.imageRef);
          }
          getSearchIndex().remove(obs.id);
          vectorIndexRemove(obs.id);
          deletedObservationIds.push(obs.id);
          deleted++;
        }
        await kv.delete(KV.sessions, data.sessionId);
        await kv.delete(KV.summaries, data.sessionId);
        deletedSession = true;
        deleted += 2;
      }

      if (deleted > 0) {
        await flushIndexSave();
        await recordAudit(
          kv,
          "forget",
          "mem::forget",
          [...deletedMemoryIds, ...deletedObservationIds],
          {
            sessionId: data.sessionId,
            deleted,
            memoriesDeleted: deletedMemoryIds.length,
            observationsDeleted: deletedObservationIds.length,
            sessionDeleted: deletedSession,
            reason: "user-initiated forget",
          },
        );
      }

      logger.info("Memory forgotten", { deleted });
      return { success: true, deleted };
    },
  );
}
