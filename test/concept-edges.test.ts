import { describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: vi.fn(() => ({ type: "void" })),
    },
  };
});

import { vi } from "vitest";
import {
  registerConceptEdgesFunction,
  conceptEdgeKey,
} from "../src/functions/concept-edges.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { getSearchIndex, setIndexPersistence } from "../src/functions/search.js";
import { KV } from "../src/state/schema.js";
import type { ConceptEdge } from "../src/types.js";

const EDGES = "mem:concept-edges";
const MIGRATION_KEY = "migrations:concept-edges-backfill";

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
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown; action?: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) return {};
      return fn(input.payload);
    },
  };
}

describe("conceptEdgeKey", () => {
  it("is canonical for unordered pairs", () => {
    expect(conceptEdgeKey("jwt", "auth")).toBe("auth|jwt");
    expect(conceptEdgeKey("auth", "jwt")).toBe("auth|jwt");
  });
});

describe("mem::concept-edges-derive", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerConceptEdgesFunction(sdk as never, kv as never);
  });

  it("creates one edge per unordered concept pair", async () => {
    const result = await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: { concepts: ["auth", "jwt", "session-token"] },
    });

    expect(result).toMatchObject({ success: true, edgesTouched: 3 });
    const edges = await kv.list<ConceptEdge>(EDGES);
    expect(edges).toHaveLength(3);

    const edge = await kv.get<ConceptEdge>(EDGES, "auth|jwt");
    expect(edge).toMatchObject({
      from: "auth",
      to: "jwt",
      strength: 0.5,
      reinforcements: 0,
      decayRate: 0.05,
    });
    expect(edge!.createdAt).toBeTruthy();
    expect(edge!.lastSeenAt).toBeTruthy();
  });

  it("reinforces existing edges on repeated co-occurrence", async () => {
    await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: { concepts: ["auth", "jwt"] },
    });
    await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: { concepts: ["auth", "jwt"] },
    });

    const edge = await kv.get<ConceptEdge>(EDGES, "auth|jwt");
    // same curve as reinforceLesson: 0.5 + 0.1 * (1 - 0.5) = 0.55
    expect(edge!.strength).toBeCloseTo(0.55, 10);
    expect(edge!.reinforcements).toBe(1);
    const edges = await kv.list<ConceptEdge>(EDGES);
    expect(edges).toHaveLength(1);
  });

  it("strength saturates below 1.0", async () => {
    for (let i = 0; i < 100; i++) {
      await sdk.trigger({
        function_id: "mem::concept-edges-derive",
        payload: { concepts: ["auth", "jwt"] },
      });
    }
    const edge = await kv.get<ConceptEdge>(EDGES, "auth|jwt");
    expect(edge!.strength).toBeLessThanOrEqual(1.0);
    expect(edge!.strength).toBeGreaterThan(0.99);
    expect(edge!.reinforcements).toBe(99);
  });

  it("normalizes casing and whitespace before pairing", async () => {
    const result = await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: { concepts: ["JWT", " jwt ", "Auth", "auth"] },
    });

    // collapses to {jwt, auth} -> single edge
    expect(result).toMatchObject({ success: true, edgesTouched: 1 });
    const edge = await kv.get<ConceptEdge>(EDGES, "auth|jwt");
    expect(edge).not.toBeNull();
  });

  it("ignores empty and non-string entries", async () => {
    const result = await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: { concepts: ["auth", "", "   ", 42 as never, null as never] },
    });

    expect(result).toMatchObject({ success: true, edgesTouched: 0 });
    expect(await kv.list(EDGES)).toHaveLength(0);
  });

  it("derives nothing for fewer than two concepts", async () => {
    const result = await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: { concepts: ["auth"] },
    });
    expect(result).toMatchObject({ success: true, edgesTouched: 0 });
  });

  it("rejects a missing concepts array", async () => {
    const result = await sdk.trigger({
      function_id: "mem::concept-edges-derive",
      payload: {},
    });
    expect(result).toMatchObject({
      success: false,
      error: "concepts must be an array",
    });
  });
});

describe("mem::concept-edges-backfill", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerConceptEdgesFunction(sdk as never, kv as never);
  });

  it("backfills edges from existing memories and sets the migration flag", async () => {
    await kv.set(KV.memories, "mem_1", {
      id: "mem_1",
      concepts: ["auth", "jwt"],
    });
    await kv.set(KV.memories, "mem_2", {
      id: "mem_2",
      concepts: ["jwt", "session-token"],
    });
    await kv.set(KV.memories, "mem_3", {
      id: "mem_3",
      concepts: ["solo-concept"],
    });

    const result = await sdk.trigger({
      function_id: "mem::concept-edges-backfill",
      payload: {},
    });

    expect(result).toMatchObject({
      success: true,
      memoriesWalked: 2,
      edgesTouched: 2,
    });
    expect(await kv.get<ConceptEdge>(EDGES, "auth|jwt")).not.toBeNull();
    expect(
      await kv.get<ConceptEdge>(EDGES, "jwt|session-token"),
    ).not.toBeNull();
    expect(await kv.get<boolean>(KV.state, MIGRATION_KEY)).toBe(true);
  });

  it("is a no-op once the migration flag is set", async () => {
    await kv.set(KV.state, MIGRATION_KEY, true);
    await kv.set(KV.memories, "mem_1", {
      id: "mem_1",
      concepts: ["auth", "jwt"],
    });

    const result = await sdk.trigger({
      function_id: "mem::concept-edges-backfill",
      payload: {},
    });

    expect(result).toMatchObject({ success: true, skipped: "already-migrated" });
    expect(await kv.list(EDGES)).toHaveLength(0);
  });

  it("skips when edges already exist and marks migration complete", async () => {
    await kv.set(EDGES, "auth|jwt", {
      from: "auth",
      to: "jwt",
      strength: 0.5,
      reinforcements: 0,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      decayRate: 0.05,
    });
    await kv.set(KV.memories, "mem_1", {
      id: "mem_1",
      concepts: ["auth", "jwt"],
    });

    const result = await sdk.trigger({
      function_id: "mem::concept-edges-backfill",
      payload: {},
    });

    expect(result).toMatchObject({
      success: true,
      skipped: "edges-already-present",
    });
    const edge = await kv.get<ConceptEdge>(EDGES, "auth|jwt");
    expect(edge!.reinforcements).toBe(0); // untouched, no double-reinforce
    expect(await kv.get<boolean>(KV.state, MIGRATION_KEY)).toBe(true);
  });

  it("handles memories without a concepts field", async () => {
    await kv.set(KV.memories, "mem_legacy", { id: "mem_legacy" });

    const result = await sdk.trigger({
      function_id: "mem::concept-edges-backfill",
      payload: {},
    });

    expect(result).toMatchObject({
      success: true,
      memoriesWalked: 0,
      edgesTouched: 0,
    });
  });
});

describe("mem::remember — concept edge derivation hook", () => {
  beforeEach(() => {
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  it("derives concept edges when a memory with 2+ concepts is saved", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    registerConceptEdgesFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "express-jwt requires trimmed Bearer token",
        type: "bug",
        concepts: ["auth", "jwt", "express"],
      },
    });

    expect(result).toMatchObject({ success: true });
    const edges = await kv.list<ConceptEdge>(EDGES);
    expect(edges).toHaveLength(3);
    expect(await kv.get<ConceptEdge>(EDGES, "auth|jwt")).not.toBeNull();
  });

  it("does not derive edges for a single-concept memory", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    registerConceptEdgesFunction(sdk as never, kv as never);

    await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "standalone fact",
        concepts: ["solo"],
      },
    });

    expect(await kv.list(EDGES)).toHaveLength(0);
  });
});
