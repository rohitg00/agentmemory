import { TriggerAction, type ISdk } from "iii-sdk";
import type { CompressedObservation, HookPayload, Session } from "../types.js";
import { KV, STREAM, fingerprintId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { isReflectEnabled } from "../functions/slots.js";
import {
  getAgentId,
  getConsolidationCooldownMs,
  isConsolidationEnabled,
} from "../config.js";
import { logger } from "../logger.js";

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

export function registerEventTriggers(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "event::session::started",
    async (data: {
      sessionId: string;
      project: string;
      cwd: string;
      agentId?: string;
    }) => {
      const requestAgentId =
        typeof data.agentId === "string" && data.agentId.trim().length > 0
          ? data.agentId.trim().slice(0, 128)
          : undefined;
      const agentId = requestAgentId ?? getAgentId();
      const session: Session = {
        id: data.sessionId,
        project: data.project,
        cwd: data.cwd,
        startedAt: new Date().toISOString(),
        status: "active",
        observationCount: 0,
        ...(agentId ? { agentId } : {}),
      };
      await kv.set(KV.sessions, data.sessionId, session);
      const contextResult = await sdk.trigger<
        { sessionId: string; project: string; agentId?: string },
        { context: string }
      >({
        function_id: "mem::context",
        payload: {
          sessionId: data.sessionId,
          project: data.project,
          ...(agentId ? { agentId } : {}),
        },
      });
      return { session, context: contextResult.context };
    },
  );
  sdk.registerTrigger({
    type: "durable:subscriber",
    function_id: "event::session::started",
    config: { topic: "agentmemory.session.started" },
  });

  sdk.registerFunction("event::observation", async (data: HookPayload) =>
    sdk.trigger({ function_id: "mem::observe", payload: data }),
  );
  sdk.registerTrigger({
    type: "durable:subscriber",
    function_id: "event::observation",
    config: { topic: "agentmemory.observation" },
  });

  sdk.registerFunction("event::session::stopped", async (data: { sessionId: string; skipConsolidation?: boolean }) => {
    const summary = await sdk.trigger({ function_id: "mem::summarize", payload: data });
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
        if (typeof at === "string") {
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
          // Off the dispatched batch, so a future cap cannot advance the
          // watermark past an observation nobody sent.
          const newest = batch.reduce(
            (max, o) => (o.timestamp > max ? o.timestamp : max),
            "",
          );
          // Same node and edge sets either way — pinned by
          // graph-heuristic-extract.test.ts. Provenance narrows, which is the
          // real change: mergeNode/mergeEdge union the whole batch's obsIds,
          // so a whole-session batch stamped every node and edge with every
          // observation id in the session.
          //
          // Accepted is not done. A throw skips the watermark write and
          // retries next turn (pinned by graph-extract-incremental.test.ts),
          // but completion is unobservable through TriggerAction.Void(), so an
          // extract that fails downstream leaves its delta out of the graph
          // until POST /agentmemory/graph/build.
          await sdk.trigger({
            function_id: "mem::graph-extract",
            payload: { observations: batch },
            action: TriggerAction.Void(),
          });
          await kv.update(KV.sessions, data.sessionId, [
            { type: "set", path: "graphExtractedAt", value: newest },
            {
              type: "set",
              path: "graphExtractedDigest",
              value: observationFingerprint(compressed),
            },
          ]);
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
      }
    }
    return summary;
  });
  sdk.registerTrigger({
    type: "durable:subscriber",
    function_id: "event::session::stopped",
    config: { topic: "agentmemory.session.stopped" },
  });

  sdk.registerFunction(
    "event::session::ended",
    async (data: { sessionId: string }) => {
      await kv.update(KV.sessions, data.sessionId, [
        { type: "set", path: "endedAt", value: new Date().toISOString() },
        { type: "set", path: "status", value: "completed" },
      ]);
      return { success: true };
    },
  );
  sdk.registerTrigger({
    type: "durable:subscriber",
    function_id: "event::session::ended",
    config: { topic: "agentmemory.session.ended" },
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
      if (payload.event_type === "delete") return { skipped: true };
      const oldCount = payload.old_value?.observationCount ?? 0;
      const newCount = payload.new_value?.observationCount ?? 0;
      if (newCount <= oldCount) return { skipped: true };

      await sdk.trigger({
        function_id: "stream::send",
        payload: {
          stream_name: STREAM.name,
          group_id: STREAM.viewerGroup,
          id: `session-activity-${payload.key}-${Date.now()}`,
          type: "session.activity",
          data: {
            sessionId: payload.key,
            observationCount: newCount,
            delta: newCount - oldCount,
            updatedAt: payload.new_value?.updatedAt ?? new Date().toISOString(),
          },
        },
        action: TriggerAction.Void(),
      });

      return { emitted: true };
    },
  );
  sdk.registerTrigger({
    type: "state",
    function_id: "event::session::observation-count-changed",
    config: { scope: KV.sessions },
  });
}
