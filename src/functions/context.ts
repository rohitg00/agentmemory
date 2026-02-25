import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  SessionSummary,
  ContextBlock,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

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
  sdk.registerFunction(
    {
      id: "mem::context",
      description: "Generate context for session injection",
    },
    async (data: { sessionId: string; project: string; budget?: number }) => {
      const ctx = getContext();
      const budget = data.budget || tokenBudget;
      const blocks: ContextBlock[] = [];

      const allSessions = await kv.list<Session>(KV.sessions);
      const sessions = allSessions
        .filter((s) => s.project === data.project && s.id !== data.sessionId)
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, 10);

      for (const session of sessions) {
        const summary = await kv.get<SessionSummary>(KV.summaries, session.id);

        if (summary) {
          const content = `## ${summary.title}\n${summary.narrative}\nDecisions: ${summary.keyDecisions.join("; ")}\nFiles: ${summary.filesModified.join(", ")}`;
          blocks.push({
            type: "summary",
            content,
            tokens: estimateTokens(content),
            recency: new Date(summary.createdAt).getTime(),
          });
          continue;
        }

        const observations = await kv.list<CompressedObservation>(
          KV.observations(session.id),
        );
        const important = observations.filter(
          (o) => o.title && o.importance >= 5,
        );

        if (important.length > 0) {
          const items = important
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 5)
            .map((o) => `- [${o.type}] ${o.title}: ${o.narrative}`)
            .join("\n");
          const content = `## Session ${session.id.slice(0, 8)} (${session.startedAt})\n${items}`;
          blocks.push({
            type: "observation",
            content,
            tokens: estimateTokens(content),
            recency: new Date(session.startedAt).getTime(),
          });
        }
      }

      blocks.sort((a, b) => b.recency - a.recency);

      let usedTokens = 0;
      const selected: string[] = [];
      const header = `<agentmemory-context project="${escapeXmlAttr(data.project)}">`;
      const footer = `</agentmemory-context>`;
      usedTokens += estimateTokens(header) + estimateTokens(footer);

      for (const block of blocks) {
        if (usedTokens + block.tokens > budget) break;
        selected.push(block.content);
        usedTokens += block.tokens;
      }

      if (selected.length === 0) {
        ctx.logger.info("No context available", { project: data.project });
        return { context: "", blocks: 0, tokens: 0 };
      }

      const result = `${header}\n${selected.join("\n\n")}\n${footer}`;
      ctx.logger.info("Context generated", {
        blocks: selected.length,
        tokens: usedTokens,
      });
      return { context: result, blocks: selected.length, tokens: usedTokens };
    },
  );
}
