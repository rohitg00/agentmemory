import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  filterSessionsByTime,
  inTimeRange,
  parseTimeRange,
  TimeRangeError,
} from "../src/state/time-filter.js";
import {
  registerSearchFunction,
  getSearchIndex,
} from "../src/functions/search.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { KV } from "../src/state/schema.js";
import type {
  CompressedObservation,
  HybridSearchResult,
  Session,
} from "../src/types.js";

// ---------- mocks ----------

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
  const triggerOverrides = new Map<string, Function>();
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
      if (triggerOverrides.has(id)) {
        return triggerOverrides.get(id)!(payload);
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body?: unknown, query_params: Record<string, unknown> = {}) {
  return {
    body,
    headers: {},
    query_params,
  };
}

function testSession(id: string, minute: number): Session {
  return {
    id,
    project: "demo",
    cwd: "/tmp/demo",
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
    status: "completed",
    observationCount: 0,
  };
}

// ---------- parseTimeRange ----------

describe("parseTimeRange", () => {
  it("returns null when both inputs are absent", () => {
    expect(parseTimeRange({})).toBeNull();
    expect(parseTimeRange(null)).toBeNull();
    expect(parseTimeRange(undefined)).toBeNull();
  });

  it("returns null when both inputs are empty strings", () => {
    expect(parseTimeRange({ start_time: "", end_time: "" })).toBeNull();
  });

  it("parses a valid ISO 8601 datetime with timezone", () => {
    const r = parseTimeRange({
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-07T23:59:59Z",
    });
    expect(r).not.toBeNull();
    expect(r!.start).toBe(Date.parse("2026-05-01T00:00:00Z"));
    expect(r!.end).toBe(Date.parse("2026-05-07T23:59:59Z"));
  });

  it("parses a date-only ISO 8601 string", () => {
    const r = parseTimeRange({ start_time: "2026-05-01" });
    expect(r).not.toBeNull();
    expect(r!.start).toBe(Date.parse("2026-05-01"));
    expect(r!.end).toBeUndefined();
  });

  it("accepts only one bound", () => {
    const onlyStart = parseTimeRange({ start_time: "2026-05-01T00:00:00Z" });
    expect(onlyStart!.start).toBeDefined();
    expect(onlyStart!.end).toBeUndefined();

    const onlyEnd = parseTimeRange({ end_time: "2026-05-07T23:59:59Z" });
    expect(onlyEnd!.start).toBeUndefined();
    expect(onlyEnd!.end).toBeDefined();
  });

  it("trims whitespace around bounds", () => {
    const r = parseTimeRange({ start_time: "  2026-05-01T00:00:00Z  " });
    expect(r!.start).toBe(Date.parse("2026-05-01T00:00:00Z"));
  });

  it("throws TimeRangeError on unparseable strings", () => {
    expect(() => parseTimeRange({ start_time: "not-a-date" })).toThrow(
      TimeRangeError,
    );
    expect(() => parseTimeRange({ end_time: "yesterday" })).toThrow(
      TimeRangeError,
    );
  });

  it("throws TimeRangeError when start > end", () => {
    try {
      parseTimeRange({
        start_time: "2026-05-07T00:00:00Z",
        end_time: "2026-05-01T00:00:00Z",
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TimeRangeError);
      expect((err as TimeRangeError).code).toBe("start_after_end");
    }
  });

  it("throws TimeRangeError when value is not a string", () => {
    expect(() =>
      parseTimeRange({ start_time: 123 as unknown as string }),
    ).toThrow(TimeRangeError);
  });

  it("treats start === end as valid (zero-length window)", () => {
    const t = "2026-05-01T00:00:00Z";
    const r = parseTimeRange({ start_time: t, end_time: t });
    expect(r!.start).toBe(r!.end);
  });
});

// ---------- inTimeRange ----------

describe("inTimeRange", () => {
  const range = parseTimeRange({
    start_time: "2026-05-01T00:00:00Z",
    end_time: "2026-05-07T23:59:59Z",
  });

  it("returns true for timestamps inside the window", () => {
    expect(inTimeRange("2026-05-03T12:00:00Z", range)).toBe(true);
  });

  it("treats both bounds as inclusive", () => {
    expect(inTimeRange("2026-05-01T00:00:00Z", range)).toBe(true);
    expect(inTimeRange("2026-05-07T23:59:59Z", range)).toBe(true);
  });

  it("returns false for timestamps outside the window", () => {
    expect(inTimeRange("2026-04-30T23:59:59Z", range)).toBe(false);
    expect(inTimeRange("2026-05-08T00:00:00Z", range)).toBe(false);
  });

  it("returns true when range is null", () => {
    expect(inTimeRange("2026-05-03T12:00:00Z", null)).toBe(true);
  });

  it("returns false for malformed timestamps when a range is set", () => {
    expect(inTimeRange("", range)).toBe(false);
    expect(inTimeRange(undefined, range)).toBe(false);
    expect(inTimeRange("not-a-date", range)).toBe(false);
  });

  it("respects start-only ranges", () => {
    const startOnly = parseTimeRange({ start_time: "2026-05-01T00:00:00Z" });
    expect(inTimeRange("2026-04-30T00:00:00Z", startOnly)).toBe(false);
    expect(inTimeRange("2027-01-01T00:00:00Z", startOnly)).toBe(true);
  });

  it("respects end-only ranges", () => {
    const endOnly = parseTimeRange({ end_time: "2026-05-07T23:59:59Z" });
    expect(inTimeRange("2026-04-30T00:00:00Z", endOnly)).toBe(true);
    expect(inTimeRange("2026-05-08T00:00:00Z", endOnly)).toBe(false);
  });
});

// ---------- filterSessionsByTime ----------

describe("filterSessionsByTime", () => {
  const sessions = [
    { id: "s1", startedAt: "2026-04-30T20:00:00Z", endedAt: "2026-05-02T08:00:00Z" }, // overlaps left edge
    { id: "s2", startedAt: "2026-05-03T12:00:00Z", endedAt: "2026-05-03T18:00:00Z" }, // fully inside
    { id: "s3", startedAt: "2026-05-07T22:00:00Z" }, // active, started near right edge
    { id: "s4", startedAt: "2026-05-08T01:00:00Z", endedAt: "2026-05-08T02:00:00Z" }, // fully after
    { id: "s5", startedAt: "2026-04-01T00:00:00Z", endedAt: "2026-04-02T00:00:00Z" }, // fully before
    { id: "s6", startedAt: "" }, // malformed
  ];

  it("returns all sessions sorted desc when range is null", () => {
    const out = filterSessionsByTime(sessions, null);
    expect(out.map((s) => s.id)).toEqual(["s4", "s3", "s2", "s1", "s5", "s6"]);
  });

  it("includes sessions whose lifetime overlaps the window", () => {
    const range = parseTimeRange({
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-07T23:59:59Z",
    });
    const out = filterSessionsByTime(sessions, range);
    const ids = out.map((s) => s.id).sort();
    // s1 (overlaps left), s2 (inside), s3 (active at right edge) all qualify;
    // s4/s5 are fully outside, s6 is malformed.
    expect(ids).toEqual(["s1", "s2", "s3"]);
  });

  it("orders results by startedAt descending", () => {
    const range = parseTimeRange({
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-07T23:59:59Z",
    });
    const out = filterSessionsByTime(sessions, range);
    expect(out.map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
  });

  it("treats an active session (no endedAt) as still running for the window check", () => {
    const range = parseTimeRange({
      start_time: "2026-05-07T00:00:00Z",
      end_time: "2026-05-07T23:00:00Z",
    });
    const out = filterSessionsByTime(sessions, range);
    expect(out.map((s) => s.id)).toContain("s3");
  });
});

// ---------- REST / MCP sessions surface ----------

describe("api::sessions time-range surface", () => {
  it("defaults memory_sessions to 50 results", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);

    for (let i = 0; i < 60; i++) {
      const session = testSession(`ses_${i}`, i);
      await kv.set(KV.sessions, session.id, session);
    }

    const fn = sdk.getFunction("api::sessions")!;
    const result = (await fn(makeReq())) as {
      status_code: number;
      body: { sessions: Session[] };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.sessions).toHaveLength(50);
    expect(result.body.sessions[0].id).toBe("ses_59");
  });

  it("rejects non-string time bounds instead of ignoring them", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);

    const fn = sdk.getFunction("api::sessions")!;
    const result = (await fn(makeReq(undefined, { start_time: 123 }))) as {
      status_code: number;
      body: { code?: string; error?: string };
    };

    expect(result.status_code).toBe(400);
    expect(result.body.code).toBe("not_a_string");
    expect(result.body.error).toMatch(/start_time must be an ISO 8601 string/);
  });
});

describe("MCP time-range surface", () => {
  it("defaults memory_sessions to 50 results", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);

    for (let i = 0; i < 60; i++) {
      const session = testSession(`ses_${i}`, i);
      await kv.set(KV.sessions, session.id, session);
    }

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(
      makeReq({ name: "memory_sessions", arguments: {} }),
    )) as {
      status_code: number;
      body: { content: Array<{ text: string }> };
    };
    const body = JSON.parse(result.body.content[0].text);

    expect(result.status_code).toBe(200);
    expect(body.sessions).toHaveLength(50);
    expect(body.sessions[0].id).toBe("ses_59");
  });

  it("rejects non-string time bounds for time-aware tools", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
    sdk.overrideTrigger("mem::search", async () => {
      throw new Error("mem::search should not run");
    });
    sdk.overrideTrigger("mem::smart-search", async () => {
      throw new Error("mem::smart-search should not run");
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    const calls = [
      { name: "memory_recall", args: { query: "auth", start_time: 123 } },
      { name: "memory_smart_search", args: { query: "auth", end_time: 123 } },
      { name: "memory_sessions", args: { start_time: 123 } },
    ];

    for (const call of calls) {
      const result = (await fn(
        makeReq({ name: call.name, arguments: call.args }),
      )) as {
        status_code: number;
        body: { code?: string; error?: string };
      };
      expect(result.status_code).toBe(400);
      expect(result.body.code).toBe("not_a_string");
      expect(result.body.error).toMatch(/must be an ISO 8601 string/);
    }
  });
});

// ---------- mem::search integration ----------

describe("mem::search with time range", () => {
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
      startedAt: "2026-05-01T00:00:00Z",
      status: "completed",
      observationCount: 3,
    };
    await kv.set(KV.sessions, session.id, session);

    const obsApr: CompressedObservation = {
      id: "obs_apr",
      sessionId: "ses_1",
      timestamp: "2026-04-15T10:00:00Z",
      type: "decision",
      title: "auth jwt strategy",
      facts: ["Use rotating refresh tokens"],
      narrative: "Picked JWT with rotating refresh.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    const obsMay3: CompressedObservation = {
      id: "obs_may_3",
      sessionId: "ses_1",
      timestamp: "2026-05-03T12:00:00Z",
      type: "decision",
      title: "auth refresh rotation",
      facts: ["Rotate refresh tokens every login"],
      narrative: "Settled on rotate-on-use refresh tokens.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    const obsJun: CompressedObservation = {
      id: "obs_jun",
      sessionId: "ses_1",
      timestamp: "2026-06-10T09:00:00Z",
      type: "decision",
      title: "auth rate limit decision",
      facts: ["Add per-user rate limits"],
      narrative: "Chose rate limit middleware after auth.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 7,
    };

    await kv.set(KV.observations("ses_1"), obsApr.id, obsApr);
    await kv.set(KV.observations("ses_1"), obsMay3.id, obsMay3);
    await kv.set(KV.observations("ses_1"), obsJun.id, obsJun);

    getSearchIndex().clear();
  });

  it("returns all observations when no time range is set", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "compact",
    })) as { results: Array<{ obsId: string }> };
    const ids = result.results.map((r) => r.obsId).sort();
    expect(ids).toEqual(["obs_apr", "obs_jun", "obs_may_3"]);
  });

  it("filters out observations outside [start_time, end_time]", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "compact",
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-31T23:59:59Z",
    })) as { results: Array<{ obsId: string; timestamp: string }> };
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.obsId).toBe("obs_may_3");
  });

  it("respects start_time only (open upper bound)", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "compact",
      start_time: "2026-05-01T00:00:00Z",
    })) as { results: Array<{ obsId: string }> };
    const ids = result.results.map((r) => r.obsId).sort();
    expect(ids).toEqual(["obs_jun", "obs_may_3"]);
  });

  it("respects end_time only (open lower bound)", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "compact",
      end_time: "2026-05-31T23:59:59Z",
    })) as { results: Array<{ obsId: string }> };
    const ids = result.results.map((r) => r.obsId).sort();
    expect(ids).toEqual(["obs_apr", "obs_may_3"]);
  });

  it("rejects unparseable start_time with a 400-style error", async () => {
    await expect(
      sdk.trigger("mem::search", { query: "auth", start_time: "yesterday" }),
    ).rejects.toThrow(/start_time is not a valid ISO 8601/);
  });

  it("rejects start_time > end_time", async () => {
    await expect(
      sdk.trigger("mem::search", {
        query: "auth",
        start_time: "2026-06-01T00:00:00Z",
        end_time: "2026-05-01T00:00:00Z",
      }),
    ).rejects.toThrow(/start_time must be <= end_time/);
  });
});

// ---------- mem::smart-search integration ----------

describe("mem::smart-search with time range", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
  });

  it("forwards timeRange to the searchFn closure", async () => {
    let captured: { limit: number; timeRange: unknown } | null = null;
    const fakeSearch = async (
      _q: string,
      limit: number,
      options?: { timeRange?: unknown },
    ): Promise<HybridSearchResult[]> => {
      captured = { limit, timeRange: options?.timeRange ?? null };
      return [];
    };
    registerSmartSearchFunction(sdk as never, kv as never, fakeSearch);

    await sdk.trigger("mem::smart-search", {
      query: "auth",
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-07T23:59:59Z",
    });

    expect(captured).not.toBeNull();
    expect(captured!.timeRange).toMatchObject({
      start: Date.parse("2026-05-01T00:00:00Z"),
      end: Date.parse("2026-05-07T23:59:59Z"),
    });
  });

  it("forwards null timeRange when neither bound is supplied", async () => {
    let captured: { hasOption: boolean; timeRange: unknown } | null = null;
    const fakeSearch = async (
      _q: string,
      _l: number,
      options?: { timeRange?: unknown },
    ): Promise<HybridSearchResult[]> => {
      captured = {
        hasOption: options !== undefined && "timeRange" in options,
        timeRange: options?.timeRange,
      };
      return [];
    };
    registerSmartSearchFunction(sdk as never, kv as never, fakeSearch);

    await sdk.trigger("mem::smart-search", { query: "auth" });
    expect(captured!.hasOption).toBe(true);
    expect(captured!.timeRange).toBeNull();
  });

  it("returns a 400-style error response for malformed start_time", async () => {
    const fakeSearch = async (): Promise<HybridSearchResult[]> => [];
    registerSmartSearchFunction(sdk as never, kv as never, fakeSearch);

    const result = (await sdk.trigger("mem::smart-search", {
      query: "auth",
      start_time: "not-a-date",
    })) as { mode: string; error?: string; results: unknown[] };

    expect(result.mode).toBe("compact");
    expect(result.error).toMatch(/start_time is not a valid ISO 8601/);
    expect(result.results).toEqual([]);
  });

  it("returns a 400-style error response when start_time > end_time", async () => {
    const fakeSearch = async (): Promise<HybridSearchResult[]> => [];
    registerSmartSearchFunction(sdk as never, kv as never, fakeSearch);

    const result = (await sdk.trigger("mem::smart-search", {
      query: "auth",
      start_time: "2026-06-01T00:00:00Z",
      end_time: "2026-05-01T00:00:00Z",
    })) as { mode: string; error?: string };

    expect(result.error).toMatch(/start_time must be <= end_time/);
  });
});
