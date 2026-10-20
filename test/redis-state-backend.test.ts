import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { StateKV, applyUpdateOps, generatedIdTime, orderLikeInsertion } from "../src/state/kv.js";
import {
  AUDIT_MIGRATION_STATE_KEY,
  probeLegacyAuditScope,
  queryAudit,
  startAuditMigration,
} from "../src/functions/audit.js";
import { KV, generateId } from "../src/state/schema.js";
import {
  resetViewerStreamTracker,
  seedViewerStreamTracker,
} from "../src/state/viewer-stream.js";
import { evaluateStatus, type StatusInputs } from "../src/functions/status.js";

type Call = { function_id: string; payload: Record<string, unknown> };
type StateEvent = { type: "created" | "updated" | "deleted"; scope: string; key: string; old: unknown; next: unknown };

function cjsonRoundTrip(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (Array.isArray(v) && v.length === 0 ? {} : v)),
  );
}

function shuffled<T>(values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7919 + 13) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function fakeRedisEngine() {
  const hashes = new Map<string, Map<string, string>>();
  const calls: Call[] = [];
  const events: StateEvent[] = [];
  const hash = (scope: string) => {
    let h = hashes.get(`state:${scope}`);
    if (!h) {
      h = new Map();
      hashes.set(`state:${scope}`, h);
    }
    return h;
  };
  const read = (scope: string, key: string) => {
    const raw = hashes.get(`state:${scope}`)?.get(key);
    return raw === undefined ? null : JSON.parse(raw);
  };
  const sdk = {
    trigger: vi.fn(async (req: Call) => {
      calls.push(req);
      const p = req.payload as { scope: string; key: string; value?: unknown; ops?: never[] };
      switch (req.function_id) {
        case "state::get":
          return read(p.scope, p.key);
        case "state::set": {
          const old = read(p.scope, p.key);
          hash(p.scope).set(p.key, JSON.stringify(p.value));
          events.push({ type: old === null ? "created" : "updated", scope: p.scope, key: p.key, old, next: p.value });
          return { old_value: old, new_value: p.value };
        }
        case "state::update": {
          const old = read(p.scope, p.key);
          const next = cjsonRoundTrip(applyUpdateOps(old, p.ops ?? []));
          hash(p.scope).set(p.key, JSON.stringify(next));
          events.push({ type: old === null ? "created" : "updated", scope: p.scope, key: p.key, old, next });
          return { old_value: old, new_value: next, errors: [] };
        }
        case "state::delete": {
          const old = read(p.scope, p.key);
          hashes.get(`state:${p.scope}`)?.delete(p.key);
          events.push({ type: "deleted", scope: p.scope, key: p.key, old, next: null });
          return old;
        }
        case "state::list": {
          const h = hashes.get(`state:${p.scope}`);
          return h ? shuffled([...h.values()].map((raw) => JSON.parse(raw))) : [];
        }
        default:
          return null;
      }
    }),
  };
  return { sdk, hashes, calls, events, read };
}

describe("StateKV on the redis backend", () => {
  it("keeps empty arrays through an update instead of letting the engine's Lua path turn them into objects", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    await kv.set(KV.sessions, "ses_1", { id: "ses_1", tags: [], commitShas: [], observationCount: 0 });

    await kv.update(KV.sessions, "ses_1", [
      { type: "set", path: "status", value: "completed" },
      { type: "set", path: "observationCount", value: 3 },
    ]);

    expect(engine.read(KV.sessions, "ses_1")).toEqual({
      id: "ses_1",
      tags: [],
      commitShas: [],
      observationCount: 3,
      status: "completed",
    });
    expect(engine.calls.some((c) => c.function_id === "state::update")).toBe(false);
    const last = engine.events.at(-1)!;
    expect(last.type).toBe("updated");
    expect((last.old as { tags: unknown }).tags).toEqual([]);
    expect((last.next as { status: string }).status).toBe("completed");
  });

  it("shows the corruption the local path avoids when the engine applies the update", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "file" });
    await kv.set(KV.sessions, "ses_1", { id: "ses_1", tags: [] });
    await kv.update(KV.sessions, "ses_1", [{ type: "set", path: "status", value: "completed" }]);
    expect(engine.read(KV.sessions, "ses_1")).toEqual({ id: "ses_1", tags: {}, status: "completed" });
  });

  it("creates a missing key like the engine does and reports it as created", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    const result = await kv.update<{ old_value: unknown; new_value: unknown }>(KV.sessions, "ghost", [
      { type: "set", path: "status", value: "completed" },
    ]);
    expect(result).toEqual({ old_value: null, new_value: { status: "completed" }, errors: [] });
    expect(engine.events.at(-1)!.type).toBe("created");
  });

  it("serializes concurrent updates to one key so neither write is lost", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    await kv.set("scope", "k", { id: "k" });
    await Promise.all([
      kv.update("scope", "k", [{ type: "set", path: "a", value: 1 }]),
      kv.update("scope", "k", [{ type: "set", path: "b", value: 2 }]),
      kv.update("scope", "k", [{ type: "merge", path: "", value: { c: 3 } }]),
    ]);
    expect(engine.read("scope", "k")).toEqual({ id: "k", a: 1, b: 2, c: 3 });
  });

  it("hands ops it does not mirror to the engine", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    await kv.update("scope", "k", [{ type: "increment", path: "n", value: 1 }]);
    await kv.update("scope", "k", [{ type: "set", path: "__proto__", value: 1 }]);
    expect(engine.calls.filter((c) => c.function_id === "state::update")).toHaveLength(2);
  });

  it("mirrors the engine's set, remove and merge semantics", () => {
    expect(applyUpdateOps(null, [{ type: "set", path: "a", value: 1 }])).toEqual({ a: 1 });
    expect(applyUpdateOps({ a: 1, b: 2 }, [{ type: "remove", path: "a" }])).toEqual({ b: 2 });
    expect(applyUpdateOps({ a: 1 }, [{ type: "set", path: "", value: [] }])).toEqual([]);
    expect(applyUpdateOps({ m: { x: 1 } }, [{ type: "merge", path: "m", value: { y: 2 } }])).toEqual({ m: { x: 1, y: 2 } });
    expect(applyUpdateOps({ m: 5 }, [{ type: "merge", path: "m", value: { y: 2 } }])).toEqual({ m: { y: 2 } });
    expect(applyUpdateOps("text", [{ type: "set", path: "a", value: 1 }])).toBe("text");
    const original = { list: [1] };
    applyUpdateOps(original, [{ type: "set", path: "list", value: [] }]);
    expect(original).toEqual({ list: [1] });
  });

  it("returns list results oldest first on redis, the order the file store keeps", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    const base = Date.UTC(2026, 8, 1);
    const ids = Array.from({ length: 30 }, (_, i) => `mem_${(base + i * 1000).toString(36)}_${"a".repeat(12)}`);
    for (const id of shuffled(ids)) await kv.set(KV.memories, id, { id, createdAt: "2020-01-01T00:00:00.000Z" });
    const listed = await kv.list<{ id: string }>(KV.memories);
    expect(listed.map((m) => m.id)).toEqual(ids);
    const again = await kv.list<{ id: string }>(KV.memories);
    expect(again.map((m) => m.id)).toEqual(ids);
  });

  it("orders records without generated ids by their timestamp fields, then id", () => {
    const rows = [
      { id: "b", startedAt: "2026-09-02T00:00:00.000Z" },
      { id: "c", timestamp: 1 },
      { id: "a", startedAt: "2026-09-02T00:00:00.000Z" },
      { id: "z" },
      { id: "d", createdAt: "2026-09-01T00:00:00.000Z" },
    ];
    expect(orderLikeInsertion(rows).map((r) => r.id)).toEqual(["c", "d", "a", "b", "z"]);
  });

  it("reads the creation time generateId embeds", () => {
    const before = Date.now();
    const at = generatedIdTime(generateId("obs"));
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(before - 1);
    expect(generatedIdTime("mem_0123456789abcdef")).toBeNull();
    expect(generatedIdTime("session-uuid")).toBeNull();
  });

  it("leaves list order alone on the file backend", async () => {
    const values = [{ id: "z" }, { id: "a" }];
    const sdk = { trigger: vi.fn(async () => values) };
    const kv = new StateKV(sdk as never);
    expect(kv.backend).toBe("file");
    expect(await kv.list("scope")).toBe(values);
  });
});

describe("audit migration on the redis backend", () => {
  const savedDataDir = process.env.AGENTMEMORY_DATA_DIR;

  beforeEach(() => {
    process.env.AGENTMEMORY_DATA_DIR = "/nonexistent/agentmemory-redis-test";
  });

  afterEach(() => {
    if (savedDataDir === undefined) delete process.env.AGENTMEMORY_DATA_DIR;
    else process.env.AGENTMEMORY_DATA_DIR = savedDataDir;
  });

  it("marks a fresh redis store done instead of freezing it for a missing file", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    await startAuditMigration(kv);
    const state = await kv.get<{ status: string; safeToListLegacy: boolean }>(KV.auditMonths, AUDIT_MIGRATION_STATE_KEY);
    expect(state?.status).toBe("done");
    expect(state?.safeToListLegacy).toBe(true);
    const result = await queryAudit(kv);
    expect(result.legacyFrozen).toBe(false);
  });

  it("the file probe would have frozen the same store, which is the bug this avoids", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "file" });
    await startAuditMigration(kv, { deleteDelayMs: async () => 0 });
    const state = await kv.get<{ status: string }>(KV.auditMonths, AUDIT_MIGRATION_STATE_KEY);
    expect(state?.status).toBe("unreadable");
  });

  it("moves a legacy redis audit hash into month scopes without waiting for a file flush", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    const rows = [
      { id: "aud_1", timestamp: "2026-08-10T00:00:00.000Z", operation: "forget", functionId: "mem::forget", targetIds: ["mem_1"], details: {} },
      { id: "aud_2", timestamp: "2026-09-10T00:00:00.000Z", operation: "delete", functionId: "mem::governance-delete", targetIds: ["mem_2"], details: {} },
      { id: "aud_3", timestamp: "2026-09-11T00:00:00.000Z", operation: "index_persist", functionId: "x", targetIds: [], details: {} },
    ];
    for (const row of rows) await kv.set(KV.audit, row.id, row);
    const started = Date.now();
    await startAuditMigration(kv);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(engine.hashes.get(`state:${KV.audit}`)?.size ?? 0).toBe(0);
    expect(await kv.get(KV.auditMonth("2026-08"), "aud_1")).not.toBeNull();
    expect(await kv.get(KV.auditMonth("2026-09"), "aud_2")).not.toBeNull();
    expect(await kv.get(KV.auditMonth("2026-09"), "aud_3")).toBeNull();
    const state = await kv.get<{ status: string; migrated: number; purged: number }>(KV.auditMonths, AUDIT_MIGRATION_STATE_KEY);
    expect(state).toMatchObject({ status: "done", migrated: 2, purged: 1 });
  });

  it("sizes the legacy redis scope from its rows and freezes it past the cap", async () => {
    const engine = fakeRedisEngine();
    const kv = new StateKV(engine.sdk as never, { backend: "redis" });
    const saved = process.env.AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES;
    process.env.AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES = "100";
    try {
      await kv.set(KV.audit, "aud_big", { id: "aud_big", timestamp: "2026-09-01T00:00:00.000Z", details: { blob: "x".repeat(500) } });
      const probe = await probeLegacyAuditScope(kv);
      expect(probe).toMatchObject({ safe: false, reason: "too-large" });
    } finally {
      if (saved === undefined) delete process.env.AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES;
      else process.env.AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES = saved;
    }
  });

  it("reports an unreachable redis as unreadable rather than empty", async () => {
    const kv = new StateKV({ trigger: vi.fn(async () => { throw new Error("Failed to get group from Redis"); }) } as never, { backend: "redis" });
    expect(await probeLegacyAuditScope(kv)).toEqual({ safe: false, reason: "unreadable" });
  });
});

describe("viewer stream seeding on the redis backend", () => {
  beforeEach(() => resetViewerStreamTracker());
  afterEach(() => {
    delete process.env.AGENTMEMORY_VIEWER_STREAM_MAX;
    resetViewerStreamTracker();
  });

  it("prunes the oldest items even though redis lists them in arbitrary order", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const base = Date.UTC(2026, 8, 1);
    const ids = Array.from({ length: 203 }, (_, i) => `obs_${(base + i * 1000).toString(36)}_${"b".repeat(12)}`);
    const items = shuffled(ids).map((id) => ({ observation: { id, timestamp: "not-a-date" } }));
    const deleted: string[] = [];
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string; payload: { item_id?: string } }) => {
        if (req.function_id === "stream::list") return items;
        if (req.payload.item_id) deleted.push(req.payload.item_id);
        return {};
      }),
    };
    await expect(seedViewerStreamTracker(sdk as never, { unorderedListing: true })).resolves.toBe(203);
    expect(deleted.sort()).toEqual(ids.slice(0, 3).sort());
  });
});

describe("status on the redis backend", () => {
  function inputs(overrides: Partial<StatusInputs>): StatusInputs {
    return {
      now: new Date("2026-09-28T00:00:00.000Z"),
      version: "0.0.0",
      engineVersion: "0.22.1",
      uptimeSeconds: 10,
      stateBackend: "redis",
      ports: { rest: 3111, streams: 3112, viewer: 3113 },
      health: { status: "healthy", alerts: [] },
      circuitBreaker: null,
      functionMetrics: [],
      provider: "anthropic",
      embeddingProvider: "none",
      flags: [],
      index: {
        bm25Documents: 0,
        vectorDocuments: null,
        observationsIndexed: 0,
        missingObservations: 0,
        sessions: 0,
        bm25Incomplete: false,
        pendingVectorBackfill: 0,
      },
      graph: null,
      graphExtractionEnabled: false,
      auditLegacy: null,
      ...overrides,
    };
  }

  it("flags an unreachable redis as an error with a redis fix and never shows the URL", () => {
    const report = evaluateStatus(inputs({ stateStore: { ok: false } }));
    const problem = report.problems.find((p) => p.code === "state-store-unreachable");
    expect(problem?.level).toBe("error");
    expect(problem?.fix).toContain("AGENTMEMORY_REDIS_URL");
    expect(problem?.fix).toContain("restart agentmemory");
    expect(JSON.stringify(report)).not.toContain("redis://");
    expect(report.service.stateBackend).toBe("redis");
    expect(report.service.stateStore).toEqual({ ok: false });
  });

  it("gives a file-store fix on the default backend", () => {
    const report = evaluateStatus(inputs({ stateBackend: "file", stateStore: { ok: false } }));
    const problem = report.problems.find((p) => p.code === "state-store-unreachable");
    expect(problem?.fix).not.toContain("Redis");
  });

  it("tells redis users how to drop a frozen legacy audit hash", () => {
    const report = evaluateStatus(inputs({ auditLegacy: { status: "too-large", sizeBytes: 1 } }));
    const problem = report.problems.find((p) => p.code === "audit-legacy-frozen");
    expect(problem?.fix).toContain("DEL state:mem:audit");
  });
});

describe("redis event relay probe", () => {
  function fakeSocketFactory(behaviour: { open: boolean; relay: boolean }) {
    const sockets: Array<{ joined: unknown[]; deliver: (data: unknown) => void }> = [];
    const create = () => {
      const socket = {
        readyState: 0,
        onopen: null as null | (() => void),
        onmessage: null as null | ((e: { data: unknown }) => void),
        onclose: null as null | (() => void),
        onerror: null as null | (() => void),
        joined: [] as unknown[],
        send(data: string) {
          socket.joined.push(JSON.parse(data));
        },
        close() {
          socket.readyState = 3;
        },
        deliver(data: unknown) {
          socket.onmessage?.({ data: JSON.stringify(data) });
        },
      };
      sockets.push(socket);
      setTimeout(() => {
        if (behaviour.open) {
          socket.readyState = 1;
          socket.onopen?.();
        } else {
          socket.onerror?.();
        }
      }, 1);
      return socket;
    };
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string; payload: { data: { nonce: string } } }) => {
        if (behaviour.relay) {
          setTimeout(() => {
            for (const s of sockets) s.deliver({ type: "stream", event: { type: "event", event: { type: "relay.probe", data: req.payload.data } } });
          }, 1);
        }
        return null;
      }),
    };
    return { create, sdk, sockets };
  }

  it("reports ok when the probe event comes back over the stream", async () => {
    const { createStreamRelayProbe } = await import("../src/health/stream-relay-probe.js");
    const f = fakeSocketFactory({ open: true, relay: true });
    const probe = createStreamRelayProbe(f.sdk as never, { url: "ws://x", timeoutMs: 200, createSocket: f.create as never });
    expect(await probe.check()).toBe("ok");
    expect(await probe.check()).toBe("ok");
    expect(f.sockets).toHaveLength(1);
    expect(f.sockets[0]!.joined[0]).toMatchObject({ type: "join", data: { streamName: "mem-live", groupId: "relay-probe" } });
    probe.close();
  });

  it("reports down when the engine accepts the event but never relays it", async () => {
    const { createStreamRelayProbe } = await import("../src/health/stream-relay-probe.js");
    const f = fakeSocketFactory({ open: true, relay: false });
    const probe = createStreamRelayProbe(f.sdk as never, { url: "ws://x", timeoutMs: 100, createSocket: f.create as never });
    expect(await probe.check()).toBe("down");
    probe.close();
  });

  it("reports down when the send itself fails and unknown when the stream port is closed", async () => {
    const { createStreamRelayProbe } = await import("../src/health/stream-relay-probe.js");
    const f = fakeSocketFactory({ open: true, relay: false });
    f.sdk.trigger.mockRejectedValueOnce(new Error("Failed to publish event to Redis"));
    const probe = createStreamRelayProbe(f.sdk as never, { url: "ws://x", timeoutMs: 100, createSocket: f.create as never });
    expect(await probe.check()).toBe("down");
    const closed = fakeSocketFactory({ open: false, relay: true });
    const probe2 = createStreamRelayProbe(closed.sdk as never, { url: "ws://x", timeoutMs: 100, createSocket: closed.create as never });
    expect(await probe2.check()).toBe("unknown");
    probe.close();
    probe2.close();
  });

  it("turns a dead relay into a degraded health alert with a restart fix", async () => {
    const { evaluateHealth } = await import("../src/health/thresholds.js");
    const { describeHealthAlert } = await import("../src/functions/status.js");
    const result = evaluateHealth({
      connectionState: "connected",
      workers: [],
      memory: { heapUsed: 1, heapTotal: 100, rss: 1, external: 0 },
      cpu: { userMicros: 0, systemMicros: 0, percent: 1 },
      eventLoopLagMs: 1,
      uptimeSeconds: 1,
      streamRelay: "down",
      status: "healthy",
      alerts: [],
    } as never);
    expect(result.status).toBe("degraded");
    expect(result.alerts).toContain("stream_relay_down");
    const described = describeHealthAlert("stream_relay_down");
    expect(described.fix).toContain("Restart agentmemory");
  });
});
