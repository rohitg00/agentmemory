import type { ISdk } from "iii-sdk";
import type {
  Action,
  CompressedObservation,
  MemoryProvider,
} from "../types.js";
import { KV, fingerprintId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { isActionSuggestEnabled } from "../config.js";
import { recordAudit } from "./audit.js";
import {
  ACTION_SUGGEST_SYSTEM,
  buildActionSuggestPrompt,
  parseActionSuggestXml,
} from "../prompts/action-suggest.js";
import { logger } from "../logger.js";

const PARTIAL_RE = /partial|incomplete|still need|still missing|not yet|remaining|left to do/i;
const TODO_RE = /todo|fixme|hack|xxx|tbd/i;

interface ActionCandidate {
  title: string;
  description: string;
  priority: number;
  sourceObservationIds: string[];
  source: "heuristic" | "llm";
}

function heuristicScan(
  observations: CompressedObservation[],
): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];

  for (const obs of observations) {
    const title = obs.title || "";
    const narrative = (obs.narrative || "").toLowerCase();
    const type = obs.type;

    if (type === "error") {
      candidates.push({
        title: `Fix error: ${title}`,
        description: obs.narrative || title,
        priority: 8,
        sourceObservationIds: [obs.id],
        source: "heuristic",
      });
      continue;
    }

    if (TODO_RE.test(title) || TODO_RE.test(narrative)) {
      candidates.push({
        title,
        description: obs.narrative || title,
        priority: 7,
        sourceObservationIds: [obs.id],
        source: "heuristic",
      });
      continue;
    }

    if (type === "decision" && obs.importance >= 8) {
      candidates.push({
        title: `Follow up: ${title}`,
        description: obs.narrative || title,
        priority: 6,
        sourceObservationIds: [obs.id],
        source: "heuristic",
      });
      continue;
    }

    if (type === "file_edit" && PARTIAL_RE.test(narrative)) {
      candidates.push({
        title: `Complete: ${title}`,
        description: obs.narrative || title,
        priority: 5,
        sourceObservationIds: [obs.id],
        source: "heuristic",
      });
    }
  }

  return candidates;
}

export function registerActionSuggestFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    "mem::action-suggest",
    async (data: {
      sessionId?: string;
      maxObservations?: number;
      project?: string;
    }) => {
      if (!isActionSuggestEnabled()) {
        return {
          success: false,
          skipped: true,
          reason: "AGENTMEMORY_ACTION_SUGGEST is not set to true",
        };
      }

      if (!data?.sessionId || typeof data.sessionId !== "string") {
        return { success: false, error: "sessionId is required" };
      }

      const max =
        typeof data.maxObservations === "number" &&
        Number.isInteger(data.maxObservations) &&
        data.maxObservations > 0
          ? Math.min(200, data.maxObservations)
          : 50;

      const observations = await kv.list<CompressedObservation>(
        KV.observations(data.sessionId),
      );

      if (observations.length === 0) {
        return {
          success: true,
          suggested: 0,
          heuristic: 0,
          llm: 0,
          reason: "no observations for session",
        };
      }

      const recent = observations
        .slice()
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
        .slice(0, max);

      const heuristicCandidates = heuristicScan(recent);

      const heuristicIds = new Set(
        heuristicCandidates.flatMap((c) => c.sourceObservationIds),
      );

      const unmatched = recent
        .filter((o) => o.importance >= 7 && !heuristicIds.has(o.id))
        .slice(0, 10);

      let llmCandidates: ActionCandidate[] = [];

      if (provider.name !== "noop" && unmatched.length > 0) {
        try {
          const prompt = buildActionSuggestPrompt(
            unmatched.map((o) => ({
              type: o.type,
              title: o.title || "",
              narrative: o.narrative || "",
              importance: o.importance,
              files: o.files,
            })),
          );

          const response = await Promise.race([
            provider.summarize(ACTION_SUGGEST_SYSTEM, prompt),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("action-suggest timeout")), 30_000),
            ),
          ]);

          const parsed = parseActionSuggestXml(response).slice(0, 5);

          llmCandidates = parsed.map((a) => ({
            title: a.title,
            description: a.description,
            priority: a.priority,
            sourceObservationIds: unmatched
              .slice(0, 2)
              .map((o) => o.id),
            source: "llm" as const,
          }));
        } catch (err) {
          logger.warn("LLM action suggestion failed", {
            sessionId: data.sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const allCandidates = [...heuristicCandidates, ...llmCandidates];

      const existingActions = await kv.list<Action>(KV.actions);
      const existingFingerprints = new Set(
        existingActions.map((a) => a.id),
      );

      const now = new Date().toISOString();
      let created = 0;
      let deduped = 0;

      for (const candidate of allCandidates) {
        const fp = fingerprintId("act", candidate.title.toLowerCase());

        if (existingFingerprints.has(fp)) {
          deduped++;
          continue;
        }

        const action: Action = {
          id: fp,
          title: candidate.title,
          description: candidate.description,
          status: "pending",
          priority: candidate.priority,
          createdAt: now,
          updatedAt: now,
          createdBy: "action-suggest",
          project: data.project,
          tags: ["auto-suggested"],
          sourceObservationIds: candidate.sourceObservationIds,
          sourceMemoryIds: [],
          metadata: { source: candidate.source },
        };

        await kv.set(KV.actions, action.id, action);
        existingFingerprints.add(action.id);
        created++;
      }

      if (created > 0) {
        await recordAudit(
          kv,
          "action_suggest",
          "mem::action-suggest",
          [data.sessionId],
          {
            suggested: created,
            heuristic: heuristicCandidates.length,
            llm: llmCandidates.length,
            deduped,
          },
        );
      }

      return {
        success: true,
        suggested: created,
        heuristic: heuristicCandidates.length,
        llm: llmCandidates.length,
        deduped,
      };
    },
  );
}