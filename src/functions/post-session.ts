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
  sdk.registerFunction("mem::post-session-graph", async (data: { sessionId: string }) => {
    const marker = await kv.get<GraphExtractMark>(KV.graphExtractMarks, data.sessionId);
    const cooldownMs = graphExtractCooldownMs();
    if (marker && cooldownMs > 0 && Date.now() - Date.parse(marker.updatedAt) < cooldownMs) {
      return { skipped: "cooldown", updatedAt: marker.updatedAt };
    }
    const since = marker ? Date.parse(marker.lastObservationTimestamp) : 0;
    const observations = await collectAll<CompressedObservation>(kv, KV.observations(data.sessionId));
    const fresh = observations.filter((o) => o.title && Date.parse(o.timestamp) > since);
    if (fresh.length === 0) return { extracted: 0 };
    await sdk.trigger({ function_id: "mem::graph-extract", payload: { observations: fresh } });
    const maxTs = fresh.reduce((max, o) => (o.timestamp > max ? o.timestamp : max), marker?.lastObservationTimestamp ?? "");
    await kv.set(KV.graphExtractMarks, data.sessionId, {
      sessionId: data.sessionId,
      lastObservationTimestamp: maxTs,
      extractedCount: (marker?.extractedCount ?? 0) + fresh.length,
      updatedAt: new Date().toISOString(),
    } satisfies GraphExtractMark);
    return { extracted: fresh.length };
  });

  sdk.registerFunction("mem::post-session-reflect", async (data: { sessionId: string }) => {
    if (!isReflectEnabled()) return { skipped: "reflect_disabled" };
    return sdk.trigger({ function_id: "mem::slot-reflect", payload: { sessionId: data.sessionId } });
  });

  sdk.registerFunction("mem::post-session-consolidate", async (data: { sessionId: string; skipConsolidation?: boolean }) => {
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
    } as unknown as CompressedObservation;
    return sdk.trigger({ function_id: "mem::graph-extract", payload: { observations: [observation] } });
  });
}
