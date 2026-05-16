import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", () => ({
  isActionSuggestEnabled: () => true,
}));

import { registerActionSuggestFunction } from "../src/functions/action-suggest.js";
import type { Action, CompressedObservation, MemoryProvider } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function mockNoopProvider(): MemoryProvider {
  return { name: "noop", compress: vi.fn(), summarize: vi.fn() };
}

function mockLlmProvider(responses: string[]): MemoryProvider {
  let callIdx = 0;
  return {
    name: "test-llm",
    compress: vi.fn(),
    summarize: vi.fn().mockImplementation(() => {
      const resp = responses[callIdx] ?? "";
      callIdx++;
      return Promise.resolve(resp);
    }),
  };
}

function makeObs(overrides: Partial<CompressedObservation> & { id: string; sessionId: string }): CompressedObservation {
  return {
    title: "Test observation",
    subtitle: "",
    type: "other",
    facts: [],
    narrative: "Something happened",
    concepts: [],
    files: [],
    importance: 5,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

async function callSuggest(sdk: ReturnType<typeof mockSdk>, kv: ReturnType<typeof mockKV>, sessionId: string, project?: string) {
  return sdk.trigger({
    function_id: "mem::action-suggest",
    payload: { sessionId, project },
  });
}

describe("Action Suggest Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let provider: MemoryProvider;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    provider = mockNoopProvider();
    registerActionSuggestFunction(sdk as any, kv as any, provider);
  });

  it("returns error when sessionId is missing", async () => {
    const result = await callSuggest(sdk, kv, "");
    expect(result.success).toBe(false);
    expect(result.error).toContain("sessionId");
  });

  it("returns 0 suggestions when no observations exist", async () => {
    const result = await callSuggest(sdk, kv, "empty-session");
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(0);
  });

  it("creates action for error observations", async () => {
    const obs = makeObs({
      id: "obs1",
      sessionId: "s1",
      type: "error",
      title: "TypeError: Cannot read property",
      narrative: "Uncaught TypeError in auth module",
      importance: 6,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await callSuggest(sdk, kv, "s1", "my-project");
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(1);
    expect(result.heuristic).toBe(1);
    expect(result.llm).toBe(0);

    const actions = await kv.list<Action>("mem:actions");
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toContain("Fix error:");
    expect(actions[0].priority).toBe(8);
    expect(actions[0].tags).toContain("auto-suggested");
    expect(actions[0].createdBy).toBe("action-suggest");
    expect(actions[0].project).toBe("my-project");
  });

  it("creates action for TODO observations", async () => {
    const obs = makeObs({
      id: "obs2",
      sessionId: "s1",
      type: "file_edit",
      title: "TODO: Add input validation",
      narrative: "Need to add validation to the form handler",
      importance: 6,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await callSuggest(sdk, kv, "s1");
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(1);

    const actions = await kv.list<Action>("mem:actions");
    expect(actions[0].title).toBe("TODO: Add input validation");
    expect(actions[0].priority).toBe(7);
  });

  it("creates action for high-importance decisions", async () => {
    const obs = makeObs({
      id: "obs3",
      sessionId: "s1",
      type: "decision",
      title: "Chose JWT over session cookies",
      narrative: "Decided to use JWT for API auth",
      importance: 9,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await callSuggest(sdk, kv, "s1");
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(1);

    const actions = await kv.list<Action>("mem:actions");
    expect(actions[0].title).toContain("Follow up:");
    expect(actions[0].priority).toBe(6);
  });

  it("creates action for partial file edits", async () => {
    const obs = makeObs({
      id: "obs4",
      sessionId: "s1",
      type: "file_edit",
      title: "Partial auth middleware",
      narrative: "Added partial implementation, still need to handle refresh tokens",
      importance: 5,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await callSuggest(sdk, kv, "s1");
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(1);

    const actions = await kv.list<Action>("mem:actions");
    expect(actions[0].title).toContain("Complete:");
    expect(actions[0].priority).toBe(5);
  });

  it("deduplicates actions with same title", async () => {
    const obs1 = makeObs({ id: "obs5", sessionId: "s1", type: "error", title: "TypeError: Cannot read property", narrative: "Error", importance: 6 });
    const obs2 = makeObs({ id: "obs6", sessionId: "s2", type: "error", title: "TypeError: Cannot read property", narrative: "Same error again", importance: 6 });
    await kv.set("mem:obs:s1", obs1.id, obs1);
    await kv.set("mem:obs:s2", obs2.id, obs2);

    await callSuggest(sdk, kv, "s1");
    await callSuggest(sdk, kv, "s2");

    const actions = await kv.list<Action>("mem:actions");
    expect(actions).toHaveLength(1);
  });

  it("skips low-importance non-matching observations with noop provider", async () => {
    const obs = makeObs({
      id: "obs7",
      sessionId: "s1",
      type: "file_read",
      title: "Read config file",
      narrative: "Checked the project configuration",
      importance: 3,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await callSuggest(sdk, kv, "s1");
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(0);
  });

  it("uses LLM fallback for high-importance unmatched observations", async () => {
    const llmProvider = mockLlmProvider([
      `<action title="Refactor auth module" priority="6" description="The auth module has accumulated technical debt and needs cleanup">
</action>`,
    ]);
    const freshSdk = mockSdk();
    registerActionSuggestFunction(freshSdk as any, kv as any, llmProvider);

    const obs = makeObs({
      id: "obs8",
      sessionId: "s1",
      type: "discovery",
      title: "Auth module has grown complex",
      narrative: "Noticed the auth module has many responsibilities mixed together",
      importance: 8,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await freshSdk.trigger({
      function_id: "mem::action-suggest",
      payload: { sessionId: "s1" },
    });
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(1);
    expect(result.llm).toBe(1);

    const actions = await kv.list<Action>("mem:actions");
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe("Refactor auth module");
    expect(actions[0].tags).toContain("auto-suggested");
  });

  it("handles LLM failure gracefully", async () => {
    const failProvider: MemoryProvider = {
      name: "failing",
      compress: vi.fn(),
      summarize: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    };
    const freshSdk = mockSdk();
    registerActionSuggestFunction(freshSdk as any, kv as any, failProvider);

    const obs = makeObs({
      id: "obs9",
      sessionId: "s1",
      type: "discovery",
      title: "Something important",
      narrative: "Important observation without heuristic match",
      importance: 8,
    });
    await kv.set("mem:obs:s1", obs.id, obs);

    const result = await freshSdk.trigger({
      function_id: "mem::action-suggest",
      payload: { sessionId: "s1" },
    });
    expect(result.success).toBe(true);
    expect(result.suggested).toBe(0);
    expect(result.llm).toBe(0);
  });

  it("matches FIXME in narrative", async () => {
    const freshSdk = mockSdk();
    registerActionSuggestFunction(freshSdk as any, kv as any, mockNoopProvider());

    const obs = makeObs({
      id: "obs-fixme",
      sessionId: "s-fixme",
      type: "file_edit",
      title: "Quick patch for login",
      narrative: "FIXME: this is a hack, need proper solution",
      importance: 5,
    });
    await kv.set("mem:obs:s-fixme", obs.id, obs);

    const result = await freshSdk.trigger({
      function_id: "mem::action-suggest",
      payload: { sessionId: "s-fixme" },
    });
    expect(result.suggested).toBe(1);
  });

  it("matches TBD in title", async () => {
    const freshSdk = mockSdk();
    registerActionSuggestFunction(freshSdk as any, kv as any, mockNoopProvider());

    const obs = makeObs({
      id: "obs-tbd",
      sessionId: "s-tbd",
      type: "conversation",
      title: "TBD: rate limiting strategy",
      narrative: "Discussion about rate limiting",
      importance: 5,
    });
    await kv.set("mem:obs:s-tbd", obs.id, obs);

    const result = await freshSdk.trigger({
      function_id: "mem::action-suggest",
      payload: { sessionId: "s-tbd" },
    });
    expect(result.suggested).toBe(1);
  });

  it("does not create action for completed work", async () => {
    const freshSdk = mockSdk();
    registerActionSuggestFunction(freshSdk as any, kv as any, mockNoopProvider());

    const obs = makeObs({
      id: "obs-done",
      sessionId: "s-done",
      type: "file_edit",
      title: "Implemented auth middleware",
      narrative: "Successfully implemented the full auth middleware with tests",
      importance: 7,
    });
    await kv.set("mem:obs:s-done", obs.id, obs);

    const result = await freshSdk.trigger({
      function_id: "mem::action-suggest",
      payload: { sessionId: "s-done" },
    });
    expect(result.suggested).toBe(0);
  });

  it("does not create decision action for low importance", async () => {
    const freshSdk = mockSdk();
    registerActionSuggestFunction(freshSdk as any, kv as any, mockNoopProvider());

    const obs = makeObs({
      id: "obs-low-dec",
      sessionId: "s-low-dec",
      type: "decision",
      title: "Used tabs instead of spaces",
      narrative: "Minor formatting decision",
      importance: 3,
    });
    await kv.set("mem:obs:s-low-dec", obs.id, obs);

    const result = await freshSdk.trigger({
      function_id: "mem::action-suggest",
      payload: { sessionId: "s-low-dec" },
    });
    expect(result.suggested).toBe(0);
  });
});
