import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";

describe("OpenCode plugin dynamic project detection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dynamically updates session project when tool touches a file in a repository", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );

    const handlers = await (AgentmemoryCapturePlugin as any)({
      worktree: "/tmp/fake-initial-cwd",
    });

    const sid = "dynamic_proj_session_1";

    // 1. Session created in initial folder
    await handlers.event({
      event: {
        type: "session.created",
        properties: {
          sessionID: sid,
          info: { id: sid, directory: "/tmp/fake-initial-cwd" },
        },
      },
    });

    // Verify initial start call
    const startCall = fetchMock.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/session/start"),
    );
    expect(startCall).toBeDefined();

    // 2. Tool executes touching a file in the current agentmemory repo
    const currentRepoFile = resolve(process.cwd(), "src/functions/reflect.ts");
    await handlers["tool.execute.before"](
      { tool: "read", sessionID: sid },
      { args: { filePath: currentRepoFile } },
    );

    // 3. Prompt or tool finish occurs — observe should now use the dynamic repo name "agentmemory"
    await handlers["chat.message"](
      { sessionID: sid },
      { parts: [{ type: "text", text: "testing reflect function" }] },
    );

    const observeCalls = fetchMock.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/observe"),
    );
    expect(observeCalls.length).toBeGreaterThan(0);

    const lastObserve = JSON.parse(observeCalls[observeCalls.length - 1][1].body);
    expect(lastObserve.project).toBe("agentmemory");
    expect(lastObserve.cwd).toBe(process.cwd());
  });

  it("updates session project when message part updated receives tool workdir", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );

    const handlers = await (AgentmemoryCapturePlugin as any)({});
    const sid = "dynamic_proj_session_2";

    await handlers.event({
      event: {
        type: "session.created",
        properties: {
          sessionID: sid,
          info: { id: sid },
        },
      },
    });

    await handlers.event({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: sid,
          part: {
            type: "tool",
            tool: "bash",
            id: "call_bash_1",
            state: {
              status: "completed",
              input: { command: "git status", workdir: process.cwd() },
              output: "clean",
            },
          },
        },
      },
    });

    const observeCalls = fetchMock.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("/observe"),
    );
    expect(observeCalls.length).toBeGreaterThan(0);

    const lastObserve = JSON.parse(observeCalls[observeCalls.length - 1][1].body);
    expect(lastObserve.project).toBe("agentmemory");
  });
});
