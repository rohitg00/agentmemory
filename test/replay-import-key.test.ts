import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerReplayFunctions } from "../src/functions/replay.js";
import { KV } from "../src/state/schema.js";
import {
  getSearchIndex,
  setVectorIndex,
  setEmbeddingProvider,
} from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { EmbeddingProvider } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const setCalls: Array<{ scope: string; key: string | undefined; value: any }> = [];
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      setCalls.push({ scope, key, value });
      if (!store.has(scope)) store.set(scope, new Map());
      // Mirror the engine: a state::set with key=undefined fails. We
      // surface this via setCalls so the test can assert key !== undefined.
      if (key === undefined) {
        throw new Error("missing field `key`");
      }
      store.get(scope)!.set(key, value);
      return value;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    getSetCalls: () => setCalls,
  };
}

function mockSdk(kv: ReturnType<typeof mockKV>) {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => fns.set(id, handler),
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload?: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload =
        typeof idOrInput === "string" ? data : (idOrInput as any).payload;
      const fn = fns.get(id);
      if (!fn) return { success: true };
      return fn(payload);
    },
    _kv: kv,
  } as any;
}

describe("import-jsonl re-key on parsed.sessionId (#775)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "replay-import-key-"));
  });

  function writeFixture(sessionId: string, ts = "2026-04-17T10:00:00.000Z") {
    const dir = join(tmpRoot, "proj");
    rmSync(dir, { recursive: true, force: true });
    require("node:fs").mkdirSync(dir, { recursive: true });
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        sessionId,
        timestamp: ts,
        cwd: tmpRoot,
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        sessionId,
        timestamp: ts,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "world" }],
        },
      }),
    ];
    writeFileSync(join(dir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
  }

  it("re-imports a session whose stored row is missing the `id` field without aborting the batch", async () => {
    writeFixture("sess-no-id");
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerReplayFunctions(sdk, kv as never);

    // Seed an existing session row that is MISSING `id` — the
    // pre-fix code would re-key on `existing.id` (undefined) and
    // throw `missing field \`key\``, aborting the whole import.
    await kv.set(KV.sessions, "sess-no-id", {
      project: "proj",
      cwd: tmpRoot,
      startedAt: "2026-04-17T09:00:00Z",
      endedAt: "2026-04-17T09:30:00Z",
      status: "completed",
      observationCount: 2,
      tags: [],
    });

    const result = (await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    })) as { success: boolean; imported?: number; error?: string };

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);

    const undefinedKeyWrites = kv
      .getSetCalls()
      .filter((c) => c.scope === KV.sessions && c.key === undefined);
    expect(undefinedKeyWrites.length).toBe(0);

    const sessionWrites = kv
      .getSetCalls()
      .filter((c) => c.scope === KV.sessions && c.key === "sess-no-id");
    expect(sessionWrites.length).toBeGreaterThan(0);
    // The handler also backfills the missing id field so future reads
    // are well-formed.
    expect((sessionWrites.at(-1)!.value as any).id).toBe("sess-no-id");
  });

  it("fresh import (no existing row) still writes session keyed by parsed.sessionId", async () => {
    writeFixture("sess-fresh");
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerReplayFunctions(sdk, kv as never);

    const result = (await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    })) as { success: boolean; imported?: number };

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    const sessionWrites = kv
      .getSetCalls()
      .filter((c) => c.scope === KV.sessions && c.key === "sess-fresh");
    expect(sessionWrites.length).toBe(1);
  });
});

describe("import-jsonl indexes observations into BM25 AND vector", () => {
  const mockEmbedder: EmbeddingProvider = {
    name: "test",
    dimensions: 3,
    embed: async () => new Float32Array([0.1, 0.2, 0.3]),
    embedBatch: async (texts: string[]) =>
      texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
  };
  let tmpRoot: string;
  let vectorIndex: VectorIndex;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "replay-import-index-"));
    getSearchIndex().clear();
    vectorIndex = new VectorIndex();
    setVectorIndex(vectorIndex);
    setEmbeddingProvider(mockEmbedder);
  });

  afterEach(() => {
    setVectorIndex(null);
    setEmbeddingProvider(null);
    getSearchIndex().clear();
  });

  function writeFixture(sessionId: string) {
    const dir = join(tmpRoot, "proj");
    require("node:fs").mkdirSync(dir, { recursive: true });
    const ts = "2026-04-17T10:00:00.000Z";
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        sessionId,
        timestamp: ts,
        cwd: tmpRoot,
        message: { role: "user", content: [{ type: "text", text: "how do I fix the flaky retry" }] },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        sessionId,
        timestamp: ts,
        message: { role: "assistant", content: [{ type: "text", text: "await the fetch before asserting" }] },
      }),
    ];
    writeFileSync(join(dir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
  }

  it("populates the vector index (regression: replay used to BM25-add only, leaving imports unsearchable by meaning)", async () => {
    writeFixture("sess-index");
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerReplayFunctions(sdk, kv as never);

    expect(vectorIndex.size).toBe(0);
    expect(getSearchIndex().size).toBe(0);

    const result = (await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    })) as { success: boolean; imported?: number };

    expect(result.success).toBe(true);
    // Both lanes must be populated. The old code left vectorIndex at 0.
    expect(vectorIndex.size).toBeGreaterThan(0);
    expect(getSearchIndex().size).toBeGreaterThan(0);
    expect(vectorIndex.size).toBe(getSearchIndex().size);
  });

  it("skips the vector lane cleanly when no embedding provider is configured (keyless install)", async () => {
    setVectorIndex(null);
    setEmbeddingProvider(null);
    writeFixture("sess-keyless");
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerReplayFunctions(sdk, kv as never);

    const result = (await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    })) as { success: boolean };

    // BM25 still works; no crash from the absent vector index.
    expect(result.success).toBe(true);
    expect(getSearchIndex().size).toBeGreaterThan(0);
  });
});
