import { describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGraphFunction } from "../src/functions/graph.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Memory, Session } from "../src/types.js";

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
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggers: Array<{ function_id: string; config?: { api_path?: string } }> = [];
  return {
    triggers,
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: (trigger: { function_id: string; config?: { api_path?: string } }) => {
      triggers.push(trigger);
    },
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

const mockProvider = {
  name: "test",
  compress: vi.fn().mockResolvedValue(`<entities>
<entity type="concept" name="Agent Memory"><property key="kind">memory</property></entity>
<entity type="file" name="src/memory.ts"><property key="path">src/memory.ts</property></entity>
</entities>
<relationships>
<relationship type="touches" source="Agent Memory" target="src/memory.ts" weight="0.8"/>
</relationships>`),
  summarize: vi.fn(),
};

function makeObservation(id: string): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: "2026-05-19T08:00:00Z",
    type: "decision",
    title: "Agent memory graph backfill",
    facts: ["Existing observations should populate the graph"],
    narrative: "Build a knowledge graph from existing memory observations.",
    concepts: ["agent-memory", "graph"],
    files: ["src/memory.ts"],
    importance: 8,
  };
}

function makeMemory(id: string): Memory {
  return {
    id,
    type: "fact",
    title: "Saved memory graph fact",
    content: "Explicit memories should also be available to graph build.",
    concepts: ["agent-memory", "graph"],
    files: ["src/memory.ts"],
    sessionIds: [],
    strength: 7,
    version: 1,
    isLatest: true,
    createdAt: "2026-05-19T08:00:00Z",
    updatedAt: "2026-05-19T08:00:00Z",
  };
}

describe("api::graph-build", () => {
  it("registers POST /agentmemory/graph/build and backfills graph data (#505)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerGraphFunction(sdk as never, kv as never, mockProvider as never);
    registerApiTriggers(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-05-19T08:00:00Z",
      status: "completed",
      observationCount: 1,
    };
    await kv.set(KV.sessions, session.id, session);
    await kv.set(KV.observations(session.id), "obs_1", makeObservation("obs_1"));
    await kv.set(KV.memories, "mem_1", makeMemory("mem_1"));

    const trigger = sdk.triggers.find(
      (entry) => entry.function_id === "api::graph-build",
    );
    expect(trigger?.config?.api_path).toBe("/agentmemory/graph/build");

    const response = (await sdk.trigger("api::graph-build", {
      headers: {},
      body: {},
    })) as { status_code: number; body: Record<string, unknown> };

    expect(response.status_code).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.observationsProcessed).toBe(2);
    expect(response.body.nodesAdded).toBeGreaterThan(0);
    expect(response.body.edgesAdded).toBeGreaterThan(0);
  });

  it("validates graph build limit", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);

    const response = (await sdk.trigger("api::graph-build", {
      headers: {},
      body: { limit: 0 },
    })) as { status_code: number; body: { error?: string } };

    expect(response.status_code).toBe(400);
    expect(response.body.error).toContain("limit");
  });

  it("marks graph build results as truncated when limit cuts off inputs", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerGraphFunction(sdk as never, kv as never, mockProvider as never);
    registerApiTriggers(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-05-19T08:00:00Z",
      status: "completed",
      observationCount: 2,
    };
    await kv.set(KV.sessions, session.id, session);
    await kv.set(KV.observations(session.id), "obs_1", makeObservation("obs_1"));
    await kv.set(KV.observations(session.id), "obs_2", makeObservation("obs_2"));

    const response = (await sdk.trigger("api::graph-build", {
      headers: {},
      body: { limit: 1 },
    })) as {
      status_code: number;
      body: { observationsProcessed?: number; truncated?: boolean };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.observationsProcessed).toBe(1);
    expect(response.body.truncated).toBe(true);
  });

  it("fails fast when graph build cannot read storage", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const failingKv = {
      ...kv,
      list: vi.fn(async (scope: string): Promise<unknown[]> => {
        if (scope === KV.sessions) throw new Error("kv unavailable");
        return kv.list(scope);
      }),
    };
    registerApiTriggers(sdk as never, failingKv as never);

    const response = (await sdk.trigger("api::graph-build", {
      headers: {},
      body: {},
    })) as {
      status_code: number;
      body: { success?: boolean; errors?: string[] };
    };

    expect(response.status_code).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.errors?.[0]).toContain("kv unavailable");
  });

  it("reports extraction failures without hiding partial graph build results", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);
    sdk.registerFunction("mem::graph-extract", async () => {
      throw new Error("provider unavailable");
    });

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-05-19T08:00:00Z",
      status: "completed",
      observationCount: 1,
    };
    await kv.set(KV.sessions, session.id, session);
    await kv.set(KV.observations(session.id), "obs_1", makeObservation("obs_1"));

    const response = (await sdk.trigger("api::graph-build", {
      headers: {},
      body: {},
    })) as {
      status_code: number;
      body: {
        success?: boolean;
        observationsProcessed?: number;
        nodesAdded?: number;
        edgesAdded?: number;
        errors?: string[];
      };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.observationsProcessed).toBe(1);
    expect(response.body.nodesAdded).toBe(0);
    expect(response.body.edgesAdded).toBe(0);
    expect(response.body.errors?.[0]).toContain("provider unavailable");
  });

  it("returns the graph disabled response when extraction is not registered", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-05-19T08:00:00Z",
      status: "completed",
      observationCount: 1,
    };
    await kv.set(KV.sessions, session.id, session);
    await kv.set(KV.observations(session.id), "obs_1", makeObservation("obs_1"));

    const response = (await sdk.trigger("api::graph-build", {
      headers: {},
      body: {},
    })) as { status_code: number; body: { flag?: string } };

    expect(response.status_code).toBe(503);
    expect(response.body.flag).toBe("GRAPH_EXTRACTION_ENABLED");
  });
});
