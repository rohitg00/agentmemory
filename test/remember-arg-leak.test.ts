import { describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: vi.fn(() => ({ type: "void" })),
    },
  };
});

import { vi } from "vitest";
import { registerRememberFunction } from "../src/functions/remember.js";
import { getSearchIndex, setIndexPersistence } from "../src/functions/search.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) return {};
      return fn(input.payload);
    },
  };
}

async function remember(payload: unknown) {
  const sdk = mockSdk();
  const kv = mockKV();
  registerRememberFunction(sdk as never, kv as never);

  const result = (await sdk.trigger({
    function_id: "mem::remember",
    payload,
  })) as { success: boolean; error?: string; memory?: { id: string; type: string } };

  return { result, kv };
}

describe("mem::remember — mis-encoded tool call arguments", () => {
  beforeEach(() => {
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  // Verbatim shape of a real mis-encoded save: the caller closed content with a
  // tag and wrote the remaining arguments as text, so only content arrived.
  const leaked = [
    "porter export handler: the 413 size-limit precedence is MaxBytesError first.",
    "</content>",
    "<type>bug</type>",
    "<concepts>porter, export handler</concepts>",
    "<files>internal/porter/handler/export/export.go</files>",
    "<project>porter</project>",
    "</invoke>",
  ].join("\n");

  it("refuses content carrying the arguments that followed it", async () => {
    const { result, kv } = await remember({ content: leaked });

    expect(result.success).toBe(false);
    expect(result.error).toContain("one parameter per argument");

    // The point of failing here is that the alternative is a silent save: the
    // markup persisted and every field after content lost.
    expect(await kv.list("mem:memories")).toHaveLength(0);
  });

  it("refuses it even when the other arguments are also sent", async () => {
    // The leaked text is still wrong when type and project happen to arrive, so
    // the guard cannot key off their absence.
    const { result } = await remember({
      content: leaked,
      type: "bug",
      project: "porter",
    });

    expect(result.success).toBe(false);
  });

  it("saves content that merely mentions one of the argument tags", async () => {
    const { result } = await remember({
      content: "The MCP schema names the field <project>; pass it as its own argument.",
      type: "fact",
    });

    expect(result.success).toBe(true);
    expect(result.memory?.type).toBe("fact");
  });

  it("saves prose about closing tags in general", async () => {
    const { result } = await remember({
      content: "Reader.Close() must run before the </html> is written, or the body truncates.",
    });

    expect(result.success).toBe(true);
  });

  it("refuses content carrying the same marker twice", async () => {
    // Two occurrences of one marker must trip the guard as surely as two
    // different markers, so the check counts occurrences, not categories.
    const { result } = await remember({
      content: "<type>bug</type>\nmore text\n<type>fact</type>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("one parameter per argument");
  });

  it("keeps matching on repeated calls, so the check is not stateful", async () => {
    for (let i = 0; i < 3; i++) {
      const { result } = await remember({ content: leaked });
      expect(result.success).toBe(false);
    }
  });
});
