import type { IIIClient } from "iii-sdk";
import type {
  CompressedObservation,
  Memory,
  Session,
  MemoryProvider,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { safeAudit } from "./audit.js";
import { withKeyedLocks } from "../state/keyed-mutex.js";
import { stableStringify } from "../capture/event-id.js";

const CONSOLIDATION_SYSTEM = `You are a memory consolidation engine. Given a set of related observations from coding sessions, synthesize them into a single long-term memory.

Output XML:
<memory>
  <type>pattern|preference|architecture|bug|workflow|fact</type>
  <title>Concise memory title (max 80 chars)</title>
  <content>2-4 sentence description of the learned insight</content>
  <concepts>
    <concept>key term</concept>
  </concepts>
  <files>
    <file>relevant/file/path</file>
  </files>
  <strength>1-10 how confident/important this memory is</strength>
</memory>`;

import { getXmlTag, getXmlChildren } from "../prompts/xml.js";
import { logger } from "../logger.js";

function parseMemoryXml(
  xml: string,
  sessionIds: string[],
): Omit<Memory, "id" | "createdAt" | "updatedAt"> | null {
  const type = getXmlTag(xml, "type");
  const title = getXmlTag(xml, "title");
  const content = getXmlTag(xml, "content");
  if (!type || !title || !content) return null;

  const validTypes = new Set([
    "pattern",
    "preference",
    "architecture",
    "bug",
    "workflow",
    "fact",
  ]);

  return {
    type: (validTypes.has(type) ? type : "fact") as Memory["type"],
    title,
    content,
    concepts: getXmlChildren(xml, "concepts", "concept"),
    files: getXmlChildren(xml, "files", "file"),
    sessionIds,
    strength: Math.max(
      1,
      Math.min(10, parseInt(getXmlTag(xml, "strength") || "5", 10) || 5),
    ),
    version: 1,
    isLatest: true,
  };
}

function sameIds(left: string[] | undefined, right: string[]): boolean {
  const ids = new Set(left);
  return ids.size === right.length && right.every((id) => ids.has(id));
}

export function registerConsolidateFunction(
  sdk: IIIClient,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::consolidate", 
    async (data: { project?: string; minObservations?: number }) => {
      const minObs = data.minObservations ?? 10;

      const sessions = await kv.list<Session>(KV.sessions);
      const filtered = data.project
        ? sessions.filter((s) => s.project === data.project)
        : sessions;

      const allObs: Array<CompressedObservation & { sid: string }> = [];
      const obsPerSession: CompressedObservation[][] = [];
      for (let batch = 0; batch < filtered.length; batch += 10) {
        const chunk = filtered.slice(batch, batch + 10);
        const results = await Promise.all(
          chunk.map((s) =>
            kv
              .list<CompressedObservation>(KV.observations(s.id))
              .catch(() => [] as CompressedObservation[]),
          ),
        );
        obsPerSession.push(...results);
      }
      for (let i = 0; i < filtered.length; i++) {
        for (const obs of obsPerSession[i]) {
          if (obs.title && obs.importance >= 5) {
            allObs.push({ ...obs, sid: filtered[i].id });
          }
        }
      }

      if (allObs.length < minObs) {
        return { consolidated: 0, reason: "insufficient_observations" };
      }

      const conceptGroups = new Map<string, typeof allObs>();
      for (const obs of allObs) {
        for (const concept of obs.concepts) {
          const key = concept.toLowerCase();
          if (!conceptGroups.has(key)) conceptGroups.set(key, []);
          conceptGroups.get(key)!.push(obs);
        }
      }

      let consolidated = 0;

      const MAX_LLM_CALLS = 10;
      let llmCallCount = 0;

      const sortedGroups = [...conceptGroups.entries()]
        .filter(([, g]) => g.length >= 3)
        .sort((a, b) => b[1].length - a[1].length);

      for (const [concept, obsGroup] of sortedGroups) {
        if (llmCallCount >= MAX_LLM_CALLS) break;

        const top = obsGroup
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 8);
        const sessionIds = [...new Set(top.map((o) => o.sid))];

        const prompt = top
          .map(
            (o) =>
              `[${o.type}] ${o.title}\n${o.narrative}\nFiles: ${o.files.join(", ")}\nImportance: ${o.importance}`,
          )
          .join("\n\n");

        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          llmCallCount++;
          const response = await Promise.race([
            provider.compress(
              CONSOLIDATION_SYSTEM,
              `Concept: "${concept}"\n\nObservations:\n${prompt}`,
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("compress timeout")), 30_000);
            }),
          ]);
          clearTimeout(timer);
          const parsed = parseMemoryXml(response, sessionIds);
          if (!parsed) continue;

          const now = new Date().toISOString();
          const obsIds = [...new Set(top.map((o) => o.id))];
          const scopedProject =
            typeof data.project === "string" && data.project.trim().length > 0
              ? data.project.trim()
              : undefined;

          const publicationLocks = ["mem:remember", ...sessionIds.map((sid) => `obs:${sid}`)];
          const published = await withKeyedLocks(publicationLocks, async () => {
            for (const sid of sessionIds) {
              const current = await kv.get<Session>(KV.sessions, sid);
              const original = filtered.find((session) => session.id === sid)!;
              if (!current || current.project !== original.project || current.agentId !== original.agentId) return false;
            }
            for (const { sid, ...original } of top) {
              const current = await kv.get<CompressedObservation>(KV.observations(sid), original.id);
              if (!current || stableStringify(current) !== stableStringify(original)) return false;
            }
            const memories = await kv.list<Memory>(KV.memories);
            const candidates = memories.filter((memory) =>
              memory.isLatest !== false &&
              (!scopedProject || !memory.project || memory.project === scopedProject),
            );
            const children = new Map<string, Memory[]>();
            for (const memory of candidates) {
              if (!memory.parentId) continue;
              const siblings = children.get(memory.parentId) ?? [];
              siblings.push(memory);
              children.set(memory.parentId, siblings);
            }
            // Complete an interrupted successor publication only for unambiguous lineage.
            for (const parent of candidates) {
              const successors = children.get(parent.id);
              if (successors?.length !== 1) continue;
              const child = successors[0];
              if (child.title.toLowerCase() !== parent.title.toLowerCase() ||
                  child.version !== (parent.version || 1) + 1 ||
                  !child.supersedes?.includes(parent.id)) continue;
              await kv.set(KV.memories, parent.id, { ...parent, isLatest: false });
              parent.isLatest = false;
              await safeAudit(kv, "evolve", "mem::consolidate", [parent.id], {
                action: "complete_publication", newId: child.id,
              });
            }
            const heads = candidates.filter((memory) => memory.isLatest !== false);
            if (heads.some((memory) =>
              sameIds(memory.sourceObservationIds, obsIds) &&
              sameIds(memory.sessionIds, sessionIds),
            )) return false;

            const previous = heads.find((memory) =>
              memory.title.toLowerCase() === parsed.title.toLowerCase(),
            );
            const memory: Memory = {
              id: generateId("mem"),
              createdAt: now,
              updatedAt: now,
              ...parsed,
              sourceObservationIds: obsIds,
              version: previous ? (previous.version || 1) + 1 : 1,
              isLatest: true,
              ...(previous && {
                parentId: previous.id,
                supersedes: [previous.id, ...(previous.supersedes || [])],
              }),
              ...(scopedProject !== undefined && { project: scopedProject }),
            };

            // Keep the previous version readable until its successor is stored.
            try {
              await kv.set(KV.memories, memory.id, memory);
            } catch (error) {
              if (!(await kv.get<Memory>(KV.memories, memory.id))) throw error;
            }
            if (previous) {
              try {
                await kv.set(KV.memories, previous.id, { ...previous, isLatest: false });
              } catch (error) {
                // A write can commit before its acknowledgement fails.
                await kv.set(KV.memories, previous.id, previous);
                await kv.delete(KV.memories, memory.id);
                throw error;
              }
            }
            await safeAudit(kv, previous ? "evolve" : "remember", "mem::consolidate", [memory.id], {
              action: previous ? "evolve_memory" : "create_memory",
              ...(previous && { oldId: previous.id, newId: memory.id }),
              concept,
            });
            return true;
          });
          if (published) consolidated++;
        } catch (err) {
          logger.warn("Consolidation failed for concept", {
            concept,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          clearTimeout(timer);
        }
      }

      logger.info("Consolidation complete", {
        consolidated,
        totalObs: allObs.length,
      });
      return { consolidated, totalObservations: allObs.length };
    },
  );
}
