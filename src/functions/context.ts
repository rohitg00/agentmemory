import type { ISdk } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  SessionSummary,
  ContextBlock,
  ProjectProfile,
  MemorySlot,
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
    async (data: { sessionId: string; project: string; budget?: number }) => {
      const budget = data.budget || tokenBudget;
      const blocks: ContextBlock[] = [];

      const [pinnedSlots, profile] = await Promise.all([
        isSlotsEnabled()
          ? listPinnedSlots(kv).catch(() => [] as MemorySlot[])
          : Promise.resolve([] as MemorySlot[]),
        kv
          .get<ProjectProfile>(KV.profiles, data.project)
          .catch(() => null),
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

      const allSessions = await kv.list<Session>(KV.sessions);
      const sessions = allSessions
        .filter((s) => s.project === data.project && s.id !== data.sessionId)
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
