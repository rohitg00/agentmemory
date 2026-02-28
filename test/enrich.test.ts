import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerEnrichFunction } from "../src/functions/enrich.js";
import type { Memory } from "../src/types.js";

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

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "bug",
    title: "Known bug",
    content: "Null pointer in handler",
    concepts: ["bug"],
    files: ["src/handler.ts"],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
    ...overrides,
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

describe("Enrich Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);
  });

  it("returns file context and relevant memories", async () => {
    sdk.overrideTrigger(
      "mem::file-context",
      async () => ({ context: "File was edited in session ses_1" }),
    );
    sdk.overrideTrigger("mem::search", async () => ({
      results: [
        { observation: { narrative: "User fixed a bug in handler" } },
      ],
    }));

    const bugMem = makeMemory({
      id: "bug_1",
      files: ["src/handler.ts"],
      type: "bug",
    });
    await kv.set("mem:memories", "bug_1", bugMem);

    const result = (await sdk.trigger("mem::enrich", {
      sessionId: "ses_1",
      files: ["src/handler.ts"],
    })) as { context: string; truncated: boolean };

    expect(result.context).toContain("File was edited in session ses_1");
    expect(result.context).toContain("agentmemory-relevant-context");
    expect(result.context).toContain("agentmemory-past-errors");
    expect(result.truncated).toBe(false);
  });

  it("extracts terms from Grep/Glob pattern for search", async () => {
    let capturedQuery = "";
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));
    sdk.overrideTrigger("mem::search", async (data: any) => {
      capturedQuery = data.query;
      return { results: [] };
    });

    await sdk.trigger("mem::enrich", {
      sessionId: "ses_1",
      files: ["src/utils.ts"],
      terms: ["handleError"],
      toolName: "Grep",
    });

    expect(capturedQuery).toContain("handleError");
  });

  it("truncates context at 4000 chars", async () => {
    const longContext = "x".repeat(5000);
    sdk.overrideTrigger(
      "mem::file-context",
      async () => ({ context: longContext }),
    );
    sdk.overrideTrigger("mem::search", async () => ({ results: [] }));

    const result = (await sdk.trigger("mem::enrich", {
      sessionId: "ses_1",
      files: ["src/big.ts"],
    })) as { context: string; truncated: boolean };

    expect(result.context.length).toBe(4000);
    expect(result.truncated).toBe(true);
  });

  it("returns empty context when no data found", async () => {
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));
    sdk.overrideTrigger("mem::search", async () => ({ results: [] }));

    const result = (await sdk.trigger("mem::enrich", {
      sessionId: "ses_1",
      files: ["src/new-file.ts"],
    })) as { context: string; truncated: boolean };

    expect(result.context).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("handles failed triggers without crashing", async () => {
    sdk.overrideTrigger("mem::file-context", async () => {
      throw new Error("file-context failed");
    });
    sdk.overrideTrigger("mem::search", async () => {
      throw new Error("search failed");
    });

    const result = (await sdk.trigger("mem::enrich", {
      sessionId: "ses_1",
      files: ["src/handler.ts"],
    })) as { context: string; truncated: boolean };

    expect(result.context).toBeDefined();
    expect(result.truncated).toBe(false);
  });

  it("includes bug memories that overlap with requested files", async () => {
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));
    sdk.overrideTrigger("mem::search", async () => ({ results: [] }));

    const bugMem = makeMemory({
      id: "bug_match",
      type: "bug",
      title: "Race condition",
      content: "Race condition in worker pool",
      files: ["src/worker.ts"],
      isLatest: true,
    });
    const nonBugMem = makeMemory({
      id: "pattern_1",
      type: "pattern",
      title: "Code pattern",
      content: "Singleton pattern used",
      files: ["src/worker.ts"],
      isLatest: true,
    });
    await kv.set("mem:memories", "bug_match", bugMem);
    await kv.set("mem:memories", "pattern_1", nonBugMem);

    const result = (await sdk.trigger("mem::enrich", {
      sessionId: "ses_1",
      files: ["src/worker.ts"],
    })) as { context: string; truncated: boolean };

    expect(result.context).toContain("Race condition");
    expect(result.context).not.toContain("Singleton pattern");
  });
});
