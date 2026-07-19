import type { ISdk } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  SessionSummary,
  ContextBlock,
  ProjectProfile,
  MemorySlot,
  Lesson,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAccessBatch } from "./access-tracker.js";
import { logger } from "../logger.js";
import {
  isSlotsEnabled,
  listPinnedSlots,
  renderPinnedContext,
} from "./slots.js";
import { getAgentId, isAgentScopeIsolated } from "../config.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function registerContextFunction(
  sdk: ISdk,
  kv: StateKV,
  tokenBudget: number,
): void {
  sdk.registerFunction("mem::context", 
    async (data: {
      sessionId: string;
      project: string;
      budget?: number;
      agentId?: string;
    }) => {
      const budget = data.budget || tokenBudget;
      const blocks: ContextBlock[] = [];

      // Cross-agent isolation for the injected-context path. Mirrors the
      // filter mem::search / mem::smart-search already apply so /context
      // cannot leak another profile's sessions. Fail-closed: if isolated
      // mode is on with no explicit agentId and env AGENT_ID unset, refuse
      // rather than silently returning cross-agent rows.
      const isolated = isAgentScopeIsolated();
      const explicitAgentId =
        typeof data.agentId === "string" && data.agentId.trim().length > 0
          ? data.agentId.trim()
          : undefined;
      const wildcardAgent = explicitAgentId === "*";
      const envAgentId = isolated ? getAgentId() : undefined;
      const filterAgentId = wildcardAgent
        ? undefined
        : explicitAgentId ?? envAgentId;
      if (isolated && !wildcardAgent && !explicitAgentId && !envAgentId) {
        throw new Error(
          "mem::context: AGENTMEMORY_AGENT_SCOPE=isolated is set but no " +
            "agent id is available (env AGENT_ID unset and no explicit " +
            "agentId in the call). Refusing to read cross-agent rows. " +
            'Pass agentId: "*" to opt in to a wildcard read.',
        );
      }

      const [pinnedSlots, profile, lessons] = await Promise.all([
        isSlotsEnabled()
          ? listPinnedSlots(kv).catch(() => [] as MemorySlot[])
          : Promise.resolve([] as MemorySlot[]),
        kv
          .get<ProjectProfile>(KV.profiles, data.project)
          .catch(() => null),
        kv.list<Lesson>(KV.lessons).catch(() => [] as Lesson[]),
      ]);

      const slotContent = renderPinnedContext(pinnedSlots);
      if (slotContent) {
        blocks.push({
          type: "memory",
          content: slotContent,
          tokens: estimateTokens(slotContent),
          recency: Date.now(),
        });
      }
      if (profile) {
        const profileParts = [];
        if (profile.topConcepts.length > 0) {
          profileParts.push(
            `Concepts: ${profile.topConcepts
              .slice(0, 8)
              .map((c) => c.concept)
              .join(", ")}`,
          );
        }
        if (profile.topFiles.length > 0) {
          profileParts.push(
            `Key files: ${profile.topFiles
              .slice(0, 5)
              .map((f) => f.file)
              .join(", ")}`,
          );
        }
        if (profile.conventions.length > 0) {
          profileParts.push(`Conventions: ${profile.conventions.join("; ")}`);
        }
        if (profile.commonErrors.length > 0) {
          profileParts.push(
            `Common errors: ${profile.commonErrors.slice(0, 3).join("; ")}`,
          );
        }
        if (profileParts.length > 0) {
          const profileContent = `## Project Profile\n${profileParts.join("\n")}`;
          blocks.push({
            type: "memory",
            content: profileContent,
            tokens: estimateTokens(profileContent),
            recency: new Date(profile.updatedAt).getTime(),
          });
        }
      }

      // Lessons — closes the loop opened by mem::lesson-save / mem::reflect.
      // Without this block, lessons sit in KV and only surface when the agent
      // thinks to call memory_lesson_recall. Ranking puts project-scoped
      // lessons ahead of global ones, then weights by confidence; we cap at
      // 10 to keep the block bounded since the outer token-budget loop
      // below will drop the whole block if it doesn't fit. #457.
      const relevantLessons = lessons
        .filter((l) => !l.deleted && (!l.project || l.project === data.project))
        .sort((a, b) => {
          const scoreA = (a.project === data.project ? 1.5 : 1) * a.confidence;
          const scoreB = (b.project === data.project ? 1.5 : 1) * b.confidence;
          return scoreB - scoreA;
        })
        .slice(0, 10);

      if (relevantLessons.length > 0) {
        const items = relevantLessons
          .map(
            (l) =>
              `- (${l.confidence.toFixed(2)}) ${l.content}${l.context ? ` — ${l.context}` : ""}`,
          )
          .join("\n");
        const lessonsContent = `## Lessons Learned\n${items}`;
        const mostRecent = relevantLessons.reduce((acc, l) => {
          const t = new Date(l.lastReinforcedAt || l.updatedAt).getTime();
          return t > acc ? t : acc;
        }, 0);
        blocks.push({
          type: "memory",
          content: lessonsContent,
          tokens: estimateTokens(lessonsContent),
          recency: mostRecent,
          sourceIds: relevantLessons.map((l) => l.id),
        });
      }

      const allSessions = await kv.list<Session>(KV.sessions);
      const sessions = allSessions
        .filter(
          (s) =>
            s.project === data.project &&
            s.id !== data.sessionId &&
            (filterAgentId === undefined || s.agentId === filterAgentId),
        )
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, 10);

      const summariesPerSession = await Promise.all(
        sessions.map((s) =>
          kv.get<SessionSummary>(KV.summaries, s.id).catch(() => null),
        ),
      );

      const sessionsNeedingObs: number[] = [];
      for (let i = 0; i < sessions.length; i++) {
        const summary = summariesPerSession[i];
        if (summary) {
          const content = `## ${summary.title}\n${summary.narrative}\nDecisions: ${summary.keyDecisions.join("; ")}\nFiles: ${summary.filesModified.join(", ")}`;
          blocks.push({
            type: "summary",
            content,
            tokens: estimateTokens(content),
            recency: new Date(summary.createdAt).getTime(),
          });
        } else {
          sessionsNeedingObs.push(i);
        }
      }

      const obsResults = await Promise.all(
        sessionsNeedingObs.map((i) =>
          kv
            .list<CompressedObservation>(KV.observations(sessions[i].id))
            .catch(() => []),
        ),
      );

      for (let j = 0; j < sessionsNeedingObs.length; j++) {
        const i = sessionsNeedingObs[j];
        const observations = obsResults[j];
        const important = observations.filter(
          (o) => o.title && o.importance >= 5,
        );

        if (important.length > 0) {
          const top = important
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 5);
          const items = top
            .map((o) => `- [${o.type}] ${o.title}: ${o.narrative}`)
            .join("\n");
          const content = `## Session ${sessions[i].id.slice(0, 8)} (${sessions[i].startedAt})\n${items}`;
          blocks.push({
            type: "observation",
            content,
            tokens: estimateTokens(content),
            recency: new Date(sessions[i].startedAt).getTime(),
            sourceIds: top.map((o) => o.id),
          });
        }
      }

      blocks.sort((a, b) => b.recency - a.recency);

      let usedTokens = 0;
      const selected: string[] = [];
      const accessedIds: string[] = [];
      const header = `<agentmemory-context project="${escapeXmlAttr(data.project)}">`;
      const footer = `</agentmemory-context>`;
      usedTokens += estimateTokens(header) + estimateTokens(footer);

      for (const block of blocks) {
        if (usedTokens + block.tokens > budget) continue;
        selected.push(block.content);
        usedTokens += block.tokens;
        if (block.sourceIds && block.sourceIds.length > 0) {
          accessedIds.push(...block.sourceIds);
        }
      }

      if (accessedIds.length > 0) {
        void recordAccessBatch(kv, accessedIds);
      }

      if (selected.length === 0) {
        logger.info("No context available", { project: data.project });
        return { context: "", blocks: 0, tokens: 0 };
      }

      const result = `${header}\n${selected.join("\n\n")}\n${footer}`;
      logger.info("Context generated", {
        blocks: selected.length,
        tokens: usedTokens,
      });
      return { context: result, blocks: selected.length, tokens: usedTokens };
    },
  );
}
