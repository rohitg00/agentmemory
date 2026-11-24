import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { handleToolCall } from "../src/mcp/standalone.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { resetHandleForTests } from "../src/mcp/rest-proxy.js";

// Issue #1828: the MCP bridge proxy drops agent identity. The bridge
// process owns AGENT_ID / AGENTMEMORY_AGENT_SCOPE but the server is a
// separate deployment, so unless the bridge transports identity with the
// proxied call every bridged write lands agentId: null and the scope env
// is inert on bridged lanes.

type Payload = Record<string, unknown>;
type Response = { status_code: number; body: Record<string, unknown> };

function captureSdk() {
  const functions = new Map<string, (req: unknown) => Promise<Response>>();
  const payloads: Payload[] = [];
  return {
    registerFunction: (
      id: string | { id: string },
      handler: (req: unknown) => Promise<Response>,
    ) => {
      functions.set(typeof id === "string" ? id : id.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: Payload }) => {
      if (input.function_id === "mem::remember") payloads.push(input.payload);
      return { success: true };
    },
    payloads,
    fn: (id: string) => functions.get(id)!,
  };
}

const kvStub = {
  get: async () => null,
  set: async (_s: string, _k: string, d: unknown) => d,
  delete: async () => {},
  list: async () => [],
};

function installFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) =>
    handler(url.toString(), init),
  );
  (globalThis as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

async function bridgedMcpCall(
  tool: string,
  args: Payload,
): Promise<Payload | undefined> {
  let sent: Payload | undefined;
  installFetch((url, init) => {
    if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
    if (url.endsWith("/agentmemory/mcp/call")) {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  await handleToolCall(tool, args);
  return sent;
}

async function bridgedRememberBody(args: Payload): Promise<Payload | undefined> {
  let sent: Payload | undefined;
  installFetch((url, init) => {
    if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
    if (url.endsWith("/agentmemory/remember")) {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
    return new Response("not found", { status: 404 });
  });
  await handleToolCall("memory_save", args);
  return sent;
}

async function bridgedSearchBody(args: Payload): Promise<Payload | undefined> {
  let sent: Payload | undefined;
  installFetch((url, init) => {
    if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
    if (url.endsWith("/agentmemory/search")) {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ mode: "full", facts: [] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  await handleToolCall("memory_recall", args);
  return sent;
}

describe("MCP bridge proxy forwards agent identity (issue #1828)", () => {
  const ORIG_ID = process.env["AGENT_ID"];
  const ORIG_SCOPE = process.env["AGENTMEMORY_AGENT_SCOPE"];

  beforeEach(() => {
    resetHandleForTests();
    process.env["AGENTMEMORY_URL"] = "http://localhost:3111";
    delete process.env["AGENTMEMORY_SECRET"];
    delete process.env["AGENT_ID"];
    delete process.env["AGENTMEMORY_AGENT_SCOPE"];
  });

  afterEach(() => {
    resetHandleForTests();
    if (ORIG_ID === undefined) delete process.env["AGENT_ID"];
    else process.env["AGENT_ID"] = ORIG_ID;
    if (ORIG_SCOPE === undefined) delete process.env["AGENTMEMORY_AGENT_SCOPE"];
    else process.env["AGENTMEMORY_AGENT_SCOPE"] = ORIG_SCOPE;
  });

  it("generic proxy lane puts bridge AGENT_ID + scope in the /agentmemory/mcp/call payload", async () => {
    process.env["AGENT_ID"] = "agent-delta";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "shared";
    const sent = await bridgedMcpCall("memory_lesson_save", {
      title: "Always pin lockfiles",
      content: "...",
    });
    expect(sent).toBeDefined();
    expect(sent!["agentId"]).toBe("agent-delta");
    expect(sent!["agentScope"]).toBe("shared");
    // identity travels as request metadata, not by mutating tool arguments
    expect(sent!["arguments"]).toEqual({
      title: "Always pin lockfiles",
      content: "...",
    });
  });

  it("generic proxy lane without AGENT_ID sends no identity fields", async () => {
    const sent = await bridgedMcpCall("memory_lesson_save", { title: "t", content: "c" });
    expect(sent).toBeDefined();
    expect(sent!["agentId"]).toBeUndefined();
    expect(sent!["agentScope"]).toBeUndefined();
  });

  it("generic lane keeps an explicit per-call agentId in arguments over the env identity", async () => {
    process.env["AGENT_ID"] = "agent-delta";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "shared";
    const sent = await bridgedMcpCall("memory_action_create", {
      title: "ship the fix",
      agentId: "agent-gamma",
    });
    expect(sent).toBeDefined();
    // explicit per-call argument travels verbatim and wins server-side
    expect((sent!["arguments"] as Payload)["agentId"]).toBe("agent-gamma");
    // env identity still rides along as metadata fallback
    expect(sent!["agentId"]).toBe("agent-delta");
  });

  it("bridged memory_save stamps the bridge AGENT_ID on the REST remember payload", async () => {
    process.env["AGENT_ID"] = "agent-delta";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "shared";
    const sent = await bridgedRememberBody({ content: "reach the server tagged" });
    expect(sent).toBeDefined();
    expect(sent!["agentId"]).toBe("agent-delta");
  });

  it("bridged memory_save keeps an explicit per-call agentId", async () => {
    process.env["AGENT_ID"] = "agent-delta";
    const sent = await bridgedRememberBody({
      content: "explicit identity wins",
      agentId: "agent-gamma",
    });
    expect(sent!["agentId"]).toBe("agent-gamma");
  });

  it("bridged memory_save without AGENT_ID sends no agentId (legacy)", async () => {
    const sent = await bridgedRememberBody({ content: "legacy unscoped" });
    expect(sent).toBeDefined();
    expect(sent!["agentId"]).toBeUndefined();
  });

  it("isolated scope scopes bridged recall to the bridge agent", async () => {
    process.env["AGENT_ID"] = "agent-delta";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "isolated";
    const sent = await bridgedSearchBody({ query: "auth bug" });
    expect(sent!["agentId"]).toBe("agent-delta");
  });

  it("shared scope leaves bridged recall unfiltered like the local lane", async () => {
    process.env["AGENT_ID"] = "agent-delta";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "shared";
    const sent = await bridgedSearchBody({ query: "auth bug" });
    expect(sent!["agentId"]).toBeUndefined();
  });

  it("server-side mcp::tools::call attributes a proxied shared-scope save", async () => {
    const sdk = captureSdk();
    registerMcpEndpoints(sdk as never, kvStub as never);
    const res = await sdk.fn("mcp::tools::call")({
      headers: {},
      body: {
        name: "memory_save",
        arguments: { content: "proxied write" },
        agentId: "agent-delta",
        agentScope: "shared",
      },
    });
    expect(res.status_code).toBe(200);
    expect(sdk.payloads[0]!["agentId"]).toBe("agent-delta");
  });

  it("server-side mcp::tools::call keeps explicit arguments agentId over the proxied identity", async () => {
    const sdk = captureSdk();
    registerMcpEndpoints(sdk as never, kvStub as never);
    const res = await sdk.fn("mcp::tools::call")({
      headers: {},
      body: {
        name: "memory_save",
        arguments: { content: "explicit wins", agentId: "agent-gamma" },
        agentId: "agent-delta",
        agentScope: "shared",
      },
    });
    expect(res.status_code).toBe(200);
    expect(sdk.payloads[0]!["agentId"]).toBe("agent-gamma");
  });

  it("server-side mcp::tools::call without proxied identity stays legacy (no agentId)", async () => {
    const sdk = captureSdk();
    registerMcpEndpoints(sdk as never, kvStub as never);
    const res = await sdk.fn("mcp::tools::call")({
      headers: {},
      body: { name: "memory_save", arguments: { content: "legacy" } },
    });
    expect(res.status_code).toBe(200);
    expect(sdk.payloads[0]!["agentId"]).toBeUndefined();
  });

  it("server-side mcp::tools::call scopes proxied recall only under isolated scope", async () => {
    const sdk = captureSdk();
    registerMcpEndpoints(sdk as never, kvStub as never);
    const searches: Payload[] = [];
    sdk.trigger = async (input: { function_id: string; payload: Payload }) => {
      if (input.function_id === "mem::search") searches.push(input.payload);
      return { results: [] };
    };
    const res = await sdk.fn("mcp::tools::call")({
      headers: {},
      body: {
        name: "memory_recall",
        arguments: { query: "auth bug" },
        agentId: "agent-delta",
        agentScope: "isolated",
      },
    });
    expect(res.status_code).toBe(200);
    expect(searches[0]!["agentId"]).toBe("agent-delta");
  });
});
