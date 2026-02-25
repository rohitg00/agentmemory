import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { RawObservation, HookPayload, Session } from "../types.js";
import { KV, STREAM, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { stripPrivateData } from "./privacy.js";

export function registerObserveFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::observe",
      description: "Capture and store a tool-use observation",
    },
    async (payload: HookPayload) => {
      const ctx = getContext();
      const obsId = generateId("obs");
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

      if (typeof payload.data === "object" && payload.data !== null) {
        const d = payload.data as Record<string, unknown>;
        if (payload.hookType === "post_tool_use") {
          raw.toolName = d["tool_name"] as string | undefined;
          raw.toolInput = d["tool_input"];
          raw.toolOutput = d["tool_output"];
        }
        if (payload.hookType === "prompt_submit") {
          raw.userPrompt = d["prompt"] as string | undefined;
        }
      }

      await kv.set(KV.observations(payload.sessionId), obsId, raw);

      await sdk.trigger("stream::set", {
        stream_name: STREAM.name,
        group_id: STREAM.group(payload.sessionId),
        item_id: obsId,
        data: { type: "raw", observation: raw },
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
    },
  );
}
