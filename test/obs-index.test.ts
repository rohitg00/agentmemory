import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import {
  indexObservationSession,
  unindexObservationSession,
  lookupObservationSession,
} from "../src/state/obs-index.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, HybridSearchResult } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    }),
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (
      idOrOpts: string | { id: string },
      handler: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function makeObs(
  overrides: Partial<CompressedObservation> = {},
): CompressedObservation {
  return {
    id: "obs_1",
    sessionId: "ses_1",
    timestamp: "2026-02-01T10:00:00Z",
    type: "file_edit",
    title: "Edit auth handler",
    facts: [],
    narrative: "Modified auth",
    concepts: ["auth"],
    files: ["src/auth.ts"],
    importance: 7,
    ...overrides,
  };
}

describe("obs-session reverse index — maintenance (kv-access finding 6)", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("indexObservationSession writes a lookup entry", async () => {
    await indexObservationSession(kv as never, "obs_a", "ses_a");
    expect(await lookupObservationSession(kv as never, "obs_a")).toBe("ses_a");
  });

  it("unindexObservationSession removes the entry", async () => {
    await indexObservationSession(kv as never, "obs_a", "ses_a");
    await unindexObservationSession(kv as never, "obs_a");
    expect(await lookupObservationSession(kv as never, "obs_a")).toBeNull();
  });

  it("lookupObservationSession returns null for an unknown id", async () => {
    expect(await lookupObservationSession(kv as never, "obs_never_seen")).toBeNull();
  });

  it("shards writes across multiple KV scopes rather than one giant scope", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `obs_${i}_${"x".repeat(i % 5)}`);
    for (const id of ids) {
      await indexObservationSession(kv as never, id, "ses_shared");
    }

    const scopesTouched = new Set(
      kv.set.mock.calls
        .map(([scope]) => scope as string)
        .filter((scope) => scope.startsWith("mem:idx:obs:")),
    );
    expect(scopesTouched.size).toBeGreaterThan(1);
    for (const scope of scopesTouched) {
      expect(scope).toMatch(/^mem:idx:obs:\d+$/);
    }
  });
});

describe("mem::smart-search expandIds — uses the reverse index (kv-access finding 6)", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    const searchFn = async (
      _query: string,
      _limit: number,
    ): Promise<HybridSearchResult[]> => [];
    registerSmartSearchFunction(sdk as never, kv as never, searchFn);
  });

  it("finds an observation via the reverse index without scanning every session", async () => {
    const obs = makeObs({ id: "obs_indexed", sessionId: "ses_target" });
    await kv.set(KV.observations("ses_target"), "obs_indexed", obs);
    await indexObservationSession(kv as never, "obs_indexed", "ses_target");

    const decoySessions = Array.from({ length: 8 }, (_, i) => ({
      id: `ses_decoy_${i}`,
    }));
    await Promise.all(
      decoySessions.map((s) => kv.set(KV.sessions, s.id, s)),
    );
    kv.list.mockClear();

    const result = (await sdk.trigger("mem::smart-search", {
      expandIds: ["obs_indexed"],
    })) as { mode: string; results: Array<{ observation: CompressedObservation }> };

    expect(result.results.length).toBe(1);
    expect(result.results[0].observation.title).toBe("Edit auth handler");
    expect(
      kv.list.mock.calls.some(([scope]) => scope === KV.sessions),
    ).toBe(false);
  });

  it("falls back to scanning sessions when the reverse index has no entry, then backfills it", async () => {
    const obs = makeObs({ id: "obs_unindexed", sessionId: "ses_fallback" });
    await kv.set(KV.sessions, "ses_fallback", { id: "ses_fallback" });
    await kv.set(KV.observations("ses_fallback"), "obs_unindexed", obs);

    expect(
      await lookupObservationSession(kv as never, "obs_unindexed"),
    ).toBeNull();

    const result = (await sdk.trigger("mem::smart-search", {
      expandIds: ["obs_unindexed"],
    })) as { mode: string; results: Array<{ observation: CompressedObservation }> };

    expect(result.results.length).toBe(1);
    expect(result.results[0].observation.id).toBe("obs_unindexed");

    expect(
      await lookupObservationSession(kv as never, "obs_unindexed"),
    ).toBe("ses_fallback");
  });

  it("returns nothing for an id that exists nowhere, without throwing", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      expandIds: ["obs_does_not_exist"],
    })) as { mode: string; results: unknown[] };

    expect(result.mode).toBe("expanded");
    expect(result.results.length).toBe(0);
  });
});
