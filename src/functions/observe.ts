import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { RawObservation, HookPayload, Session } from "../types.js";
import { KV, STREAM, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { stripPrivateData } from "./privacy.js";
import { DedupMap } from "./dedup.js";
import { withKeyedLock } from "../state/keyed-mutex.js";

export function registerObserveFunction(
  sdk: ISdk,
  kv: StateKV,
  dedupMap?: DedupMap,
  maxObservationsPerSession?: number,
): void {
  sdk.registerFunction(
    {
      id: "mem::observe",
      description: "Capture and store a tool-use observation",
    },
    async (payload: HookPayload) => {
      const ctx = getContext();

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

      const obsId = generateId("obs");

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

      const raw: RawObservation = {
        id: obsId,
        sessionId: payload.sessionId,
        timestamp: payload.timestamp,
        hookType: payload.hookType,
        raw: sanitizedRaw,
      };

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
      }

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

        await kv.set(KV.observations(payload.sessionId), obsId, raw);

        if (dedupMap && dedupHash) {
          dedupMap.record(dedupHash);
        }

        sdk.triggerVoid("stream::set", {
          stream_name: STREAM.name,
          group_id: STREAM.group(payload.sessionId),
          item_id: obsId,
          data: { type: "raw", observation: raw },
        });

        sdk.triggerVoid("stream::set", {
          stream_name: STREAM.name,
          group_id: STREAM.viewerGroup,
          item_id: obsId,
          data: { type: "raw", observation: raw, sessionId: payload.sessionId },
        });

        const session = await kv.get<Session>(KV.sessions, payload.sessionId);
        if (session) {
          await kv.set(KV.sessions, payload.sessionId, {
            ...session,
            observationCount: (session.observationCount || 0) + 1,
          });
        }

        sdk.triggerVoid("mem::compress", {
          observationId: obsId,
          sessionId: payload.sessionId,
          raw,
        });

        ctx.logger.info("Observation captured", {
          obsId,
          sessionId: payload.sessionId,
          hook: payload.hookType,
        });
        return { observationId: obsId };
      });
    },
  );
}
