import type { IIIClient } from "iii-sdk";
import type {
  CompressedObservation,
  Memory,
  Session,
  MemoryProvider,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";

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

function overlapShare(sourceIds: string[] | undefined, obsIds: string[]): number {
  if (!sourceIds?.length || obsIds.length === 0) return 0;
  const source = new Set(sourceIds);
  return obsIds.filter((id) => source.has(id)).length / obsIds.length;
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
      let skipped = 0;
      const existingMemories = await kv.list<Memory>(KV.memories);
      const scopedProject =
        typeof data.project === "string" && data.project.trim().length > 0
          ? data.project.trim()
          : undefined;
      // A scoped consolidation run must only evolve memories that belong
      // to the same project. Without this guard, two projects that happen
      // to consolidate observations into an identically-titled memory would
      // cause one project's memory to silently evolve the other's — the
      // exact class of cross-project corruption this fix is designed to
      // prevent. An unscoped run (no data.project, background cron path)
      // preserves the pre-existing behavior and may evolve any memory.
      const evolvable = (m: Memory) =>
        m.isLatest !== false && (!scopedProject || !m.project || m.project === scopedProject);

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
        const obsIds = [...new Set(top.map((o) => o.id))];

        // The LLM rewords titles between runs, so re-consolidating the same
        // observations would store a reworded copy of a memory that exists.
        if (existingMemories.some((m) => evolvable(m) && overlapShare(m.sourceObservationIds, obsIds) === 1)) {
          skipped++;
          continue;
        }

        const prompt = top
          .map(
            (o) =>
              `[${o.type}] ${o.title}\n${o.narrative}\nFiles: ${o.files.join(", ")}\nImportance: ${o.importance}`,
          )
          .join("\n\n");

        try {
          const response = await Promise.race([
            provider.compress(
              CONSOLIDATION_SYSTEM,
              `Concept: "${concept}"\n\nObservations:\n${prompt}`,
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("compress timeout")), 30_000),
            ),
          ]);
          llmCallCount++;
          const parsed = parseMemoryXml(response, sessionIds);
          if (!parsed) continue;

          const now = new Date().toISOString();
          const candidates = existingMemories.filter(evolvable);
          let existingMatch = candidates.find(
            (m) => m.title.toLowerCase() === parsed.title.toLowerCase(),
          );
          if (!existingMatch) {
            let best = 0.5;
            for (const m of candidates) {
              const share = overlapShare(m.sourceObservationIds, obsIds);
              if (share >= best) {
                best = share;
                existingMatch = m;
              }
            }
          }

          if (existingMatch) {
            existingMatch.isLatest = false;
            await kv.set(KV.memories, existingMatch.id, existingMatch);
            await recordAudit(kv, "evolve", "mem::consolidate", [existingMatch.id], {
              action: "mark_non_latest",
              concept,
            });

            const evolved: Memory = {
              id: generateId("mem"),
              createdAt: now,
              updatedAt: now,
              ...parsed,
              version: (existingMatch.version || 1) + 1,
              parentId: existingMatch.id,
              supersedes: [
                existingMatch.id,
                ...(existingMatch.supersedes || []),
              ],
              sourceObservationIds: obsIds,
              isLatest: true,
              ...(scopedProject !== undefined && { project: scopedProject }),
            };
            await kv.set(KV.memories, evolved.id, evolved);
            await recordAudit(kv, "evolve", "mem::consolidate", [evolved.id], {
              action: "evolve_memory",
              oldId: existingMatch.id,
              newId: evolved.id,
              concept,
            });
            existingMemories.push(evolved);
            consolidated++;
          } else {
            const memory: Memory = {
              id: generateId("mem"),
              createdAt: now,
              updatedAt: now,
              ...parsed,
              sourceObservationIds: obsIds,
              version: 1,
              isLatest: true,
              ...(scopedProject !== undefined && { project: scopedProject }),
            };
            await kv.set(KV.memories, memory.id, memory);
            await recordAudit(kv, "remember", "mem::consolidate", [memory.id], {
              action: "create_memory",
              concept,
            });
            existingMemories.push(memory);
            consolidated++;
          }
        } catch (err) {
          logger.warn("Consolidation failed for concept", {
            concept,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info("Consolidation complete", {
        consolidated,
        skipped,
        totalObs: allObs.length,
      });
      return { consolidated, skipped, totalObservations: allObs.length };
    },
  );
}
