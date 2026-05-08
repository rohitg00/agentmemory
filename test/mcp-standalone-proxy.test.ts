import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { handleToolCall } from "../src/mcp/standalone.js";
import { resetHandleForTests } from "../src/mcp/rest-proxy.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";

type FetchMock = ReturnType<typeof vi.fn>;

function installFetch(handler: (url: string, init?: RequestInit) => Response): FetchMock {
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) =>
    handler(url.toString(), init),
  );
  (globalThis as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

const BASE = "http://localhost:3111";

describe("@agentmemory/mcp standalone — server proxy (issue #159)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetHandleForTests();
    process.env["AGENTMEMORY_URL"] = BASE;
    delete process.env["AGENTMEMORY_SECRET"];
  });

  afterEach(() => {
    resetHandleForTests();
    globalThis.fetch = originalFetch;
    delete process.env["AGENTMEMORY_URL"];
    delete process.env["AGENTMEMORY_SECRET"];
  });

  it("proxies any tool call to POST /agentmemory/mcp/call", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    installFetch((url, init) => {
      const parsed = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, method: init?.method || "GET", body: parsed });
      if (url.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      if (url.endsWith("/agentmemory/mcp/call")) {
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: JSON.stringify({ sessions: [{ id: "sess-1" }] }) }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const res = await handleToolCall("memory_sessions", { limit: 5 });
    const body = JSON.parse(res.content[0].text);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("sess-1");

    const mcpCall = calls.find((c) => c.url.endsWith("/agentmemory/mcp/call"));
    expect(mcpCall).toBeDefined();
    expect(mcpCall!.method).toBe("POST");
    expect((mcpCall!.body as Record<string, unknown>).name).toBe("memory_sessions");
    expect((mcpCall!.body as Record<string, unknown>).arguments).toEqual({ limit: 5 });
  });

  it("proxies non-IMPLEMENTED_TOOLS tools to POST /agentmemory/mcp/call", async () => {
    installFetch((url, init) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.endsWith("/agentmemory/mcp/call")) {
        const body = JSON.parse((init?.body as string) || "{}");
        return new Response(
          JSON.stringify({
            content: [{
              type: "text",
              text: JSON.stringify({ tool: body.name, query: body.arguments.query }),
            }],
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });
    const res = await handleToolCall("memory_crystallize", { actionIds: "a,b" });
    const body = JSON.parse(res.content[0].text);
    expect(body.tool).toBe("memory_crystallize");
  });

  it("falls back to local InMemoryKV when server is unreachable", async () => {
    installFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const localKv = new InMemoryKV(undefined);
    await handleToolCall("memory_save", { content: "local only" }, localKv);
    const recall = await handleToolCall("memory_recall", { query: "local" }, localKv);
    const out = JSON.parse(recall.content[0].text);
    expect(out.mode).toBe("compact");
    expect(out.results).toHaveLength(1);
    expect(out.results[0].content).toBe("local only");
  });

  it("invalidates the handle on proxy failure, so the next call re-probes", async () => {
    let probeCount = 0;
    let serverUp = true;
    installFetch((url, init) => {
      if (url.endsWith("/agentmemory/livez")) {
        probeCount++;
        return serverUp ? new Response("ok", { status: 200 }) : new Response("", { status: 500 });
      }
      return new Response("boom", { status: 500, statusText: "Internal Server Error" });
    });
    const localKv = new InMemoryKV(undefined);
    await handleToolCall("memory_save", { content: "first fallback" }, localKv);
    expect(probeCount).toBe(1);
    serverUp = false;
    await handleToolCall("memory_save", { content: "second fallback" }, localKv);
    expect(probeCount).toBe(2);
  });

  it("attaches Bearer token on the proxied tool request and probe", async () => {
    process.env["AGENTMEMORY_SECRET"] = "s3cret";
    const authByPath = new Map<string, string | undefined>();
    installFetch((url, init) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.[
        "authorization"
      ];
      const u = new URL(url);
      authByPath.set(u.pathname, auth);
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
        { status: 200 },
      );
    });
    await handleToolCall("memory_sessions", {});
    expect(authByPath.get("/agentmemory/livez")).toBe("Bearer s3cret");
    expect(authByPath.get("/agentmemory/mcp/call")).toBe("Bearer s3cret");
  });

  it("in proxy mode, delegates validation to the server (no local validation error)", async () => {
    installFetch((url, init) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.endsWith("/agentmemory/mcp/call")) {
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: JSON.stringify({ proxied: true }) }],
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });
    const localKv = new InMemoryKV(undefined);
    const result = await handleToolCall("memory_save", { content: "" }, localKv);
    const body = JSON.parse(result.content[0].text);
    expect(body.proxied).toBe(true);
  });

  it("local fallback returns the same shape as expected for memory_smart_search", async () => {
    installFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const localKv = new InMemoryKV(undefined);
    await handleToolCall("memory_save", { content: "shape-check entry" }, localKv);
    const res = await handleToolCall("memory_smart_search", { query: "shape" }, localKv);
    const body = JSON.parse(res.content[0].text);
    expect(body).toHaveProperty("mode", "compact");
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results[0].content).toBe("shape-check entry");
  });
});
