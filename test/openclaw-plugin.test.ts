import { afterEach, describe, expect, it, vi } from "vitest";

type Capability = {
  promptBuilder?: (params: {
    availableTools: Set<string>;
  }) => string[] | undefined;
};

type RegisterFn = (capability: Capability) => void;

interface FakeApi {
  registerMemoryCapability: RegisterFn;
  on: ReturnType<typeof vi.fn>;
  pluginConfig: Record<string, unknown>;
  logger: { warn: ReturnType<typeof vi.fn> };
}

function makeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    registerMemoryCapability: vi.fn(),
    on: vi.fn(),
    pluginConfig: { base_url: "http://localhost:3111" },
    logger: { warn: vi.fn() },
    ...overrides,
  };
}

describe("openclaw plugin — memory capability registration (closes #286 follow-up)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls api.registerMemoryCapability with a promptBuilder when the host supports it", async () => {
    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi();
    plugin.register(api);
    expect(api.registerMemoryCapability).toHaveBeenCalledTimes(1);
    const capability = (api.registerMemoryCapability as ReturnType<typeof vi.fn>).mock.calls[0][0] as Capability;
    expect(typeof capability.promptBuilder).toBe("function");
    const lines = capability.promptBuilder?.({ availableTools: new Set() });
    expect(Array.isArray(lines)).toBe(true);
    expect((lines as string[]).join(" ")).toMatch(/agentmemory/i);
  });

  it("still registers hooks and tolerates older OpenClaw builds without registerMemoryCapability", async () => {
    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({ registerMemoryCapability: undefined as unknown as RegisterFn });
    expect(() => plugin.register(api)).not.toThrow();
    expect(api.on).toHaveBeenCalled();
    const events = (api.on as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(events).toContain("before_agent_start");
    expect(events).toContain("llm_output");
    expect(events).toContain("agent_end");
  });

  it("promptBuilder returns lines that mention the configured base_url", async () => {
    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({ pluginConfig: { base_url: "http://memory.internal:9999" } });
    plugin.register(api);
    const capability = (api.registerMemoryCapability as ReturnType<typeof vi.fn>).mock.calls[0][0] as Capability;
    const lines = capability.promptBuilder?.({ availableTools: new Set() }) ?? [];
    expect(lines.join("\n")).toMatch(/memory\.internal:9999/);
  });

  it("captures completed turns with the AgentMemory observe contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });

    plugin.register(api);
    const agentEndHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;

    expect(agentEndHandler).toBeTypeOf("function");
    await agentEndHandler?.(
      {
        success: true,
        runId: "run-1",
        messages: [
          { role: "user", content: "Please inspect the warning." },
          { role: "assistant", content: "The warning is from AgentMemory." },
        ],
      },
      {
        sessionId: "session-1",
        workspaceDir: "/Users/wecik/.openclaw/workspace",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("http://memory.internal:3113/agentmemory/observe");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toMatchObject({
      hookType: "post_tool_use",
      sessionId: "session-1",
      project: "/Users/wecik/.openclaw/workspace",
      cwd: "/Users/wecik/.openclaw/workspace",
      data: {
        tool_name: "conversation",
        tool_input: "Please inspect the warning.",
        tool_output: "The warning is from AgentMemory.",
      },
    });
  });

  it("captures codex turns when the mirrored user prompt is suppressed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });

    plugin.register(api);
    const agentEndHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;

    await agentEndHandler?.(
      {
        success: true,
        prompt: "Smoke test AgentMemory capture.",
        runId: "run-2",
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "openclaw-agentmemory-marker" }],
          },
        ],
      },
      {
        sessionId: "session-2",
        workspaceDir: "/Users/wecik/.openclaw/workspace",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(JSON.parse(options.body)).toMatchObject({
      sessionId: "session-2",
      data: {
        tool_name: "conversation",
        tool_input: "Smoke test AgentMemory capture.",
        tool_output: "openclaw-agentmemory-marker",
      },
    });
  });

  it("captures codex turns from prompt and assistantTexts when messages are empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });

    plugin.register(api);
    const agentEndHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;

    await agentEndHandler?.(
      {
        success: true,
        prompt: "Capture from event fields.",
        runId: "run-3",
        messages: [],
        assistantTexts: ["assistant text from result"],
      },
      {
        sessionId: "session-3",
        workspaceDir: "/Users/wecik/.openclaw/workspace",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(JSON.parse(options.body)).toMatchObject({
      sessionId: "session-3",
      data: {
        tool_input: "Capture from event fields.",
        tool_output: "assistant text from result",
      },
    });
  });

  it("captures codex turns from before_agent_start and llm_output fallback cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });

    plugin.register(api);
    const beforeAgentStartHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "before_agent_start",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const llmOutputHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "llm_output",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const agentEndHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;

    await beforeAgentStartHandler?.(
      { runId: "run-4", prompt: "Remember this prompt." },
      { runId: "run-4", sessionId: "session-4" },
    );
    await llmOutputHandler?.(
      { runId: "run-4", assistantTexts: ["remembered assistant"] },
      { runId: "run-4", sessionId: "session-4" },
    );
    await agentEndHandler?.(
      { runId: "run-4", success: true, messages: [] },
      { runId: "run-4", sessionId: "session-4" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("http://memory.internal:3113/agentmemory/observe");
    expect(JSON.parse(options.body)).toMatchObject({
      sessionId: "session-4",
      data: {
        tool_input: "Remember this prompt.",
        tool_output: "remembered assistant",
      },
    });
  });

  it("does not capture internal boot no-reply turns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });

    plugin.register(api);
    const beforeAgentStartHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "before_agent_start",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const llmOutputHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "llm_output",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const agentEndHandler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;

    await beforeAgentStartHandler?.(
      {
        runId: "boot-run",
        sessionId: "boot",
        prompt:
          "You are running a boot check.\n<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nBOOT.md\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>",
      },
      { runId: "boot-run", sessionId: "boot", sessionKey: "agent:main:boot" },
    );
    await llmOutputHandler?.(
      { runId: "boot-run", sessionId: "boot", assistantTexts: ["NO_REPLY"] },
      { runId: "boot-run", sessionId: "boot", sessionKey: "agent:main:boot" },
    );
    await agentEndHandler?.(
      { runId: "boot-run", sessionId: "boot", success: true, messages: [] },
      { runId: "boot-run", sessionId: "boot", sessionKey: "agent:main:boot" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://memory.internal:3113/agentmemory/smart-search");
  });

  it("deduplicates observe calls across duplicate plugin instances", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const apiA = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });
    const apiB = makeApi({
      pluginConfig: {
        base_url: "http://memory.internal:3113",
        fallback_on_error: false,
      },
    });

    plugin.register(apiA);
    plugin.register(apiB);
    const handlerA = (apiA.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const handlerB = (apiB.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === "agent_end",
    )?.[1] as ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const event = {
      success: true,
      runId: "run-dedupe",
      messages: [
        { role: "user", content: "Same user prompt." },
        { role: "assistant", content: "Same assistant answer." },
      ],
    };
    const ctx = {
      runId: "run-dedupe",
      sessionId: "session-dedupe",
      workspaceDir: "/Users/wecik/.openclaw/workspace",
    };

    await handlerA?.(event, ctx);
    await handlerB?.(event, ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://memory.internal:3113/agentmemory/observe");
  });
});
