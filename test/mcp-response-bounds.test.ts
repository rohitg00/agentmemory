import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";

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
  const overrides = new Map<string, Function>();
  return {
    overrides,
    registerFunction: (id: string, handler: Function) => functions.set(id, handler),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      if (overrides.has(input.function_id)) {
        return overrides.get(input.function_id)!(input.payload);
      }
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`No function: ${input.function_id}`);
      return fn(input.payload);
    },
    call: async (id: string, body: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn({ body, headers: {}, query_params: {} });
    },
  };
}

type Res = { status_code: number; body: Record<string, unknown> };

describe("MCP response bounds", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const ORIG_MAX = process.env["AGENTMEMORY_MCP_MAX_RESPONSE_BYTES"];

  const call = (name: string, args: Record<string, unknown>) =>
    sdk.call("mcp::tools::call", { name, arguments: args }) as Promise<Res>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never, undefined);
    for (let i = 0; i < 40; i++) {
      await kv.set("mem:sessions", `s${i}`, {
        id: `s${i}`,
        project: i % 2 === 0 ? "alpha" : "beta",
        status: "completed",
        startedAt: `2026-02-${String((i % 27) + 1).padStart(2, "0")}T10:00:00Z`,
        observationCount: i,
      });
    }
  });

  afterEach(() => {
    if (ORIG_MAX === undefined) delete process.env["AGENTMEMORY_MCP_MAX_RESPONSE_BYTES"];
    else process.env["AGENTMEMORY_MCP_MAX_RESPONSE_BYTES"] = ORIG_MAX;
  });

  it("memory_sessions bounds and projects its rows", async () => {
    const res = await call("memory_sessions", { limit: 5 });
    expect(res.status_code).toBe(200);
    const text = (res.body.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text) as {
      sessions: Array<Record<string, unknown>>;
      total: number;
      truncated: boolean;
    };
    expect(parsed.sessions.length).toBe(5);
    expect(parsed.total).toBe(40);
    expect(parsed.truncated).toBe(true);
    // Newest first, asserted as an ordering rather than mere presence:
    // insertion order would otherwise pass.
    const dates = parsed.sessions.map((s) => s.startedAt as string);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe("2026-02-27T10:00:00Z");
  });

  it("memory_sessions filters by project", async () => {
    const res = await call("memory_sessions", { project: "alpha", limit: 100 });
    const parsed = JSON.parse(
      (res.body.content as Array<{ text: string }>)[0].text,
    ) as { sessions: Array<{ project: string }> };
    expect(parsed.sessions.length).toBe(20);
    expect(parsed.sessions.every((s) => s.project === "alpha")).toBe(true);
  });

  // A malformed filter used to be dropped, silently widening the query to
  // every project instead of failing.
  it("rejects malformed arguments instead of dropping the filter", async () => {
    expect((await call("memory_sessions", { project: 42 })).status_code).toBe(400);
    expect((await call("memory_sessions", { status: "" })).status_code).toBe(400);
    expect((await call("memory_sessions", { limit: 0 })).status_code).toBe(400);
    expect((await call("memory_sessions", { limit: 2.5 })).status_code).toBe(400);
    expect(
      (await call("memory_graph_query", { includeSources: "yes" })).status_code,
    ).toBe(400);
  });

  it("keeps a truncated response inside the advertised ceiling", async () => {
    process.env["AGENTMEMORY_MCP_MAX_RESPONSE_BYTES"] = "2000";
    sdk.overrides.set("mem::search", async () => ({
      format: "full",
      results: Array.from({ length: 200 }, (_, i) => ({
        observation: { id: `obs_${i}`, narrative: "x".repeat(500) },
      })),
    }));

    const res = await call("memory_recall", { query: "anything" });
    const total = (res.body.content as Array<{ text: string }>)
      .map((c) => Buffer.byteLength(c.text, "utf8"))
      .reduce((a, b) => a + b, 0);

    expect(total).toBeLessThanOrEqual(2000);
    const joined = (res.body.content as Array<{ text: string }>)
      .map((c) => c.text)
      .join("");
    expect(joined).toContain("truncated");
  });

  // The ceiling is named in bytes. Measuring String.length instead would
  // let multibyte content through at roughly three times the limit.
  it("counts multibyte text in bytes, not UTF-16 units", async () => {
    process.env["AGENTMEMORY_MCP_MAX_RESPONSE_BYTES"] = "2000";
    sdk.overrides.set("mem::search", async () => ({
      format: "full",
      results: Array.from({ length: 200 }, (_, i) => ({
        // 3 bytes per character in UTF-8.
        observation: { id: `obs_${i}`, narrative: "\u4e2d".repeat(500) },
      })),
    }));

    const res = await call("memory_recall", { query: "anything" });
    const parts = res.body.content as Array<{ text: string }>;
    const bytes = parts
      .map((c) => Buffer.byteLength(c.text, "utf8"))
      .reduce((a, b) => a + b, 0);

    expect(bytes).toBeLessThanOrEqual(2000);
    // And the cut must not leave a broken code point behind.
    expect(parts.map((c) => c.text).join("")).not.toContain("\uFFFD");
  });

  it("bounds an unknown tool name echoed back in the error", async () => {
    const res = await call("z".repeat(100_000), {});
    expect(res.status_code).toBe(400);
    expect((res.body.error as string).length).toBeLessThan(200);
  });
});
