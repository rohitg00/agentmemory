import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apply,
  makeRestClient,
  resolveProjectName,
  isAgentmemoryTool,
  userMessagePrompt,
  toolCallObservation,
  compactionSummary,
  type PluginContext,
  type SessionEvent,
} from "../src/index";

// ─────────────────────────── helpers ───────────────────────────

function fakeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", impl);
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } });
}

function makeCtx(): { ctx: PluginContext; listeners: Map<string, Function[]>; logs: string[] } {
  const listeners = new Map<string, Function[]>();
  const logs: string[] = [];
  const ctx: PluginContext = {
    on(event, listener) {
      const arr = listeners.get(event) ?? [];
      arr.push(listener);
      listeners.set(event, arr);
    },
    effect() {},
    logger: {
      info: (...a) => logs.push("info " + a.join(" ")),
      warn: (...a) => logs.push("warn " + a.join(" ")),
      error: (...a) => logs.push("error " + a.join(" ")),
    },
  };
  return { ctx, listeners, logs };
}

async function fire(listeners: Map<string, Function[]>, event: string, ...args: unknown[]) {
  for (const fn of listeners.get(event) ?? []) {
    await (fn as (...a: unknown[]) => unknown)(...args);
  }
}

function session(id: string, cwd = "/tmp/proj"): any {
  return { id, header: { cwd } };
}

function event(type: string, data: unknown): SessionEvent {
  return { type, data } as SessionEvent;
}

// ─────────────────────────── tests ───────────────────────────

describe("makeRestClient", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("posts JSON with auth header when secret set", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    fakeFetch(async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return jsonResponse({ ok: true });
    });
    const rest = makeRestClient("http://localhost:3111", "sekrit");
    const out = await rest.post<{ ok: boolean }>("/session/start", { sessionId: "s1" });
    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:3111/agentmemory/session/start");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sekrit");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ sessionId: "s1" });
  });

  it("returns null on non-ok response", async () => {
    fakeFetch(async () => jsonResponse({ error: "x" }, false));
    const rest = makeRestClient("http://x", "");
    expect(await rest.post("/x", {})).toBeNull();
  });

  it("returns null on network failure without throwing", async () => {
    fakeFetch(async () => { throw new Error("boom"); });
    const rest = makeRestClient("http://x", "");
    expect(await rest.post("/x", {})).toBeNull();
    expect(() => rest.fire("/x", {})).not.toThrow();
  });

  it("fire swallows async rejection", async () => {
    fakeFetch(async () => { throw new Error("boom"); });
    const rest = makeRestClient("http://x", "");
    rest.fire("/observe", {});
    await new Promise((r) => setTimeout(r, 20));
    expect(true).toBe(true);
  });
});

describe("resolveProjectName", () => {
  it("uses explicit env override", () => {
    expect(resolveProjectName("/tmp/a", { AGENTMEMORY_PROJECT_NAME: "override" })).toBe("override");
  });

  it("falls back to cwd basename without git", () => {
    expect(resolveProjectName("/tmp/some-dir", {})).toBe("some-dir");
  });
});

describe("isAgentmemoryTool", () => {
  it("recognizes dsh-namespaced and opencode-named tools", () => {
    expect(isAgentmemoryTool("mcp__agentmemory__memory_recall")).toBe(true);
    expect(isAgentmemoryTool("agentmemory_memory_save")).toBe(true);
    expect(isAgentmemoryTool("read")).toBe(false);
  });
});

describe("event mapping", () => {
  it("userMessagePrompt extracts string content", () => {
    expect(userMessagePrompt(event("user/message", { content: "hello world" }), 100)).toBe("hello world");
  });

  it("userMessagePrompt extracts text blocks", () => {
    const e = event("user/message", { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] });
    expect(userMessagePrompt(e, 100)).toBe("a\nb");
  });

  it("userMessagePrompt returns null for empty", () => {
    expect(userMessagePrompt(event("user/message", { content: "   " }), 100)).toBeNull();
    expect(userMessagePrompt(event("tool/call", {}), 100)).toBeNull();
  });

  it("toolCallObservation extracts name and arguments and truncates", () => {
    const e = event("tool/call", { callId: "c1", name: "read", arguments: { path: "/a/b.txt" } });
    const obs = toolCallObservation(e, 200);
    expect(obs).not.toBeNull();
    expect(obs!.tool_name).toBe("read");
    expect(obs!.call_id).toBe("c1");
    expect(JSON.parse(obs!.tool_input as string)).toEqual({ path: "/a/b.txt" });
  });

  it("toolCallObservation filters agentmemory tools", () => {
    const e = event("tool/call", { callId: "c2", name: "mcp__agentmemory__memory_recall", arguments: {} });
    expect(toolCallObservation(e, 200)).toBeNull();
  });

  it("compactionSummary extracts summary text", () => {
    expect(compactionSummary(event("compaction/summary", { summary: "did stuff" }), 100)).toBe("did stuff");
    expect(compactionSummary(event("user/message", {}), 100)).toBeNull();
  });
});

describe("plugin apply()", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("registers session on session/created with project+cwd+agentId", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    fakeFetch(async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return jsonResponse({ context: "ctx" });
    });
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:3111", secret: "", agentId: "dsh-test" });

    await fire(listeners, "session/created", session("ses_1", "/tmp/proj"));
    await new Promise((r) => setTimeout(r, 10));

    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(body.sessionId).toBe("ses_1");
    expect(body.project).toBe("proj");
    expect(body.cwd).toBe("/tmp/proj");
    expect(body.agentId).toBe("dsh-test");
  });

  it("injects instructions+context into first step batch", async () => {
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:3111" });
    const preStep = listeners.get("agent/pre-step");
    expect(preStep).toBeDefined();

    const claimed = [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }] }];
    let nextCalled = 0;
    const next = async () => {
      nextCalled++;
      return { kind: "enter", messages: [...claimed] };
    };
    const payload = { agent: { session: session("ses_2", "/tmp/proj") }, messages: claimed, step: 1, signal: new AbortController().signal };

    const decision = await (preStep![0] as any)(payload, next);
    expect(nextCalled).toBe(1);
    expect(decision.messages).toHaveLength(2);
    expect(decision.messages[1].role).toBe("user");
    expect(decision.messages[1].content[0].type).toBe("text");
    expect(String(decision.messages[1].content[0].text)).toContain("agentmemory");
    expect(String(decision.messages[1].content[0].text)).toContain("memory_recall");
  });

  it("does not inject on step > 1 or already-injected session", async () => {
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:3111" });
    const preStep = listeners.get("agent/pre-step")![0] as any;
    const claimed = [{ id: "m1" }];
    const next = async () => ({ kind: "enter", messages: [...claimed] });

    const d1 = await preStep({ agent: { session: session("s", "/tmp/p") }, messages: claimed, step: 2, signal: new AbortController().signal }, next);
    expect(d1.messages).toHaveLength(1);

    const d2 = await preStep({ agent: { session: session("s", "/tmp/p") }, messages: claimed, step: 1, signal: new AbortController().signal }, next);
    expect(d2.messages).toHaveLength(2);
    const d3 = await preStep({ agent: { session: session("s", "/tmp/p") }, messages: claimed, step: 1, signal: new AbortController().signal }, next);
    expect(d3.messages).toHaveLength(1);
  });

  it("observes prompt_submit and post_tool_use via session/event", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    fakeFetch(async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return jsonResponse({});
    });
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:3111" });
    const ses = session("ses_3", "/tmp/proj");

    await fire(listeners, "session/event", ses, event("user/message", { content: "do the thing" }));
    await fire(listeners, "session/event", ses, event("tool/call", { callId: "c9", name: "edit", arguments: { filePath: "/tmp/proj/a.ts" } }));
    await new Promise((r) => setTimeout(r, 10));

    const observes = calls.filter((c) => c.url.endsWith("/observe")).map((c) => JSON.parse(String(c.init.body)));
    expect(observes).toHaveLength(2);
    expect(observes[0].hookType).toBe("prompt_submit");
    expect(observes[0].data.userPrompt).toBe("do the thing");
    expect(observes[1].hookType).toBe("post_tool_use");
    expect(observes[1].data.tool_name).toBe("edit");
  });

  it("compaction bridge remembers summaries", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    fakeFetch(async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return jsonResponse({});
    });
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:3111" });

    await fire(listeners, "session/event", session("ses_4", "/tmp/proj"), event("compaction/summary", { summary: "refactored auth module" }));
    await new Promise((r) => setTimeout(r, 10));

    const remembers = calls.filter((c) => c.url.endsWith("/remember"));
    expect(remembers).toHaveLength(1);
    const body = JSON.parse(String(remembers[0].init.body)) as Record<string, unknown>;
    expect(String(body.content)).toContain("refactored auth module");
  });

  it("calls session/end on dispose", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    fakeFetch(async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return jsonResponse({});
    });
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:3111" });

    await fire(listeners, "session/disposed", session("ses_5"));
    await new Promise((r) => setTimeout(r, 10));

    const ends = calls.filter((c) => c.url.endsWith("/session/end"));
    expect(ends).toHaveLength(1);
    expect(JSON.parse(String(ends[0].init.body))).toEqual({ sessionId: "ses_5" });
  });

  it("never throws when daemon is unreachable", async () => {
    fakeFetch(async () => { throw new Error("ECONNREFUSED"); });
    const { ctx, listeners } = makeCtx();
    apply(ctx, { url: "http://localhost:1" });

    await expect(
      fire(listeners, "session/created", session("s6", "/tmp/p")),
    ).resolves.toBeUndefined();
    await expect(
      fire(listeners, "session/event", session("s6", "/tmp/p"), event("user/message", { content: "x" })),
    ).resolves.toBeUndefined();
    await expect(
      fire(listeners, "session/disposed", session("s6")),
    ).resolves.toBeUndefined();

    const preStep = listeners.get("agent/pre-step")![0] as any;
    const claimed = [{ id: "m" }];
    const next = async () => ({ kind: "enter", messages: [...claimed] });
    await expect(
      preStep({ agent: { session: session("s6", "/tmp/p") }, messages: claimed, step: 1, signal: new AbortController().signal }, next),
    ).resolves.toBeTruthy();
  });
});
