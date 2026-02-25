import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { HookPayload, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerEventTriggers(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "event::session::started",
      description: "Handle session start event",
    },
    async (data: { sessionId: string; project: string; cwd: string }) => {
      const ctx = getContext();
      ctx.logger.info("Session start event", { sessionId: data.sessionId });
      const session: Session = {
        id: data.sessionId,
        project: data.project,
        cwd: data.cwd,
        startedAt: new Date().toISOString(),
        status: "active",
        observationCount: 0,
      };
      await kv.set(KV.sessions, data.sessionId, session);
      const contextResult = await sdk.trigger<
        { sessionId: string; project: string },
        { context: string }
      >("mem::context", { sessionId: data.sessionId, project: data.project });
      return { session, context: contextResult.context };
    },
  );
  sdk.registerTrigger({
    type: "queue",
    function_id: "event::session::started",
    config: { topic: "agentmemory.session.started" },
  });

  sdk.registerFunction(
    { id: "event::observation", description: "Handle new observation event" },
    async (data: HookPayload) => {
      const ctx = getContext();
      ctx.logger.info("Observation event", {
        sessionId: data.sessionId,
        hook: data.hookType,
      });
      return await sdk.trigger("mem::observe", data);
    },
  );
  sdk.registerTrigger({
    type: "queue",
    function_id: "event::observation",
    config: { topic: "agentmemory.observation" },
  });

  sdk.registerFunction(
    {
      id: "event::session::stopped",
      description: "Handle stop event (trigger summarize)",
    },
    async (data: { sessionId: string }) => {
      const ctx = getContext();
      ctx.logger.info("Session stop event, triggering summarize", {
        sessionId: data.sessionId,
      });
      return await sdk.trigger("mem::summarize", data);
    },
  );
  sdk.registerTrigger({
    type: "queue",
    function_id: "event::session::stopped",
    config: { topic: "agentmemory.session.stopped" },
  });

  sdk.registerFunction(
    {
      id: "event::session::ended",
      description: "Handle session end event",
    },
    async (data: { sessionId: string }) => {
      const ctx = getContext();
      ctx.logger.info("Session end event", { sessionId: data.sessionId });
      const session = await kv.get<Session>(KV.sessions, data.sessionId);
      if (session) {
        await kv.set(KV.sessions, data.sessionId, {
          ...session,
          endedAt: new Date().toISOString(),
          status: "completed" as const,
        });
      }
      return { success: true };
    },
  );
  sdk.registerTrigger({
    type: "queue",
    function_id: "event::session::ended",
    config: { topic: "agentmemory.session.ended" },
  });
}
