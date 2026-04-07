import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  CompressedObservation,
  SessionSummary,
  ProceduralMemory,
  Session,
  MemoryProvider,
} from "../types.js";
import { KV, generateId, fingerprintId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";

const SKILL_EXTRACT_SYSTEM = `You are a skill extraction engine. Given a completed multi-step task session, extract a reusable procedural skill document.

Output format:
<skill>
<trigger>When the agent encounters [specific situation/pattern]</trigger>
<title>Short skill title</title>
<steps>
<step>First concrete action</step>
<step>Second concrete action</step>
</steps>
<expected_outcome>What success looks like</expected_outcome>
<tags>comma,separated,tags</tags>
</skill>

Rules:
- Extract ONLY if the session shows a clear multi-step procedure that succeeded
- Steps must be concrete and actionable, not vague
- The trigger should describe WHEN to apply this skill
- If the session is exploratory with no clear procedure, output <no-skill/>
- Maximum 10 steps per skill`;

function buildSkillPrompt(
  summary: SessionSummary,
  observations: CompressedObservation[],
): string {
  const obsText = observations
    .filter((o) => o.importance >= 4)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(0, 30)
    .map(
      (o) =>
        `[${o.type}] ${o.title}${o.narrative ? ": " + o.narrative : ""}`,
    )
    .join("\n");

  return `## Session Summary
Title: ${summary.title}
Narrative: ${summary.narrative}
Key Decisions: ${summary.keyDecisions.join("; ")}
Files Modified: ${summary.filesModified.join(", ")}
Concepts: ${summary.concepts.join(", ")}

## Observations (${observations.length} total, showing top by importance)
${obsText}`;
}

function parseSkillXml(
  xml: string,
): {
  trigger: string;
  title: string;
  steps: string[];
  expectedOutcome: string;
  tags: string[];
} | null {
  if (xml.includes("<no-skill/>")) return null;

  const triggerMatch = xml.match(/<trigger>([\s\S]*?)<\/trigger>/);
  const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/);
  const stepsMatch = xml.match(/<steps>([\s\S]*?)<\/steps>/);
  const outcomeMatch = xml.match(
    /<expected_outcome>([\s\S]*?)<\/expected_outcome>/,
  );
  const tagsMatch = xml.match(/<tags>([\s\S]*?)<\/tags>/);

  if (!triggerMatch || !titleMatch || !stepsMatch) return null;

  const stepRegex = /<step>([\s\S]*?)<\/step>/g;
  const steps: string[] = [];
  let match;
  while ((match = stepRegex.exec(stepsMatch[1])) !== null) {
    const step = match[1].trim();
    if (step) steps.push(step);
  }

  if (steps.length < 2) return null;

  return {
    trigger: triggerMatch[1].trim(),
    title: titleMatch[1].trim(),
    steps,
    expectedOutcome: outcomeMatch?.[1]?.trim() || "",
    tags: tagsMatch?.[1]
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) || [],
  };
}

export function registerSkillExtractFunctions(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    {
      id: "mem::skill-extract",
      description:
        "Extract a reusable skill document from a completed session",
    },
    async (data: { sessionId: string }) => {
      const ctx = getContext();
      if (!data?.sessionId) {
        return { success: false, error: "sessionId is required" };
      }

      const session = await kv
        .get<Session>(KV.sessions, data.sessionId)
        .catch(() => null);
      if (!session) {
        return { success: false, error: "session not found" };
      }
      if (session.status !== "completed") {
        return {
          success: false,
          error: "session must be completed before skill extraction",
        };
      }

      const [summary, observations] = await Promise.all([
        kv.get<SessionSummary>(KV.summaries, data.sessionId).catch(() => null),
        kv.list<CompressedObservation>(KV.observations(data.sessionId)).catch(() => []),
      ]);
      if (!summary) {
        return {
          success: false,
          error: "no summary — run mem::summarize first",
        };
      }
      if (observations.length < 3) {
        return { success: false, error: "too few observations for skill extraction" };
      }

      try {
        const prompt = buildSkillPrompt(summary, observations);
        const response = await provider.summarize(
          SKILL_EXTRACT_SYSTEM,
          prompt,
        );
        const parsed = parseSkillXml(response);

        if (!parsed) {
          ctx.logger.info("No skill extracted — session was exploratory", {
            sessionId: data.sessionId,
          });
          return { success: true, extracted: false, reason: "no clear procedure found" };
        }

        const fp = fingerprintId(
          "skill",
          JSON.stringify({
            title: parsed.title.toLowerCase(),
            trigger: parsed.trigger.toLowerCase(),
            steps: parsed.steps.map((s) => s.toLowerCase().trim()),
          }),
        );
        const existing = await kv
          .get<ProceduralMemory>(KV.procedural, fp)
          .catch(() => null);

        if (existing) {
          const alreadyReinforced = existing.sourceSessionIds.includes(data.sessionId);
          if (!alreadyReinforced) {
            existing.strength = Math.min(1.0, existing.strength + 0.15);
            existing.frequency++;
            existing.sourceSessionIds = [...existing.sourceSessionIds, data.sessionId];
          }
          existing.updatedAt = new Date().toISOString();
          await kv.set(KV.procedural, existing.id, existing);

          try {
            await recordAudit(kv, "skill_extract", "mem::skill-extract", [], {
              skillId: existing.id,
              reinforced: true,
              sessionId: data.sessionId,
            });
          } catch {}

          ctx.logger.info("Skill reinforced", {
            id: existing.id,
            name: parsed.title,
          });
          return {
            success: true,
            extracted: true,
            reinforced: true,
            skill: existing,
          };
        }

        const now = new Date().toISOString();
        const skill: ProceduralMemory = {
          id: fp,
          name: parsed.title,
          triggerCondition: parsed.trigger,
          steps: parsed.steps,
          expectedOutcome: parsed.expectedOutcome,
          strength: 0.6,
          frequency: 1,
          tags: parsed.tags,
          concepts: summary.concepts,
          sourceSessionIds: [data.sessionId],
          sourceObservationIds: observations
            .slice(0, 10)
            .map((o) => o.id),
          createdAt: now,
          updatedAt: now,
        };

        await kv.set(KV.procedural, skill.id, skill);

        try {
          await recordAudit(kv, "skill_extract", "mem::skill-extract", [], {
            skillId: skill.id,
            title: parsed.title,
            steps: parsed.steps.length,
            sessionId: data.sessionId,
          });
        } catch {}

        ctx.logger.info("Skill extracted", {
          id: skill.id,
          title: parsed.title,
          steps: parsed.steps.length,
        });

        return { success: true, extracted: true, reinforced: false, skill };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error("Skill extraction failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction(
    {
      id: "mem::skill-list",
      description: "List extracted procedural skills",
    },
    async (data: { limit?: number }) => {
      const limit = data?.limit ?? 50;
      const skills = await kv.list<ProceduralMemory>(KV.procedural);
      const sorted = skills.sort((a, b) => b.strength - a.strength);
      return {
        success: true,
        skills: sorted.slice(0, limit),
        total: sorted.length,
      };
    },
  );

  sdk.registerFunction(
    {
      id: "mem::skill-match",
      description: "Find skills relevant to a given task description",
    },
    async (data: { query: string; limit?: number }) => {
      if (!data?.query?.trim()) {
        return { success: false, error: "query is required" };
      }

      const limit = data.limit ?? 5;
      const query = data.query.toLowerCase();
      const terms = query.split(/\s+/).filter((t) => t.length > 2);

      const skills = await kv.list<ProceduralMemory>(KV.procedural);

      const scored = skills
        .map((skill) => {
          const text =
            `${skill.name} ${skill.triggerCondition} ${(skill.tags || []).join(" ")} ${skill.steps.join(" ")}`.toLowerCase();
          const matchCount = terms.filter((t) => text.includes(t)).length;
          if (matchCount === 0) return null;
          const relevance = matchCount / terms.length;
          return { skill, score: relevance * skill.strength };
        })
        .filter(Boolean) as Array<{
        skill: ProceduralMemory;
        score: number;
      }>;

      scored.sort((a, b) => b.score - a.score);

      return {
        success: true,
        matches: scored.slice(0, limit),
      };
    },
  );
}
