import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerMcpEndpoints } from "../src/mcp/server.js";

type McpResponse = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

type ApiReq = {
  body?: unknown;
  headers?: Record<string, string>;
  query_params: Record<string, string>;
};

type RegisteredFunction = (req: ApiReq) => Promise<McpResponse>;
type TriggerHandler = (payload: unknown) => unknown | Promise<unknown>;
type TriggerCall = { function_id: string; payload: unknown };

const ORIGINAL_TOOLS_FLAG = process.env["AGENTMEMORY_TOOLS"];

function makeReq(body?: unknown, headers: Record<string, string> = {}): ApiReq {
  return { body, headers, query_params: {} };
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const ensure = (scope: string) => {
    if (!store.has(scope)) store.set(scope, new Map());
    return store.get(scope)!;
  };
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T | undefined) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, value: T): Promise<T> => {
      ensure(scope).set(key, value);
      return value;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      return Array.from(store.get(scope)?.values() ?? []) as T[];
    }),
  };
}

function createHarness(secret?: string) {
  const functions = new Map<string, RegisteredFunction>();
  const triggers: unknown[] = [];
  const triggerCalls: TriggerCall[] = [];
  const triggerOverrides = new Map<string, TriggerHandler>();
  const kv = mockKV();
  const sdk = {
    registerFunction: vi.fn((id: string, handler: RegisteredFunction) => {
      functions.set(id, handler);
    }),
    registerTrigger: vi.fn((trigger: unknown) => {
      triggers.push(trigger);
    }),
    trigger: vi.fn(async (input: { function_id: string; payload: unknown }) => {
      triggerCalls.push(input);
      const override = triggerOverrides.get(input.function_id);
      if (override) return override(input.payload);
      return { ok: true, function_id: input.function_id, payload: input.payload };
    }),
  };

  registerMcpEndpoints(sdk as never, kv as never, secret);

  const getFunction = (id: string) => {
    const fn = functions.get(id);
    if (!fn) throw new Error(`missing registered function ${id}`);
    return fn;
  };

  return {
    sdk,
    triggers,
    triggerCalls,
    stream(body: unknown, headers?: Record<string, string>) {
      return getFunction("mcp::streamable")(makeReq(body, headers));
    },
    streamGet(headers?: Record<string, string>) {
      return getFunction("mcp::streamable::get")(makeReq(undefined, headers));
    },
    streamDelete(headers?: Record<string, string>) {
      return getFunction("mcp::streamable::delete")(makeReq(undefined, headers));
    },
    listTools(headers?: Record<string, string>) {
      return getFunction("mcp::tools::list")(makeReq(undefined, headers));
    },
  };
}

beforeEach(() => {
  delete process.env["AGENTMEMORY_TOOLS"];
});

afterEach(() => {
  if (ORIGINAL_TOOLS_FLAG === undefined) delete process.env["AGENTMEMORY_TOOLS"];
  else process.env["AGENTMEMORY_TOOLS"] = ORIGINAL_TOOLS_FLAG;
});

describe("MCP Streamable HTTP endpoint", () => {
  it("registers a single Streamable HTTP endpoint on the existing REST surface", () => {
    const h = createHarness();

    expect(h.triggers).toContainEqual({
      type: "http",
      function_id: "mcp::streamable",
      config: { api_path: "/agentmemory/mcp", http_method: "POST" },
    });
    expect(h.triggers).toContainEqual({
      type: "http",
      function_id: "mcp::streamable::get",
      config: { api_path: "/agentmemory/mcp", http_method: "GET" },
    });
    expect(h.triggers).toContainEqual({
      type: "http",
      function_id: "mcp::streamable::delete",
      config: { api_path: "/agentmemory/mcp", http_method: "DELETE" },
    });
  });

  it("responds to initialize over JSON-RPC", async () => {
    const h = createHarness();

    await expect(
      h.stream({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      }),
    ).resolves.toMatchObject({
      status_code: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "agentmemory" },
        },
      },
    });
  });

  it("accepts notifications without emitting a JSON-RPC response", async () => {
    const h = createHarness();

    await expect(
      h.stream({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).resolves.toMatchObject({
      status_code: 202,
      headers: { "Content-Type": "application/json" },
      body: null,
    });
  });

  it("rejects malformed notifications before the no-response shortcut", async () => {
    const h = createHarness();

    await expect(
      h.stream({
        jsonrpc: "2.0",
      }),
    ).resolves.toMatchObject({
      status_code: 400,
      body: {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" },
      },
    });
  });

  it("handles JSON-RPC batch requests and notification-only batches", async () => {
    const h = createHarness();

    const batch = await h.stream([
      {
        jsonrpc: "2.0",
        id: "init",
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      },
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
    ]);

    expect(batch.status_code).toBe(200);
    expect(batch.body).toMatchObject([
      {
        jsonrpc: "2.0",
        id: "init",
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
        },
      },
      {
        jsonrpc: "2.0",
        id: "tools",
        result: { tools: expect.any(Array) },
      },
    ]);

    await expect(
      h.stream([
        {
          jsonrpc: "2.0",
          method: "notifications/initialized",
        },
      ]),
    ).resolves.toMatchObject({
      status_code: 202,
      body: null,
    });
  });

  it("returns the same tools/list result as the existing helper route", async () => {
    const h = createHarness();

    const listed = await h.stream({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
    });
    const helper = await h.listTools();

    expect(listed.status_code).toBe(200);
    expect((listed.body as { result: unknown }).result).toEqual(helper.body);
  });

  it("routes tools/call through the existing MCP tool handler", async () => {
    const h = createHarness();

    const called = await h.stream({
      jsonrpc: "2.0",
      id: "call",
      method: "tools/call",
      params: {
        name: "memory_timeline",
        arguments: { anchor: "2026-06-17" },
      },
    });

    expect(called.status_code).toBe(200);
    expect(h.triggerCalls.at(-1)).toEqual({
      function_id: "mem::timeline",
      payload: { anchor: "2026-06-17", before: 5, after: 5 },
    });
  });

  it("uses the existing bearer auth rule when a secret is configured", async () => {
    const h = createHarness("secret");

    await expect(
      h.stream({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    ).resolves.toMatchObject({
      status_code: 401,
      body: { error: "unauthorized" },
    });

    await expect(
      h.stream(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Bearer secret" },
      ),
    ).resolves.toMatchObject({ status_code: 200 });
  });

  it("allows missing and loopback origins while rejecting suspicious browser origins", async () => {
    const h = createHarness("secret");

    await expect(
      h.stream(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Bearer secret" },
      ),
    ).resolves.toMatchObject({ status_code: 200 });

    await expect(
      h.stream(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        {
          authorization: "Bearer secret",
          origin: "http://localhost:3111",
        },
      ),
    ).resolves.toMatchObject({ status_code: 200 });

    await expect(
      h.stream(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        {
          authorization: "Bearer secret",
          origin: "http://127.0.0.1:3111",
        },
      ),
    ).resolves.toMatchObject({ status_code: 200 });

    await expect(
      h.stream(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Bearer secret", origin: "http://attacker.invalid" },
      ),
    ).resolves.toMatchObject({
      status_code: 403,
      body: { error: "origin not allowed" },
    });

    await expect(
      h.stream(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Bearer secret", origin: "%%%not-a-url" },
      ),
    ).resolves.toMatchObject({
      status_code: 403,
      body: { error: "origin not allowed" },
    });
  });

  it("maps JSON-RPC method and parameter failures to protocol errors", async () => {
    const h = createHarness();

    await expect(
      h.stream({ jsonrpc: "2.0", id: "missing", method: "missing/method" }),
    ).resolves.toMatchObject({
      status_code: 200,
      body: {
        jsonrpc: "2.0",
        id: "missing",
        error: { code: -32601, message: "Method not found: missing/method" },
      },
    });

    await expect(
      h.stream({
        jsonrpc: "2.0",
        id: "bad-params",
        method: "tools/call",
        params: {},
      }),
    ).resolves.toMatchObject({
      status_code: 200,
      body: {
        jsonrpc: "2.0",
        id: "bad-params",
        error: { code: -32602, message: "Invalid params: name is required" },
      },
    });
  });

  it("maps existing tool handler errors to JSON-RPC errors", async () => {
    const h = createHarness();

    await expect(
      h.stream({
        jsonrpc: "2.0",
        id: "unknown-tool",
        method: "tools/call",
        params: { name: "missing_tool", arguments: {} },
      }),
    ).resolves.toMatchObject({
      status_code: 200,
      body: {
        jsonrpc: "2.0",
        id: "unknown-tool",
        error: { code: -32602, message: "Unknown tool: missing_tool" },
      },
    });
  });

  it("does not offer SSE or client-terminated sessions on the narrow endpoint", async () => {
    const h = createHarness();

    await expect(h.streamGet()).resolves.toMatchObject({
      status_code: 405,
      headers: { Allow: "POST" },
    });
    await expect(h.streamDelete()).resolves.toMatchObject({
      status_code: 405,
      headers: { Allow: "POST" },
    });
  });

  it("applies auth and Origin checks before method-not-allowed responses", async () => {
    const h = createHarness("secret");

    await expect(h.streamGet()).resolves.toMatchObject({
      status_code: 401,
      body: { error: "unauthorized" },
    });

    await expect(
      h.streamDelete({
        authorization: "Bearer secret",
        origin: "http://attacker.invalid",
      }),
    ).resolves.toMatchObject({
      status_code: 403,
      body: { error: "origin not allowed" },
    });

    await expect(
      h.streamGet({
        authorization: "Bearer secret",
        origin: "http://localhost:3111",
      }),
    ).resolves.toMatchObject({
      status_code: 405,
      headers: { Allow: "POST" },
    });
  });
});
