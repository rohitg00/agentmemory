import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaders, guardedFetch } from "../src/hooks/_http.js";

const originalEnv = { ...process.env };
const originalStdin = Object.getOwnPropertyDescriptor(process, "stdin");

const hookImporters: Record<string, () => Promise<unknown>> = {
  notification: () => import("../src/hooks/notification.js"),
  "post-tool-failure": () => import("../src/hooks/post-tool-failure.js"),
  "post-tool-use": () => import("../src/hooks/post-tool-use.js"),
  "pre-compact": () => import("../src/hooks/pre-compact.js"),
  "pre-tool-use": () => import("../src/hooks/pre-tool-use.js"),
  "prompt-submit": () => import("../src/hooks/prompt-submit.js"),
  "session-end": () => import("../src/hooks/session-end.js"),
  "session-start": () => import("../src/hooks/session-start.js"),
  stop: () => import("../src/hooks/stop.js"),
  "subagent-start": () => import("../src/hooks/subagent-start.js"),
  "subagent-stop": () => import("../src/hooks/subagent-stop.js"),
  "task-completed": () => import("../src/hooks/task-completed.js"),
};

type FetchCall = {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
};

function installStdin(input: string): void {
  Object.defineProperty(process, "stdin", {
    configurable: true,
    value: Readable.from([input]),
  });
}

function restoreStdin(): void {
  if (originalStdin) {
    Object.defineProperty(process, "stdin", originalStdin);
  }
}

function jsonResponse(body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function flushHookImport(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function fetchCalls(fetchMock: ReturnType<typeof vi.fn>): FetchCall[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    init: init as RequestInit,
    body: JSON.parse(String((init as RequestInit).body ?? "{}")) as Record<string, unknown>,
  }));
}

async function importHook(
  hook: string,
  payload: unknown,
  env: Record<string, string | undefined> = {},
): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
  stdoutWrite: ReturnType<typeof vi.spyOn>;
  stderrWrite: ReturnType<typeof vi.spyOn>;
  setTimeoutSpy: ReturnType<typeof vi.spyOn>;
}> {
  vi.resetModules();
  process.env = {
    ...originalEnv,
    AGENTMEMORY_URL: "http://localhost:3111",
    AGENTMEMORY_SECRET: "secret",
    AGENTMEMORY_INJECT_CONTEXT: "",
    AGENTMEMORY_PROJECT: "",
    AGENTMEMORY_PROJECT_ID: "",
    AGENTMEMORY_PROJECT_NAME: "",
    CLAUDE_MEMORY_BRIDGE: "",
    CONSOLIDATION_ENABLED: "",
    ...env,
  };
  installStdin(typeof payload === "string" ? payload : JSON.stringify(payload));

  const fetchMock = vi.fn(async () => jsonResponse({ context: "remembered context" }));
  vi.stubGlobal("fetch", fetchMock);
  const stdoutWrite = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  const stderrWrite = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  const setTimeoutSpy = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation(() => ({ unref: vi.fn() }) as unknown as NodeJS.Timeout);

  const importer = hookImporters[hook];
  if (!importer) throw new Error(`No hook importer for ${hook}`);
  await importer();
  await flushHookImport();

  return { fetchMock, stdoutWrite, stderrWrite, setTimeoutSpy };
}

describe("hook HTTP helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    restoreStdin();
  });

  it("adds bearer auth only when a secret is configured", () => {
    expect(authHeaders("")).toEqual({ "Content-Type": "application/json" });
    expect(authHeaders("s3cr3t")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer s3cr3t",
    });
  });

  it("returns undefined and logs when plaintext bearer auth is blocked", () => {
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = guardedFetch("http://remote.example:3111", "/x", "secret", {
      method: "POST",
    });

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(String(stderrWrite.mock.calls[0]?.[0])).toContain(
      "plaintext HTTP to http://remote.example:3111",
    );
  });
});

describe("source hook entrypoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    restoreStdin();
  });

  it.each([
    {
      hook: "prompt-submit",
      payload: { session_id: "s1", cwd: process.cwd(), prompt: "Ship it" },
      hookType: "prompt_submit",
      data: { prompt: "Ship it" },
    },
    {
      hook: "subagent-start",
      payload: {
        session_id: "s1",
        cwd: process.cwd(),
        agent_id: "a1",
        agent_type: "reviewer",
      },
      hookType: "subagent_start",
      data: { agent_id: "a1", agent_type: "reviewer" },
    },
    {
      hook: "subagent-stop",
      payload: {
        session_id: "s1",
        cwd: process.cwd(),
        agentName: "agent-name",
        agentDisplayName: "Agent Name",
        last_assistant_message: "x".repeat(5000),
      },
      hookType: "subagent_stop",
      data: {
        agent_id: "agent-name",
        agent_type: "Agent Name",
        last_message: "x".repeat(4000),
      },
    },
    {
      hook: "task-completed",
      payload: {
        session_id: "s1",
        cwd: process.cwd(),
        task_id: "t1",
        task_subject: "coverage",
        task_description: "d".repeat(3000),
        teammate_name: "teammate",
        team_name: "team",
      },
      hookType: "task_completed",
      data: {
        task_id: "t1",
        task_subject: "coverage",
        task_description: "d".repeat(2000),
        teammate_name: "teammate",
        team_name: "team",
      },
    },
  ])("$hook posts observation without stdout", async ({ hook, payload, hookType, data }) => {
    const { fetchMock, stdoutWrite, setTimeoutSpy } = await importHook(hook, payload);
    const [call] = fetchCalls(fetchMock);

    expect(call.url).toBe("http://localhost:3111/agentmemory/observe");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(call.body).toMatchObject({
      hookType,
      sessionId: "s1",
      cwd: process.cwd(),
      data,
    });
    expect(String(call.body.project)).toMatch(/^(git:[a-f0-9]{32}|agentmemory)$/);
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it("post-tool-use extracts image payloads and truncates large text output", async () => {
    const { fetchMock, stdoutWrite, setTimeoutSpy } = await importHook("post-tool-use", {
      sessionId: "s1",
      cwd: process.cwd(),
      toolName: "Read",
      toolArgs: { file: "image.png" },
      toolResult: {
        textResultForLlm: {
          content: `iVBORw0KGgo${"a".repeat(9000)}`,
          note: "kept",
        },
      },
    });
    const [call] = fetchCalls(fetchMock);

    expect(call.body).toMatchObject({
      hookType: "post_tool_use",
      sessionId: "s1",
      data: {
        tool_name: "Read",
        tool_input: { file: "image.png" },
        image_data: expect.stringMatching(/^iVBORw0KGgo/),
      },
    });
    expect((call.body.data as Record<string, unknown>).tool_output).toEqual({
      content: "[image data extracted]",
      note: "kept",
    });
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it("post-tool-failure truncates string inputs and skips interrupt payloads", async () => {
    const failure = await importHook("post-tool-failure", {
      session_id: "s1",
      cwd: process.cwd(),
      tool_name: "Bash",
      tool_input: "x".repeat(5000),
      error: "e".repeat(5000),
    });
    const [call] = fetchCalls(failure.fetchMock);
    expect(call.body).toMatchObject({
      hookType: "post_tool_failure",
      data: {
        tool_name: "Bash",
        tool_input: "x".repeat(4000),
        error: "e".repeat(4000),
      },
    });

    const interrupt = await importHook("post-tool-failure", {
      session_id: "s1",
      cwd: process.cwd(),
      is_interrupt: true,
    });
    expect(interrupt.fetchMock).not.toHaveBeenCalled();
  });

  it("notification only records permission prompts", async () => {
    const skipped = await importHook("notification", {
      session_id: "s1",
      cwd: process.cwd(),
      notification_type: "info",
    });
    expect(skipped.fetchMock).not.toHaveBeenCalled();

    const recorded = await importHook("notification", {
      sessionId: "s1",
      cwd: process.cwd(),
      notificationType: "permission_prompt",
      title: "Allow?",
      message: "Needs access",
    });
    const [call] = fetchCalls(recorded.fetchMock);
    expect(call.body).toMatchObject({
      hookType: "notification",
      data: {
        notification_type: "permission_prompt",
        title: "Allow?",
        message: "Needs access",
      },
    });
  });

  it("session-start is fire-and-forget by default and writes context only when opted in", async () => {
    const telemetry = await importHook("session-start", {
      session_id: "s1",
      cwd: process.cwd(),
    });
    const [telemetryCall] = fetchCalls(telemetry.fetchMock);
    expect(telemetryCall.url).toBe("http://localhost:3111/agentmemory/session/start");
    expect(telemetryCall.body).toMatchObject({
      sessionId: "s1",
      cwd: process.cwd(),
    });
    expect(telemetry.stdoutWrite).not.toHaveBeenCalled();
    expect(telemetry.setTimeoutSpy).not.toHaveBeenCalled();

    const injected = await importHook(
      "session-start",
      { sessionId: "s2", cwd: process.cwd() },
      { AGENTMEMORY_INJECT_CONTEXT: "true" },
    );
    expect(injected.stdoutWrite).toHaveBeenCalledWith("remembered context");
  });

  it("pre-tool-use stays silent by default and writes context for opted-in file tools", async () => {
    const disabled = await importHook("pre-tool-use", {
      session_id: "s1",
      cwd: process.cwd(),
      tool_name: "Read",
      tool_input: { file_path: "src/index.ts" },
    });
    expect(disabled.fetchMock).not.toHaveBeenCalled();
    expect(disabled.stdoutWrite).not.toHaveBeenCalled();

    const enabled = await importHook(
      "pre-tool-use",
      {
        sessionId: "s1",
        cwd: process.cwd(),
        toolName: "Grep",
        toolArgs: { path: "src", pattern: "guardedFetch" },
      },
      { AGENTMEMORY_INJECT_CONTEXT: "true" },
    );
    const [call] = fetchCalls(enabled.fetchMock);
    expect(call.url).toBe("http://localhost:3111/agentmemory/enrich");
    expect(call.body).toMatchObject({
      sessionId: "s1",
      files: ["src"],
      terms: ["guardedFetch"],
      toolName: "Grep",
    });
    expect(enabled.stdoutWrite).toHaveBeenCalledWith("remembered context");
  });

  it("pre-compact optionally syncs the bridge and writes returned context", async () => {
    const { fetchMock, stdoutWrite } = await importHook(
      "pre-compact",
      { sessionId: "s1", cwd: process.cwd() },
      { CLAUDE_MEMORY_BRIDGE: "true" },
    );
    const calls = fetchCalls(fetchMock);

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:3111/agentmemory/claude-bridge/sync",
      "http://localhost:3111/agentmemory/context",
    ]);
    expect(calls[1].body).toMatchObject({
      sessionId: "s1",
      budget: 1500,
    });
    expect(stdoutWrite).toHaveBeenCalledWith("remembered context");
  });

  it("session-end fans out optional consolidation and bridge requests without stdout", async () => {
    const { fetchMock, stdoutWrite, setTimeoutSpy } = await importHook(
      "session-end",
      { sessionId: "s1" },
      { CONSOLIDATION_ENABLED: "true", CLAUDE_MEMORY_BRIDGE: "true" },
    );
    const calls = fetchCalls(fetchMock);

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:3111/agentmemory/session/end",
      "http://localhost:3111/agentmemory/crystals/auto",
      "http://localhost:3111/agentmemory/consolidate-pipeline",
      "http://localhost:3111/agentmemory/claude-bridge/sync",
    ]);
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it("stop sends summarize and session-end telemetry without stdout", async () => {
    const { fetchMock, stdoutWrite, setTimeoutSpy } = await importHook("stop", {
      session_id: "s1",
    });
    const calls = fetchCalls(fetchMock);

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:3111/agentmemory/summarize",
      "http://localhost:3111/agentmemory/session/end",
    ]);
    expect(calls[0].body).toEqual({ sessionId: "s1" });
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it("malformed JSON and SDK child contexts return without requests", async () => {
    const malformed = await importHook("prompt-submit", "{not-json");
    expect(malformed.fetchMock).not.toHaveBeenCalled();

    const payloadChild = await importHook("prompt-submit", {
      session_id: "s1",
      entrypoint: "sdk-ts",
    });
    expect(payloadChild.fetchMock).not.toHaveBeenCalled();

    const envChild = await importHook(
      "prompt-submit",
      { session_id: "s1" },
      { AGENTMEMORY_SDK_CHILD: "1" },
    );
    expect(envChild.fetchMock).not.toHaveBeenCalled();
  });
});
