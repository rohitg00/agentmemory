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

const originalAgentmemoryAgentId = process.env.AGENTMEMORY_AGENT_ID;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalAgentmemoryAgentId === undefined) delete process.env.AGENTMEMORY_AGENT_ID;
  else process.env.AGENTMEMORY_AGENT_ID = originalAgentmemoryAgentId;
});

describe("openclaw plugin — memory capability registration (closes #286 follow-up)", () => {
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

  it("passes AGENTMEMORY_AGENT_ID to before_agent_start smart-search", async () => {
    process.env.AGENTMEMORY_AGENT_ID = "openclaw-profile";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi();
    plugin.register(api);

    const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([event]) => event === "before_agent_start",
    )?.[1] as (event: { prompt: string }) => Promise<unknown>;
    await handler({ prompt: "auth issue" });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.agentId).toBe("openclaw-profile");
  });

  it("passes AGENTMEMORY_AGENT_ID to agent_end observe", async () => {
    process.env.AGENTMEMORY_AGENT_ID = "openclaw-profile";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const mod = await import("../integrations/openclaw/plugin.mjs");
    const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
    const api = makeApi();
    plugin.register(api);

    const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([event]) => event === "agent_end",
    )?.[1] as (event: Record<string, unknown>) => Promise<unknown>;
    await handler({
      success: true,
      messages: [
        { role: "user", content: "remember this" },
        { role: "assistant", content: "saved" },
      ],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.agentId).toBe("openclaw-profile");
  });
});
