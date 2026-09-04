import { describe, it, expect, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

type ContextHandler = (data: {
  sessionId: string;
  project: string;
  budget?: number;
}) => Promise<{ context: string; blocks: number; tokens: number }>;

function wireContext(kv: ReturnType<typeof mockKV>, budget = 4000) {
  let handler: ContextHandler | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, cb: ContextHandler) => {
      if (id === "mem::context") handler = cb;
    }),
  } as unknown as import("iii-sdk").ISdk;
  registerContextFunction(sdk, kv as never, budget);
  if (!handler) throw new Error("mem::context not registered");
  return handler;
}

describe("mem::context — observation fallback and telemetry exclusion", () => {
  it("filters out telemetry observations and avoids dangling colons on empty narratives", async () => {
    const kv = mockKV();
    const handler = wireContext(kv);

    const prevSession: Session = {
      id: "ses_prev1",
      project: "/tmp/test-project",
      cwd: "/tmp/test-project",
      startedAt: new Date(Date.now() - 60000).toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      observationCount: 4,
    };
    await kv.set(KV.sessions, prevSession.id, prevSession);

    const obsList: CompressedObservation[] = [
      {
        id: "obs_task",
        sessionId: "ses_prev1",
        timestamp: new Date().toISOString(),
        type: "task",
        title: "Build feature",
        narrative: "Completed implementation of feature",
        facts: [],
        concepts: [],
        files: [],
        importance: 8,
      },
      {
        id: "obs_telemetry_status",
        sessionId: "ses_prev1",
        timestamp: new Date().toISOString(),
        type: "other",
        title: "session_status",
        narrative: "",
        facts: [],
        concepts: [],
        files: [],
        importance: 5,
        isTelemetry: true,
      },
      {
        id: "obs_telemetry_reasoning",
        sessionId: "ses_prev1",
        timestamp: new Date().toISOString(),
        type: "other",
        title: "reasoning",
        narrative: "",
        facts: [],
        concepts: [],
        files: [],
        importance: 5,
        isTelemetry: true,
      },
      {
        id: "obs_no_narrative",
        sessionId: "ses_prev1",
        timestamp: new Date().toISOString(),
        type: "command_run",
        title: "git status",
        narrative: "",
        facts: [],
        concepts: [],
        files: [],
        importance: 6,
      },
    ];

    for (const obs of obsList) {
      await kv.set(KV.observations("ses_prev1"), obs.id, obs);
    }

    const result = await handler({
      sessionId: "ses_current",
      project: "/tmp/test-project",
    });

    // Telemetry must be excluded
    expect(result.context).not.toContain("session_status");
    expect(result.context).not.toContain("reasoning");

    // Real observations must be included
    expect(result.context).toContain("- [task] Build feature: Completed implementation of feature");
    expect(result.context).toContain("- [command_run] git status");

    // Must not have dangling empty colon (e.g. "- [other] reasoning: ")
    expect(result.context).not.toMatch(/- \[[^\]]+\] [^:\n]+:\s*$/m);
  });
});
