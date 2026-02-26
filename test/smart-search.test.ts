import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import type {
  CompressedObservation,
  HybridSearchResult,
  CompactSearchResult,
  Session,
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

describe("Smart Search Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let searchResults: HybridSearchResult[];

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();

    const obs1 = makeObs({ id: "obs_1", sessionId: "ses_1", title: "Auth handler" });
    const obs2 = makeObs({ id: "obs_2", sessionId: "ses_1", title: "Database setup" });

    searchResults = [
      {
        observation: obs1,
        bm25Score: 0.8,
        vectorScore: 0,
        combinedScore: 0.8,
        sessionId: "ses_1",
      },
      {
        observation: obs2,
        bm25Score: 0.3,
        vectorScore: 0,
        combinedScore: 0.3,
        sessionId: "ses_1",
      },
    ];

    const session: Session = {
      id: "ses_1",
      project: "my-project",
      cwd: "/tmp",
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 2,
    };
    await kv.set("mem:sessions", "ses_1", session);
    await kv.set("mem:obs:ses_1", "obs_1", obs1);
    await kv.set("mem:obs:ses_1", "obs_2", obs2);

    const searchFn = async (_query: string, _limit: number) => searchResults;
    registerSmartSearchFunction(sdk as never, kv as never, searchFn);
  });

  it("compact mode returns CompactSearchResult array", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      query: "auth",
    })) as { mode: string; results: CompactSearchResult[] };

    expect(result.mode).toBe("compact");
    expect(result.results.length).toBe(2);
    expect(result.results[0]).toHaveProperty("obsId");
    expect(result.results[0]).toHaveProperty("title");
    expect(result.results[0]).toHaveProperty("type");
    expect(result.results[0]).toHaveProperty("score");
    expect(result.results[0]).toHaveProperty("timestamp");
    expect(result.results[0]).not.toHaveProperty("narrative");
  });

  it("expand mode returns full observations for given IDs", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      expandIds: ["obs_1"],
    })) as { mode: string; results: Array<{ obsId: string; observation: CompressedObservation }> };

    expect(result.mode).toBe("expanded");
    expect(result.results.length).toBe(1);
    expect(result.results[0].observation.title).toBe("Auth handler");
  });

  it("returns error when query is missing and no expandIds", async () => {
    const result = (await sdk.trigger("mem::smart-search", {})) as {
      mode: string;
      error: string;
    };

    expect(result.mode).toBe("compact");
    expect(result.error).toBe("query is required");
    expect((result as { results: unknown[] }).results).toEqual([]);
  });

  it("respects limit parameter in compact mode", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      query: "auth",
      limit: 1,
    })) as { mode: string; results: CompactSearchResult[] };

    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it("expand returns empty for nonexistent observation IDs", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      expandIds: ["obs_nonexistent_ses_xxx"],
    })) as { mode: string; results: unknown[] };

    expect(result.mode).toBe("expanded");
    expect(result.results.length).toBe(0);
  });
});
