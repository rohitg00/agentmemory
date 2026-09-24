import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("OpenCode plugin complete endpoint & hook matrix test suite", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{ url: string; body: any }>;

  beforeEach(() => {
    capturedRequests = [];
    fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedRequests.push({ url, body });

      if (url.includes("/session/start")) {
        return {
          ok: true,
          json: async () => ({ context: "## Start Context" }),
        };
      }
      if (url.includes("/context")) {
        return {
          ok: true,
          json: async () => ({ context: "## Fetched Context" }),
        };
      }
      if (url.includes("/enrich")) {
        return {
          ok: true,
          json: async () => ({ context: "## File History for " + (body.files || []).join(", ") }),
        };
      }
      if (url.includes("/session/commit")) {
        return {
          ok: true,
          json: async () => ({ status: "linked", sha: body.sha }),
        };
      }
      return { ok: true, json: async () => ({ status: "ok" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Endpoint 1 (/observe): safely handles null/empty projects with safe fallbacks and sends valid payload", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "", project: {} });

    await handlers.event({
      event: { type: "session.created", properties: { sessionID: "sess-observe-1" } },
    });

    await handlers.event({
      event: {
        type: "session.status",
        properties: { sessionID: "sess-observe-1", status: { type: "running", attempt: 1 } },
      },
    });

    const observeCalls = capturedRequests.filter(r => r.url.includes("/observe"));
    expect(observeCalls.length).toBeGreaterThanOrEqual(1);
    const lastObserve = observeCalls[observeCalls.length - 1];
    expect(lastObserve.body.sessionId).toBe("sess-observe-1");
    expect(typeof lastObserve.body.project).toBe("string");
    expect(lastObserve.body.project.length).toBeGreaterThan(0);
    expect(typeof lastObserve.body.cwd).toBe("string");
    expect(lastObserve.body.cwd.length).toBeGreaterThan(0);
  });

  it("Endpoint 2 (/session/start): sends valid start payload and caches start context", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/test/dir" });

    await handlers.event({
      event: {
        type: "session.created",
        properties: { info: { id: "sess-start-1", title: "Test Session", directory: "/test/dir" } },
      },
    });

    const startCall = capturedRequests.find(r => r.url.includes("/session/start"));
    expect(startCall).toBeDefined();
    expect(startCall?.body.sessionId).toBe("sess-start-1");
    expect(startCall?.body.project).toBeDefined();
    expect(startCall?.body.cwd).toBe("/test/dir");
  });

  it("Endpoint 3 (/context): is called as fallback when start context cache is missing or during compacting", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/test/dir" });

    // 1. experimental.session.compacting fetches /context
    const compactOutput = { context: [] };
    await handlers["experimental.session.compacting"]({ sessionID: "sess-ctx-1" }, compactOutput);

    const ctxCall = capturedRequests.find(r => r.url.includes("/context"));
    expect(ctxCall).toBeDefined();
    expect(ctxCall?.body.sessionId).toBe("sess-ctx-1");
    expect(compactOutput.context).toContain("## Fetched Context");
  });

  it("Endpoint 4 (/enrich): passes project parameter and excludes regex/glob patterns from file stash", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/test/dir" });

    await handlers.event({
      event: { type: "session.created", properties: { sessionID: "sess-enrich-1" } },
    });

    // Tool execute before with read (filePath) and glob (pattern)
    await handlers["tool.execute.before"](
      { sessionID: "sess-enrich-1", tool: "read" },
      { args: { filePath: "src/main.ts" } },
    );
    await handlers["tool.execute.before"](
      { sessionID: "sess-enrich-1", tool: "glob" },
      { args: { pattern: "**/*.test.ts", path: "src" } },
    );

    const chatOutput = { parts: [{ type: "text", text: "Please check this" }] };
    await handlers["chat.message"]({ sessionID: "sess-enrich-1" }, chatOutput);

    const msgsOutput = {
      messages: [
        {
          info: { role: "user", sessionID: "sess-enrich-1" },
          parts: [{ type: "text", text: "Please check this" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, msgsOutput);

    const enrichCall = capturedRequests.find(r => r.url.includes("/enrich"));
    expect(enrichCall).toBeDefined();
    expect(enrichCall?.body.sessionId).toBe("sess-enrich-1");
    expect(enrichCall?.body.project).toBeDefined();
    expect(typeof enrichCall?.body.project).toBe("string");
    // "src/main.ts" and "src" should be stashed, but NOT the pattern "**/*.test.ts"
    expect(enrichCall?.body.files).toContain("src/main.ts");
    expect(enrichCall?.body.files).not.toContain("**/*.test.ts");
  });

  it("Endpoint 5 (/session/commit): links commit when git commit output is observed in bash tool", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/test/dir" });

    await handlers.event({
      event: { type: "session.created", properties: { sessionID: "sess-commit-1" } },
    });

    // Simulate tool output containing git commit result
    await handlers.event({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: "sess-commit-1",
          part: {
            id: "part-1",
            type: "tool",
            tool: "bash",
            state: {
              status: "completed",
              input: { command: "git commit -m 'feat: test commit'" },
              output: "[main 1234567] feat: test commit\n 1 file changed, 1 insertion(+)",
            },
          },
        },
      },
    });

    const commitCall = capturedRequests.find(r => r.url.includes("/session/commit"));
    expect(commitCall).toBeDefined();
    expect(commitCall?.body.sha).toBe("1234567");
    expect(commitCall?.body.sessionId).toBe("sess-commit-1");
  });

  it("Endpoint 6, 8, 9 (/session/end, /crystals/auto, /consolidate-pipeline): fires all on session.deleted", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/test/dir" });

    await handlers.event({
      event: { type: "session.created", properties: { sessionID: "sess-end-1" } },
    });

    await handlers.event({
      event: { type: "session.deleted", properties: { info: { id: "sess-end-1" } } },
    });

    const endCall = capturedRequests.find(r => r.url.includes("/session/end"));
    const crystalCall = capturedRequests.find(r => r.url.includes("/crystals/auto"));
    const consolidateCall = capturedRequests.find(r => r.url.includes("/consolidate-pipeline"));

    expect(endCall).toBeDefined();
    expect(crystalCall).toBeDefined();
    expect(consolidateCall).toBeDefined();
  });

  it("Endpoint 7 (/summarize): fires on direct session.idle, session.status idle, and session.compacted", async () => {
    vi.useFakeTimers();
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/test/dir" });

    // Direct session.idle
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-idle-1" } },
    });

    // session.status idle
    await handlers.event({
      event: { type: "session.status", properties: { sessionID: "sess-idle-2", status: { type: "idle" } } },
    });

    // session.compacted
    await handlers.event({
      event: { type: "session.compacted", properties: { sessionID: "sess-idle-3" } },
    });

    // Advance fake timers past the 3000ms debounce window
    await vi.advanceTimersByTimeAsync(3500);

    const summarizeCalls = capturedRequests.filter(r => r.url.includes("/summarize"));
    expect(summarizeCalls.length).toBe(3);
    expect(summarizeCalls.map(c => c.body.sessionId)).toEqual(["sess-idle-1", "sess-idle-2", "sess-idle-3"]);
    vi.useRealTimers();
  });
});
