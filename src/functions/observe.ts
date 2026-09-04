import { TriggerAction, type ISdk } from "iii-sdk";
import type { RawObservation, HookPayload, Origin, Session } from "../types.js";
import { TELEMETRY_HOOKS } from "../types.js";

const TOOL_HOOKS = new Set(["pre_tool_use", "post_tool_use", "post_tool_failure"]);

function extractStringFiles(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
      if (out.length >= cap) break;
    }
  }
  return out;
}

import { KV, STREAM, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { stripPrivateData } from "./privacy.js";
import { DedupMap } from "./dedup.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { isAutoCompressEnabled } from "../config.js";
import { buildSyntheticCompression } from "./compress-synthetic.js";
import { getSearchIndex, vectorIndexAddGuarded } from "./search.js";
import { getAgentId } from "../config.js";
import { logger } from "../logger.js";
import { saveImageToDisk } from "../utils/image-store.js";

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

      if (payload.hookType === "assistant_message") {
        return withKeyedLock(`obs:${payload.sessionId}`, async () => {
          const d =
            typeof payload.data === "object" && payload.data !== null
              ? (payload.data as Record<string, any>)
              : {};
          const inputTokens =
            Number(d?.tokens?.input) || Number(d?.input_tokens) || 0;
          const outputTokens =
            Number(d?.tokens?.output) || Number(d?.output_tokens) || 0;
          const reasoningTokens =
            Number(d?.tokens?.reasoning) || Number(d?.reasoning_tokens) || 0;
          const cacheRead =
            Number(d?.tokens?.cache_read) || Number(d?.tokens?.cacheRead) || 0;
          const cacheWrite =
            Number(d?.tokens?.cache_write) || Number(d?.tokens?.cacheWrite) || 0;
          const cost = Number(d?.cost) || 0;
          const durationMs =
            Number(d?.duration_ms) || Number(d?.durationMs) || 0;
          const modelId =
            typeof d?.modelID === "string"
              ? d.modelID
              : typeof d?.model === "string"
                ? d.model
                : "unknown";

          let session = await kv.get<Session>(
            KV.sessions,
            payload.sessionId,
          );
          if (!session) {
            const proj =
              typeof payload.project === "string" && payload.project.trim().length > 0
                ? payload.project.trim()
                : "default";
            const cwd =
              typeof payload.cwd === "string" && payload.cwd.trim().length > 0
                ? payload.cwd.trim()
                : (typeof process !== "undefined" && typeof process.cwd === "function"
                    ? process.cwd()
                    : ".");
            session = {
              id: payload.sessionId,
              project: proj,
              cwd,
              startedAt: payload.timestamp,
              status: "active",
              observationCount: 0,
            };
            await kv.set(KV.sessions, payload.sessionId, session);
          }
          if (session) {
            const metrics = session.metrics || {
              tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              cost: 0,
              durationMs: 0,
              turnCount: 0,
              models: {},
            };
            metrics.tokens.input += inputTokens;
            metrics.tokens.output += outputTokens;
            metrics.tokens.reasoning += reasoningTokens;
            metrics.tokens.cacheRead += cacheRead;
            metrics.tokens.cacheWrite += cacheWrite;
            metrics.cost = Math.round((metrics.cost + cost) * 1e6) / 1e6;
            metrics.durationMs += durationMs;
            metrics.turnCount += 1;
            metrics.models[modelId] =
              (metrics.models[modelId] || 0) + 1;

            await kv.update(KV.sessions, payload.sessionId, [
              { type: "set", path: "metrics", value: metrics },
              { type: "set", path: "updatedAt", value: new Date().toISOString() },
            ]);
          }
          return {
            success: true,
            sessionId: payload.sessionId,
            telemetry: true,
          };
        });
      }

      const obsId = generateId("obs");

      let dedupHash: string | undefined;
      if (dedupMap) {
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
        dedupHash = dedupMap.computeHash(
          payload.sessionId,
          toolName,
          dedupInput,
        );
        if (dedupMap.isDuplicate(dedupHash)) {
          return { deduplicated: true, sessionId: payload.sessionId };
        }
      }

      let sanitizedRaw: unknown = payload.data;
      try {
        const jsonStr = JSON.stringify(payload.data);
        const sanitized = stripPrivateData(jsonStr);
        sanitizedRaw = JSON.parse(sanitized);
      } catch {
        sanitizedRaw = stripPrivateData(String(payload.data));
      }

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
          if (raw.origin && raw.toolName) raw.origin.detail = raw.toolName;
        }
        if (payload.hookType === "prompt_submit") {
          raw.userPrompt = d["prompt"] as string | undefined;
          const promptFiles = extractStringFiles(d["files"], 20);
          if (promptFiles.length > 0) raw.files = promptFiles;
        }
        if (payload.hookType === "patch_applied") {
          const files = extractStringFiles(d["files"], 50);
          raw.files = files;
          raw.title = `Applied patch to ${files.length} file(s)`;
          if (files.length > 0) {
            raw.toolInput = files.join(", ");
          }
        }
        if (payload.hookType === "command_executed") {
          const nameVal = d["name"] ?? d["tool_name"];
          const isStringName = typeof nameVal === "string";
          const name = isStringName ? nameVal : undefined;
          if (name) {
            raw.toolName = name;
            if (raw.origin) raw.origin.detail = name;
          } else if (nameVal !== undefined && nameVal !== null) {
            raw.toolName = String(nameVal);
          }
          const args = d["arguments"] ?? d["tool_input"];
          if (args !== undefined && args !== null) {
            const s = String(args);
            if (s.length > 0) raw.toolInput = s.length > 2000 ? s.slice(0, 2000) : s;
          }
          const titleName = isStringName ? nameVal : String(nameVal ?? "unknown");
          raw.title = `Executed command: ${titleName}`;
        }
        if (payload.hookType === "subagent_start") {
          const desc = typeof d["description"] === "string" ? d["description"] : undefined;
          const agent = typeof d["agent"] === "string" ? d["agent"] : undefined;
          const promptVal = typeof d["prompt"] === "string" ? d["prompt"] : undefined;
          let titleSeed: string | undefined = desc || agent;
          if (!titleSeed && promptVal) titleSeed = promptVal.slice(0, 120);
          if (!titleSeed) titleSeed = "unknown";
          raw.title = `Started subagent: ${titleSeed}`;
          if (promptVal !== undefined) {
            raw.toolInput = promptVal.length > 4000 ? promptVal.slice(0, 4000) : promptVal;
          } else if (d["prompt"] !== undefined && d["prompt"] !== null) {
            const s = String(d["prompt"]);
            raw.toolInput = s.length > 4000 ? s.slice(0, 4000) : s;
          }
          if (raw.toolName === undefined && agent) {
            raw.toolName = agent;
            if (raw.origin) raw.origin.detail = agent;
          }
        }
        if (payload.hookType === "task_completed") {
          const completed = d["completed"];
          const completedLen = Array.isArray(completed) ? completed.length : 0;
          let total = 0;
          if (typeof d["total"] === "number") total = d["total"];
          else if (typeof d["total"] === "string") total = Number(d["total"]) || 0;
          raw.title =
            typeof d["title"] === "string"
              ? d["title"]
              : (completed !== undefined || d["total"] !== undefined)
                ? `Task completed: ${completedLen}/${total} items`
                : "Task completed";
          if (Array.isArray(completed)) {
            const contents = (completed as unknown[])
              .map((item) => {
                if (item && typeof item === "object" && typeof (item as Record<string, unknown>).content === "string") {
                  return (item as Record<string, unknown>).content as string;
                }
                return "";
              })
              .filter(Boolean)
              .join("; ");
            if (contents.length > 0) raw.toolInput = contents.slice(0, 4000);
            else if (completedLen > 0) raw.toolInput = `${completedLen} items`;
          }
        }
        if (TELEMETRY_HOOKS.has(payload.hookType)) {
          raw.isTelemetry = true;
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
        if (maxObservationsPerSession && maxObservationsPerSession > 0) {
          const existing = await kv.list(KV.observations(payload.sessionId));
          if (existing.length >= maxObservationsPerSession) {
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
        const existingSession = await kv.get<{
          agentId?: string;
          observationCount?: number;
          firstPrompt?: string;
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

        try {

          await kv.set(KV.observations(payload.sessionId), obsId, raw);

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

        if (dedupMap && dedupHash) {
          dedupMap.record(dedupHash);
        }

        await sdk.trigger({
          function_id: "stream::set",
          payload: {
          stream_name: STREAM.name,
          group_id: STREAM.group(payload.sessionId),
          item_id: obsId,
          data: { type: "raw", observation: raw },
          },
        });

        await sdk.trigger({
          function_id: "stream::send",
          payload: {
            stream_name: STREAM.name,
            group_id: STREAM.viewerGroup,
            id: `raw-${obsId}`,
            type: "raw_observation",
            data: { type: "raw", observation: raw, sessionId: payload.sessionId },
          },
          action: TriggerAction.Void(),
        });

        const session = existingSession;
        if (session) {
          const updates: Array<{ type: "set"; path: string; value: unknown }> = [
            { type: "set", path: "updatedAt", value: new Date().toISOString() },
            {
              type: "set",
              path: "observationCount",
              value: (session.observationCount || 0) + 1,
            },
          ];
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
          await kv.set(KV.sessions, payload.sessionId, {
            id: payload.sessionId,
            project: payload.project,
            cwd: payload.cwd,
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
        const isClassA =
          payload.hookType === "command_executed" ||
          payload.hookType === "patch_applied" ||
          payload.hookType === "subagent_start" ||
          payload.hookType === "task_completed";
        const lacksSubstantiveContent =
          !raw.toolName &&
          !raw.toolInput &&
          !raw.toolOutput &&
          !raw.userPrompt &&
          !(raw as any).content;
        const shouldUseSynthetic = isClassA || lacksSubstantiveContent;

        if (isAutoCompressEnabled() && !shouldUseSynthetic) {
          await sdk.trigger({
            function_id: "mem::compress",
            payload: {
              observationId: obsId,
              sessionId: payload.sessionId,
              raw,
            },
            action: TriggerAction.Void(),
          });
        } else {
          const synthetic = buildSyntheticCompression(raw);
          if (raw.toolName) (synthetic as any).toolName = raw.toolName;
          if (raw.toolInput) {
            const inputVal = raw.toolInput;
            if (typeof inputVal === "string") {
              (synthetic as any).toolInput =
                inputVal.length > 4000
                  ? inputVal.slice(0, 4000) + "\n[...truncated for memory storage]"
                  : inputVal;
            } else {
              (synthetic as any).toolInput = inputVal;
            }
          }
          if (raw.files) {
            (synthetic as any).files = Array.isArray(raw.files)
              ? raw.files.slice(0, 50)
              : raw.files;
          }
          if (raw.title) (synthetic as any).title = raw.title;
          await kv.set(
            KV.observations(payload.sessionId),
            obsId,
            synthetic,
          );
          getSearchIndex().add(synthetic);
          await vectorIndexAddGuarded(
            synthetic.id,
            synthetic.sessionId,
            synthetic.title + " " + (synthetic.narrative || ""),
            { kind: "synthetic", logId: synthetic.id },
          );
          await sdk.trigger({
            function_id: "stream::set",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.group(payload.sessionId),
              item_id: obsId,
              data: { type: "compressed", observation: synthetic },
            },
          });
          await sdk.trigger({
            function_id: "stream::set",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.viewerGroup,
              item_id: obsId,
              data: {
                type: "compressed",
                observation: synthetic,
                sessionId: payload.sessionId,
              },
            },
          });
          await sdk.trigger({
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
            action: TriggerAction.Void(),
          });
        }

        logger.info("Observation captured", {
          obsId,
          sessionId: payload.sessionId,
          hook: payload.hookType,
          compress: isAutoCompressEnabled() ? "llm" : "synthetic",
        });
        return {
          success: true,
          observationId: obsId,
          sessionId: payload.sessionId,
          ...(payload.hookType === "assistant_message" ? { telemetry: true } : {}),
        };
      });
    },
  );
}
