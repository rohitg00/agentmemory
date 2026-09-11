import type { ISdk } from "iii-sdk";
import type {
  CompressedObservation,
  Memory,
  Session,
  Lesson,
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

// Gradual Self-Healing Consolidation: opportunistic re-tag of legacy records
// written under an un-scoped Project Display Name (e.g. "Monolith") to the
// canonical Project Key (e.g. "github.com-myorg-monolith"). Runs inline as
// part of the normal consolidation write cycle — no cold migrations, no
// locking. Legacy names come from (a) sessions already scoped to the
// canonical key that carry a projectDisplayName, and (b) an explicit
// caller-supplied list. Idempotent by construction: a healed record's
// project equals the canonical key, so a second pass matches nothing.
export async function resolveLegacyProjectNames(
  kv: StateKV,
  canonicalProject: string,
  explicitNames: string[] = [],
): Promise<Set<string>> {
  const legacyNames = new Set<string>();
  for (const raw of explicitNames) {
    const name = raw.trim();
    if (name && name !== canonicalProject) legacyNames.add(name);
  }
  if (!canonicalProject.trim()) return legacyNames;

  const sessions = await kv.list<Session>(KV.sessions).catch(() => [] as Session[]);
  for (const s of sessions) {
    if (s.project === canonicalProject && s.projectDisplayName?.trim()) {
      legacyNames.add(s.projectDisplayName.trim());
    }
  }
  legacyNames.delete(canonicalProject);
  return legacyNames;
}

export async function healLegacyProjects(
  kv: StateKV,
  canonicalProject: string,
  opts?: { legacyNames?: string[] },
): Promise<{
  healedMemories: number;
  healedLessons: number;
  healedSessions: number;
}> {
  const legacyNames = await resolveLegacyProjectNames(
    kv,
    canonicalProject,
    opts?.legacyNames ?? [],
  );
  if (legacyNames.size === 0) {
    return { healedMemories: 0, healedLessons: 0, healedSessions: 0 };
  }

  const [memories, lessons, sessions] = await Promise.all([
    kv.list<Memory>(KV.memories).catch(() => [] as Memory[]),
    kv.list<Lesson>(KV.lessons).catch(() => [] as Lesson[]),
    kv.list<Session>(KV.sessions).catch(() => [] as Session[]),
  ]);

  let healedMemories = 0;
  let healedLessons = 0;
  let healedSessions = 0;
  const writes: Promise<unknown>[] = [];

  for (const m of memories) {
    if (m.project && legacyNames.has(m.project)) {
      m.project = canonicalProject;
      writes.push(kv.set(KV.memories, m.id, m));
      healedMemories++;
    }
  }
  for (const l of lessons) {
    if (l.project && legacyNames.has(l.project)) {
      l.project = canonicalProject;
      writes.push(kv.set(KV.lessons, l.id, l));
      healedLessons++;
    }
  }
  for (const s of sessions) {
    if (s.project && legacyNames.has(s.project)) {
      s.project = canonicalProject;
      writes.push(kv.set(KV.sessions, s.id, s));
      healedSessions++;
    }
  }

  await Promise.all(writes);
  return { healedMemories, healedLessons, healedSessions };
}

export function registerConsolidateFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::consolidate", 
    async (data: {
      project?: string;
      minObservations?: number;
      project_display_name?: string;
    }) => {
      const minObs = data.minObservations ?? 10;

      const healed = data.project
        ? await healLegacyProjects(kv, data.project, {
            legacyNames: data.project_display_name?.trim()
              ? [data.project_display_name.trim()]
              : undefined,
          })
        : undefined;
      const healSummary = healed ? { healed } : {};

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
          if (!obs.isTelemetry && obs.title && obs.importance >= 5) {
            allObs.push({ ...obs, sid: filtered[i].id });
          }
        }
      }

      if (allObs.length < minObs) {
        return { consolidated: 0, reason: "insufficient_observations", ...healSummary };
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
      const existingMemories = await kv.list<Memory>(KV.memories);
      const existingTitles = new Set(
        existingMemories.map((m) => m.title.toLowerCase()),
      );

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
          const obsIds = [...new Set(top.map((o) => o.id))];
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
          const existingMatch = existingMemories.find(
            (m) =>
              m.title.toLowerCase() === parsed.title.toLowerCase() &&
              (!scopedProject || !m.project || m.project === scopedProject),
          );

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
            existingTitles.add(evolved.title.toLowerCase());
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
            existingTitles.add(memory.title.toLowerCase());
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
        totalObs: allObs.length,
      });
      return { consolidated, totalObservations: allObs.length, ...healSummary };
    },
  );
}
