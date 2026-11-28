import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { getAllTools, getVisibleTools } from "../src/mcp/tools-registry.js";
import { setRestOriginPorts } from "../src/triggers/api.js";
import { VERSION } from "../src/version.js";

const PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO = "io.modelcontextprotocol/serverInfo";
const MODERN = "2026-07-28";
const CONCRETE_URIS = ["agentmemory://status", "agentmemory://memories/latest", "agentmemory://graph/stats"];
const TEMPLATE_URIS = [
  "agentmemory://project/{name}/profile",
  "agentmemory://project/{name}/recent",
  "agentmemory://team/{id}/profile",
];

// JSON-RPC bodies are asserted field by field; typing every result shape adds nothing to these tests.
type Response = { status_code: number; headers?: Record<string, string>; body: any };
type Headers = Record<string, string | undefined>;

function setup(secret?: string) {
  const functions = new Map<string, Function>();
  const triggers: Array<{ function_id: string; config: { api_path: string; http_method: string } }> = [];
  const calls: Array<{ function_id: string; payload: Record<string, unknown> }> = [];
  const sdk = {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: (trigger: (typeof triggers)[number]) => {
      triggers.push(trigger);
    },
    trigger: async (input: { function_id: string; payload: Record<string, unknown> }) => {
      calls.push(input);
      return { action: "created" };
    },
  };
  const kv = {
    get: async () => null,
    set: async (_scope: string, _key: string, data: unknown) => data,
    delete: async () => {},
    list: async () => [],
  };
  registerMcpEndpoints(sdk as never, kv as never, secret);
  const endpoint = functions.get("mcp::http") as (req: unknown) => Promise<Response>;
  return { endpoint, triggers, calls };
}

function withoutUndefined(headers: Headers): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

function modernRequest(
  method: string,
  params: Record<string, unknown> = {},
  overrides: { headers?: Headers; meta?: Record<string, unknown>; id?: unknown } = {},
) {
  const name = params["name"] ?? params["uri"];
  return {
    method: "POST",
    headers: withoutUndefined({
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MODERN,
      "mcp-method": method,
      "mcp-name": typeof name === "string" ? name : undefined,
      ...overrides.headers,
    }),
    body: {
      jsonrpc: "2.0",
      id: "id" in overrides ? overrides.id : 1,
      method,
      params: {
        ...params,
        _meta: overrides.meta ?? { [PROTOCOL_VERSION]: MODERN, [CLIENT_CAPABILITIES]: {} },
      },
    },
  };
}

function legacyRequest(method: string, params?: Record<string, unknown>, headers: Headers = {}) {
  return {
    method: "POST",
    headers: withoutUndefined({ "content-type": "application/json", ...headers }),
    body: { jsonrpc: "2.0", id: 7, method, ...(params ? { params } : {}) },
  };
}

describe("streamable HTTP MCP endpoint: routing", () => {
  it("binds POST, GET and DELETE on one path to one function", () => {
    const { triggers } = setup();
    const bound = triggers.filter((t) => t.function_id === "mcp::http");
    expect(bound.map((t) => t.config.http_method).sort()).toEqual(["DELETE", "GET", "POST"]);
    expect(new Set(bound.map((t) => t.config.api_path))).toEqual(new Set(["/agentmemory/mcp"]));
  });

  it("answers GET and DELETE with 405 and an Allow header", async () => {
    const { endpoint } = setup();
    for (const method of ["GET", "DELETE"]) {
      const res = await endpoint({ method, headers: {}, body: undefined });
      expect(res.status_code).toBe(405);
      expect(res.headers).toEqual({ Allow: "POST" });
      expect(res.body.error.code).toBe(-32600);
    }
  });

  it("rejects a missing or wrong bearer token with 401 and accepts the right one", async () => {
    const { endpoint } = setup("s3cret");
    const anonymous = await endpoint(modernRequest("tools/list"));
    expect(anonymous.status_code).toBe(401);
    expect(anonymous.headers?.["WWW-Authenticate"]).toContain("Bearer");

    const wrong = await endpoint(modernRequest("tools/list", {}, { headers: { authorization: "Bearer nope" } }));
    expect(wrong.status_code).toBe(401);

    const right = await endpoint(modernRequest("tools/list", {}, { headers: { authorization: "Bearer s3cret" } }));
    expect(right.status_code).toBe(200);
  });

  it("rejects a foreign Origin with 403", async () => {
    const { endpoint } = setup();
    const res = await endpoint(modernRequest("tools/list", {}, { headers: { origin: "https://evil.example" } }));
    expect(res.status_code).toBe(403);
  });

  it("accepts the Origin of the local viewer", async () => {
    const { endpoint } = setup();
    setRestOriginPorts(() => [3113]);
    try {
      const res = await endpoint(modernRequest("tools/list", {}, { headers: { origin: "http://localhost:3113" } }));
      expect(res.status_code).toBe(200);
    } finally {
      setRestOriginPorts(() => []);
    }
  });

  it("returns a parse error for a body that is not JSON", async () => {
    const { endpoint } = setup();
    const res = await endpoint({ method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
    expect(res.status_code).toBe(400);
    expect(res.body.error.code).toBe(-32700);
    expect("id" in res.body).toBe(false);
  });

  it("parses a JSON body that arrives as a string", async () => {
    const { endpoint } = setup();
    const request = legacyRequest("ping");
    const res = await endpoint({ ...request, body: JSON.stringify(request.body) });
    expect(res.status_code).toBe(200);
    expect(res.body).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  it("rejects non JSON-RPC bodies and a null id", async () => {
    const { endpoint } = setup();
    const headers = { "content-type": "application/json" };
    const bodies = [
      { id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 1 },
      { jsonrpc: "2.0", id: null, method: "ping" },
      { jsonrpc: "2.0", id: 1.5, method: "ping" },
    ];
    for (const body of bodies) {
      const res = await endpoint({ method: "POST", headers, body });
      expect(res.status_code).toBe(400);
      expect(res.body.error.code).toBe(-32600);
    }
  });

  it("rejects params that are not an object", async () => {
    const { endpoint } = setup();
    const res = await endpoint({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { jsonrpc: "2.0", id: 3, method: "tools/list", params: [1] },
    });
    expect(res.status_code).toBe(400);
    expect(res.body).toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it("accepts notifications and client responses with 202 and no body", async () => {
    const { endpoint } = setup();
    const headers = { "content-type": "application/json" };
    const bodies = [
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } },
      { jsonrpc: "2.0", id: 4, result: {} },
    ];
    for (const body of bodies) {
      const res = await endpoint({ method: "POST", headers, body });
      expect(res).toEqual({ status_code: 202, headers: { "Content-Type": "text/plain" }, body: "" });
    }
  });
});

describe("streamable HTTP MCP endpoint: 2026-07-28 stateless requests", () => {
  it("answers server/discover with versions, capabilities, identity and cache hints", async () => {
    const { endpoint } = setup();
    const res = await endpoint(modernRequest("server/discover", {}, { id: "discover-1" }));
    expect(res.status_code).toBe(200);
    expect(res.body.id).toBe("discover-1");
    expect(res.body.result).toEqual({
      resultType: "complete",
      supportedVersions: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"],
      capabilities: { tools: {}, resources: {}, prompts: {} },
      ttlMs: 300000,
      cacheScope: "public",
      _meta: { [SERVER_INFO]: { name: "agentmemory", version: VERSION } },
    });
  });

  it("lists the same tools as the REST surface, with cache hints", async () => {
    const { endpoint } = setup();
    const res = await endpoint(modernRequest("tools/list"));
    const result = res.body.result;
    expect(result.resultType).toBe("complete");
    expect(result.tools.map((t: { name: string }) => t.name)).toEqual(
      getVisibleTools().filter((t) => !t.name.startsWith("memory_slot_")).map((t) => t.name),
    );
    expect(result).toMatchObject({ ttlMs: 300000, cacheScope: "public" });
    expect(result._meta[SERVER_INFO].name).toBe("agentmemory");
  });

  it("lists resources, resource templates and prompts", async () => {
    const { endpoint } = setup();
    const resources = (await endpoint(modernRequest("resources/list"))).body.result;
    expect(resources.resources.map((r: { uri: string }) => r.uri)).toEqual(CONCRETE_URIS);
    expect(resources).toMatchObject({ resultType: "complete", ttlMs: 300000, cacheScope: "public" });

    const templates = (await endpoint(modernRequest("resources/templates/list"))).body.result;
    expect(templates.resourceTemplates.map((r: { uriTemplate: string }) => r.uriTemplate)).toEqual(TEMPLATE_URIS);
    expect(templates.resourceTemplates.every((r: Record<string, unknown>) => !("uri" in r) && typeof r["name"] === "string")).toBe(true);
    expect(templates).toMatchObject({ resultType: "complete", ttlMs: 300000, cacheScope: "public" });

    const prompts = (await endpoint(modernRequest("prompts/list"))).body.result;
    expect(prompts.prompts.length).toBeGreaterThan(0);
    expect(prompts).toMatchObject({ resultType: "complete", ttlMs: 300000, cacheScope: "public" });
  });

  it("runs a tool call through the REST handler", async () => {
    const { endpoint, calls } = setup();
    const res = await endpoint(
      modernRequest("tools/call", { name: "memory_lesson_save", arguments: { content: "Run the checks first" } }),
    );
    expect(res.status_code).toBe(200);
    expect(calls[0]!.function_id).toBe("mem::lesson-save");
    expect(res.body.result.resultType).toBe("complete");
    expect(res.body.result.isError).toBe(false);
    expect(res.body.result.content[0].type).toBe("text");
    expect("ttlMs" in res.body.result).toBe(false);
  });

  it("reports a rejected tool argument as a tool error the model can read", async () => {
    const { endpoint, calls } = setup();
    const res = await endpoint(
      modernRequest("tools/call", { name: "memory_lesson_save", arguments: { content: "A lesson", sourceIds: "ses_1" } }),
    );
    expect(res.status_code).toBe(200);
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain("sourceIds must be an array");
    expect(calls).toHaveLength(0);
  });

  it("reports a disabled feature as a tool error that says how to enable it", async () => {
    const { endpoint } = setup();
    const slotTool = getAllTools().find((t) => t.name.startsWith("memory_slot_"))!;
    const res = await endpoint(modernRequest("tools/call", { name: slotTool.name, arguments: {} }));
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain("AGENTMEMORY_SLOTS=true");
  });

  it("returns a protocol error for an unknown tool and for bad call params", async () => {
    const { endpoint, calls } = setup();
    const unknown = await endpoint(modernRequest("tools/call", { name: "no_such_tool", arguments: {} }));
    expect(unknown.status_code).toBe(200);
    expect(unknown.body.error).toEqual({ code: -32602, message: "Unknown tool: no_such_tool" });

    const noName = await endpoint(modernRequest("tools/call", { arguments: {} }));
    expect(noName.body.error.code).toBe(-32602);

    const badArgs = await endpoint(modernRequest("tools/call", { name: "memory_lesson_save", arguments: [] }));
    expect(badArgs.body.error.code).toBe(-32602);
    expect(calls).toHaveLength(0);
  });

  it("reads a resource as private, immediately stale data", async () => {
    const { endpoint } = setup();
    const res = await endpoint(modernRequest("resources/read", { uri: "agentmemory://status" }));
    expect(res.body.result).toMatchObject({ resultType: "complete", ttlMs: 0, cacheScope: "private" });
    expect(res.body.result.contents[0].uri).toBe("agentmemory://status");
  });

  it("returns -32602 with the uri for a resource that does not exist", async () => {
    const { endpoint } = setup();
    const res = await endpoint(modernRequest("resources/read", { uri: "agentmemory://nope" }));
    expect(res.status_code).toBe(200);
    expect(res.body.error).toEqual({ code: -32602, message: "Resource not found", data: { uri: "agentmemory://nope" } });
  });

  it("returns -32602 for an unknown prompt", async () => {
    const { endpoint } = setup();
    const res = await endpoint(modernRequest("prompts/get", { name: "no_such_prompt" }));
    expect(res.body.error.code).toBe(-32602);
    expect(res.body.error.message).toContain("Unknown prompt");
  });

  it("returns 404 with -32601 for a method this revision does not define", async () => {
    const { endpoint } = setup();
    for (const method of ["initialize", "ping", "sampling/createMessage"]) {
      const res = await endpoint(modernRequest(method));
      expect(res.status_code).toBe(404);
      expect(res.body).toMatchObject({ id: 1, error: { code: -32601 } });
    }
  });

  it("returns 400 with -32022 and the supported versions for an unknown version", async () => {
    const { endpoint } = setup();
    const res = await endpoint(
      modernRequest("tools/list", {}, {
        headers: { "mcp-protocol-version": "2099-01-01" },
        meta: { [PROTOCOL_VERSION]: "2099-01-01", [CLIENT_CAPABILITIES]: {} },
      }),
    );
    expect(res.status_code).toBe(400);
    expect(res.body.error.code).toBe(-32022);
    expect(res.body.error.data.requested).toBe("2099-01-01");
    expect(res.body.error.data.supported).toContain(MODERN);
  });

  it("returns -32022 when only the header names an unknown version", async () => {
    const { endpoint } = setup();
    const res = await endpoint(legacyRequest("tools/list", undefined, { "mcp-protocol-version": "2099-01-01" }));
    expect(res.status_code).toBe(400);
    expect(res.body.error.code).toBe(-32022);
  });

  it("returns 400 with -32602 when required _meta fields are missing", async () => {
    const { endpoint } = setup();
    const noCapabilities = await endpoint(modernRequest("tools/list", {}, { meta: { [PROTOCOL_VERSION]: MODERN } }));
    expect(noCapabilities.status_code).toBe(400);
    expect(noCapabilities.body.error.code).toBe(-32602);
    expect(noCapabilities.body.error.message).toContain(CLIENT_CAPABILITIES);

    const noVersion = await endpoint(modernRequest("server/discover", {}, { meta: {} }));
    expect(noVersion.status_code).toBe(400);
    expect(noVersion.body.error.code).toBe(-32602);
    expect(noVersion.body.error.message).toContain(PROTOCOL_VERSION);
  });

  it("returns 400 with -32020 when a mirrored header is missing or differs from the body", async () => {
    const { endpoint, calls } = setup();
    const call = { name: "memory_lesson_save", arguments: { content: "A lesson" } };
    const cases: Headers[] = [
      { "mcp-protocol-version": undefined },
      { "mcp-protocol-version": "2025-11-25" },
      { "mcp-method": undefined },
      { "mcp-method": "tools/list" },
      { "mcp-name": undefined },
      { "mcp-name": "memory_recall" },
      { "mcp-name": "=?base64?***?=" },
    ];
    for (const headers of cases) {
      const res = await endpoint(modernRequest("tools/call", call, { headers }));
      expect(res.status_code).toBe(400);
      expect(res.body).toMatchObject({ id: 1, error: { code: -32020 } });
    }
    expect(calls).toHaveLength(0);
  });

  it("reads header names without regard to case and decodes a Base64 Mcp-Name", async () => {
    const { endpoint } = setup();
    const uri = "agentmemory://status";
    const res = await endpoint(
      modernRequest("resources/read", { uri }, {
        headers: {
          "mcp-protocol-version": undefined,
          "mcp-method": undefined,
          "mcp-name": undefined,
          "MCP-Protocol-Version": MODERN,
          "Mcp-Method": "resources/read",
          "Mcp-Name": `=?base64?${Buffer.from(uri, "utf8").toString("base64")}?=`,
        },
      }),
    );
    expect(res.status_code).toBe(200);
    expect(res.body.result.contents[0].uri).toBe(uri);
  });
});

describe("streamable HTTP MCP endpoint: initialize-based clients", () => {
  it("negotiates the requested version and issues no session", async () => {
    const { endpoint } = setup();
    const res = await endpoint(
      legacyRequest("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    );
    expect(res.status_code).toBe(200);
    expect(res.headers).toBeUndefined();
    expect(res.body.result).toEqual({
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
      serverInfo: { name: "agentmemory", version: VERSION },
    });
  });

  it("offers its newest initialize-based version when the requested one is unknown", async () => {
    const { endpoint } = setup();
    const res = await endpoint(legacyRequest("initialize", { protocolVersion: "1999-01-01" }));
    expect(res.body.result.protocolVersion).toBe("2025-11-25");
  });

  it("serves requests with or without a negotiated version header, in the older result shape", async () => {
    const { endpoint } = setup();
    for (const headers of [{}, { "mcp-protocol-version": "2025-06-18" }, { "mcp-session-id": "ignored" }] as Headers[]) {
      const res = await endpoint(legacyRequest("tools/list", {}, headers));
      expect(res.status_code).toBe(200);
      expect(res.body.result.tools.length).toBeGreaterThan(0);
      expect(Object.keys(res.body.result)).toEqual(["tools"]);
    }
  });

  it("runs a tool call", async () => {
    const { endpoint, calls } = setup();
    const res = await endpoint(
      legacyRequest("tools/call", { name: "memory_lesson_save", arguments: { content: "A lesson" } }),
    );
    expect(calls[0]!.function_id).toBe("mem::lesson-save");
    expect(res.body.result.isError).toBe(false);
    expect("resultType" in res.body.result).toBe(false);
  });

  it("answers ping", async () => {
    const { endpoint } = setup();
    const res = await endpoint(legacyRequest("ping"));
    expect(res.body).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  it("returns a JSON-RPC error with HTTP 200 for an unknown method", async () => {
    const { endpoint } = setup();
    const res = await endpoint(legacyRequest("logging/setLevel", { level: "info" }));
    expect(res.status_code).toBe(200);
    expect(res.body.error.code).toBe(-32601);
  });

  it("splits concrete resources from resource templates", async () => {
    const { endpoint } = setup();
    const resources = (await endpoint(legacyRequest("resources/list"))).body.result;
    expect(resources.resources.map((r: { uri: string }) => r.uri)).toEqual(CONCRETE_URIS);
    const templates = (await endpoint(legacyRequest("resources/templates/list"))).body.result;
    expect(templates.resourceTemplates.map((r: { uriTemplate: string }) => r.uriTemplate)).toEqual(TEMPLATE_URIS);
  });

  it("offers 2025-11-25 to a client that asks for 2024-11-05", async () => {
    const { endpoint } = setup();
    const res = await endpoint(legacyRequest("initialize", { protocolVersion: "2024-11-05" }));
    expect(res.body.result.protocolVersion).toBe("2025-11-25");
  });

  it("answers a 2025-03-26 batch with one result per request", async () => {
    const { endpoint } = setup();
    for (const headers of [{}, { "mcp-protocol-version": "2025-03-26" }] as Headers[]) {
      const res = await endpoint({
        method: "POST",
        headers: withoutUndefined({ "content-type": "application/json", ...headers }),
        body: [
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { jsonrpc: "2.0", method: "notifications/initialized" },
          { jsonrpc: "2.0", id: "p", method: "prompts/list" },
          { jsonrpc: "2.0", id: 3, method: "logging/setLevel", params: { level: "info" } },
        ],
      });
      expect(res.status_code).toBe(200);
      expect(res.body.map((entry: { id: unknown }) => entry.id)).toEqual([1, "p", 3]);
      expect(res.body[0].result.tools.length).toBeGreaterThan(0);
      expect(res.body[1].result.prompts.length).toBeGreaterThan(0);
      expect(res.body[2].error.code).toBe(-32601);
    }
  });

  it("answers a batch of notifications with 202", async () => {
    const { endpoint } = setup();
    const res = await endpoint({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: [{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 9, result: {} }],
    });
    expect(res).toEqual({ status_code: 202, headers: { "Content-Type": "text/plain" }, body: "" });
  });

  it("rejects initialize, 2026-07-28 requests and malformed entries inside a batch", async () => {
    const { endpoint } = setup();
    const res = await endpoint({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
        modernRequest("tools/list", {}, { id: 2 }).body,
        { id: 3, method: "ping" },
        { jsonrpc: "2.0", id: 4, method: "ping" },
      ],
    });
    expect(res.status_code).toBe(200);
    expect(res.body.map((entry: { error?: { code: number } }) => entry.error?.code)).toEqual([-32600, -32600, -32600, undefined]);
    expect(res.body[3]).toEqual({ jsonrpc: "2.0", id: 4, result: {} });
  });

  it("rejects batches for revisions that removed them, and an empty batch", async () => {
    const { endpoint } = setup();
    const batch = [{ jsonrpc: "2.0", id: 1, method: "ping" }];
    for (const version of ["2025-06-18", "2025-11-25", MODERN]) {
      const res = await endpoint({
        method: "POST",
        headers: { "content-type": "application/json", "mcp-protocol-version": version },
        body: batch,
      });
      expect(res.status_code).toBe(400);
      expect(res.body.error.code).toBe(-32600);
    }
    const empty = await endpoint({ method: "POST", headers: { "content-type": "application/json" }, body: [] });
    expect(empty.status_code).toBe(400);
    expect(empty.body.error.code).toBe(-32600);
  });

  it("keeps the older resource-not-found code", async () => {
    const { endpoint } = setup();
    const res = await endpoint(legacyRequest("resources/read", { uri: "agentmemory://nope" }));
    expect(res.body.error.code).toBe(-32002);
  });
});
