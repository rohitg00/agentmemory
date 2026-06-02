import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  registerSmartSearchFunction,
  getFollowupStats,
  resetFollowupStatsForTests,
  flushPendingFollowups,
} from "../src/functions/smart-search.js";
import { registerRecentSearchesSweepFunction } from "../src/functions/recent-searches-sweep.js";
import { KV } from "../src/state/schema.js";
import type { HybridSearchResult } from "../src/types.js";

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
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    getStore: () => store,
  };
}

function mockSdk(kv: ReturnType<typeof mockKV>) {
  const functions = new Map<string, Function>();
  const sdk = {
    registerFunction: (
      idOrOpts: string | { id: string },
      handler: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload?: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload =
        typeof idOrInput === "string" ? data : (idOrInput as any).payload;
      const fn = functions.get(id);
      if (!fn) {
        if (id === "mem::lesson-recall") return { success: true, lessons: [] };
        throw new Error(`No function: ${id}`);
      }
      const result = await fn(payload);
      // smart-search now runs followup detection off the critical
      // response path; drain it before returning so test assertions
      // see consistent state.
      if (id === "mem::smart-search") await flushPendingFollowups();
      return result;
    },
  } as any;
  void kv;
  return sdk;
}

function makeHit(obsId: string, sessionId = "ses_1"): HybridSearchResult {
  return {
    observation: {
      id: obsId,
      sessionId,
      timestamp: new Date().toISOString(),
      title: `obs ${obsId}`,
      narrative: "n",
      type: "pattern",
      concepts: [],
      files: [],
    } as any,
    sessionId,
    combinedScore: 0.8,
  } as HybridSearchResult;
}

describe("Smart-search followup-rate diagnostic (#771)", () => {
  let sdk: any;
  let kv: ReturnType<typeof mockKV>;
  let searchResults: HybridSearchResult[];

  beforeEach(() => {
    delete process.env.AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS;
    resetFollowupStatsForTests();
    kv = mockKV();
    sdk = mockSdk(kv);
    searchResults = [];
    registerSmartSearchFunction(sdk, kv as any, async () => searchResults);
    registerRecentSearchesSweepFunction(sdk, kv as any);
  });

  afterEach(() => {
    delete process.env.AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS;
  });

  it("records the first agent-initiated search but does not flag it as a followup", async () => {
    searchResults = [makeHit("obs_a"), makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "auth flow",
      sessionId: "ses_1",
    });

    const stats = getFollowupStats();
    expect(stats.agentInitiatedSearches).toBe(1);
    expect(stats.followupWithinWindow).toBe(0);

    const stored = await kv.get(KV.recentSearches, "ses_1");
    expect(stored).not.toBeNull();
    expect((stored as any).sessionId).toBe("ses_1");
    expect((stored as any).query).toBe("auth flow");
  });

  it("flags a follow-up when the second search inside the window returns a disjoint set", async () => {
    searchResults = [makeHit("obs_a"), makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "auth flow",
      sessionId: "ses_1",
    });

    searchResults = [makeHit("obs_c"), makeHit("obs_d")];
    await sdk.trigger("mem::smart-search", {
      query: "token expiry handling",
      sessionId: "ses_1",
    });

    const stats = getFollowupStats();
    expect(stats.agentInitiatedSearches).toBe(2);
    expect(stats.followupWithinWindow).toBe(1);
    expect(stats.rate).toBeCloseTo(0.5);
  });

  it("does not flag a follow-up when result sets overlap", async () => {
    searchResults = [makeHit("obs_a"), makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "auth flow",
      sessionId: "ses_1",
    });

    searchResults = [makeHit("obs_b"), makeHit("obs_c")];
    await sdk.trigger("mem::smart-search", {
      query: "auth token",
      sessionId: "ses_1",
    });

    const stats = getFollowupStats();
    expect(stats.followupWithinWindow).toBe(0);
  });

  it("does not flag a follow-up on an identical re-query (retry, not follow-up)", async () => {
    searchResults = [makeHit("obs_a")];
    await sdk.trigger("mem::smart-search", {
      query: "auth flow",
      sessionId: "ses_1",
    });

    // Different result set on the retry (e.g. flaky search index), but
    // same query — still not a follow-up.
    searchResults = [makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "auth flow",
      sessionId: "ses_1",
    });

    expect(getFollowupStats().followupWithinWindow).toBe(0);
  });

  it("does not flag a follow-up when prior search is outside the window", async () => {
    process.env.AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS = "1";
    searchResults = [makeHit("obs_a")];
    await sdk.trigger("mem::smart-search", {
      query: "first",
      sessionId: "ses_1",
    });

    // Backdate the stored search so the window has elapsed.
    const stored = (await kv.get(KV.recentSearches, "ses_1")) as any;
    stored.at = Date.now() - 5_000;
    await kv.set(KV.recentSearches, "ses_1", stored);

    searchResults = [makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "second",
      sessionId: "ses_1",
    });

    expect(getFollowupStats().followupWithinWindow).toBe(0);
  });

  it("skips viewer-originated searches (source === 'viewer')", async () => {
    searchResults = [makeHit("obs_a")];
    await sdk.trigger("mem::smart-search", {
      query: "from viewer",
      sessionId: "ses_1",
      source: "viewer",
    });

    expect(getFollowupStats().agentInitiatedSearches).toBe(0);
    // Viewer call shouldn't write to recent-searches either, otherwise
    // a subsequent agent call would treat the viewer search as prior.
    expect(await kv.get(KV.recentSearches, "ses_1")).toBeNull();
  });

  it("skips searches without a sessionId (direct sdk callers)", async () => {
    searchResults = [makeHit("obs_a")];
    await sdk.trigger("mem::smart-search", { query: "no session" });

    expect(getFollowupStats().agentInitiatedSearches).toBe(0);
  });

  it("recent-searches sweep deletes rows older than 24h, keeps fresh ones", async () => {
    const fresh = {
      sessionId: "ses_fresh",
      query: "x",
      resultIds: [],
      at: Date.now() - 1_000,
    };
    const stale = {
      sessionId: "ses_stale",
      query: "x",
      resultIds: [],
      at: Date.now() - 25 * 60 * 60 * 1000,
    };
    await kv.set(KV.recentSearches, fresh.sessionId, fresh);
    await kv.set(KV.recentSearches, stale.sessionId, stale);

    const result = (await sdk.trigger(
      "mem::diagnostic::recent-searches-sweep",
      {},
    )) as { swept: number };

    expect(result.swept).toBe(1);
    expect(await kv.get(KV.recentSearches, "ses_fresh")).not.toBeNull();
    expect(await kv.get(KV.recentSearches, "ses_stale")).toBeNull();
  });

  it("skips detection when current results are empty (retrieval failure, not reader failure)", async () => {
    searchResults = [makeHit("obs_a"), makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "first",
      sessionId: "ses_1",
    });

    // Empty result set on the next call. Without the empty-skip guard
    // the empty-vs-prior comparison would be vacuously "disjoint" and
    // inflate the rate. Skip detection entirely.
    searchResults = [];
    await sdk.trigger("mem::smart-search", {
      query: "second",
      sessionId: "ses_1",
    });

    const stats = getFollowupStats();
    // Only the first call counts as agent-initiated; the empty-result
    // second call is skipped entirely.
    expect(stats.agentInitiatedSearches).toBe(1);
    expect(stats.followupWithinWindow).toBe(0);
  });

  it("followup-stats function returns the configured window and live counts", async () => {
    process.env.AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS = "45";
    searchResults = [makeHit("obs_a")];
    await sdk.trigger("mem::smart-search", {
      query: "q1",
      sessionId: "ses_1",
    });
    searchResults = [makeHit("obs_b")];
    await sdk.trigger("mem::smart-search", {
      query: "q2",
      sessionId: "ses_1",
    });

    const stats = (await sdk.trigger(
      "mem::diagnostic::followup-stats",
      {},
    )) as {
      success: boolean;
      windowSeconds: number;
      agentInitiatedSearches: number;
      followupWithinWindow: number;
      rate: number;
    };

    expect(stats.success).toBe(true);
    expect(stats.windowSeconds).toBe(45);
    expect(stats.agentInitiatedSearches).toBe(2);
    expect(stats.followupWithinWindow).toBe(1);
    expect(stats.rate).toBeCloseTo(0.5);
  });
});
