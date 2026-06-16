import { describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerFlowCompressFunction } from "../src/functions/flow-compress.js";
import { logger } from "../src/logger.js";
import { KV } from "../src/state/schema.js";
import type { Action, Memory, MemoryProvider } from "../src/types.js";

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

function makeDoneAction(id: string): Action {
  return {
    id,
    title: "Ship Semgrep cleanup",
    status: "done",
    priority: "medium",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    tags: ["security", "semgrep"],
    project: "agentmemory",
    result: "Findings triaged",
  };
}

describe("mem::flow-compress", () => {
  it("stores workflow memory from provider XML", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const provider: MemoryProvider = {
      summarize: vi.fn(async () => `<summary>
<goal>Address Semgrep findings</goal>
<outcome>Plan implemented</outcome>
<steps>1. Validate findings
2. Patch code</steps>
<discoveries>Sentinel regex needed bounds</discoveries>
<lesson>Keep security suppressions justified</lesson>
</summary>`),
      compress: vi.fn(),
      embed: vi.fn(),
    } as unknown as MemoryProvider;

    registerFlowCompressFunction(sdk as never, kv as never, provider);
    sdk.registerFunction("mem::lesson-save", async (payload: Record<string, unknown>) => {
      await kv.set(KV.lessons, "lsn_flow", payload);
      return { success: true, action: "created", lesson: payload };
    });
    const action = makeDoneAction("act_flow");
    await kv.set(KV.actions, action.id, action);

    const result = (await sdk.trigger("mem::flow-compress", {
      actionIds: [action.id],
      project: "agentmemory",
    })) as { success: boolean; compressed: number; summary: { goal: string } };

    expect(result.success).toBe(true);
    expect(result.compressed).toBe(1);
    expect(result.summary.goal).toBe("Address Semgrep findings");

    const memories = await kv.list<Memory>(KV.memories);
    expect(memories).toHaveLength(1);
    expect(memories[0].type).toBe("workflow");
    expect(memories[0].title).toBe("Address Semgrep findings");
    expect(memories[0].content).toContain("Outcome: Plan implemented");
    expect(memories[0].content).toContain("Lesson: Keep security suppressions justified");

    const lessons = await kv.list<Record<string, unknown>>(KV.lessons);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      content: "Keep security suppressions justified",
      context: "Address Semgrep findings",
      confidence: 0.6,
      project: "agentmemory",
      tags: ["flow-compress"],
      source: "consolidation",
      sourceIds: [memories[0].id],
    });
  });

  it("rejects selected actions from a different requested project", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const provider: MemoryProvider = {
      summarize: vi.fn(),
      compress: vi.fn(),
      embed: vi.fn(),
    } as unknown as MemoryProvider;
    registerFlowCompressFunction(sdk as never, kv as never, provider);

    const action = { ...makeDoneAction("act_web"), project: "web" };
    await kv.set(KV.actions, action.id, action);

    const result = (await sdk.trigger("mem::flow-compress", {
      actionIds: [action.id],
      project: "api",
    })) as { success: boolean; error: string; compressed: number };

    expect(result).toMatchObject({
      success: false,
      error: "selected actions must match requested project",
      compressed: 0,
    });
    expect(provider.summarize).not.toHaveBeenCalled();
    expect(await kv.list<Memory>(KV.memories)).toHaveLength(0);
  });

  it("keeps compression successful when lesson save throws", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const provider: MemoryProvider = {
      summarize: vi.fn(async () => `<summary>
<goal>Compress reliable flow</goal>
<outcome>Memory persisted</outcome>
<steps>1. Save memory</steps>
<discoveries></discoveries>
<lesson>Lesson persistence is optional</lesson>
</summary>`),
      compress: vi.fn(),
      embed: vi.fn(),
    } as unknown as MemoryProvider;

    registerFlowCompressFunction(sdk as never, kv as never, provider);
    sdk.registerFunction("mem::lesson-save", async () => {
      throw new Error("lesson store offline");
    });
    const action = makeDoneAction("act_optional_lesson");
    await kv.set(KV.actions, action.id, action);

    const result = (await sdk.trigger("mem::flow-compress", {
      actionIds: [action.id],
      project: "agentmemory",
    })) as { success: boolean; compressed: number };

    expect(result.success).toBe(true);
    expect(result.compressed).toBe(1);
    expect(await kv.list<Memory>(KV.memories)).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to save lesson from flow-compress",
      expect.objectContaining({ error: "lesson store offline" }),
    );
  });

  it("keeps compression successful when lesson save returns failure", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const provider: MemoryProvider = {
      summarize: vi.fn(async () => `<summary>
<goal>Compress reliable flow</goal>
<outcome>Memory persisted</outcome>
<steps>1. Save memory</steps>
<discoveries></discoveries>
<lesson>Lesson persistence is optional</lesson>
</summary>`),
      compress: vi.fn(),
      embed: vi.fn(),
    } as unknown as MemoryProvider;

    registerFlowCompressFunction(sdk as never, kv as never, provider);
    sdk.registerFunction("mem::lesson-save", async () => ({
      success: false,
      error: "lesson rejected",
    }));
    const action = makeDoneAction("act_failed_lesson_result");
    await kv.set(KV.actions, action.id, action);

    const result = (await sdk.trigger("mem::flow-compress", {
      actionIds: [action.id],
      project: "agentmemory",
    })) as { success: boolean; compressed: number };

    expect(result.success).toBe(true);
    expect(result.compressed).toBe(1);
    expect(await kv.list<Memory>(KV.memories)).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to save lesson from flow-compress",
      expect.objectContaining({ error: "lesson rejected" }),
    );
  });
});
