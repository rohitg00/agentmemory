import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMeshFunction } from "../src/functions/mesh.js";
import type {
  MeshPeer,
  Memory,
  Action,
  SemanticMemory,
  ProceduralMemory,
  MemoryRelation,
  GraphNode,
  GraphEdge,
} from "../src/types.js";

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
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

describe("Mesh Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    vi.clearAllMocks();
    registerMeshFunction(sdk as never, kv as never);
  });

  describe("mesh-register", () => {
    it("registers a valid peer", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
        name: "peer-1",
        sharedScopes: ["memories"],
      })) as { success: boolean; peer: MeshPeer };

      expect(result.success).toBe(true);
      expect(result.peer.url).toBe("https://peer1.example.com");
      expect(result.peer.name).toBe("peer-1");
      expect(result.peer.status).toBe("disconnected");
      expect(result.peer.sharedScopes).toEqual(["memories"]);
      expect(result.peer.id).toMatch(/^peer_/);

      const peers = await kv.list<MeshPeer>("mem:mesh");
      expect(peers.length).toBe(1);
    });

    it("uses expanded default sharedScopes when not provided", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer2.example.com",
        name: "peer-2",
      })) as { success: boolean; peer: MeshPeer };

      expect(result.success).toBe(true);
      expect(result.peer.sharedScopes).toEqual([
        "memories",
        "actions",
        "semantic",
        "procedural",
        "relations",
        "graph:nodes",
        "graph:edges",
      ]);
    });

    it("stores syncFilter when provided", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer3.example.com",
        name: "peer-3",
        syncFilter: { project: "/my/project" },
      })) as { success: boolean; peer: MeshPeer };

      expect(result.success).toBe(true);
      expect(result.peer.syncFilter).toEqual({ project: "/my/project" });
    });

    it("returns error when url is missing", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        name: "peer-1",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("url and name are required");
    });

    it("returns error when name is missing", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("url and name are required");
    });

    it("returns error for duplicate url", async () => {
      await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
        name: "peer-1",
      });

      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
        name: "peer-1-duplicate",
      })) as { success: boolean; error: string; peerId: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("peer already registered");
      expect(result.peerId).toBeDefined();
    });
  });

  describe("mesh-list", () => {
    it("returns empty list when no peers registered", async () => {
      const result = (await sdk.trigger("mem::mesh-list", {})) as {
        success: boolean;
        peers: MeshPeer[];
      };

      expect(result.success).toBe(true);
      expect(result.peers).toEqual([]);
    });

    it("returns all registered peers", async () => {
      await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
        name: "peer-1",
      });
      await sdk.trigger("mem::mesh-register", {
        url: "https://peer2.example.com",
        name: "peer-2",
      });

      const result = (await sdk.trigger("mem::mesh-list", {})) as {
        success: boolean;
        peers: MeshPeer[];
      };

      expect(result.success).toBe(true);
      expect(result.peers.length).toBe(2);
      expect(result.peers.map((p) => p.name).sort()).toEqual(["peer-1", "peer-2"]);
    });
  });

  describe("mesh-sync", () => {
    it("requires a configured shared secret", async () => {
      const regResult = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
        name: "peer-1",
      })) as { success: boolean; peer: MeshPeer };

      const result = (await sdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "push",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("AGENTMEMORY_SECRET");
    });

    it("sends authorization headers to peers when syncing", async () => {
      const authedSdk = mockSdk();
      const authedKv = mockKV();
      registerMeshFunction(authedSdk as never, authedKv as never, "mesh-secret");

      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ accepted: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const regResult = (await authedSdk.trigger("mem::mesh-register", {
        url: "https://peer2.example.com",
        name: "peer-2",
      })) as { success: boolean; peer: MeshPeer };

      const result = (await authedSdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "push",
      })) as { success: boolean; results: Array<{ errors: string[] }> };

      expect(result.success).toBe(true);
      expect(result.results[0].errors).toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://peer2.example.com/agentmemory/mesh/receive",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mesh-secret",
          }),
        }),
      );

      vi.unstubAllGlobals();
    });
  });

  describe("mesh-receive", () => {
    it("accepts new memories", async () => {
      const mem: Memory = {
        id: "mem_1",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        type: "pattern",
        title: "Test memory",
        content: "Test content",
        concepts: ["test"],
        files: [],
        sessionIds: ["ses_1"],
        strength: 5,
        version: 1,
        isLatest: true,
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [mem],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);

      const stored = await kv.get<Memory>("mem:memories", "mem_1");
      expect(stored).toBeDefined();
      expect(stored!.title).toBe("Test memory");
    });

    it("accepts newer memory over existing (last-write-wins)", async () => {
      const older: Memory = {
        id: "mem_1",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        type: "pattern",
        title: "Old title",
        content: "Old content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 5,
        version: 1,
        isLatest: true,
      };
      await kv.set("mem:memories", "mem_1", older);

      const newer: Memory = {
        ...older,
        updatedAt: "2026-03-02T00:00:00Z",
        title: "New title",
        content: "New content",
        version: 2,
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [newer],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);

      const stored = await kv.get<Memory>("mem:memories", "mem_1");
      expect(stored!.title).toBe("New title");
    });

    it("rejects older memory than existing", async () => {
      const existing: Memory = {
        id: "mem_1",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-02T00:00:00Z",
        type: "pattern",
        title: "Existing title",
        content: "Existing content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 5,
        version: 2,
        isLatest: true,
      };
      await kv.set("mem:memories", "mem_1", existing);

      const older: Memory = {
        ...existing,
        updatedAt: "2026-03-01T00:00:00Z",
        title: "Old title",
        version: 1,
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [older],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);

      const stored = await kv.get<Memory>("mem:memories", "mem_1");
      expect(stored!.title).toBe("Existing title");
    });

    it("skips memory entries with missing id", async () => {
      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [
          { updatedAt: "2026-03-01T00:00:00Z", title: "No ID" } as unknown as Memory,
        ],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);
    });

    it("skips memory entries with invalid date", async () => {
      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [
          {
            id: "mem_bad_date",
            updatedAt: "not-a-date",
            title: "Bad date",
          } as unknown as Memory,
        ],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);
    });

    it("accepts new actions", async () => {
      const action: Action = {
        id: "act_1",
        title: "Fix bug",
        description: "Fix the login bug",
        status: "pending",
        priority: 1,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        createdBy: "agent-1",
        tags: ["bug"],
        sourceObservationIds: [],
        sourceMemoryIds: [],
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        actions: [action],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);

      const stored = await kv.get<Action>("mem:actions", "act_1");
      expect(stored).toBeDefined();
      expect(stored!.title).toBe("Fix bug");
    });

    it("accepts newer action over existing (last-write-wins)", async () => {
      const older: Action = {
        id: "act_1",
        title: "Old action",
        description: "Old desc",
        status: "pending",
        priority: 1,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        createdBy: "agent-1",
        tags: [],
        sourceObservationIds: [],
        sourceMemoryIds: [],
      };
      await kv.set("mem:actions", "act_1", older);

      const newer: Action = {
        ...older,
        updatedAt: "2026-03-02T00:00:00Z",
        title: "Updated action",
        status: "done",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        actions: [newer],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);

      const stored = await kv.get<Action>("mem:actions", "act_1");
      expect(stored!.title).toBe("Updated action");
      expect(stored!.status).toBe("done");
    });

    it("rejects older action than existing", async () => {
      const existing: Action = {
        id: "act_1",
        title: "Current action",
        description: "Current desc",
        status: "active",
        priority: 1,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-02T00:00:00Z",
        createdBy: "agent-1",
        tags: [],
        sourceObservationIds: [],
        sourceMemoryIds: [],
      };
      await kv.set("mem:actions", "act_1", existing);

      const older: Action = {
        ...existing,
        updatedAt: "2026-03-01T00:00:00Z",
        title: "Stale action",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        actions: [older],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);

      const stored = await kv.get<Action>("mem:actions", "act_1");
      expect(stored!.title).toBe("Current action");
    });

    it("skips action entries with missing id", async () => {
      const result = (await sdk.trigger("mem::mesh-receive", {
        actions: [
          { updatedAt: "2026-03-01T00:00:00Z", title: "No ID" } as unknown as Action,
        ],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);
    });

    it("skips action entries with invalid date", async () => {
      const result = (await sdk.trigger("mem::mesh-receive", {
        actions: [
          {
            id: "act_bad_date",
            updatedAt: "invalid-date-string",
            title: "Bad date",
          } as unknown as Action,
        ],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);
    });

    it("accepts both memories and actions in one call", async () => {
      const mem: Memory = {
        id: "mem_combo",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        type: "fact",
        title: "Combo memory",
        content: "Content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 3,
        version: 1,
        isLatest: true,
      };
      const action: Action = {
        id: "act_combo",
        title: "Combo action",
        description: "Desc",
        status: "pending",
        priority: 2,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        createdBy: "agent-1",
        tags: [],
        sourceObservationIds: [],
        sourceMemoryIds: [],
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [mem],
        actions: [action],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(2);
    });

    it("returns zero accepted for empty arrays", async () => {
      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [],
        actions: [],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(0);
    });
  });

  describe("mesh-remove", () => {
    it("removes a registered peer", async () => {
      const regResult = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer1.example.com",
        name: "peer-1",
      })) as { success: boolean; peer: MeshPeer };

      const result = (await sdk.trigger("mem::mesh-remove", {
        peerId: regResult.peer.id,
      })) as { success: boolean };

      expect(result.success).toBe(true);

      const peers = await kv.list<MeshPeer>("mem:mesh");
      expect(peers.length).toBe(0);
    });

    it("returns error when peerId is missing", async () => {
      const result = (await sdk.trigger("mem::mesh-remove", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("peerId is required");
    });

    it("succeeds silently for non-existent peerId", async () => {
      const result = (await sdk.trigger("mem::mesh-remove", {
        peerId: "peer_nonexistent",
      })) as { success: boolean };

      expect(result.success).toBe(true);
    });
  });

  describe("mesh-receive expanded scopes", () => {
    it("accepts semantic memories", async () => {
      const sem: SemanticMemory = {
        id: "sem_1",
        fact: "React uses JSX",
        confidence: 0.9,
        sourceSessionIds: ["ses_1"],
        sourceMemoryIds: ["mem_1"],
        accessCount: 1,
        lastAccessedAt: "2026-03-01T00:00:00Z",
        strength: 7,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        semantic: [sem],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
      const stored = await kv.get<SemanticMemory>("mem:semantic", "sem_1");
      expect(stored).toBeDefined();
      expect(stored!.fact).toBe("React uses JSX");
    });

    it("accepts procedural memories", async () => {
      const proc: ProceduralMemory = {
        id: "proc_1",
        name: "Deploy to prod",
        steps: ["build", "test", "deploy"],
        triggerCondition: "on merge to main",
        frequency: 5,
        sourceSessionIds: ["ses_1"],
        strength: 8,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        procedural: [proc],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
      const stored = await kv.get<ProceduralMemory>("mem:procedural", "proc_1");
      expect(stored!.name).toBe("Deploy to prod");
    });

    it("accepts graph nodes", async () => {
      const node: GraphNode = {
        id: "gn_1",
        type: "concept",
        name: "typescript",
        properties: {},
        sourceObservationIds: ["obs_1"],
        createdAt: "2026-03-01T00:00:00Z",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        graphNodes: [node],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
      const stored = await kv.get<GraphNode>("mem:graph:nodes", "gn_1");
      expect(stored!.name).toBe("typescript");
    });

    it("accepts graph edges", async () => {
      const edge: GraphEdge = {
        id: "ge_1",
        type: "uses",
        sourceNodeId: "gn_1",
        targetNodeId: "gn_2",
        weight: 1,
        sourceObservationIds: ["obs_1"],
        createdAt: "2026-03-01T00:00:00Z",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        graphEdges: [edge],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
      const stored = await kv.get<GraphEdge>("mem:graph:edges", "ge_1");
      expect(stored!.type).toBe("uses");
    });

    it("accepts relations", async () => {
      const rel: MemoryRelation = {
        type: "supersedes",
        sourceId: "mem_2",
        targetId: "mem_1",
        createdAt: "2026-03-01T00:00:00Z",
        confidence: 0.95,
      };
      const relWithId = { ...rel, id: "rel_1" } as MemoryRelation & { id: string };

      const result = (await sdk.trigger("mem::mesh-receive", {
        relations: [relWithId],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
    });

    it("accepts all scope types in one call", async () => {
      const mem: Memory = {
        id: "mem_all",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        type: "fact",
        title: "All scopes test",
        content: "Content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 5,
        version: 1,
        isLatest: true,
      };
      const sem: SemanticMemory = {
        id: "sem_all",
        fact: "Test",
        confidence: 0.5,
        sourceSessionIds: [],
        sourceMemoryIds: [],
        accessCount: 0,
        lastAccessedAt: "2026-03-01T00:00:00Z",
        strength: 5,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      };
      const node: GraphNode = {
        id: "gn_all",
        type: "file",
        name: "test.ts",
        properties: {},
        sourceObservationIds: [],
        createdAt: "2026-03-01T00:00:00Z",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        memories: [mem],
        semantic: [sem],
        graphNodes: [node],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(3);
    });

    it("applies LWW for semantic memories", async () => {
      const older: SemanticMemory = {
        id: "sem_lww",
        fact: "Old fact",
        confidence: 0.5,
        sourceSessionIds: [],
        sourceMemoryIds: [],
        accessCount: 1,
        lastAccessedAt: "2026-03-01T00:00:00Z",
        strength: 5,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      };
      await kv.set("mem:semantic", "sem_lww", older);

      const newer: SemanticMemory = {
        ...older,
        fact: "New fact",
        updatedAt: "2026-03-02T00:00:00Z",
      };

      const result = (await sdk.trigger("mem::mesh-receive", {
        semantic: [newer],
      })) as { success: boolean; accepted: number };

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
      const stored = await kv.get<SemanticMemory>("mem:semantic", "sem_lww");
      expect(stored!.fact).toBe("New fact");
    });
  });
});
