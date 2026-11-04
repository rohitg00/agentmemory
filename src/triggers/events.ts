import { TriggerAction, type IIIClient } from "iii-sdk";
import type { CompressedObservation, Memory, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { emitLiveEvent } from "../viewer/live-events.js";
import { isReflectEnabled } from "../functions/slots.js";
import {
  detectLlmProviderKind,
  getAgentId,
  getConsolidationCooldownMs,
  isAgentScopeIsolated,
  isConsolidationEnabled,
} from "../config.js";
import { logger } from "../logger.js";
import { noteMemoryChange, noteSessionChange } from "../state/viewer-counts.js";

// Global marker recording when corpus consolidation last ran, used to debounce
// the per-turn session-stop fan-out.
const CONSOLIDATION_MARKER_KEY = "consolidation:lastRun";

async function consolidationDueUnserialized(kv: StateKV): Promise<boolean> {
  const cooldownMs = getConsolidationCooldownMs();
  if (cooldownMs <= 0) return true; // debounce disabled
  const now = Date.now();
  const marker = await kv
    .get<{ at?: number }>(KV.config, CONSOLIDATION_MARKER_KEY)
    .catch(() => null);
  const lastAt = typeof marker?.at === "number" ? marker.at : 0;
  if (now - lastAt < cooldownMs) return false;
  await kv.set(KV.config, CONSOLIDATION_MARKER_KEY, { at: now }).catch(() => {});
  return true;
}

// Concurrent session-stop events would otherwise interleave the marker
// read-check-write above and both pass the cooldown. Serialize the whole
// check through an in-process chain so exactly one concurrent caller wins.
let consolidationCheckChain: Promise<unknown> = Promise.resolve();

function consolidationDue(kv: StateKV): Promise<boolean> {
  const result = consolidationCheckChain.then(() =>
    consolidationDueUnserialized(kv),
  );
  consolidationCheckChain = result.catch(() => false);
  return result;
}

export function registerEventTriggers(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction("event::session::stopped", async (data: { sessionId: string; skipConsolidation?: boolean }) => {
    const summary = await sdk.trigger<typeof data, { unchanged?: boolean } | undefined>({
      function_id: "mem::summarize",
      payload: data,
    });
    if (summary?.unchanged === true) return summary;
    const fireVoid = (function_id: string, payload: unknown) =>
      sdk
        .trigger({ function_id, payload, action: TriggerAction.Void() })
        .catch((err) =>
          logger.warn(function_id + " trigger failed", {
            sessionId: data.sessionId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    if (isReflectEnabled()) {
      fireVoid("mem::slot-reflect", { sessionId: data.sessionId });
    }
    // Unconditional: mem::graph-extract gates its LLM pass internally.
    try {
      const observations = await kv.list<CompressedObservation>(
        KV.observations(data.sessionId),
      );
      const compressed = observations.filter((o) => o.title);
      if (compressed.length > 0) {
        fireVoid("mem::graph-extract", { observations: compressed });
      }
    } catch (err) {
      logger.warn("graph-extract trigger failed", {
        sessionId: data.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Crystals + lessons consolidation. The stop lifecycle is the single
    // source of truth: event::session::stopped fires for ALL agents (the
    // client-side session-end hook no longer drives consolidation directly).
    // Gated so keyless/zero-LLM users don't fire no-op LLM calls.
    //
    // skipConsolidation suppresses the fan-out when this handler is driven
    // by eviction's stale-session recovery: evict calls session::stopped
    // once per recovered session, then runs ONE final consolidation pass.
    // Without this guard, N recovered sessions launch N concurrent forced
    // full-corpus consolidations plus N crystallizations.
    //
    // Debounce: /session/end is posted by the per-turn Stop hook, so this
    // handler fires on every agent turn. consolidate-pipeline + auto-crystallize
    // are full-corpus LLM work with no internal "nothing changed" guard, so
    // firing them every turn is a cost/latency storm for connected agents.
    // Bound the global corpus consolidation to once per cooldown window.
    if (isConsolidationEnabled() && !data.skipConsolidation) {
      if (await consolidationDue(kv)) {
        fireVoid("mem::consolidate-pipeline", { tier: "all", force: true });
        fireVoid("mem::auto-crystallize", { olderThanDays: 0 });
        if (detectLlmProviderKind() === "llm") {
          fireVoid("mem::skill-extract", { sessionId: data.sessionId });
        }
      }
    }
    return summary;
  });
  // React to observation count changes and emit a lightweight live event for dashboards/viewer.
  sdk.registerFunction(
    "event::session::observation-count-changed",
    async (payload: {
      key: string;
      event_type: string;
      old_value?: Session;
      new_value?: Session;
    }) => {
      noteSessionChange(payload.old_value, isStateDelete(payload) ? null : payload.new_value);
      if (isOutOfAgentScope(payload.new_value ?? payload.old_value)) {
        return { emitted: false };
      }
      if (isStateDelete(payload)) {
        await sendViewerEvent(sdk, `session-deleted-${payload.key}-${Date.now()}`, "session.deleted", {
          sessionId: payload.key,
        });
        return { emitted: true };
      }
      if (payload.new_value) {
        await sendViewerEvent(sdk, `session-updated-${payload.key}-${Date.now()}`, "session.updated", {
          session: payload.new_value,
        });
      }
      const oldCount = payload.old_value?.observationCount ?? 0;
      const newCount = payload.new_value?.observationCount ?? 0;
      if (newCount <= oldCount) return { emitted: Boolean(payload.new_value) };

      await sendViewerEvent(sdk, `session-activity-${payload.key}-${Date.now()}`, "session.activity", {
        sessionId: payload.key,
        observationCount: newCount,
        delta: newCount - oldCount,
        updatedAt: payload.new_value?.updatedAt ?? new Date().toISOString(),
      });

      return { emitted: true };
    },
  );
  sdk.registerTrigger({
    type: "state",
    function_id: "event::session::observation-count-changed",
    config: { scope: KV.sessions },
  });

  sdk.registerFunction(
    "event::memory::changed",
    async (payload: {
      key: string;
      event_type: string;
      old_value?: Memory;
      new_value?: Memory;
    }) => {
      const deleted = isStateDelete(payload);
      noteMemoryChange(payload.old_value, deleted ? null : payload.new_value);
      if (isOutOfAgentScope(payload.new_value ?? payload.old_value)) {
        return { emitted: false };
      }
      const memory = payload.new_value;
      const created = !deleted && !payload.old_value;
      let type = "memory.updated";
      if (deleted) type = "memory.deleted";
      else if (created) type = "memory.created";
      await sendViewerEvent(
        sdk,
        `${type.replace(".", "-")}-${payload.key}-${Date.now()}`,
        type,
        deleted
          ? { memoryId: payload.key, isLatest: payload.old_value?.isLatest }
          : {
              memoryId: payload.key,
              type: memory?.type,
              title: memory?.title,
              isLatest: memory?.isLatest,
              updatedAt: memory?.updatedAt,
              memory,
            },
      );
      return { emitted: true };
    },
  );
  sdk.registerTrigger({
    type: "state",
    function_id: "event::memory::changed",
    config: { scope: KV.memories },
  });
}

export function isStateDelete(payload: { event_type: string; new_value?: unknown }): boolean {
  return payload.event_type === "state:deleted" || !payload.new_value;
}

export function isOutOfAgentScope(record: { agentId?: string } | undefined): boolean {
  return isAgentScopeIsolated() && record?.agentId !== getAgentId();
}

export async function sendViewerEvent(
  _sdk: IIIClient,
  id: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  emitLiveEvent({ id, type, data });
}
