import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("@agentmemory/mcp standalone — time range forwarding (issue #392)", () => {
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
  });

  it("proxies start_time/end_time on memory_smart_search to the server body", async () => {
    let observedBody: Record<string, unknown> | null = null;
    installFetch((url, init) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.endsWith("/agentmemory/smart-search")) {
        observedBody = init?.body ? JSON.parse(init.body as string) : null;
        return new Response(
          JSON.stringify({ mode: "compact", results: [] }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });

    await handleToolCall("memory_smart_search", {
      query: "auth",
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-07T23:59:59Z",
    });
    expect(observedBody).not.toBeNull();
    expect(observedBody!.start_time).toBe("2026-05-01T00:00:00Z");
    expect(observedBody!.end_time).toBe("2026-05-07T23:59:59Z");
  });

  it("proxies start_time/end_time on memory_recall to /agentmemory/smart-search body", async () => {
    let observedBody: Record<string, unknown> | null = null;
    installFetch((url, init) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.endsWith("/agentmemory/smart-search")) {
        observedBody = init?.body ? JSON.parse(init.body as string) : null;
        return new Response(
          JSON.stringify({ mode: "compact", results: [] }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });

    await handleToolCall("memory_recall", {
      query: "auth",
      start_time: "2026-05-01T00:00:00Z",
    });
    expect(observedBody).not.toBeNull();
    expect(observedBody!.start_time).toBe("2026-05-01T00:00:00Z");
    // end_time is omitted from the request body when not provided.
    expect(observedBody!.end_time).toBeUndefined();
  });

  it("proxies start_time/end_time/limit on memory_sessions as query params", async () => {
    let observedUrl: string | null = null;
    installFetch((url) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.includes("/agentmemory/sessions")) {
        observedUrl = url;
        return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    await handleToolCall("memory_sessions", {
      start_time: "2026-05-01T00:00:00Z",
      end_time: "2026-05-07T23:59:59Z",
      limit: 25,
    });
    expect(observedUrl).not.toBeNull();
    const u = new URL(observedUrl!);
    expect(u.searchParams.get("start_time")).toBe("2026-05-01T00:00:00Z");
    expect(u.searchParams.get("end_time")).toBe("2026-05-07T23:59:59Z");
    expect(u.searchParams.get("limit")).toBe("25");
  });

  it("rejects malformed start_time before the proxy call goes out", async () => {
    let smartSearchHits = 0;
    installFetch((url) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.endsWith("/agentmemory/smart-search")) smartSearchHits++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await expect(
      handleToolCall("memory_smart_search", {
        query: "auth",
        start_time: "yesterday",
      }),
    ).rejects.toThrow(/ISO 8601/);
    expect(smartSearchHits).toBe(0);
  });

  it("rejects start_time > end_time before the proxy call goes out", async () => {
    let smartSearchHits = 0;
    installFetch((url) => {
      if (url.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
      if (url.endsWith("/agentmemory/smart-search")) smartSearchHits++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await expect(
      handleToolCall("memory_smart_search", {
        query: "auth",
        start_time: "2026-06-01T00:00:00Z",
        end_time: "2026-05-01T00:00:00Z",
      }),
    ).rejects.toThrow(/start_time must be <= end_time/);
    expect(smartSearchHits).toBe(0);
  });

  it("local fallback applies time filter on memory_sessions", async () => {
    installFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const localKv = new InMemoryKV(undefined);

    await localKv.set("mem:sessions", "s_in", {
      id: "s_in",
      startedAt: "2026-05-03T00:00:00Z",
      endedAt: "2026-05-03T01:00:00Z",
    });
    await localKv.set("mem:sessions", "s_before", {
      id: "s_before",
      startedAt: "2026-04-01T00:00:00Z",
      endedAt: "2026-04-01T01:00:00Z",
    });
    await localKv.set("mem:sessions", "s_after", {
      id: "s_after",
      startedAt: "2026-06-01T00:00:00Z",
      endedAt: "2026-06-01T01:00:00Z",
    });

    const res = await handleToolCall(
      "memory_sessions",
      {
        start_time: "2026-05-01T00:00:00Z",
        end_time: "2026-05-31T23:59:59Z",
      },
      localKv,
    );
    const body = JSON.parse(res.content[0].text);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("s_in");
  });

  it("local fallback applies time filter on memory_recall against memory.createdAt", async () => {
    installFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const localKv = new InMemoryKV(undefined);

    await handleToolCall(
      "memory_save",
      { content: "auth jwt note" },
      localKv,
    );
    // Backdate the freshly-saved memory so it sits outside the window.
    const memList = await localKv.list<Record<string, unknown>>("mem:memories");
    expect(memList).toHaveLength(1);
    const stored = memList[0] as { id: string; createdAt: string };
    await localKv.set("mem:memories", stored.id, {
      ...stored,
      createdAt: "2026-04-15T00:00:00Z",
    });
    // And add a fresh one inside the window.
    await handleToolCall(
      "memory_save",
      { content: "auth refresh in window" },
      localKv,
    );
    const refreshed = await localKv.list<Record<string, unknown>>("mem:memories");
    const inWindow = refreshed.find(
      (m) => m["content"] === "auth refresh in window",
    ) as { id: string; createdAt: string };
    await localKv.set("mem:memories", inWindow.id, {
      ...inWindow,
      createdAt: "2026-05-03T00:00:00Z",
    });

    const res = await handleToolCall(
      "memory_recall",
      {
        query: "auth",
        start_time: "2026-05-01T00:00:00Z",
        end_time: "2026-05-31T23:59:59Z",
      },
      localKv,
    );
    const body = JSON.parse(res.content[0].text);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].content).toBe("auth refresh in window");
  });
});
