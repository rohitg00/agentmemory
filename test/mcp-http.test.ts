import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server as NodeServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createProxyBackend,
  startMcpHttpServer,
  type McpHttpBackend,
} from "../src/mcp/http.js";

const servers: NodeServer[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

async function fixture(token = "test-token") {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const backend: McpHttpBackend = {
    health: async () => true,
    listTools: async () => ({
      tools: [
        {
          name: "memory_next",
          description: "Read the next shared action",
          inputSchema: {
            type: "object",
            properties: { project: { type: "string" } },
            required: ["project"],
          },
        },
      ],
    }),
    callTool: async (name, args) => {
      calls.push({ name, args });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, name, args }) }],
      };
    },
  };
  const server = await startMcpHttpServer({
    host: "127.0.0.1",
    port: 0,
    token,
    backend,
  });
  servers.push(server);
  const address = server.address() as AddressInfo;
  return {
    calls,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function connect(baseUrl: string, token: string | null = "test-token") {
  const client = new Client({ name: "agentmemory-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
    {
      requestInit: token
        ? { headers: { authorization: `Bearer ${token}` } }
        : undefined,
    },
  );
  await client.connect(transport);
  return client;
}

describe("AgentMemory Streamable HTTP transport", () => {
  it("serves tools through the official stateless MCP client", async () => {
    const { baseUrl, calls } = await fixture();
    const client = await connect(baseUrl);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(["memory_next"]);

    const called = await client.callTool({
      name: "memory_next",
      arguments: { project: "workstation" },
    });
    expect(called.isError).not.toBe(true);
    expect(calls).toEqual([
      { name: "memory_next", args: { project: "workstation" } },
    ]);

    await client.close();
  });

  it("allows a fresh client to reconnect without server session state", async () => {
    const { baseUrl, calls } = await fixture();
    const first = await connect(baseUrl);
    await first.callTool({ name: "memory_next", arguments: { project: "one" } });
    await first.close();

    const second = await connect(baseUrl);
    await second.callTool({ name: "memory_next", arguments: { project: "two" } });
    await second.close();

    expect(calls.map((call) => call.args.project)).toEqual(["one", "two"]);
  });

  it("does not require listener auth when its explicit token is empty", async () => {
    const { baseUrl } = await fixture("");
    const client = await connect(baseUrl, null);

    expect((await client.listTools()).tools[0]?.name).toBe("memory_next");

    await client.close();
  });

  it("rejects missing bearer credentials and hostile browser origins", async () => {
    const { baseUrl } = await fixture();
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "raw-test", version: "1.0.0" },
      },
    });

    const unauthorized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toBe("Bearer");

    const hostileOrigin = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body,
    });
    expect(hostileOrigin.status).toBe(403);
  });

  it("allows an explicitly authenticated wildcard bind without trusting hostile origins", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const backend: McpHttpBackend = {
      health: async () => true,
      listTools: async () => ({
        tools: [{
          name: "memory_next",
          description: "next",
          inputSchema: { type: "object", properties: {} },
        }],
      }),
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "ok" }] };
      },
    };
    await expect(startMcpHttpServer({
      host: "0.0.0.0",
      port: 0,
      allowRemote: true,
      token: "",
      backend,
    })).rejects.toThrow(/bearer token/);

    const server = await startMcpHttpServer({
      host: "0.0.0.0",
      port: 0,
      allowRemote: true,
      token: "remote-test-token",
      backend,
    });
    servers.push(server);
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const client = await connect(baseUrl, "remote-test-token");

    expect((await client.listTools()).tools[0]?.name).toBe("memory_next");
    await client.close();

    const hostile = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer remote-test-token",
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: "{}",
    });
    expect(hostile.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("keeps health separate and returns 405 for MCP GET", async () => {
    const { baseUrl } = await fixture();
    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: "ok",
      transport: "streamable-http",
      upstream: true,
    });

    const get = await fetch(`${baseUrl}/mcp`, {
      headers: { authorization: "Bearer test-token" },
    });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });

  it("proxies list and call requests to the existing engine surface", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/agentmemory/livez") {
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }
      if (path === "/agentmemory/mcp/tools") {
        return new Response(
          JSON.stringify({
            tools: [
              {
                name: "memory_next",
                description: "next",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          }),
          { status: 200 },
        );
      }
      expect(path).toBe("/agentmemory/mcp/call");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "memory_next",
        arguments: { project: "workstation" },
      });
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200 },
      );
    });
    const backend = createProxyBackend({
      baseUrl: "http://127.0.0.1:3111",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(await backend.health()).toBe(true);
    expect((await backend.listTools()).tools[0]?.name).toBe("memory_next");
    expect(
      await backend.callTool("memory_next", { project: "workstation" }),
    ).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("preserves structured authorization errors from the engine", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "lesson_access_denied",
          error: "lesson access denied",
        }),
        { status: 403, statusText: "Forbidden" },
      ),
    );
    const backend = createProxyBackend({
      baseUrl: "http://127.0.0.1:3111",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(backend.listTools()).rejects.toThrow(
      "403 Forbidden; code=lesson_access_denied error=lesson access denied",
    );
  });
});
