import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import type { Session, SessionSummary, Memory } from "../src/types.js";

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
  const triggerOverrides = new Map<string, Function>();
  return {
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      if (triggerOverrides.has(id)) {
        return triggerOverrides.get(id)!(data);
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body?: unknown, headers?: Record<string, string>) {
  return {
    body,
    headers: headers || {},
    query_params: {},
  };
}

describe("MCP Prompts", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("lists 3 prompts", async () => {
    const fn = sdk.getFunction("mcp::prompts::list")!;
    const result = (await fn(makeReq())) as {
      status_code: number;
      body: { prompts: unknown[] };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.prompts).toHaveLength(3);
  });

  it("recall_context returns messages with search results", async () => {
    sdk.overrideTrigger("mem::search", async () => ({
      results: [{ observation: { title: "Found something" } }],
    }));

    const mem: Memory = {
      id: "mem_1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: "pattern",
      title: "Auth pattern",
      content: "Always use JWT",
      concepts: ["auth"],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: true,
    };
    await kv.set("mem:memories", "mem_1", mem);

    const fn = sdk.getFunction("mcp::prompts::get")!;
    const result = (await fn(
      makeReq({
        name: "recall_context",
        arguments: { task_description: "implement auth" },
      }),
    )) as {
      status_code: number;
      body: { messages: Array<{ role: string; content: { text: string } }> };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.messages).toHaveLength(1);
    expect(result.body.messages[0].role).toBe("user");
    expect(result.body.messages[0].content.text).toContain("implement auth");
  });

  it("session_handoff returns session data", async () => {
    const session: Session = {
      id: "ses_1",
      project: "/test",
      cwd: "/test",
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 10,
    };
    await kv.set("mem:sessions", "ses_1", session);

    const summary: SessionSummary = {
      sessionId: "ses_1",
      project: "/test",
      createdAt: "2026-02-01T00:00:00Z",
      title: "Auth implementation",
      narrative: "Implemented JWT auth",
      keyDecisions: ["Used JWT"],
      filesModified: ["src/auth.ts"],
      concepts: ["auth"],
      observationCount: 10,
    };
    await kv.set("mem:summaries", "ses_1", summary);

    const fn = sdk.getFunction("mcp::prompts::get")!;
    const result = (await fn(
      makeReq({
        name: "session_handoff",
        arguments: { session_id: "ses_1" },
      }),
    )) as {
      status_code: number;
      body: { messages: Array<{ role: string; content: { text: string } }> };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.messages[0].content.text).toContain("Session Handoff");
    expect(result.body.messages[0].content.text).toContain("ses_1");
  });

  it("detect_patterns returns analysis", async () => {
    sdk.overrideTrigger("mem::patterns", async () => ({
      fileCoOccurrence: [{ files: ["a.ts", "b.ts"], count: 5 }],
    }));

    const fn = sdk.getFunction("mcp::prompts::get")!;
    const result = (await fn(
      makeReq({
        name: "detect_patterns",
        arguments: { project: "/myapp" },
      }),
    )) as {
      status_code: number;
      body: { messages: Array<{ role: string; content: { text: string } }> };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.messages[0].content.text).toContain("Pattern Analysis");
  });

  it("returns 400 for missing required arg", async () => {
    const fn = sdk.getFunction("mcp::prompts::get")!;
    const result = (await fn(
      makeReq({
        name: "recall_context",
        arguments: {},
      }),
    )) as { status_code: number };

    expect(result.status_code).toBe(400);
  });

  it("returns 400 for unknown prompt name", async () => {
    const fn = sdk.getFunction("mcp::prompts::get")!;
    const result = (await fn(
      makeReq({
        name: "nonexistent_prompt",
        arguments: {},
      }),
    )) as { status_code: number };

    expect(result.status_code).toBe(400);
  });
});
