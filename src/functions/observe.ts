import type { ISdk } from "iii-sdk";
import type { RawObservation, CompressedObservation, HookPayload, Session } from "../types.js";
import { KV, STREAM, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { stripPrivateData } from "./privacy.js";
import { DedupMap } from "./dedup.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { isAutoCompressEnabled } from "../config.js";
import { buildSyntheticCompression } from "./compress-synthetic.js";
import {
  getSearchIndex,
  scheduleIndexSave,
  vectorIndexAddGuarded,
} from "./search.js";
import { getAgentId } from "../config.js";
import { logger } from "../logger.js";
import { saveImageToDisk } from "../utils/image-store.js";
import { safeAudit } from "./audit.js";
import { triggerDetached } from "../utils/trigger-detached.js";
import { shouldSemanticallyIndexObservation } from "../state/indexing-policy.js";
import {
  normalizeSessionContextValues,
  SESSION_CONTEXT_STRING_FIELDS,
} from "./session-context-values.js";
import { captureRetrievalAttribution } from "../state/provenance.js";

const SESSION_CONTEXT_FIELDS = ["project", "cwd", ...SESSION_CONTEXT_STRING_FIELDS] as const;

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

export function registerObserveFunction(
  sdk: ISdk,
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

      const requestedObservationId =
        typeof payload.observationId === "string" &&
        /^obs_[a-z0-9_]{1,96}$/i.test(payload.observationId.trim())
          ? payload.observationId.trim()
          : undefined;
      const obsId = requestedObservationId ?? generateId("obs");

      let dedupHash: string | undefined;
      if (dedupMap) {
        const d =
          typeof payload.data === "object" && payload.data !== null
            ? (payload.data as Record<string, unknown>)
            : {};
        const toolName = (d["tool_name"] as string) || payload.hookType;
        dedupHash = dedupMap.computeHash(
          payload.sessionId,
          toolName,
          d["tool_input"],
        );
      }

      let sanitizedRaw: unknown = payload.data;
      try {
        const jsonStr = JSON.stringify(payload.data);
        const sanitized = stripPrivateData(jsonStr);
        sanitizedRaw = JSON.parse(sanitized);
      } catch {
        sanitizedRaw = stripPrivateData(String(payload.data));
      }

      const normalizedContext = normalizeSessionContextValues(
        payload as unknown as Record<string, unknown>,
      );

      const raw: RawObservation = {
        id: obsId,
        sessionId: payload.sessionId,
        timestamp: payload.timestamp,
        hookType: payload.hookType,
        raw: sanitizedRaw,
      };

      let extractedImage: string | undefined;

      if (typeof sanitizedRaw === "object" && sanitizedRaw !== null) {
        const d = sanitizedRaw as Record<string, unknown>;
        if (
          payload.hookType === "post_tool_use" ||
          payload.hookType === "post_tool_failure"
        ) {
          raw.toolName = d["tool_name"] as string | undefined;
          raw.toolInput = d["tool_input"];
          raw.toolOutput = d["tool_output"] || d["error"];
        }
        if (payload.hookType === "prompt_submit") {
          raw.userPrompt = d["prompt"] as string | undefined;
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

      return withKeyedLock(`obs:${payload.sessionId}`, async () => {
        const observationScope = KV.observations(payload.sessionId);
        const existingObservation = requestedObservationId
          ? await kv.get<RawObservation | CompressedObservation>(
              observationScope,
              obsId,
            )
          : null;
        if (existingObservation && "title" in existingObservation) {
          return {
            observationId: obsId,
            deduplicated: true,
            durableRetry: true,
          };
        }
        if (existingObservation) {
          Object.assign(raw, existingObservation);
        }
        if (
          !existingObservation &&
          dedupMap &&
          dedupHash &&
          dedupMap.isDuplicate(dedupHash)
        ) {
          return { deduplicated: true, sessionId: payload.sessionId };
        }

        if (maxObservationsPerSession && maxObservationsPerSession > 0) {
          const existing = await kv.list(observationScope);
          if (
            !existingObservation &&
            existing.length >= maxObservationsPerSession
          ) {
            return {
              success: false,
              error: `Session observation limit reached (${maxObservationsPerSession})`,
            };
          }
        }

        // Existing session is the source of truth for agentId (even
        // undefined). Env AGENT_ID only fires when no session row
        // exists yet — otherwise an unscoped session would get
        // retroactively scoped by a later AGENT_ID export.
        const existingSession = await kv.get<Session>(
          KV.sessions,
          payload.sessionId,
        );
        const inheritedAgentId = existingSession
          ? existingSession.agentId
          : getAgentId();
        if (inheritedAgentId) {
          raw.agentId = inheritedAgentId;
        }
        if (!raw.attribution) {
          const project =
            typeof payload.project === "string" && payload.project.trim()
              ? payload.project.trim()
              : existingSession?.project;
          const aliases = new Set([
            ...(existingSession?.projectAliases ?? []),
            ...(normalizedContext.projectAliases ?? []),
          ]);
          if (existingSession?.project && existingSession.project !== project) {
            aliases.add(existingSession.project);
          }
          aliases.delete(project ?? "");
          raw.attribution = captureRetrievalAttribution({
            ...(existingSession ?? {}),
            ...normalizedContext,
            ...(project ? { project } : {}),
            ...(aliases.size > 0 ? { projectAliases: [...aliases] } : {}),
          });
        }

        if (
          !existingObservation &&
          pendingImageData &&
          (pendingImageData.startsWith("data:image/") ||
            pendingImageData.startsWith("iVBORw0KGgo") ||
            pendingImageData.startsWith("/9j/"))
        ) {
          const { filePath, bytesWritten } = await saveImageToDisk(pendingImageData);
          raw.imageData = filePath;
          const { incrementImageRef } = await import("./image-refs.js");
          await incrementImageRef(kv, filePath);
          triggerDetached(sdk, {
            function_id: "mem::disk-size-delta",
            payload: { deltaBytes: bytesWritten },
          });
          if (process.env["AGENTMEMORY_IMAGE_EMBEDDINGS"] === "true") {
            triggerDetached(sdk, {
              function_id: "mem::vision-embed",
              payload: {
                imageRef: filePath,
                sessionId: payload.sessionId,
                observationId: obsId,
              },
            });
          }
        }

        try {
          if (!existingObservation) {
            await kv.set(observationScope, obsId, raw);
          }
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

        if (!existingObservation && dedupMap && dedupHash) {
          dedupMap.record(dedupHash);
        }

        if (!existingObservation) {
          await sdk.trigger({
            function_id: "stream::set",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.group(payload.sessionId),
              item_id: obsId,
              data: { type: "raw", observation: raw },
            },
          });

          triggerDetached(sdk, {
            function_id: "stream::send",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.viewerGroup,
              id: `raw-${obsId}`,
              type: "raw_observation",
              data: { type: "raw", observation: raw, sessionId: payload.sessionId },
            },
          });
        }

        const contextValues = {
          ...normalizedContext,
          project: payload.project,
          cwd: payload.cwd,
        };
        const session = existingSession;
        if (session) {
          const updatedAt = new Date().toISOString();
          const changedContext: string[] = [];
          const updates: Array<{ type: "set"; path: string; value: unknown }> = [
            { type: "set", path: "updatedAt", value: updatedAt },
            {
              type: "set",
              path: "observationCount",
              value: requestedObservationId
                ? (await kv.list(observationScope)).length
                : (session.observationCount || 0) + 1,
            },
          ];
          for (const field of SESSION_CONTEXT_FIELDS) {
            const value = contextValues[field];
            if (typeof value !== "string" || !value.trim()) continue;
            const normalized = value.trim();
            if (session[field] === normalized) continue;
            updates.push({ type: "set", path: field, value: normalized });
            changedContext.push(field);
          }
          if (changedContext.includes("project") || normalizedContext.projectAliases) {
            const aliases = new Set(session.projectAliases ?? []);
            if (changedContext.includes("project") && session.project) {
              aliases.add(session.project);
            }
            for (const alias of normalizedContext.projectAliases ?? []) aliases.add(alias);
            aliases.delete(
              typeof contextValues.project === "string" && contextValues.project.trim()
                ? contextValues.project.trim()
                : session.project,
            );
            const nextAliases = [...aliases].sort();
            if (JSON.stringify(nextAliases) !== JSON.stringify(session.projectAliases ?? [])) {
              updates.push({
                type: "set",
                path: "projectAliases",
                value: nextAliases,
              });
              changedContext.push("projectAliases");
            }
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
          if (changedContext.length > 0) {
            await safeAudit(
              kv,
              "session_context_update",
              "mem::observe",
              [payload.sessionId],
              { changed: changedContext },
            );
          }
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
          await kv.set(KV.sessions, payload.sessionId, {
            id: payload.sessionId,
            project: payload.project,
            cwd: payload.cwd,
            ...normalizedContext,
            startedAt: payload.timestamp ?? ts,
            updatedAt: ts,
            status: "active",
            observationCount: 1,
            ...(inheritedAgentId ? { agentId: inheritedAgentId } : {}),
            ...(trimmedPrompt && trimmedPrompt.length > 0
              ? { firstPrompt: trimmedPrompt }
              : {}),
          });
        }

        // Per-observation LLM compression is opt-in as of 0.8.8.
        // Default path: build a zero-LLM synthetic compression so recall
        // and BM25 search still work without burning the user's Claude
        // token allocation on every tool invocation.
        if (isAutoCompressEnabled()) {
          triggerDetached(
            sdk,
            {
              function_id: "mem::compress",
              payload: {
                observationId: obsId,
                sessionId: payload.sessionId,
                raw,
              },
            },
            { sessionId: payload.sessionId, observationId: obsId },
          );
        } else {
          const synthetic = buildSyntheticCompression(raw);
          await kv.set(
            KV.observations(payload.sessionId),
            obsId,
            synthetic,
          );
          getSearchIndex().add(synthetic);
          scheduleIndexSave();
          if (shouldSemanticallyIndexObservation(synthetic)) {
            await vectorIndexAddGuarded(
              synthetic.id,
              synthetic.sessionId,
              synthetic.title + " " + (synthetic.narrative || ""),
              { kind: "synthetic", logId: synthetic.id },
            );
          }
          await sdk.trigger({
            function_id: "stream::set",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.group(payload.sessionId),
              item_id: obsId,
              data: { type: "compressed", observation: synthetic },
            },
          });
          triggerDetached(sdk, {
            function_id: "stream::send",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.viewerGroup,
              id: `compressed-${obsId}`,
              type: "compressed_observation",
              data: {
                type: "compressed",
                observation: synthetic,
                sessionId: payload.sessionId,
              },
            },
          });
        }

        logger.info("Observation captured", {
          obsId,
          sessionId: payload.sessionId,
          hook: payload.hookType,
          compress: isAutoCompressEnabled() ? "llm" : "synthetic",
        });
        return { observationId: obsId };
      });
    },
  );
}
