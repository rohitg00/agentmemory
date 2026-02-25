import type { ISdk } from "iii-sdk";
import type { HookPayload, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerEventTriggers(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "event::session::started" },
    async (data: { sessionId: string; project: string; cwd: string }) => {
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
    { id: "event::observation" },
    async (data: HookPayload) => sdk.trigger("mem::observe", data),
  );
  sdk.registerTrigger({
    type: "queue",
    function_id: "event::observation",
    config: { topic: "agentmemory.observation" },
  });

  sdk.registerFunction(
    { id: "event::session::stopped" },
    async (data: { sessionId: string }) => sdk.trigger("mem::summarize", data),
  );
  sdk.registerTrigger({
    type: "queue",
    function_id: "event::session::stopped",
    config: { topic: "agentmemory.session.stopped" },
  });

  sdk.registerFunction(
    { id: "event::session::ended" },
    async (data: { sessionId: string }) => {
      const session = await kv.get<Session>(KV.sessions, data.sessionId);
      if (session) {
        await kv.set(KV.sessions, data.sessionId, {
          ...session,
          endedAt: new Date().toISOString(),
          status: "completed",
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
