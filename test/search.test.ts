import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerSearchFunction, getSearchIndex, rebuildIndex, setVectorIndex, setEmbeddingProvider, getVectorIndex } from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

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
  };
}

describe("mem::search", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerSearchFunction(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-01-01T00:00:00Z",
      status: "completed",
      observationCount: 2,
    };
    await kv.set(KV.sessions, session.id, session);

    const obsA: CompressedObservation = {
      id: "obs_a",
      sessionId: "ses_1",
      timestamp: "2026-01-01T00:00:00Z",
      type: "decision",
      title: "Auth middleware decision",
      subtitle: "JWT strategy",
      facts: ["Use rotating refresh tokens"],
      narrative: "Implemented auth middleware with JWT refresh rotation.",
      concepts: ["auth", "jwt"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    const obsB: CompressedObservation = {
      id: "obs_b",
      sessionId: "ses_1",
      timestamp: "2026-01-02T00:00:00Z",
      type: "file_edit",
      title: "UI button styling",
      facts: ["Updated primary button color"],
      narrative: "Adjusted button styles in the settings page.",
      concepts: ["ui", "css"],
      files: ["src/ui/button.tsx"],
      importance: 4,
    };

    await kv.set(KV.observations("ses_1"), obsA.id, obsA);
    await kv.set(KV.observations("ses_1"), obsB.id, obsB);

    // Module-level SearchIndex singleton would leak across tests; reset.
    getSearchIndex().clear();
    // mem::search awaits a shared rebuild on a cold index; the explicit call
    // here pre-populates the index deterministically so the query assertions
    // below never depend on that cold-start path.
    await rebuildIndex(kv as never);
  });

  it("returns full format by default", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth middleware",
    })) as { format: string; results: Array<{ observation: CompressedObservation }> };

    expect(result.format).toBe("full");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.observation.id).toBe("obs_a");
  });

  it("returns compact format when requested", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "compact",
    })) as { format: string; results: Array<{ obsId: string; title: string }> };

    expect(result.format).toBe("compact");
    expect(result.results[0]?.obsId).toBe("obs_a");
    expect(result.results[0]?.title).toBe("Auth middleware decision");
  });

  it("returns narrative text and respects token budget", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth ui",
      format: "narrative",
      token_budget: 20,
    })) as {
      format: string;
      results: Array<{ obsId: string }>;
      text: string;
      tokens_used: number;
      tokens_budget: number;
      truncated: boolean;
    };

    expect(result.format).toBe("narrative");
    expect(result.tokens_budget).toBe(20);
    expect(result.tokens_used).toBeLessThanOrEqual(20);
    expect(typeof result.text).toBe("string");
    expect(result.results.length).toBeLessThanOrEqual(2);
    expect(result.truncated).toBe(true);
  });

  it("rejects invalid format values", async () => {
    await expect(
      sdk.trigger("mem::search", { query: "auth", format: "verbose" }),
    ).rejects.toThrow("format must be one of");
  });

  it("surfaces saved memories from KV.memories (#265)", async () => {
    // mem::remember persists to KV.memories under a synthetic sessionId
    // ("memory") that has no corresponding KV.observations entry. mem::search
    // must fall back to KV.memories or memory_recall returns empty.
    await kv.set(KV.memories, "mem_x1", {
      id: "mem_x1",
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      type: "fact",
      title: "Pineapple belongs on pizza",
      content: "Pineapple belongs on pizza for testing fallback path.",
      concepts: ["pineapple", "pizza"],
      files: [],
      sessionIds: [],
      strength: 7,
      version: 1,
      isLatest: true,
    });
    // Force the rebuild to pick up the new memory (mem::search only
    // rebuilds on first call when idx.size === 0).
    await rebuildIndex(kv as never);

    const result = (await sdk.trigger("mem::search", {
      query: "pineapple pizza",
      format: "compact",
    })) as { results: Array<{ obsId: string; title: string }> };

    const hit = result.results.find((r) => r.obsId === "mem_x1");
    expect(hit).toBeDefined();
    expect(hit?.title).toBe("Pineapple belongs on pizza");
  });

  it("rebuildIndex populates the vector index", async () => {
    const mockEmbedder = {
      name: "test",
      dimensions: 3,
      embed: async (_text: string) => new Float32Array([0.1, 0.2, 0.3]),
      embedBatch: async (_texts: string[]) =>
        _texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
    };
    setEmbeddingProvider(mockEmbedder);
    setVectorIndex(new VectorIndex());

    await rebuildIndex(kv as never);

    const vi = getVectorIndex();
    expect(vi).not.toBeNull();
    expect(vi!.size).toBeGreaterThan(0);

    // Cleanup
    setVectorIndex(null);
    setEmbeddingProvider(null);
  });
});

describe("mem::search token budget contract (#1232)", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  const LONG_PROSE =
    "This is a deliberately authored decision record. ".repeat(60) +
    "The decision is to adopt a rotating refresh token strategy for auth middleware.";

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerSearchFunction(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-01-01T00:00:00Z",
      status: "completed",
      observationCount: 2,
    };
    await kv.set(KV.sessions, session.id, session);

    const longObs: CompressedObservation = {
      id: "obs_long",
      sessionId: "ses_1",
      timestamp: "2026-01-01T00:00:00Z",
      type: "decision",
      title: "Auth refresh token strategy decision",
      facts: ["Rotating refresh tokens adopted"],
      narrative: LONG_PROSE,
      concepts: ["auth", "jwt", "tokens"],
      files: ["src/auth.ts"],
      importance: 9,
    };
    const shortObs: CompressedObservation = {
      id: "obs_short",
      sessionId: "ses_1",
      timestamp: "2026-01-02T00:00:00Z",
      type: "file_edit",
      title: "auth middleware bug",
      facts: ["Fixed a null pointer in the auth middleware"],
      narrative: "Fixed a null pointer in the auth middleware.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 3,
    };
    await kv.set(KV.observations("ses_1"), longObs.id, longObs);
    await kv.set(KV.observations("ses_1"), shortObs.id, shortObs);

    getSearchIndex().clear();
    await rebuildIndex(kv as never);
  });

  it("returns the top match clipped when it alone exceeds the budget (full)", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "record decision auth",
      limit: 4,
      token_budget: 200,
    })) as {
      results: Array<{
        observation: CompressedObservation;
        content_truncated?: boolean;
      }>;
      tokens_used: number;
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results.length).toBe(1);
    expect(result.results[0]?.observation.id).toBe("obs_long");
    expect(result.results[0]?.content_truncated).toBe(true);
    expect(result.tokens_used).toBeGreaterThan(0);
    expect(result.tokens_used).toBeLessThanOrEqual(200);
    expect(result.truncated).toBe(true);
    expect(result.excluded_by_budget).toBe(1);
    expect(result.results[0]?.observation.narrative.length).toBeLessThan(
      LONG_PROSE.length,
    );
    expect(result.results[0]?.observation.facts).toEqual([
      "Rotating refresh tokens adopted",
    ]);
  });

  it("keeps the top match intact and reports nothing excluded when the budget fits (full)", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "record decision auth",
      limit: 4,
      token_budget: 5000,
    })) as {
      results: Array<{ observation: CompressedObservation; content_truncated?: boolean }>;
      tokens_used: number;
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.observation.id).toBe("obs_long");
    expect(result.results[0]?.observation.narrative).toBe(LONG_PROSE);
    expect(result.results[0]?.content_truncated).toBeUndefined();
    expect(result.truncated).toBe(false);
    expect(result.excluded_by_budget).toBeUndefined();
  });

  it("still returns an empty result with no drop report for a genuine miss", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "zzz qqq xqq",
      limit: 4,
      token_budget: 200,
    })) as {
      results: unknown[];
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.excluded_by_budget).toBeUndefined();
  });

  it("reports results excluded by the budget after the first item", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth middleware bug",
      limit: 4,
      token_budget: 150,
    })) as {
      results: Array<{
        observation: CompressedObservation;
        content_truncated?: boolean;
      }>;
      tokens_used: number;
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.observation.id).toBe("obs_short");
    expect(result.results[0]?.content_truncated).toBeUndefined();
    expect(result.tokens_used).toBeLessThanOrEqual(150);
    expect(result.truncated).toBe(true);
    expect(result.excluded_by_budget).toBe(1);
  });

  it("clips the top match in narrative format and keeps text consistent", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "record decision auth",
      limit: 4,
      format: "narrative",
      token_budget: 200,
    })) as {
      results: Array<{ obsId: string; narrative: string; content_truncated?: boolean }>;
      text: string;
      tokens_used: number;
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.obsId).toBe("obs_long");
    expect(result.results[0]?.content_truncated).toBe(true);
    expect(result.tokens_used).toBeLessThanOrEqual(200);
    expect(result.text).toContain(result.results[0]?.narrative);
    expect(result.text).not.toContain(LONG_PROSE);
    expect(result.excluded_by_budget).toBe(1);
  });

  it("reports the drop when even the text-free form cannot fit the budget", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "record decision auth",
      limit: 4,
      format: "compact",
      token_budget: 10,
    })) as {
      results: unknown[];
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.excluded_by_budget).toBe(2);
  });

  it("clips a compact title when the metadata floor fits", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "record decision auth",
      limit: 1,
      format: "compact",
      token_budget: 55,
    })) as {
      results: Array<{ title: string; content_truncated?: boolean }>;
      tokens_used: number;
      truncated: boolean;
      excluded_by_budget?: number;
    };

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.content_truncated).toBe(true);
    expect(result.results[0]?.title.length).toBeLessThan(
      "Auth refresh token strategy decision".length,
    );
    expect(result.tokens_used).toBeLessThanOrEqual(55);
    expect(result.truncated).toBe(false);
    expect(result.excluded_by_budget).toBeUndefined();
  });

  it("clips memory-derived records whose content duplicates into facts", async () => {
    const memoryContent =
      "Deployed the gift card payments toggle fix to production. ".repeat(40);
    await kv.set(KV.memories, "mem_gift", {
      id: "mem_gift",
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      type: "fact",
      title: "Gift card payments toggle fix deployment",
      content: memoryContent,
      concepts: ["gift", "payments"],
      files: [],
      sessionIds: [],
      strength: 7,
      version: 1,
      isLatest: true,
    });
    await rebuildIndex(kv as never);

    const result = (await sdk.trigger("mem::search", {
      query: "gift card payments toggle deployment",
      limit: 4,
      token_budget: 200,
    })) as {
      results: Array<{
        observation: CompressedObservation;
        content_truncated?: boolean;
      }>;
      tokens_used: number;
      truncated: boolean;
      excluded_by_budget?: number;
    };

    const hit = result.results.find((r) => r.observation.id === "mem_gift");
    expect(hit).toBeDefined();
    expect(hit?.content_truncated).toBe(true);
    expect(result.tokens_used).toBeLessThanOrEqual(200);
    expect(result.truncated).toBe(false);
    expect(result.excluded_by_budget).toBeUndefined();
    expect(hit?.observation.facts[0]?.length).toBeLessThan(memoryContent.length);
  });
});
