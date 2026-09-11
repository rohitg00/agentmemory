import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("OpenCode plugin standard fields", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{ url: string; body: any }>;

  beforeEach(() => {
    capturedRequests = [];
    fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedRequests.push({ url, body });
      if (typeof url === "string" && url.includes("/session/start")) {
        return { ok: true, json: async () => ({ context: "## Start Context" }) };
      }
      if (typeof url === "string" && url.includes("/context")) {
        return { ok: true, json: async () => ({ context: "## Context" }) };
      }
      if (typeof url === "string" && url.includes("/enrich")) {
        return { ok: true, json: async () => ({ context: "" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createHandlers() {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: process.cwd() });
    return handlers as any;
  }

  async function initSession(handlers: any, sid: string) {
    await handlers.event({
      event: { type: "session.created", properties: { info: { id: sid, directory: process.cwd() } } },
    });
    capturedRequests.length = 0;
    fetchMock.mockClear();
  }

  it("patch part with files ['a.ts','b.ts'] produces observe payload with title and filtered files", async () => {
    const handlers = await createHandlers();
    const sid = "sess-patch-1";
    await initSession(handlers, sid);

    await handlers.event({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: sid,
          part: { type: "patch", messageID: "msg-1", hash: "abc123", files: ["a.ts", "b.ts"] },
        },
      },
    });

    const observeCalls = capturedRequests.filter((r) => r.url.includes("/observe"));
    expect(observeCalls.length).toBe(1);
    expect(observeCalls[0].body.hookType).toBe("patch_applied");
    expect(observeCalls[0].body.data.files).toEqual(["a.ts", "b.ts"]);
    expect(observeCalls[0].body.data.title).toBe("Applied patch to 2 file(s)");
    expect(observeCalls[0].body.data.messageID).toBe("msg-1");
    expect(observeCalls[0].body.data.hash).toBe("abc123");
  });

  it("patch normalizes non-string files and caps at 50", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const { normalizePatchData } = AgentmemoryCapturePlugin as any;
    const raw = ["a.ts", 123 as any, null as any, "b.ts", undefined as any, {} as any];
    const { files, title } = normalizePatchData({ files: raw } as any);
    expect(files).toEqual(["a.ts", "b.ts"]);
    expect(title).toBe("Applied patch to 2 file(s)");

    const many = Array.from({ length: 60 }, (_, i) => `f${i}.ts`);
    const capped = normalizePatchData({ files: many } as any);
    expect(capped.files.length).toBe(50);
    expect(capped.files[0]).toBe("f0.ts");
    expect(capped.files[49]).toBe("f49.ts");
    expect(capped.title).toBe("Applied patch to 50 file(s)");

    const empty = normalizePatchData({} as any);
    expect(empty.files).toEqual([]);
    expect(empty.title).toBe("Applied patch to 0 file(s)");
  });

  it("command_executed includes name/arguments/title (no dead snake_case fields)", async () => {
    const handlers = await createHandlers();
    const sid = "sess-cmd-1";
    await initSession(handlers, sid);

    await handlers.event({
      event: { type: "command.executed", properties: { sessionID: sid, name: "my-cmd", arguments: "arg1 --flag" } },
    });

    const observeCalls = capturedRequests.filter((r) => r.url.includes("/observe"));
    expect(observeCalls.length).toBe(1);
    expect(observeCalls[0].body.hookType).toBe("command_executed");
    expect(observeCalls[0].body.data.name).toBe("my-cmd");
    expect(observeCalls[0].body.data.arguments).toBe("arg1 --flag");
    expect(observeCalls[0].body.data.title).toBe("Executed command: my-cmd");
    expect(observeCalls[0].body.data.tool_name).toBeUndefined();
    expect(observeCalls[0].body.data.tool_input).toBeUndefined();
  });

  it("normalizeCommandData safe against undefined fields and truncates, typed return", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const { normalizeCommandData } = AgentmemoryCapturePlugin as any;
    const res = normalizeCommandData({} as any);
    expect(res.name).toBeUndefined();
    expect(res.arguments).toBe("");
    expect(res.title).toBe("Executed command: ");

    const longArgs = "x".repeat(5000);
    const res2 = normalizeCommandData({ name: "cmd", arguments: longArgs } as any);
    expect(res2.arguments.length).toBe(2000);
    expect(res2.title).toBe("Executed command: cmd");
    expect((res2 as Record<string, unknown>).tool_name).toBeUndefined();
    expect((res2 as Record<string, unknown>).tool_input).toBeUndefined();
  });

  it("subagent_start includes title derived from description/agent/prompt", async () => {
    const handlers = await createHandlers();
    const sid = "sess-subagent-1";
    await initSession(handlers, sid);

    await handlers.event({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: sid,
          part: { type: "subtask", id: "sub-1", agent: "explore", prompt: "do things", description: "Explore codebase" },
        },
      },
    });

    const observeCalls = capturedRequests.filter((r) => r.url.includes("/observe"));
    expect(observeCalls.length).toBe(1);
    expect(observeCalls[0].body.hookType).toBe("subagent_start");
    expect(observeCalls[0].body.data.title).toBe("Started subagent: Explore codebase");
  });

  it("normalizeSubagentTitle prefers description over agent over prompt and safe slices", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const { normalizeSubagentTitle } = AgentmemoryCapturePlugin as any;
    expect(normalizeSubagentTitle({ description: "desc", agent: "ag", prompt: "pr" } as any)).toBe("Started subagent: desc");
    expect(normalizeSubagentTitle({ agent: "ag", prompt: "pr" } as any)).toBe("Started subagent: ag");
    expect(normalizeSubagentTitle({ prompt: "pr" } as any)).toBe("Started subagent: pr");
    expect(normalizeSubagentTitle({} as any)).toBe("Started subagent: ");
    const long = "y".repeat(500);
    expect(normalizeSubagentTitle({ description: long } as any).length).toBe("Started subagent: ".length + 120);
  });

  it("task_completed includes title with counts", async () => {
    const handlers = await createHandlers();
    const sid = "sess-task-1";
    await initSession(handlers, sid);

    await handlers.event({
      event: {
        type: "todo.updated",
        properties: {
          sessionID: sid,
          todos: [
            { content: "a", priority: "high", status: "completed" },
            { content: "b", priority: "low", status: "in_progress" },
            { content: "c", priority: "medium", status: "completed" },
          ],
        },
      },
    });

    const observeCalls = capturedRequests.filter((r) => r.url.includes("/observe"));
    expect(observeCalls.length).toBe(1);
    expect(observeCalls[0].body.hookType).toBe("task_completed");
    expect(observeCalls[0].body.data.title).toBe("Task completed: 2/3 items");
    expect(observeCalls[0].body.data.total).toBe(3);
    expect(observeCalls[0].body.data.completed).toHaveLength(2);
  });

  it("normalizeTaskTitle pure function", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const { normalizeTaskTitle } = AgentmemoryCapturePlugin as any;
    expect(normalizeTaskTitle([{}, {}], [{}, {}, {}] as any)).toBe("Task completed: 2/3 items");
    expect(normalizeTaskTitle([], [] as any)).toBe("Task completed: 0/0 items");
  });

  it("assistant_message payload has no title", async () => {
    const handlers = await createHandlers();
    const sid = "sess-assistant-1";
    await initSession(handlers, sid);

    await handlers.event({
      event: {
        type: "message.updated",
        properties: {
          sessionID: sid,
          info: {
            role: "assistant",
            id: "msg-assistant-1",
            parentID: "parent-1",
            modelID: "model-1",
            providerID: "provider-1",
            mode: "chat",
            cost: 0.01,
            tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
            finish: "stop",
            error: null,
            time: { created: 1000, completed: 2000 },
          },
        },
      },
    });

    const observeCalls = capturedRequests.filter((r) => r.url.includes("/observe"));
    expect(observeCalls.length).toBe(1);
    expect(observeCalls[0].body.hookType).toBe("assistant_message");
    expect(observeCalls[0].body.data.title).toBeUndefined();
    expect(observeCalls[0].body.data.messageID).toBe("msg-assistant-1");
  });

  it("telemetry events leave payload without injected title where not specified", async () => {
    const handlers = await createHandlers();
    const sid = "sess-telemetry-1";
    await initSession(handlers, sid);

    await handlers.event({
      event: { type: "message.updated", properties: { sessionID: sid, info: { role: "assistant", id: "msg-x", parentID: "p1", modelID: "m1", providerID: "pr", mode: "chat", cost: 0, tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } }, finish: "stop", error: null, time: { created: 1000, completed: 2000 } } } },
    });
    const assistantCalls = capturedRequests.filter((r) => r.url.includes("/observe") && r.body.hookType === "assistant_message");
    expect(assistantCalls.length).toBe(1);
    expect(assistantCalls[0].body.data.title).toBeUndefined();

    capturedRequests.length = 0;
    await handlers.event({
      event: { type: "message.part.updated", properties: { sessionID: sid, part: { type: "reasoning", messageID: "msg-x", text: "thinking" } } },
    });
    const reasoningCalls = capturedRequests.filter((r) => r.url.includes("/observe"));
    expect(reasoningCalls.length).toBe(1);
    expect(reasoningCalls[0].body.hookType).toBe("reasoning");
    expect(reasoningCalls[0].body.data.title).toBeUndefined();

    capturedRequests.length = 0;
    await handlers.event({
      event: { type: "session.compacted", properties: { sessionID: sid } },
    });
    const compacted = capturedRequests.filter((r) => r.url.includes("/observe") && r.body.hookType === "session_compacted");
    expect(compacted.length).toBe(1);
    expect(compacted[0].body.data.title).toBeUndefined();
  });
});
