import { TriggerAction, type IIIClient } from "iii-sdk";
import type { CompressedObservation, Memory, Session } from "../types.js";
import { KV, fingerprintId } from "../state/schema.js";
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

// Order-independent fingerprint of an observation set: tells whether the
// already-extracted half of a session still looks the way it did at the last
// graph extract. Over ids, not counts or timestamps — evict's per-project cap
// (evict.ts, age- and status-independent) can delete an observation from the
// live session in the same window a late compression lands another, and if the
// two share a millisecond only the ids tell the sets apart.
const observationFingerprint = (obs: CompressedObservation[]): string =>
  fingerprintId("gx", obs.map((o) => o.id).sort().join(","));

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
    // Resolves true when the trigger was accepted, false when the dispatch
    // itself failed. Callers that need to know (graph-extract's watermark)
    // read it; the rest ignore it exactly as before.
    const fireVoid = (function_id: string, payload: unknown) =>
      sdk
        .trigger({ function_id, payload, action: TriggerAction.Void() })
        .then(() => true)
        .catch((err) => {
          logger.warn(function_id + " trigger failed", {
            sessionId: data.sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
          return false;
        });
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
        // /session/end is posted by the per-turn Stop hook, so this handler
        // runs every agent turn. Re-sending the whole session each time makes
        // persistGraphDelta re-merge turns 1..N-1 on turn N — quadratic engine
        // calls, and per #843 every kv.set stays resident in the engine, so
        // that is quadratic permanent heap. Send only what landed since the
        // last extract.
        //
        // The digest is what makes the timestamp watermark safe. mem::compress
        // is dispatched fire-and-forget (observe.ts) and stamps the capture
        // time, not the write time, so a slow compression can land an OLDER
        // timestamp after a newer one was already extracted; evict can also
        // remove one at any point. Whenever the already-extracted half no
        // longer fingerprints the same, we re-send the whole session rather
        // than skip it. Missing a memory is worse than re-merging one.
        const session = await kv
          .get<Session>(KV.sessions, data.sessionId)
          .catch(() => null);
        const at = session?.graphExtractedAt;
        const mark = session?.graphExtractedDigest;
        let batch = compressed;
        if (typeof at === "string" && typeof mark === "string") {
          const seen = compressed.filter((o) => o.timestamp <= at);
          if (observationFingerprint(seen) === mark) {
            batch = compressed.filter((o) => o.timestamp > at);
          } else {
            // Otherwise the fallback is silent: a session stuck re-extracting
            // itself every turn looks exactly like a healthy one.
            logger.info("graph-extract watermark stale, re-extracting session", {
              sessionId: data.sessionId,
              atOrBelow: seen.length,
              total: compressed.length,
            });
          }
        }
        if (batch.length > 0) {
          // Both halves of the pair come off the batch actually dispatched, so
          // capping the batch (api::graph-build already feeds 25 at a time)
          // cannot advance the watermark past an observation nobody sent.
          const newest = batch.reduce(
            (max, o) => (o.timestamp > max ? o.timestamp : max),
            "",
          );
          const extracted = compressed.filter((o) => o.timestamp <= newest);
          // What the smaller batch costs, for the next person to read this:
          // extractGraphHeuristics (graph.ts) loops per observation and only
          // ever links nodes drawn from one observation's own files/concepts,
          // and persistGraphDelta dedupes across batches through the name and
          // edge indexes, so the heuristic graph is identical either way. The
          // opt-in LLM pass (GRAPH_EXTRACTION_ENABLED, off by default) builds
          // one prompt from the array, so it sees less co-occurrence per call
          // than a whole-session batch did — bounded batches are already the
          // norm there, api::graph-build feeds it 25 at a time.
          //
          // Advance only after the dispatch is accepted, so a hand-off that
          // never left retries on the next turn. Completion is unobservable
          // through TriggerAction.Void(); an extract that fails downstream
          // leaves its delta out of the graph until POST /agentmemory/graph/build.
          if (await fireVoid("mem::graph-extract", { observations: batch })) {
            await kv.update(KV.sessions, data.sessionId, [
              { type: "set", path: "graphExtractedAt", value: newest },
              {
                type: "set",
                path: "graphExtractedDigest",
                value: observationFingerprint(extracted),
              },
            ]);
          }
        }
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
