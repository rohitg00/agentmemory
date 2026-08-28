import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleToolCall } from "../src/mcp/standalone.js";
import { resetHandleForTests } from "../src/mcp/rest-proxy.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";

const BASE = "http://localhost:3111";

describe("@agentmemory/mcp fixed agent identity", () => {
  const originalFetch = globalThis.fetch;
  const originalAgentId = process.env["AGENT_ID"];
  const originalAgentScope = process.env["AGENTMEMORY_AGENT_SCOPE"];

  beforeEach(() => {
    resetHandleForTests();
    process.env["AGENTMEMORY_URL"] = BASE;
    process.env["AGENT_ID"] = "alpha";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "isolated";
  });

  afterEach(() => {
    resetHandleForTests();
    globalThis.fetch = originalFetch;
    delete process.env["AGENTMEMORY_URL"];
    if (originalAgentId === undefined) delete process.env["AGENT_ID"];
    else process.env["AGENT_ID"] = originalAgentId;
    if (originalAgentScope === undefined) delete process.env["AGENTMEMORY_AGENT_SCOPE"];
    else process.env["AGENTMEMORY_AGENT_SCOPE"] = originalAgentScope;
  });

  it("binds memory_save to AGENT_ID instead of a model-supplied agentId", async () => {
    let rememberBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      if (target.endsWith("/agentmemory/remember")) {
        rememberBody = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handleToolCall("memory_save", {
      content: "ALPHA profile marker",
      agentId: "beta",
    });

    expect(rememberBody).toMatchObject({
      content: "ALPHA profile marker",
      agentId: "alpha",
    });
  });

  it("binds AGENT_ID to recall, smart-search, and session reads", async () => {
    const bodies = new Map<string, Record<string, unknown>>();
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      requestedUrls.push(target);
      if (init?.body) bodies.set(new URL(target).pathname, JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ results: [], sessions: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handleToolCall("memory_recall", { query: "marker" });
    await handleToolCall("memory_smart_search", { query: "marker" });
    await handleToolCall("memory_sessions", { limit: 5 });

    expect(bodies.get("/agentmemory/search")).toMatchObject({ agentId: "alpha" });
    expect(bodies.get("/agentmemory/smart-search")).toMatchObject({ agentId: "alpha" });
    const sessionsUrl = new URL(
      requestedUrls.find((url) => url.includes("/agentmemory/sessions"))!,
    );
    expect(sessionsUrl.searchParams.get("agentId")).toBe("alpha");
  });

  it("binds AGENT_ID to proxied governance deletes", async () => {
    let deleteBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      if (target.endsWith("/agentmemory/governance/memories")) {
        deleteBody = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ success: true, deleted: 0 }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handleToolCall("memory_governance_delete", {
      memoryIds: ["mem_beta"],
      reason: "remove stale memory",
    });

    expect(deleteBody).toEqual({
      memoryIds: ["mem_beta"],
      reason: "remove stale memory",
      agentId: "alpha",
    });
  });

  it("binds AGENT_ID to proxied exports", async () => {
    let exportUrl: string | undefined;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = url.toString();
      if (target.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      if (target.includes("/agentmemory/export")) {
        exportUrl = target;
        return new Response(
          JSON.stringify({ sessions: [], memories: [], summaries: [] }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handleToolCall("memory_export", {});

    const parsed = new URL(exportUrl!);
    expect(parsed.pathname).toBe("/agentmemory/export");
    expect(parsed.searchParams.get("agentId")).toBe("alpha");
  });


  it("binds AGENT_ID on the generic full-tool proxy path", async () => {
    let callBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      if (target.endsWith("/agentmemory/mcp/call")) {
        callBody = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handleToolCall("memory_lesson_save", {
      content: "profile-scoped lesson",
      agentId: "beta",
    });

    expect(callBody).toEqual({
      name: "memory_lesson_save",
      arguments: {
        content: "profile-scoped lesson",
        agentId: "alpha",
      },
    });
  });


  it("keeps the shared local fallback store isolated between agent IDs", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const kv = new InMemoryKV();

    process.env["AGENT_ID"] = "alpha";
    await handleToolCall("memory_save", { content: "ALPHA_ONLY_MARKER" }, kv);

    process.env["AGENT_ID"] = "beta";
    await handleToolCall("memory_save", { content: "BETA_ONLY_MARKER" }, kv);
    const betaSeesAlpha = JSON.parse(
      (await handleToolCall("memory_recall", { query: "ALPHA_ONLY_MARKER" }, kv)).content[0]
        .text,
    );
    const betaSeesBeta = JSON.parse(
      (await handleToolCall("memory_recall", { query: "BETA_ONLY_MARKER" }, kv)).content[0]
        .text,
    );

    expect(betaSeesAlpha.results).toEqual([]);
    expect(betaSeesBeta.results).toHaveLength(1);
    expect(betaSeesBeta.results[0].agentId).toBe("beta");
  });


  it("filters local sessions and exports and cannot delete another agent's memory", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const kv = new InMemoryKV();
    await kv.set("mem:sessions", "alpha-session", { id: "alpha-session", agentId: "alpha" });
    await kv.set("mem:sessions", "beta-session", { id: "beta-session", agentId: "beta" });
    await kv.set("mem:memories", "alpha-memory", {
      id: "alpha-memory",
      content: "ALPHA secret",
      agentId: "alpha",
    });
    await kv.set("mem:memories", "beta-memory", {
      id: "beta-memory",
      content: "BETA secret",
      agentId: "beta",
    });

    process.env["AGENT_ID"] = "beta";
    const sessions = JSON.parse(
      (await handleToolCall("memory_sessions", {}, kv)).content[0].text,
    );
    const exported = JSON.parse(
      (await handleToolCall("memory_export", {}, kv)).content[0].text,
    );
    const deletion = JSON.parse(
      (
        await handleToolCall(
          "memory_governance_delete",
          { memoryIds: ["alpha-memory"] },
          kv,
        )
      ).content[0].text,
    );

    expect(
      sessions.sessions.map((session: Record<string, unknown>) => session["id"]),
    ).toEqual(["beta-session"]);
    expect(
      exported.sessions.map((session: Record<string, unknown>) => session["id"]),
    ).toEqual(["beta-session"]);
    expect(
      exported.memories.map((memory: Record<string, unknown>) => memory["id"]),
    ).toEqual(["beta-memory"]);
    expect(deletion.deleted).toBe(0);
    expect(await kv.get("mem:memories", "alpha-memory")).not.toBeNull();
  });


  it("keeps shared-mode recall unfiltered while still tagging writes", async () => {
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "shared";
    const bodies = new Map<string, Record<string, unknown>>();
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith("/agentmemory/livez")) {
        return new Response("ok", { status: 200 });
      }
      if (init?.body) bodies.set(new URL(target).pathname, JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ results: [], success: true }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handleToolCall("memory_save", { content: "shared marker", agentId: "beta" });
    await handleToolCall("memory_recall", { query: "shared marker" });

    expect(bodies.get("/agentmemory/remember")).toMatchObject({ agentId: "alpha" });
    expect(bodies.get("/agentmemory/search")).not.toHaveProperty("agentId");
  });


  it("fails closed in isolated mode when AGENT_ID is missing", async () => {
    delete process.env["AGENT_ID"];
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      handleToolCall("memory_save", {
        content: "must not be stored",
        agentId: "model-chosen-id",
      }),
    ).rejects.toThrow(/AGENT_ID is required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
