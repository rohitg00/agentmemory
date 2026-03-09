import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerMeshFunction } from "../src/functions/mesh.js";
import type { MeshPeer, Memory, Action } from "../src/types.js";

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
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
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

    it("uses default sharedScopes when not provided", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer2.example.com",
        name: "peer-2",
      })) as { success: boolean; peer: MeshPeer };

      expect(result.success).toBe(true);
      expect(result.peer.sharedScopes).toEqual(["memories", "actions"]);
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
});
