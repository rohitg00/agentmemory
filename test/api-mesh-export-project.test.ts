import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/auth.js", () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}));

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual<typeof import("../src/config.js")>("../src/config.js");
  return {
    ...actual,
    getAgentId: () => undefined,
    isAgentScopeIsolated: () => false,
    detectEmbeddingProvider: () => false,
    detectLlmProviderKind: () => "none",
  };
});

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type {
  Action,
  GraphEdge,
  GraphNode,
  Memory,
  MemoryRelation,
  ProceduralMemory,
  SemanticMemory,
} from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
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
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(query_params: Record<string, string> = {}) {
  return {
    body: {},
    headers: { authorization: "Bearer mesh-secret" },
    query_params,
  };
}

function memory(id: string, project?: string): Memory {
  return {
    id,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-02T00:00:00Z",
    type: "fact",
    title: id,
    content: id,
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 5,
    version: 1,
    isLatest: true,
    ...(project !== undefined && { project }),
  };
}

function action(id: string, project?: string): Action {
  return {
    id,
    title: id,
    description: id,
    status: "pending",
    priority: 1,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-02T00:00:00Z",
    createdBy: "agent-1",
    tags: [],
    sourceObservationIds: [],
    sourceMemoryIds: [],
    ...(project !== undefined && { project }),
  };
}

function semantic(id: string): SemanticMemory {
  return {
    id,
    fact: id,
    confidence: 0.9,
    sourceSessionIds: ["ses_1"],
    sourceMemoryIds: ["mem_main"],
    accessCount: 1,
    lastAccessedAt: "2026-03-01T00:00:00Z",
    strength: 7,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-02T00:00:00Z",
  };
}

function procedural(id: string): ProceduralMemory {
  return {
    id,
    name: id,
    steps: ["inspect", "fix"],
    triggerCondition: "when needed",
    frequency: 1,
    sourceSessionIds: ["ses_1"],
    strength: 7,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-02T00:00:00Z",
  };
}

describe("GET /agentmemory/mesh/export project filter", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerApiTriggers(sdk as never, kv as never, "mesh-secret");

    await kv.set(KV.memories, "mem_main", memory("mem_main", "git:repo-main"));
    await kv.set(KV.memories, "mem_other", memory("mem_other", "git:repo-other"));
    await kv.set(KV.memories, "mem_legacy", memory("mem_legacy"));
    await kv.set(KV.actions, "act_main", action("act_main", "git:repo-main"));
    await kv.set(KV.actions, "act_other", action("act_other", "git:repo-other"));
    await kv.set(KV.actions, "act_legacy", action("act_legacy"));
    await kv.set(KV.semantic, "sem_1", semantic("sem_1"));
    await kv.set(KV.procedural, "proc_1", procedural("proc_1"));
    await kv.set(KV.relations, "rel_1", {
      type: "related",
      sourceId: "mem_main",
      targetId: "mem_legacy",
      createdAt: "2026-03-02T00:00:00Z",
    } satisfies MemoryRelation);
    await kv.set(KV.graphNodes, "node_1", {
      id: "node_1",
      type: "concept",
      name: "Mesh",
      properties: {},
      sourceObservationIds: [],
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-02T00:00:00Z",
    } satisfies GraphNode);
    await kv.set(KV.graphEdges, "edge_1", {
      id: "edge_1",
      type: "related_to",
      sourceNodeId: "node_1",
      targetNodeId: "node_1",
      weight: 1,
      sourceObservationIds: [],
      createdAt: "2026-03-02T00:00:00Z",
    } satisfies GraphEdge);
  });

  it("filters memories and actions by project", async () => {
    const fn = sdk.getFunction("api::mesh-export")!;
    const result = (await fn(makeReq({ project: "git:repo-main" }))) as {
      status_code: number;
      body: {
        memories: Memory[];
        actions: Action[];
        semantic?: SemanticMemory[];
        procedural?: ProceduralMemory[];
        relations?: MemoryRelation[];
        graphNodes?: GraphNode[];
        graphEdges?: GraphEdge[];
      };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.memories.map((m) => m.id)).toEqual(["mem_main"]);
    expect(result.body.actions.map((a) => a.id)).toEqual(["act_main"]);
    expect(result.body.semantic).toBeUndefined();
    expect(result.body.procedural).toBeUndefined();
    expect(result.body.relations).toBeUndefined();
    expect(result.body.graphNodes).toBeUndefined();
    expect(result.body.graphEdges).toBeUndefined();
  });

  it("does not treat blank project query as unscoped export", async () => {
    const fn = sdk.getFunction("api::mesh-export")!;
    const result = (await fn(makeReq({ project: "   " }))) as {
      status_code: number;
      body: {
        memories: Memory[];
        actions: Action[];
        semantic?: SemanticMemory[];
        procedural?: ProceduralMemory[];
        relations?: MemoryRelation[];
        graphNodes?: GraphNode[];
        graphEdges?: GraphEdge[];
      };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.memories).toEqual([]);
    expect(result.body.actions).toEqual([]);
    expect(result.body.semantic).toBeUndefined();
    expect(result.body.procedural).toBeUndefined();
    expect(result.body.relations).toBeUndefined();
    expect(result.body.graphNodes).toBeUndefined();
    expect(result.body.graphEdges).toBeUndefined();
  });

  it("keeps unscoped export payloads unchanged", async () => {
    const fn = sdk.getFunction("api::mesh-export")!;
    const result = (await fn(makeReq())) as {
      status_code: number;
      body: {
        memories: Memory[];
        actions: Action[];
        semantic?: SemanticMemory[];
        procedural?: ProceduralMemory[];
        relations?: MemoryRelation[];
        graphNodes?: GraphNode[];
        graphEdges?: GraphEdge[];
      };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.memories.map((m) => m.id).sort()).toEqual([
      "mem_legacy",
      "mem_main",
      "mem_other",
    ]);
    expect(result.body.actions.map((a) => a.id).sort()).toEqual([
      "act_legacy",
      "act_main",
      "act_other",
    ]);
    expect(result.body.semantic?.map((s) => s.id)).toEqual(["sem_1"]);
    expect(result.body.procedural?.map((p) => p.id)).toEqual(["proc_1"]);
    expect(result.body.relations?.map((r) => `${r.sourceId}:${r.targetId}:${r.type}`)).toEqual([
      "mem_main:mem_legacy:related",
    ]);
    expect(result.body.graphNodes?.map((n) => n.id)).toEqual(["node_1"]);
    expect(result.body.graphEdges?.map((e) => e.id)).toEqual(["edge_1"]);
  });
});
