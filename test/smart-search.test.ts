import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

  it("compact mode records access for every returned observation id (#119)", async () => {
    await sdk.trigger("mem::smart-search", { query: "auth" });
    // recordAccessBatch is fire-and-forget — let the microtask queue drain.
    await new Promise((r) => setImmediate(r));

    const log1 = (await kv.get("mem:access", "obs_1")) as {
      count: number;
    } | null;
    const log2 = (await kv.get("mem:access", "obs_2")) as {
      count: number;
    } | null;

    expect(log1?.count).toBe(1);
    expect(log2?.count).toBe(1);
  });

  it("expand mode records access for expanded observation ids (#119)", async () => {
    await sdk.trigger("mem::smart-search", { expandIds: ["obs_1"] });
    await new Promise((r) => setImmediate(r));

    const log = (await kv.get("mem:access", "obs_1")) as {
      count: number;
    } | null;
    expect(log?.count).toBe(1);
  });

  describe("lesson inclusion (#lesson-visibility)", () => {
    it("compact mode returns lessons array alongside observation results", async () => {
      sdk.registerFunction("mem::lesson-recall", async (payload: any) => ({
        success: true,
        lessons: [
          { id: "lsn_a", content: "always rebase before push", confidence: 0.9, createdAt: "2026-04-01T00:00:00Z", project: "p", tags: ["git"], score: 0.81 },
          { id: "lsn_b", content: "never force-push to main", confidence: 0.95, createdAt: "2026-04-02T00:00:00Z", project: "p", tags: ["git"], score: 0.76 },
        ],
      }));

      const result = (await sdk.trigger("mem::smart-search", {
        query: "rebase",
      })) as { mode: string; results: CompactSearchResult[]; lessons?: any[] };

      expect(result.mode).toBe("compact");
      expect(result.results.length).toBe(2); // observations unchanged
      expect(result.lessons).toBeDefined();
      expect(result.lessons!.length).toBe(2);
      expect(result.lessons![0]).toMatchObject({
        lessonId: "lsn_a",
        confidence: 0.9,
        score: 0.81,
      });
      expect(result.lessons![0].tags).toEqual(["git"]);
    });

    it("compact mode truncates long lesson content for preview", async () => {
      const long = "x".repeat(500);
      sdk.registerFunction("mem::lesson-recall", async () => ({
        success: true,
        lessons: [{ id: "lsn_long", content: long, confidence: 0.5, createdAt: "", tags: [], score: 0.4 }],
      }));

      const result = (await sdk.trigger("mem::smart-search", {
        query: "x",
      })) as { lessons: any[] };

      expect(result.lessons[0].content.length).toBeLessThan(long.length);
      expect(result.lessons[0].content).toMatch(/…$/);
    });

    it("includeLessons:false omits the lessons array entirely", async () => {
      // No lesson-recall handler registered — would throw if invoked.
      const result = (await sdk.trigger("mem::smart-search", {
        query: "auth",
        includeLessons: false,
      })) as { mode: string; results: CompactSearchResult[]; lessons?: unknown };

      expect(result.results.length).toBe(2);
      expect(result.lessons).toBeUndefined();
    });

    it("forwards project filter to mem::lesson-recall", async () => {
      let receivedPayload: any = null;
      sdk.registerFunction("mem::lesson-recall", async (payload: any) => {
        receivedPayload = payload;
        return { success: true, lessons: [] };
      });

      await sdk.trigger("mem::smart-search", {
        query: "rebase",
        project: "gitops-assistant",
      });

      expect(receivedPayload).toMatchObject({
        query: "rebase",
        project: "gitops-assistant",
      });
    });

    it("tolerates mem::lesson-recall failure: returns empty lessons, observations unchanged", async () => {
      sdk.registerFunction("mem::lesson-recall", async () => {
        throw new Error("lessons store unavailable");
      });

      const result = (await sdk.trigger("mem::smart-search", {
        query: "auth",
      })) as { results: CompactSearchResult[]; lessons: any[] };

      expect(result.results.length).toBe(2);
      expect(result.lessons).toEqual([]);
    });

    it("tolerates non-success lesson-recall response shape", async () => {
      sdk.registerFunction("mem::lesson-recall", async () => ({
        success: false,
        error: "query is required",
      }));

      const result = (await sdk.trigger("mem::smart-search", {
        query: "auth",
      })) as { results: CompactSearchResult[]; lessons: any[] };

      expect(result.results.length).toBe(2);
      expect(result.lessons).toEqual([]);
    });
  });
});

import { extractNamedConcept } from "../src/functions/smart-search.js";

describe("extractNamedConcept (v4-B)", () => {
  it("matches 'who is X' / 'what is X' / 'what does X mean'", () => {
    expect(extractNamedConcept("who is the careful generator?")).toBe("careful generator");
    expect(extractNamedConcept("what is a circuit breaker")).toBe("circuit breaker");
    expect(extractNamedConcept("what's the auth middleware?")).toBe("auth middleware");
    expect(extractNamedConcept("what does eventual consistency mean?")).toBe("eventual consistency");
  });
  it("returns null for non-named-concept queries", () => {
    expect(extractNamedConcept("fix the bug in observe.ts")).toBeNull();
    expect(extractNamedConcept("recent decisions")).toBeNull();
    expect(extractNamedConcept("")).toBeNull();
  });
  it("rejects degenerate phrases (too short or too long)", () => {
    expect(extractNamedConcept("what is it?")).toBeNull();
    expect(extractNamedConcept("what is x")).toBeNull();
    expect(extractNamedConcept(
      "what is the eight token thing we discussed earlier on the call",
    )).toBeNull(); // >6 tokens
  });
});

describe("Smart Search named-concept boost (v4-B)", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let searchResults: HybridSearchResult[];

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();

    // Two observations: the one whose TITLE names the concept ("careful
    // generator") starts with a LOWER bm25 score so we can prove the
    // boost re-ranks it above the busier observation.
    const obsNamed = makeObs({
      id: "obs_named",
      sessionId: "ses_1",
      title: "Tier 2 — careful generator (Qwen3.6-35B-A3B-FP8)",
      narrative: "Picked Qwen3.6 for the careful generator role on vast.",
    });
    const obsBusy = makeObs({
      id: "obs_busy",
      sessionId: "ses_1",
      title: "Refactor the request handler — moved validation",
      narrative: "Random unrelated session work.",
    });

    searchResults = [
      // BM25 prefers the busier observation (more tokens), so without
      // boost the named-concept obs ranks SECOND.
      {
        observation: obsBusy,
        bm25Score: 0.9,
        vectorScore: 0,
        combinedScore: 0.9,
        sessionId: "ses_1",
      },
      {
        observation: obsNamed,
        bm25Score: 0.6,
        vectorScore: 0,
        combinedScore: 0.6,
        sessionId: "ses_1",
      },
    ];

    const session: Session = {
      id: "ses_1",
      project: "p",
      cwd: "/tmp",
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 2,
    };
    await kv.set("mem:sessions", "ses_1", session);
    await kv.set("mem:obs:ses_1", "obs_named", obsNamed);
    await kv.set("mem:obs:ses_1", "obs_busy", obsBusy);

    const searchFn = async (_query: string, _limit: number) => searchResults;
    registerSmartSearchFunction(sdk as never, kv as never, searchFn);
  });

  it("named-concept query boosts the title-matching observation to rank #1", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      query: "who is the careful generator?",
      includeLessons: false,
    })) as { results: CompactSearchResult[] };
    expect(result.results.length).toBe(2);
    expect(result.results[0].obsId).toBe("obs_named"); // title-boosted above busier obs
    expect(result.results[1].obsId).toBe("obs_busy");
    // Score on the boosted hit must exceed the original 0.6 by the
    // title-boost factor (2.0x).
    expect(result.results[0].score).toBeGreaterThan(1.0);
  });

  it("non-named-concept query preserves original ordering", async () => {
    const result = (await sdk.trigger("mem::smart-search", {
      query: "refactor request handler",
      includeLessons: false,
    })) as { results: CompactSearchResult[] };
    expect(result.results[0].obsId).toBe("obs_busy"); // unchanged: bm25 0.9 > 0.6
    expect(result.results[1].obsId).toBe("obs_named");
  });
});
