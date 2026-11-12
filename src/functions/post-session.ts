import type { IIIClient } from "iii-sdk";
import { TriggerAction } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { collectAll } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { CompressedObservation, GraphExtractMark, Memory } from "../types.js";
import { graphExtractCooldownMs, isConsolidationEnabled, detectLlmProviderKind } from "../config.js";
import { isReflectEnabled } from "./slots.js";
import { logger } from "../logger.js";
import { consolidationDue } from "../triggers/events.js";
import { getGraphGeneration } from "../state/graph-generation.js";
import { registerObserverTarget } from "../runtime/observed.js";

const graphStamp = (o: CompressedObservation): string => o.compressedAt ?? o.timestamp;

const fireVoid = (sdk: IIIClient, function_id: string, payload: unknown, sessionId: string) =>
  sdk
    .trigger({ function_id, payload, action: TriggerAction.Void() })
    .catch((err) =>
      logger.warn(function_id + " trigger failed", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );

export function registerPostSessionFunctions(sdk: IIIClient, kv: StateKV): void {
  registerObserverTarget(sdk, "mem::post-session-graph", "input", async (data: { sessionId: string }) => {
    const stored = await kv.get<GraphExtractMark>(KV.graphExtractMarks, data.sessionId);
    const graphGeneration = await getGraphGeneration(kv);
    const marker = stored && (stored.graphGeneration ?? null) === graphGeneration ? stored : null;
    const cooldownMs = graphExtractCooldownMs();
    if (marker && cooldownMs > 0 && Date.now() - Date.parse(marker.updatedAt) < cooldownMs) {
      return { skipped: "cooldown", updatedAt: marker.updatedAt };
    }
    const since = marker ? Date.parse(marker.lastObservationTimestamp) : 0;
    const observations = await collectAll<CompressedObservation>(kv, KV.observations(data.sessionId));
    const fresh = observations.filter((o) => o.title && Date.parse(graphStamp(o)) > since);
    if (fresh.length === 0) return { extracted: 0 };
    const result = await sdk.trigger<{ observations: CompressedObservation[] }, { success?: boolean; partial?: boolean; error?: string } | null>({
      function_id: "mem::graph-extract",
      payload: { observations: fresh },
    });
    if (result?.success === false || result?.partial === true) return { extracted: 0, error: result.error ?? "graph extraction failed" };
    const maxTs = fresh.reduce((max, o) => (graphStamp(o) > max ? graphStamp(o) : max), marker?.lastObservationTimestamp ?? "");
    await kv.set(KV.graphExtractMarks, data.sessionId, {
      sessionId: data.sessionId,
      lastObservationTimestamp: maxTs,
      extractedCount: (marker?.extractedCount ?? 0) + fresh.length,
      updatedAt: new Date().toISOString(),
      graphGeneration,
    } satisfies GraphExtractMark);
    return { extracted: fresh.length };
  });

  registerObserverTarget(sdk, "mem::post-session-reflect", "input", async (data: { sessionId: string }) => {
    if (!isReflectEnabled()) return { skipped: "reflect_disabled" };
    return sdk.trigger({ function_id: "mem::slot-reflect", payload: { sessionId: data.sessionId } });
  });

  registerObserverTarget(sdk, "mem::post-session-consolidate", "input", async (data: { sessionId: string; skipConsolidation?: boolean }) => {
    if (!isConsolidationEnabled()) return { skipped: "consolidation_disabled" };
    if (!(await consolidationDue(kv))) return { skipped: "debounced" };
    fireVoid(sdk, "mem::consolidate-pipeline", { tier: "all", force: true }, data.sessionId);
    fireVoid(sdk, "mem::auto-crystallize", { olderThanDays: 0 }, data.sessionId);
    if (detectLlmProviderKind() === "llm") {
      fireVoid(sdk, "mem::skill-extract", { sessionId: data.sessionId }, data.sessionId);
    }
    return { fired: true };
  });

  sdk.registerFunction("mem::post-remember-graph", async (data: { input?: { content?: string; type?: string; concepts?: string[] }; output?: { success?: boolean; memory?: Memory } }) => {
    const memory = data.output?.memory;
    if (!data.output?.success || !memory) return { skipped: "no_memory" };
    const content = typeof data.input?.content === "string" ? data.input.content : "";
    const observation = {
      id: memory.id,
      title: memory.title || content.slice(0, 120) || memory.type,
      narrative: content,
      type: "compressed_observation",
      timestamp: memory.createdAt,
      sessionId: `memory:${memory.id}`,
      hookType: "remember",
      concepts: data.input?.concepts ?? memory.concepts ?? [],
      files: memory.files ?? [],
    } as unknown as CompressedObservation;
    return sdk.trigger({ function_id: "mem::graph-extract", payload: { observations: [observation] } });
  });
}
