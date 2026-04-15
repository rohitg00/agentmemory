import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerDiagnosticsFunction } from "../src/functions/diagnostics.js";
import type {
  Action,
  ActionEdge,
  DiagnosticCheck,
  Lease,
  Sentinel,
  Sketch,
  Signal,
  Session,
  Memory,
  MeshPeer,
} from "../src/types.js";
import { KV } from "../src/state/schema.js";

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

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: "Test action",
    description: "",
    status: "pending",
    priority: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "agent-1",
    tags: [],
    sourceObservationIds: [],
    sourceMemoryIds: [],
    ...overrides,
  };
}

function makeLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: `lease_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    actionId: "act_missing",
    agentId: "agent-1",
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "active",
    ...overrides,
  };
}

function makeEdge(overrides: Partial<ActionEdge> = {}): ActionEdge {
  return {
    id: `ae_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "requires",
    sourceActionId: "src",
    targetActionId: "tgt",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSentinel(overrides: Partial<Sentinel> = {}): Sentinel {
  return {
    id: `sen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: "Test sentinel",
    type: "timer",
    status: "watching",
    config: {},
    createdAt: new Date().toISOString(),
    linkedActionIds: [],
    ...overrides,
  };
}

function makeSketch(overrides: Partial<Sketch> = {}): Sketch {
  return {
    id: `sk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: "Test sketch",
    description: "",
    status: "active",
    actionIds: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    from: "agent-1",
    type: "info",
    content: "test",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    project: "test",
    cwd: "/tmp",
    startedAt: new Date().toISOString(),
    status: "active",
    observationCount: 0,
    ...overrides,
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "fact",
    title: "Test memory",
    content: "content",
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 1,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

function makePeer(overrides: Partial<MeshPeer> = {}): MeshPeer {
  return {
    id: `peer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    url: "http://localhost:3111",
    name: "Test peer",
    status: "connected",
    sharedScopes: [],
    ...overrides,
  };
}

describe("Diagnostics Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerDiagnosticsFunction(sdk as never, kv as never);
  });

  describe("mem::diagnose", () => {
    it("empty system passes all checks", async () => {
      const result = (await sdk.trigger("mem::diagnose", {})) as {
        success: boolean;
        checks: DiagnosticCheck[];
        summary: { pass: number; warn: number; fail: number; fixable: number };
      };

      expect(result.success).toBe(true);
      expect(result.summary.pass).toBe(8);
      expect(result.summary.warn).toBe(0);
      expect(result.summary.fail).toBe(0);
      expect(result.summary.fixable).toBe(0);
      expect(result.checks.every((c) => c.status === "pass")).toBe(true);
    });

    it("active action with no lease produces warn", async () => {
      const action = makeAction({ status: "active" });
      await kv.set(KV.actions, action.id, action);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["actions"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("active-no-lease:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("warn");
      expect(check!.fixable).toBe(false);
    });

    it("blocked action with all deps done produces fail (fixable)", async () => {
      const dep = makeAction({ status: "done" });
      const blocked = makeAction({ status: "blocked" });
      const edge = makeEdge({
        sourceActionId: blocked.id,
        targetActionId: dep.id,
        type: "requires",
      });
      await kv.set(KV.actions, dep.id, dep);
      await kv.set(KV.actions, blocked.id, blocked);
      await kv.set(KV.actionEdges, edge.id, edge);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["actions"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("blocked-deps-done:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("pending action with unsatisfied deps produces fail (fixable)", async () => {
      const dep = makeAction({ status: "active" });
      const pending = makeAction({ status: "pending" });
      const edge = makeEdge({
        sourceActionId: pending.id,
        targetActionId: dep.id,
        type: "requires",
      });
      await kv.set(KV.actions, dep.id, dep);
      await kv.set(KV.actions, pending.id, pending);
      await kv.set(KV.actionEdges, edge.id, edge);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["actions"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("pending-unsatisfied-deps:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("expired active lease produces fail (fixable)", async () => {
      const action = makeAction({ status: "active" });
      const lease = makeLease({
        actionId: action.id,
        status: "active",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.actions, action.id, action);
      await kv.set(KV.leases, lease.id, lease);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["leases"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("expired-lease:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("orphaned lease (action gone) produces fail (fixable)", async () => {
      const lease = makeLease({
        actionId: "act_gone",
        status: "active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await kv.set(KV.leases, lease.id, lease);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["leases"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("orphaned-lease:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("expired watching sentinel produces fail (fixable)", async () => {
      const sentinel = makeSentinel({
        status: "watching",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.sentinels, sentinel.id, sentinel);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["sentinels"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("expired-sentinel:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("sentinel referencing missing action produces warn", async () => {
      const sentinel = makeSentinel({
        linkedActionIds: ["act_nonexistent"],
      });
      await kv.set(KV.sentinels, sentinel.id, sentinel);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["sentinels"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("sentinel-missing-action:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("warn");
      expect(check!.fixable).toBe(false);
    });

    it("expired active sketch produces fail (fixable)", async () => {
      const sketch = makeSketch({
        status: "active",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.sketches, sketch.id, sketch);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["sketches"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("expired-sketch:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("expired signal produces fail (fixable)", async () => {
      const signal = makeSignal({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.signals, signal.id, signal);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["signals"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("expired-signal:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("active session older than 24h produces warn", async () => {
      const session = makeSession({
        status: "active",
        startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      });
      await kv.set(KV.sessions, session.id, session);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["sessions"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("abandoned-session:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("warn");
      expect(check!.fixable).toBe(false);
    });

    it("memory with stale isLatest produces fail (fixable)", async () => {
      const oldMemory = makeMemory({ isLatest: true });
      const newMemory = makeMemory({ supersedes: [oldMemory.id] });
      await kv.set(KV.memories, oldMemory.id, oldMemory);
      await kv.set(KV.memories, newMemory.id, newMemory);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["memories"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("memory-stale-latest:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
      expect(check!.fixable).toBe(true);
    });

    it("memory superseding non-existent produces warn", async () => {
      const memory = makeMemory({ supersedes: ["mem_gone"] });
      await kv.set(KV.memories, memory.id, memory);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["memories"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("memory-missing-supersedes:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("warn");
      expect(check!.fixable).toBe(false);
    });

    it("stale mesh peer produces warn", async () => {
      const peer = makePeer({
        lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });
      await kv.set(KV.mesh, peer.id, peer);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["mesh"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("stale-peer:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("warn");
      expect(check!.fixable).toBe(false);
    });

    it("error mesh peer produces warn", async () => {
      const peer = makePeer({ status: "error" });
      await kv.set(KV.mesh, peer.id, peer);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["mesh"],
      })) as { checks: DiagnosticCheck[] };

      const check = result.checks.find((c) =>
        c.name.startsWith("error-peer:"),
      );
      expect(check).toBeDefined();
      expect(check!.status).toBe("warn");
      expect(check!.fixable).toBe(false);
    });

    it("filters by categories", async () => {
      const action = makeAction({ status: "active" });
      await kv.set(KV.actions, action.id, action);

      const signal = makeSignal({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.signals, signal.id, signal);

      const result = (await sdk.trigger("mem::diagnose", {
        categories: ["signals"],
      })) as { checks: DiagnosticCheck[] };

      expect(result.checks.every((c) => c.category === "signals")).toBe(true);
      expect(
        result.checks.some((c) => c.category === "actions"),
      ).toBe(false);
    });
  });

  describe("mem::heal", () => {
    it("unblocks stuck blocked action", async () => {
      const dep = makeAction({ status: "done" });
      const blocked = makeAction({ status: "blocked", title: "Stuck task" });
      const edge = makeEdge({
        sourceActionId: blocked.id,
        targetActionId: dep.id,
        type: "requires",
      });
      await kv.set(KV.actions, dep.id, dep);
      await kv.set(KV.actions, blocked.id, blocked);
      await kv.set(KV.actionEdges, edge.id, edge);

      const result = (await sdk.trigger("mem::heal", {
        categories: ["actions"],
      })) as { success: boolean; fixed: number; details: string[] };

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(1);
      expect(result.details[0]).toContain("Unblocked");

      const updated = await kv.get<Action>(KV.actions, blocked.id);
      expect(updated!.status).toBe("pending");
    });

    it("blocks pending action with unsatisfied deps", async () => {
      const dep = makeAction({ status: "active" });
      const pending = makeAction({
        status: "pending",
        title: "Should be blocked",
      });
      const edge = makeEdge({
        sourceActionId: pending.id,
        targetActionId: dep.id,
        type: "requires",
      });
      await kv.set(KV.actions, dep.id, dep);
      await kv.set(KV.actions, pending.id, pending);
      await kv.set(KV.actionEdges, edge.id, edge);

      const result = (await sdk.trigger("mem::heal", {
        categories: ["actions"],
      })) as { success: boolean; fixed: number; details: string[] };

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(1);
      expect(result.details[0]).toContain("Blocked");

      const updated = await kv.get<Action>(KV.actions, pending.id);
      expect(updated!.status).toBe("blocked");
    });

    it("expires stale lease and resets action", async () => {
      const action = makeAction({
        status: "active",
        assignedTo: "agent-1",
      });
      const lease = makeLease({
        actionId: action.id,
        agentId: "agent-1",
        status: "active",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.actions, action.id, action);
      await kv.set(KV.leases, lease.id, lease);

      const result = (await sdk.trigger("mem::heal", {
        categories: ["leases"],
      })) as { success: boolean; fixed: number; details: string[] };

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(1);
      expect(result.details[0]).toContain("Expired lease");

      const updatedLease = await kv.get<Lease>(KV.leases, lease.id);
      expect(updatedLease!.status).toBe("expired");

      const updatedAction = await kv.get<Action>(KV.actions, action.id);
      expect(updatedAction!.status).toBe("pending");
      expect(updatedAction!.assignedTo).toBeUndefined();
    });

    it("deletes orphaned lease", async () => {
      const lease = makeLease({
        actionId: "act_gone",
        status: "released",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await kv.set(KV.leases, lease.id, lease);

      const result = (await sdk.trigger("mem::heal", {
        categories: ["leases"],
      })) as { success: boolean; fixed: number; details: string[] };

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(1);
      expect(result.details[0]).toContain("Deleted orphaned lease");

      const deleted = await kv.get<Lease>(KV.leases, lease.id);
      expect(deleted).toBeNull();
    });

    it("expires stale sentinel", async () => {
      const sentinel = makeSentinel({
        status: "watching",
        name: "Stale watcher",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await kv.set(KV.sentinels, sentinel.id, sentinel);

      const result = (await sdk.trigger("mem::heal", {
        categories: ["sentinels"],
      })) as { success: boolean; fixed: number; details: string[] };

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(1);
      expect(result.details[0]).toContain("Expired sentinel");

      const updated = await kv.get<Sentinel>(KV.sentinels, sentinel.id);
      expect(updated!.status).toBe("expired");
    });

    it("dry run reports but does not fix", async () => {
      const dep = makeAction({ status: "done" });
      const blocked = makeAction({ status: "blocked", title: "Stuck task" });
      const edge = makeEdge({
        sourceActionId: blocked.id,
        targetActionId: dep.id,
        type: "requires",
      });
      await kv.set(KV.actions, dep.id, dep);
      await kv.set(KV.actions, blocked.id, blocked);
      await kv.set(KV.actionEdges, edge.id, edge);

      const result = (await sdk.trigger("mem::heal", {
        categories: ["actions"],
        dryRun: true,
      })) as { success: boolean; fixed: number; details: string[] };

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(1);
      expect(result.details[0]).toContain("[dry-run]");

      const unchanged = await kv.get<Action>(KV.actions, blocked.id);
      expect(unchanged!.status).toBe("blocked");
    });
  });
});
