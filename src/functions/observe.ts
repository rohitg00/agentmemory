import { TriggerAction, type IIIClient } from "iii-sdk";
import type { RawObservation, CompressedObservation, HookPayload, Origin, Session } from "../types.js";

const TOOL_HOOKS = new Set(["pre_tool_use", "post_tool_use", "post_tool_failure"]);
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { emitLiveEvent } from "../viewer/live-events.js";
import { addSessionToProjectIndex } from "../state/session-index.js";
import { indexObservationSession } from "../state/obs-index.js";
import { scrubRecord } from "./privacy.js";
import { DedupMap, recordDedupSkip } from "./dedup.js";
import { afterKeyedLock, withKeyedLock } from "../state/keyed-mutex.js";
import { getBindings } from "../runtime/bindings.js";
import { getFinalizeIdleMs, isAutoCompressEnabled } from "../config.js";
import { buildSyntheticCompression } from "./compress-synthetic.js";
import { isCaptureKey, markCaptureEventDeleted } from "../capture/event-record.js";
import { claimBackfillPrompt, isBackfillPrompt, recordLivePrompt } from "../capture/prompt-ledger.js";
import { getSearchIndex, getVectorIndex, scheduleIndexSave, vectorIndexAddGuarded, vectorIndexRemove } from "./search.js";
import { unindexObservationSession } from "../state/obs-index.js";
import { safeAudit } from "./audit.js";
import { getAgentId } from "../config.js";
import { logger } from "../logger.js";
import { saveImageToDisk } from "../utils/image-store.js";
import { withoutObservationSource } from "./observation-source.js";
import { budgetLiveObservationSource } from "./observation-source-budget.js";
import { observationEmbedText } from "../state/memory-utils.js";
import { markCompressionDispatchFailed, pendingCompression } from "./compression-state.js";
import { requestSummaryRefresh } from "./summary-state.js";
import { scheduleSessionFinalize } from "./session-finalize.js";

const DEFAULT_EVICTION_IMPORTANCE = 5;

function byEvictionOrder(a: CompressedObservation, b: CompressedObservation): number {
  const ia = a.importance ?? DEFAULT_EVICTION_IMPORTANCE;
  const ib = b.importance ?? DEFAULT_EVICTION_IMPORTANCE;
  if (ia !== ib) return ia - ib;
  return new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime();
}

function evictionCandidates(existing: CompressedObservation[], incomingId: string): CompressedObservation[] {
  return existing.filter((o) => o?.id && o.id !== incomingId).sort(byEvictionOrder);
}

async function evictForSessionCap(
  sdk: IIIClient,
  kv: StateKV,
  sessionId: string,
  incomingId: string,
  existing: CompressedObservation[],
  cap: number,
): Promise<{ evicted: CompressedObservation[]; needed: number }> {
  const needed = existing.length - cap + 1;
  const candidates = evictionCandidates(existing, incomingId);
  const evicted: CompressedObservation[] = [];
  for (const victim of candidates) {
    if (evicted.length >= needed) break;
    try {
      await markCaptureEventDeleted(kv, victim);
      await kv.delete(KV.observations(sessionId), victim.id);
    } catch (err) {
      logger.warn("Session cap eviction delete failed", {
        sessionId,
        obsId: victim.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    evicted.push(victim);
    getSearchIndex().remove(victim.id);
    vectorIndexRemove(victim.id);
  }
  if (evicted.length === 0) return { evicted, needed };

  scheduleIndexSave();
  const { decrementImageRef } = await import("./image-refs.js");
  for (const victim of evicted) {
    await unindexObservationSession(kv, victim.id).catch(() => {});
    const refs = new Set([victim.imageData, victim.imageRef].filter((r): r is string => typeof r === "string" && r.length > 0));
    for (const ref of refs) {
      await decrementImageRef(kv, sdk, ref).catch((err) => {
        logger.warn("Session cap eviction image ref release failed", {
          sessionId,
          obsId: victim.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }
  await safeAudit(kv, "delete", "mem::observe", evicted.map((o) => o.id), {
    resource: "observation",
    reason: "session_observation_cap",
    sessionId,
    cap,
    evicted: evicted.length,
  });
  logger.warn("Session observation cap reached, evicted lowest-value observations", {
    sessionId,
    cap,
    evicted: evicted.length,
  });
  return { evicted, needed };
}

export function extractImage(d: unknown): string | undefined {
  if (!d) return undefined;
  if (typeof d === "string") {
    if (d.startsWith("data:image/") || d.startsWith("iVBORw0KGgo") || d.startsWith("/9j/")) {
      return d;
    }
    return undefined;
  }
  if (typeof d === "object" && d !== null) {
    const obj = d as Record<string, unknown>;
    if (typeof obj["image_data"] === "string") return obj["image_data"];
    if (typeof obj["image_path"] === "string") return obj["image_path"];
    if (typeof obj["imageBase64"] === "string") return obj["imageBase64"];
    if (typeof obj["imagePath"] === "string") return obj["imagePath"];

    for (const key of Object.keys(obj)) {
      const match = extractImage(obj[key]);
      if (match) return match;
    }
  }
  return undefined;
}

export async function restoreIndexEntries(obs: CompressedObservation): Promise<void> {
  if (typeof obs.title !== "string" || !obs.sessionId) return;
  const search = getSearchIndex();
  if (!search.has(obs.id)) {
    search.add(obs);
    scheduleIndexSave();
  }
  const vectors = getVectorIndex();
  if (vectors && !vectors.has(obs.id)) {
    await vectorIndexAddGuarded(obs.id, obs.sessionId, observationEmbedText(obs), {
      kind: "synthetic",
      logId: obs.id,
    });
  }
}

export function registerObserveFunction(
  sdk: IIIClient,
  kv: StateKV,
  dedupMap?: DedupMap,
  maxObservationsPerSession?: number,
): void {
  sdk.registerFunction("mem::observe", 
    async (payload: HookPayload) => {

      if (
        !payload?.sessionId ||
        typeof payload.sessionId !== "string" ||
        !payload.hookType ||
        typeof payload.hookType !== "string" ||
        !payload.timestamp ||
        typeof payload.timestamp !== "string"
      ) {
        return {
          success: false,
          error:
            "Invalid payload: sessionId, hookType, and timestamp are required",
        };
      }

      const durable =
        typeof payload.observationId === "string" && /^obs_[A-Za-z0-9_]{8,80}$/.test(payload.observationId);
      const obsId = durable ? payload.observationId! : generateId("obs");

      let dedupHash: string | undefined;
      if (dedupMap && typeof payload.eventId !== "string") {
        const dataIsObject =
          typeof payload.data === "object" && payload.data !== null;
        const d = dataIsObject
          ? (payload.data as Record<string, unknown>)
          : {};
        const toolName = (d["tool_name"] as string) || payload.hookType;
        // Hash the full payload when tool_input is absent so distinct
        // events never collapse onto one key.
        const dedupInput =
          d["tool_input"] !== undefined
            ? d["tool_input"]
            : dataIsObject
              ? d
              : payload.data;
        const dedupOutput =
          d["tool_input"] !== undefined
            ? d["tool_response"] ?? d["tool_output"] ?? d["output"] ?? d["error"]
            : undefined;
        dedupHash = dedupMap.computeHash(
          payload.sessionId,
          toolName,
          dedupInput,
          dedupOutput,
        );
        if (dedupMap.isDuplicate(dedupHash)) {
          recordDedupSkip();
          return { deduplicated: true, sessionId: payload.sessionId };
        }
      }

      const serializedData = JSON.stringify(payload.data);
      const sanitizedRaw = serializedData === undefined
        ? undefined
        : scrubRecord(JSON.parse(serializedData), { scrubKeys: true });

      let originChannel: Origin["channel"] = "agent";
      if (payload.hookType === "prompt_submit") originChannel = "user";
      else if (TOOL_HOOKS.has(payload.hookType)) originChannel = "tool";
      const raw: RawObservation = {
        id: obsId,
        sessionId: payload.sessionId,
        timestamp: payload.timestamp,
        hookType: payload.hookType,
        raw: sanitizedRaw,
        origin: {
          channel: originChannel,
          capturedAt: payload.timestamp,
        },
        ...(typeof payload.eventId === "string" ? { eventId: payload.eventId } : {}),
        ...(isCaptureKey(payload.captureKey) ? { captureKey: payload.captureKey } : {}),
      };

      let extractedImage: string | undefined;

      if (typeof sanitizedRaw === "object" && sanitizedRaw !== null) {
        const d = sanitizedRaw as Record<string, unknown>;
        if (TOOL_HOOKS.has(payload.hookType)) {
          raw.toolName = d["tool_name"] as string | undefined;
          raw.toolInput = d["tool_input"];
          raw.toolOutput = d["tool_output"] ?? d["error"];
          if (raw.origin && raw.toolName) raw.origin.detail = raw.toolName;
        }
        if (payload.hookType === "prompt_submit") {
          raw.userPrompt = d["prompt"] as string | undefined;
        }
        if (payload.hookType === "stop") {
          const response = d["assistant_response"] ?? d["last_assistant_message"] ?? d["response"];
          if (typeof response === "string") raw.assistantResponse = response;
          const originalBytes = d["last_assistant_message_bytes"];
          if (typeof originalBytes === "number" && Number.isSafeInteger(originalBytes) && originalBytes >= 0) {
            raw.assistantResponseBytes = originalBytes;
          }
        }

        extractedImage = extractImage(sanitizedRaw);
        if (extractedImage) {
          raw.modality = (raw.toolInput || raw.toolOutput || raw.userPrompt) ? "mixed" : "image";
        }
      } else if (typeof sanitizedRaw === "string") {
        extractedImage = extractImage(sanitizedRaw);
        if (extractedImage) {
          raw.modality = "image";
        }
      }

      const pendingImageData = extractedImage;
      const submittedPrompt =
        payload.hookType === "prompt_submit" && typeof raw.userPrompt === "string" ? raw.userPrompt : undefined;
      const backfillPrompt = submittedPrompt && isBackfillPrompt(payload.data) ? submittedPrompt : undefined;
      const livePrompt = submittedPrompt && !backfillPrompt ? submittedPrompt : undefined;
      const promptRef = durable || typeof payload.eventId !== "string" ? obsId : payload.eventId;

      return withKeyedLock(`obs:${payload.sessionId}`, async () => {
        const existing = await kv.list<CompressedObservation>(KV.observations(payload.sessionId));
        const stored = durable ? existing.find((o) => o?.id === obsId) : undefined;
        if (stored) {
          if (livePrompt) await recordLivePrompt(kv, payload.sessionId, livePrompt, promptRef);
          await restoreIndexEntries(stored);
          return { observationId: obsId, deduplicated: true, existing: true };
        }
        if (backfillPrompt && (await claimBackfillPrompt(kv, payload.sessionId, backfillPrompt, promptRef))) {
          recordDedupSkip();
          return { deduplicated: true, sessionId: payload.sessionId };
        }

        // Existing session is the source of truth for agentId (even
        // undefined). Env AGENT_ID only fires when no session row
        // exists yet — otherwise an unscoped session would get
        // retroactively scoped by a later AGENT_ID export.
        const existingSession = await kv.get<{
          agentId?: string;
          observationCount?: number;
          firstPrompt?: string;
          status?: Session["status"];
        }>(KV.sessions, payload.sessionId);
        const inheritedAgentId = existingSession
          ? existingSession.agentId
          : getAgentId();
        if (inheritedAgentId) {
          raw.agentId = inheritedAgentId;
        }

        if (pendingImageData && (pendingImageData.startsWith("data:image/") || pendingImageData.startsWith("iVBORw0KGgo") || pendingImageData.startsWith("/9j/"))) {
          const { filePath, bytesWritten } = await saveImageToDisk(pendingImageData);
          raw.imageData = filePath;
          const { incrementImageRef } = await import("./image-refs.js");
          await incrementImageRef(kv, filePath);
          sdk.trigger({
            function_id: "mem::disk-size-delta",
            payload: { deltaBytes: bytesWritten },
            action: TriggerAction.Void(),
          });
          if (process.env["AGENTMEMORY_IMAGE_EMBEDDINGS"] === "true") {
            sdk.trigger({
              function_id: "mem::vision-embed",
              payload: {
                imageRef: filePath,
                sessionId: payload.sessionId,
                observationId: obsId,
              },
              action: TriggerAction.Void(),
            });
          }
        }

        const autoCompress = isAutoCompressEnabled();
        const finalizeIdleMs = getFinalizeIdleMs();
        if (existingSession && existingSession.status !== "active") {
          const dueAt = Date.now() + finalizeIdleMs;
          await requestSummaryRefresh(kv, payload.sessionId, dueAt);
          if (finalizeIdleMs > 0) await scheduleSessionFinalize(kv, payload.sessionId, dueAt);
        }
        const cap = maxObservationsPerSession && maxObservationsPerSession > 0 ? maxObservationsPerSession : 0;
        const plannedVictims = cap > 0 && existing.length >= cap
          ? evictionCandidates(existing, obsId).slice(0, existing.length - cap + 1)
          : [];
        const plannedIds = new Set(plannedVictims.map((o) => o.id));
        const unbudgeted = buildSyntheticCompression(raw);
        const synthetic = budgetLiveObservationSource(unbudgeted, existing.filter((o) => !plannedIds.has(o?.id)));
        if (autoCompress) synthetic.compression = pendingCompression();
        try {
          await kv.set(KV.observations(payload.sessionId), obsId, synthetic);
          await indexObservationSession(kv, obsId, payload.sessionId).catch(
            (err) => {
              logger.warn("observation index update failed", {
                obsId,
                sessionId: payload.sessionId,
                error: err instanceof Error ? err.message : String(err),
              });
            },
          );

        } catch (error) {
          if (raw.imageData) {
            // Roll back the ref taken above. decrementImageRef deletes the file
            // only when no other observation still references it (deduped images
            // survive) and emits the disk-size delta itself — deleting the file
            // directly here would orphan shared images and leave a stale ref.
            // If the rollback itself fails, log it but still surface the
            // original write error (the more useful failure to diagnose).
            try {
              const { decrementImageRef } = await import("./image-refs.js");
              await decrementImageRef(kv, sdk, raw.imageData);
            } catch (rollbackError) {
              logger.error("Failed to roll back image ref after observation write failure", {
                imageRef: raw.imageData,
                error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
              });
            }
          }
          throw error;
        }

        let evictedCount = 0;
        if (plannedVictims.length > 0) {
          const { evicted, needed } = await evictForSessionCap(
            sdk,
            kv,
            payload.sessionId,
            obsId,
            existing,
            cap,
          );
          evictedCount = evicted.length;
          if (evicted.length < needed) {
            logger.warn("Session observation cap eviction freed fewer slots than needed", {
              sessionId: payload.sessionId,
              cap,
              evicted: evicted.length,
              needed,
            });
          }
          const evictedIds = new Set(evicted.map((o) => o.id));
          if (plannedVictims.some((o) => !evictedIds.has(o.id))) {
            const retained = existing.filter((o) => !evictedIds.has(o?.id));
            const rebudgeted = budgetLiveObservationSource(unbudgeted, retained);
            if (JSON.stringify(rebudgeted.source) !== JSON.stringify(synthetic.source)) {
              if (rebudgeted.source) synthetic.source = rebudgeted.source;
              else delete synthetic.source;
              await kv.set(KV.observations(payload.sessionId), obsId, synthetic).catch((err) => {
                logger.warn("Session cap source re-budget write failed", {
                  sessionId: payload.sessionId,
                  obsId,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }
          }
        }

        if (dedupMap && dedupHash) {
          dedupMap.record(dedupHash);
        }
        if (livePrompt) await recordLivePrompt(kv, payload.sessionId, livePrompt, promptRef);

        emitLiveEvent({
          id: `raw-${obsId}`,
          type: "raw_observation",
          data: { type: "raw", observation: raw, sessionId: payload.sessionId },
        });

        const session = existingSession;
        if (session) {
          const updates: Array<{ type: "set" | "remove"; path: string; value?: unknown }> = [
            { type: "set", path: "updatedAt", value: new Date().toISOString() },
            {
              type: "set",
              path: "observationCount",
              value: Math.max(1, (session.observationCount || 0) + 1 - evictedCount),
            },
          ];
          if (session.status !== "active" && finalizeIdleMs > 0) {
            updates.push({ type: "set", path: "status", value: "active" });
            updates.push({ type: "remove", path: "endedAt" });
          }
          if (!session.firstPrompt && typeof raw.userPrompt === "string") {
            const trimmed = raw.userPrompt.replace(/\s+/g, " ").trim();
            if (trimmed.length > 0) {
              updates.push({
                type: "set",
                path: "firstPrompt",
                value: trimmed.slice(0, 200),
              });
            }
          }
          await kv.update(KV.sessions, payload.sessionId, updates);
        } else if (
          typeof payload.project === "string" &&
          payload.project.trim().length > 0 &&
          typeof payload.cwd === "string" &&
          payload.cwd.trim().length > 0
        ) {
          // OpenCode (and any plugin that skips POST /session/start)
          // can fire observations before the session record exists. Without
          // an implicit create, those observations stack up but
          // `memory_sessions` never lists them, and summarize bails with
          // "Session not found for summarize". Create the session now from
          // the observation payload — but only when project + cwd are
          // present (HookPayload contract). Older test payloads without
          // those fields keep their original no-op behaviour.
          const trimmedPrompt =
            typeof raw.userPrompt === "string"
              ? raw.userPrompt.replace(/\s+/g, " ").trim().slice(0, 200)
              : undefined;
          const ts = new Date().toISOString();
          const startedAt = payload.timestamp ?? ts;
          await kv.set(KV.sessions, payload.sessionId, {
            id: payload.sessionId,
            project: payload.project,
            cwd: payload.cwd,
            startedAt,
            updatedAt: ts,
            status: "active",
            observationCount: 1,
            ...(inheritedAgentId ? { agentId: inheritedAgentId } : {}),
            ...(trimmedPrompt && trimmedPrompt.length > 0
              ? { firstPrompt: trimmedPrompt }
              : {}),
          });
          await addSessionToProjectIndex(kv, payload.project, {
            id: payload.sessionId,
            startedAt,
            ...(inheritedAgentId ? { agentId: inheritedAgentId } : {}),
          }).catch((err) => {
            logger.warn("session index update failed", {
              sessionId: payload.sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        getSearchIndex().add(synthetic);
        scheduleIndexSave();
        await vectorIndexAddGuarded(
          synthetic.id,
          synthetic.sessionId,
          observationEmbedText(synthetic),
          { kind: "synthetic", logId: synthetic.id },
        );
        emitLiveEvent({
          id: `compressed-${obsId}`,
          type: "compressed_observation",
          data: {
            type: "compressed",
            observation: withoutObservationSource(synthetic),
            sessionId: payload.sessionId,
          },
        });

        if (autoCompress && !getBindings(sdk).observing("mem::compress")) {
          afterKeyedLock(`obs:${payload.sessionId}`, async () => {
            try {
              await sdk.trigger({
                function_id: "mem::compress",
                payload: { observationId: obsId, sessionId: payload.sessionId },
                action: TriggerAction.Void(),
              });
            } catch {
              await markCompressionDispatchFailed(kv, synthetic);
            }
          });
        }

        logger.info("Observation captured", {
          obsId,
          sessionId: payload.sessionId,
          hook: payload.hookType,
          compress: autoCompress ? "llm" : "synthetic",
        });
        return { observationId: obsId, sessionId: payload.sessionId };
      });
    },
  );
}
