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

async function loadPlugin() {
  const mod = await import("../integrations/openclaw/plugin.mjs");
  return (mod as unknown as { default: { register(api: FakeApi): void } }).default;
}

describe("openclaw plugin — memory capability registration (closes #286 follow-up)", () => {
  const originalSecret = process.env.AGENTMEMORY_SECRET;
  const originalRequireHttps = process.env.AGENTMEMORY_REQUIRE_HTTPS;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalSecret === undefined) delete process.env.AGENTMEMORY_SECRET;
    else process.env.AGENTMEMORY_SECRET = originalSecret;
    if (originalRequireHttps === undefined) delete process.env.AGENTMEMORY_REQUIRE_HTTPS;
    else process.env.AGENTMEMORY_REQUIRE_HTTPS = originalRequireHttps;
  });

  it("calls api.registerMemoryCapability with a promptBuilder when the host supports it", async () => {
    const plugin = await loadPlugin();
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
    const plugin = await loadPlugin();
    const api = makeApi({ registerMemoryCapability: undefined as unknown as RegisterFn });
    expect(() => plugin.register(api)).not.toThrow();
    expect(api.on).toHaveBeenCalled();
    const events = (api.on as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(events).toContain("before_agent_start");
    expect(events).toContain("agent_end");
  });

  it("promptBuilder returns lines that mention the configured base_url", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ pluginConfig: { base_url: "http://memory.internal:9999" } });
    plugin.register(api);
    const capability = (api.registerMemoryCapability as ReturnType<typeof vi.fn>).mock.calls[0][0] as Capability;
    const lines = capability.promptBuilder?.({ availableTools: new Set() }) ?? [];
    expect(lines.join("\n")).toMatch(/memory\.internal:9999/);
  });

  it("before_agent_start recalls and formats memories from smart-search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            observation: {
              title: "Use pnpm",
              type: "preference",
              narrative: "Project policy prefers pinned package managers.",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const plugin = await loadPlugin();
    const handlers = new Map<string, Function>();
    const api = makeApi({
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
    });
    plugin.register(api);

    const result = await handlers.get("before_agent_start")?.({
      prompt: "what package manager should I use?",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3111/agentmemory/smart-search");
    expect(JSON.parse(init.body)).toMatchObject({
      query: "what package manager should I use?",
      limit: 5,
    });
    expect(result.prependContext).toContain("Use pnpm (preference)");
  });

  it("agent_end captures the latest user and assistant conversation text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const plugin = await loadPlugin();
    const handlers = new Map<string, Function>();
    const api = makeApi({
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
    });
    plugin.register(api);

    await handlers.get("agent_end")?.({
      success: true,
      sessionKey: "openclaw-session",
      messages: [
        { role: "user", content: [{ type: "text", text: "Please remember this" }] },
        { role: "assistant", content: "Saved the memory" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3111/agentmemory/observe");
    expect(JSON.parse(init.body)).toMatchObject({
      hookType: "post_tool_use",
      sessionId: "openclaw-session",
      data: {
        tool_name: "conversation",
        tool_input: "Please remember this",
        tool_output: "Saved the memory",
      },
    });
  });

  it("propagates REST errors when fallback_on_error is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "unavailable",
      }),
    );

    const plugin = await loadPlugin();
    const handlers = new Map<string, Function>();
    const api = makeApi({
      pluginConfig: { fallback_on_error: false },
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
    });
    plugin.register(api);

    await expect(
      handlers.get("before_agent_start")?.({ prompt: "recall memory" }),
    ).rejects.toThrow("agentmemory /agentmemory/smart-search failed: 503 unavailable");
  });

  it("warns once and skips plaintext bearer requests to non-loopback HTTP", async () => {
    process.env.AGENTMEMORY_SECRET = "secret-token";
    delete process.env.AGENTMEMORY_REQUIRE_HTTPS;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const plugin = await loadPlugin();
    const handlers = new Map<string, Function>();
    const api = makeApi({
      pluginConfig: { base_url: "http://memory.example:3111" },
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
    });
    plugin.register(api);

    await handlers.get("before_agent_start")?.({ prompt: "recall memory" });
    await handlers.get("before_agent_start")?.({ prompt: "recall again" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(api.logger.warn).toHaveBeenCalledTimes(1);
    expect(api.logger.warn.mock.calls[0][0]).toContain("plaintext HTTP");
  });

  it("throws during registration when HTTPS is required for a plaintext bearer URL", async () => {
    process.env.AGENTMEMORY_SECRET = "secret-token";
    process.env.AGENTMEMORY_REQUIRE_HTTPS = "1";

    const plugin = await loadPlugin();
    const api = makeApi({ pluginConfig: { base_url: "http://memory.example:3111" } });

    expect(() => plugin.register(api)).toThrow("plaintext HTTP");
  });
});
