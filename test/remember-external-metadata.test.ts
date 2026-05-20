import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

import { registerRememberFunction } from "../src/functions/remember.js";
import {
  getSearchIndex,
  registerSearchFunction,
} from "../src/functions/search.js";

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
      if (!fn && input.function_id === "mem::cascade-update") return undefined;
      if (!fn) throw new Error(`unknown fn ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

describe("memory external_id and metadata passthrough", () => {
  beforeEach(() => {
    getSearchIndex().clear();
  });

  it("keeps duplicate-content memories distinguishable by external_id in search results", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    registerSearchFunction(sdk as never, kv as never);

    const content = "Imported duplicate source memory about stable IDs";
    await sdk.trigger({
      function_id: "mem::remember",
      payload: { content, external_id: "source-a" },
    });
    await sdk.trigger({
      function_id: "mem::remember",
      payload: { content, external_id: "source-b" },
    });

    const result = (await sdk.trigger({
      function_id: "mem::search",
      payload: { query: "stable IDs", limit: 5 },
    })) as { results: Array<{ observation: { external_id?: string } }> };

    expect(result.results.map((r) => r.observation.external_id).sort()).toEqual(
      ["source-a", "source-b"],
    );
  });

  it("returns saved metadata unchanged in search results", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    registerSearchFunction(sdk as never, kv as never);

    const metadata = {
      source: "locomo",
      conversation_id: "conv-1",
      turn_index: 3,
    };
    await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "Imported LOCOMO turn about metadata passthrough",
        external_id: "locomo-conv-1-turn-3",
        metadata,
      },
    });

    const result = (await sdk.trigger({
      function_id: "mem::search",
      payload: { query: "metadata passthrough", limit: 5 },
    })) as {
      results: Array<{
        observation: {
          external_id?: string;
          metadata?: Record<string, unknown>;
        };
      }>;
    };

    expect(result.results[0].observation.external_id).toBe(
      "locomo-conv-1-turn-3",
    );
    expect(result.results[0].observation.metadata).toEqual(metadata);
  });
});
