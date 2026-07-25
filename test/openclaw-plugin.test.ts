import { describe, expect, it, vi } from "vitest";

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
});

type HookHandler = (event: unknown, ctx?: unknown) => Promise<unknown>;

async function registerAndCollect() {
  const mod = await import("../integrations/openclaw/plugin.mjs");
  const plugin = (mod as unknown as { default: { register(api: FakeApi): void } }).default;
  const api = makeApi();
  plugin.register(api);
  const handlers = new Map<string, HookHandler>();
  for (const [name, fn] of (api.on as ReturnType<typeof vi.fn>).mock.calls) {
    handlers.set(name as string, fn as HookHandler);
  }
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      requests.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ results: [] }) };
    }),
  );
  return { handlers, requests };
}

describe("openclaw plugin — per-agent memory scoping", () => {
  it("scopes recall to the agent from the hook context", async () => {
    const { handlers, requests } = await registerAndCollect();
    await handlers.get("before_agent_start")?.(
      { prompt: "what did we decide?" },
      { agentId: "prompt-engineer", sessionKey: "agent:prompt-engineer:cli" },
    );
    const search = requests.find((r) => r.path === "/agentmemory/smart-search");
    expect(search?.body.agentId).toBe("prompt-engineer");
    expect(search?.body.project).toBe("prompt-engineer");
  });

  it("falls back to parsing sessionKey when ctx.agentId is absent", async () => {
    const { handlers, requests } = await registerAndCollect();
    await handlers.get("before_agent_start")?.(
      { prompt: "hello" },
      { sessionKey: "agent:trading-agent:telegram:direct:42" },
    );
    const search = requests.find((r) => r.path === "/agentmemory/smart-search");
    expect(search?.body.agentId).toBe("trading-agent");
  });

  it("tags the session with agentId and sends the fields observe requires", async () => {
    const { handlers, requests } = await registerAndCollect();
    await handlers.get("agent_end")?.(
      {
        success: true,
        runId: "run-1",
        messages: [
          { role: "user", content: "remember X" },
          { role: "assistant", content: [{ type: "text", text: "noted" }] },
        ],
      },
      { agentId: "prompt-engineer", workspaceDir: "/w/prompt-engineer" },
    );
    const start = requests.find((r) => r.path === "/agentmemory/session/start");
    expect(start?.body.agentId).toBe("prompt-engineer");

    const observe = requests.find((r) => r.path === "/agentmemory/observe");
    // The server rejects observe without project/cwd, and fallback_on_error
    // hides the 400 - so a regression here silently disables capture entirely.
    expect(observe?.body.project).toBe("prompt-engineer");
    expect(observe?.body.cwd).toBe("/w/prompt-engineer");
  });

  it("captures replies delivered as a tool call instead of an assistant text block", async () => {
    const { handlers, requests } = await registerAndCollect();
    await handlers.get("agent_end")?.(
      {
        success: true,
        runId: "run-2",
        messages: [
          { role: "user", content: "ping" },
          {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                name: "message",
                arguments: { action: "send", message: "pong" },
              },
            ],
          },
          { role: "toolResult", content: [{ type: "toolResult", content: "{\"ok\":true}" }] },
        ],
      },
      { agentId: "main" },
    );
    const observe = requests.find((r) => r.path === "/agentmemory/observe");
    expect((observe?.body.data as { tool_output: string }).tool_output).toBe("pong");
  });
});
