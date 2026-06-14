import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { lookup } from "node:dns/promises";
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

const lookupMock = vi.mocked(lookup);
const setRealTimeout = globalThis.setTimeout.bind(globalThis);
const clearRealTimeout = globalThis.clearTimeout.bind(globalThis);

function mockDns(addresses: string[]) {
  lookupMock.mockResolvedValue(
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    })),
  );
}

async function withRealTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: ReturnType<typeof setRealTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setRealTimeout(() => reject(new Error(`test timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearRealTimeout(timeout);
  }
}

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
    lookupMock.mockReset();
    mockDns(["93.184.216.34"]);
    registerMeshFunction(sdk as never, kv as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

    it("blocks hostnames when DNS lookup fails", async () => {
      lookupMock.mockRejectedValue(new Error("ENOTFOUND"));

      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://missing.example.com",
        name: "missing-peer",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked");
      await expect(kv.list<MeshPeer>("mem:mesh")).resolves.toEqual([]);
    });

    it("blocks hostnames when DNS lookup times out", async () => {
      vi.useFakeTimers();
      lookupMock.mockReturnValue(new Promise(() => {}) as ReturnType<typeof lookup>);

      const resultPromise = sdk.trigger("mem::mesh-register", {
        url: "https://slow.example.com",
        name: "slow-peer",
      }) as Promise<{ success: boolean; error: string }>;

      await vi.advanceTimersByTimeAsync(5000);
      const result = await withRealTimeout(resultPromise, 250);

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked");
      await expect(kv.list<MeshPeer>("mem:mesh")).resolves.toEqual([]);
    });

    it("blocks hostnames when DNS returns no addresses", async () => {
      mockDns([]);

      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://empty.example.com",
        name: "empty-peer",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked");
      await expect(kv.list<MeshPeer>("mem:mesh")).resolves.toEqual([]);
    });

    it("blocks localhost subdomains without DNS lookup", async () => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://peer.localhost",
        name: "localhost-peer",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked");
      expect(lookupMock).not.toHaveBeenCalled();
      await expect(kv.list<MeshPeer>("mem:mesh")).resolves.toEqual([]);
    });

    it("allows hostnames when all DNS answers are public", async () => {
      mockDns(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]);

      const result = (await sdk.trigger("mem::mesh-register", {
        url: "https://public.example.com",
        name: "public-peer",
      })) as { success: boolean; peer: MeshPeer };

      expect(result.success).toBe(true);
      expect(result.peer.url).toBe("https://public.example.com");
    });

    it.each([
      ["127.0.0.1"],
      ["127.1.2.3"],
      ["0.0.0.0"],
      ["10.0.0.1"],
      ["172.16.0.1"],
      ["172.31.255.255"],
      ["192.168.1.1"],
      ["169.254.1.1"],
      ["::"],
      ["::1"],
      ["fe80::1"],
      ["fc00::1"],
      ["fd00::1"],
      ["::ffff:127.0.0.1"],
      ["::ffff:c0a8:101"],
    ])("blocks hostnames when DNS resolves to blocked address %s", async (address) => {
      mockDns(["93.184.216.34", address]);

      const result = (await sdk.trigger("mem::mesh-register", {
        url: `https://${address.replace(/:/g, "-")}.example.com`,
        name: "blocked-dns-peer",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked");
    });

    it.each([
      ["http://127.0.0.1"],
      ["http://127.1.2.3"],
      ["http://0.0.0.0"],
      ["http://10.0.0.1"],
      ["http://172.16.0.1"],
      ["http://172.31.255.255"],
      ["http://192.168.1.1"],
      ["http://169.254.1.1"],
      ["http://[::]"],
      ["http://[::1]"],
      ["http://[fe80::1]"],
      ["http://[fc00::1]"],
      ["http://[fd00::1]"],
      ["http://[::ffff:127.0.0.1]"],
      ["http://[::ffff:c0a8:101]"],
    ])("blocks blocked IP literal %s", async (url) => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url,
        name: "blocked-literal-peer",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked");
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it.each([
      ["http://93.184.216.34"],
      ["http://[2606:2800:220:1:248:1893:25c8:1946]"],
    ])("allows public IP literal %s", async (url) => {
      const result = (await sdk.trigger("mem::mesh-register", {
        url,
        name: "public-literal-peer",
      })) as { success: boolean; peer: MeshPeer };

      expect(result.success).toBe(true);
      expect(result.peer.url).toBe(url);
      expect(lookupMock).not.toHaveBeenCalled();
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
          redirect: "error",
          headers: expect.objectContaining({
            Authorization: "Bearer mesh-secret",
          }),
        }),
      );
    });

    it("sends authorization headers and blocks redirects when pulling from peers", async () => {
      const authedSdk = mockSdk();
      const authedKv = mockKV();
      registerMeshFunction(authedSdk as never, authedKv as never, "mesh-secret");

      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ memories: [], actions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const regResult = (await authedSdk.trigger("mem::mesh-register", {
        url: "https://peer3.example.com",
        name: "peer-3",
      })) as { success: boolean; peer: MeshPeer };

      const result = (await authedSdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "pull",
      })) as { success: boolean; results: Array<{ errors: string[] }> };

      expect(result.success).toBe(true);
      expect(result.results[0].errors).toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://peer3.example.com/agentmemory/mesh/export?since=",
        expect.objectContaining({
          redirect: "error",
          headers: expect.objectContaining({
            Authorization: "Bearer mesh-secret",
          }),
        }),
      );
    });

    it("records an error when push fetch rejects a redirect", async () => {
      const authedSdk = mockSdk();
      const authedKv = mockKV();
      registerMeshFunction(authedSdk as never, authedKv as never, "mesh-secret");

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("redirect blocked")));

      const regResult = (await authedSdk.trigger("mem::mesh-register", {
        url: "https://push-redirect.example.com",
        name: "push-redirect-peer",
      })) as { success: boolean; peer: MeshPeer };

      const result = (await authedSdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "push",
      })) as { success: boolean; results: Array<{ errors: string[] }> };

      expect(result.success).toBe(true);
      expect(result.results[0].errors).toEqual(["push failed: TypeError: redirect blocked"]);
      const peer = await authedKv.get<MeshPeer>("mem:mesh", regResult.peer.id);
      expect(peer?.status).toBe("error");
    });

    it("records an error when pull fetch rejects a redirect", async () => {
      const authedSdk = mockSdk();
      const authedKv = mockKV();
      registerMeshFunction(authedSdk as never, authedKv as never, "mesh-secret");

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("redirect blocked")));

      const regResult = (await authedSdk.trigger("mem::mesh-register", {
        url: "https://pull-redirect.example.com",
        name: "pull-redirect-peer",
      })) as { success: boolean; peer: MeshPeer };

      const result = (await authedSdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "pull",
      })) as { success: boolean; results: Array<{ errors: string[] }> };

      expect(result.success).toBe(true);
      expect(result.results[0].errors).toEqual(["pull failed: TypeError: redirect blocked"]);
      const peer = await authedKv.get<MeshPeer>("mem:mesh", regResult.peer.id);
      expect(peer?.status).toBe("error");
    });

    it("blocks sync and skips fetch when DNS rechecks to a blocked address", async () => {
      const authedSdk = mockSdk();
      const authedKv = mockKV();
      registerMeshFunction(authedSdk as never, authedKv as never, "mesh-secret");

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      mockDns(["93.184.216.34"]);
      const regResult = (await authedSdk.trigger("mem::mesh-register", {
        url: "https://rebind.example.com",
        name: "rebind-peer",
      })) as { success: boolean; peer: MeshPeer };

      mockDns(["127.0.0.1"]);
      const result = (await authedSdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "push",
      })) as { success: boolean; results: Array<{ errors: string[] }> };

      expect(result.success).toBe(true);
      expect(result.results[0].errors).toContain("peer URL blocked: private/local address not allowed");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("blocks sync and skips fetch when DNS recheck times out", async () => {
      const authedSdk = mockSdk();
      const authedKv = mockKV();
      registerMeshFunction(authedSdk as never, authedKv as never, "mesh-secret");

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      mockDns(["93.184.216.34"]);
      const regResult = (await authedSdk.trigger("mem::mesh-register", {
        url: "https://slow-rebind.example.com",
        name: "slow-rebind-peer",
      })) as { success: boolean; peer: MeshPeer };

      vi.useFakeTimers();
      lookupMock.mockReturnValue(new Promise(() => {}) as ReturnType<typeof lookup>);
      const resultPromise = authedSdk.trigger("mem::mesh-sync", {
        peerId: regResult.peer.id,
        direction: "push",
      }) as Promise<{ success: boolean; results: Array<{ errors: string[] }> }>;

      await vi.advanceTimersByTimeAsync(5000);
      const result = await withRealTimeout(resultPromise, 250);

      expect(result.success).toBe(true);
      expect(result.results[0].errors).toContain("peer URL blocked: private/local address not allowed");
      expect(fetchMock).not.toHaveBeenCalled();
      const peer = await authedKv.get<MeshPeer>("mem:mesh", regResult.peer.id);
      expect(peer?.status).toBe("error");
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
