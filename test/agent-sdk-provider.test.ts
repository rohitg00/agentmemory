import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// #781: concurrent siblings on the agent-sdk provider used to bail out
// empty because the recursion guard mutated process.env synchronously
// before the first await. With the guard scoped to AsyncLocalStorage,
// each sibling runs in its own context and receives the real SDK result.

const queryCalls: Array<{ systemPrompt: string; userPrompt: string }> = [];
let mockResult: string | ((systemPrompt: string, userPrompt: string) => string) =
  "<result>ok</result>";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({
    prompt,
    options,
  }: {
    prompt: string;
    options: { systemPrompt: string };
  }) => {
    queryCalls.push({ systemPrompt: options.systemPrompt, userPrompt: prompt });
    const value =
      typeof mockResult === "function"
        ? mockResult(options.systemPrompt, prompt)
        : mockResult;
    async function* gen() {
      yield { type: "result", result: value } as { type: "result"; result: string };
    }
    return gen();
  },
}));

import { AgentSDKProvider } from "../src/providers/agent-sdk.js";

describe("AgentSDKProvider recursion guard (#781)", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    mockResult = "<result>ok</result>";
    delete process.env.AGENTMEMORY_SDK_CHILD;
  });

  afterEach(() => {
    delete process.env.AGENTMEMORY_SDK_CHILD;
  });

  it("concurrent summarize calls each return the SDK result (no empty siblings)", async () => {
    const provider = new AgentSDKProvider();

    const results = await Promise.all([
      provider.summarize("sys", "chunk 1"),
      provider.summarize("sys", "chunk 2"),
      provider.summarize("sys", "chunk 3"),
      provider.summarize("sys", "chunk 4"),
    ]);

    expect(results).toEqual([
      "<result>ok</result>",
      "<result>ok</result>",
      "<result>ok</result>",
      "<result>ok</result>",
    ]);
    expect(queryCalls.length).toBe(4);
    expect(queryCalls.map((c) => c.userPrompt)).toEqual([
      "chunk 1",
      "chunk 2",
      "chunk 3",
      "chunk 4",
    ]);
  });

  it("compress and summarize share the same guard scope without interfering", async () => {
    const provider = new AgentSDKProvider();

    const [a, b, c] = await Promise.all([
      provider.summarize("sys", "s1"),
      provider.compress("sys", "c1"),
      provider.summarize("sys", "s2"),
    ]);

    expect(a).toBe("<result>ok</result>");
    expect(b).toBe("<result>ok</result>");
    expect(c).toBe("<result>ok</result>");
    expect(queryCalls.length).toBe(3);
  });

  it("sets AGENTMEMORY_SDK_CHILD=1 while inside the SDK call (so spawned subprocesses inherit it)", async () => {
    const provider = new AgentSDKProvider();
    let observedEnv: string | undefined;

    mockResult = (sysPrompt, _userPrompt) => {
      observedEnv = process.env.AGENTMEMORY_SDK_CHILD;
      return `<result>${sysPrompt}</result>`;
    };

    expect(process.env.AGENTMEMORY_SDK_CHILD).toBeUndefined();
    await provider.summarize("sys", "user");
    expect(observedEnv).toBe("1");
    expect(process.env.AGENTMEMORY_SDK_CHILD).toBeUndefined();
  });

  it("restores AGENTMEMORY_SDK_CHILD to its prior value after the call", async () => {
    const provider = new AgentSDKProvider();
    process.env.AGENTMEMORY_SDK_CHILD = "prev-value";

    await provider.summarize("sys", "user");

    expect(process.env.AGENTMEMORY_SDK_CHILD).toBe("prev-value");
  });

  it("genuine re-entry (an inner call inside the same async tree) still degrades to empty", async () => {
    const provider = new AgentSDKProvider();
    let innerResult = "not-set";

    mockResult = async (_sys, _user) => {
      // Simulate the SDK callback re-entering the provider while the
      // outer call is still active. The ALS frame is active here, so
      // the inner call must return "" to break the recursion.
      innerResult = await provider.summarize("sys-inner", "user-inner");
      return "<result>outer</result>";
    };

    const outer = await provider.summarize("sys", "user");
    expect(outer).toBe("<result>outer</result>");
    expect(innerResult).toBe("");
  });
});
