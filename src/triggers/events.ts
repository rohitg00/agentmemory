import type { ISdk } from "iii-sdk";
import type { CompressedObservation, HookPayload, Session } from "../types.js";
import { KV, STREAM } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { isReflectEnabled } from "../functions/slots.js";
import { isGraphExtractionEnabled } from "../config.js";
import { logger } from "../logger.js";
import { triggerDetached } from "../utils/trigger-detached.js";
import { lessonAccessContextFromPayload } from "../functions/lesson-access.js";
import type { LessonAccessContext } from "../functions/lesson-access.js";

export function registerEventTriggers(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "event::session::started",
    async (data: {
      sessionId: string;
      project: string;
      cwd: string;
      repoRoot?: string;
      scopeType?: string;
      worktree?: string;
      branch?: string;
      taskSlug?: string;
      accessContext?: unknown;
    }) => {
      const accessContext = lessonAccessContextFromPayload(data.accessContext);
      const startedAt = new Date().toISOString();
      const session: Session = {
        id: data.sessionId,
        project: data.project,
        cwd: data.cwd,
        ...(data.repoRoot ? { repoRoot: data.repoRoot } : {}),
        ...(data.scopeType ? { scopeType: data.scopeType } : {}),
        ...(data.worktree ? { worktree: data.worktree } : {}),
        ...(data.branch ? { branch: data.branch } : {}),
        ...(data.taskSlug ? { taskSlug: data.taskSlug } : {}),
        startedAt,
        updatedAt: startedAt,
        status: "active",
        observationCount: 0,
      };
      await kv.set(KV.sessions, data.sessionId, session);
      const contextResult = await sdk.trigger<
        {
          sessionId: string;
          project: string;
          accessContext: LessonAccessContext;
        },
        { context: string }
      >({
        function_id: "mem::context",
        payload: {
          sessionId: data.sessionId,
          project: data.project,
          accessContext,
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

  sdk.registerFunction("event::session::stopped", async (data: { sessionId: string }) => {
    const summary = await sdk.trigger({
      function_id: "mem::summarize",
      payload: data,
    });
    if (isReflectEnabled()) {
      triggerDetached(
        sdk,
        {
          function_id: "mem::slot-reflect",
          payload: { sessionId: data.sessionId },
        },
        { sessionId: data.sessionId },
      );
    }
    if (isGraphExtractionEnabled()) {
      try {
        const observations = await kv.list<CompressedObservation>(
          KV.observations(data.sessionId),
        );
        const compressed = observations.filter((o) => o.title);
        if (compressed.length > 0) {
          triggerDetached(
            sdk,
            {
              function_id: "mem::graph-extract",
              payload: { observations: compressed },
            },
            { sessionId: data.sessionId },
          );
        }
      } catch (err) {
        logger.warn("graph-extract trigger failed", {
          sessionId: data.sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
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

      triggerDetached(sdk, {
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
