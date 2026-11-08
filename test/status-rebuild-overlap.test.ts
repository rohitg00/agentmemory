import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createStatusReporter } from "../src/triggers/api.js";
import {
  getSearchIndex,
  markKeywordRebuildPending,
  rebuildKeywordIndex,
} from "../src/functions/search.js";
import { KV } from "../src/state/schema.js";

function storeKV() {
  const store = new Map<string, Map<string, unknown>>();
  const listCalls: string[] = [];
  return {
    backend: "file" as const,
    listCalls,
    seed(scope: string, key: string, value: unknown) {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
    },
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(_scope: string, _key: string, data: T): Promise<T> => data,
    delete: async (): Promise<void> => {},
    list: async <T>(scope: string): Promise<T[]> => {
      listCalls.push(scope);
      return Array.from(store.get(scope)?.values() ?? []) as T[];
    },
  };
}

const sdk = { trigger: async () => null };

function seedStore() {
  const kv = storeKV();
  kv.seed(KV.sessions, "ses_1", {
    id: "ses_1",
    project: "p",
    startedAt: "2026-09-30T00:00:00Z",
    observationCount: 3,
  });
  for (let i = 0; i < 3; i++) {
    kv.seed(KV.observations("ses_1"), `obs_${i}`, {
      id: `obs_${i}`,
      sessionId: "ses_1",
      title: `title ${i}`,
      narrative: `narrative ${i}`,
      type: "decision",
      facts: [],
      concepts: [],
      files: [],
      importance: 5,
      timestamp: "2026-09-30T00:00:00Z",
    });
  }
  return kv;
}

function codes(report: { problems: Array<{ code: string }> }): string[] {
  return report.problems.map((p) => p.code);
}

describe("status while the boot keyword rebuild runs", () => {
  it("does not report missing observations before the rebuild finishes", async () => {
    getSearchIndex().clear();
    const kv = seedStore();
    markKeywordRebuildPending();
    const statusReport = createStatusReporter(sdk as never, kv as never, {});

    const during = await statusReport({ health: null, scanMaxAgeMs: 30_000 });
    expect(during.index.missingObservations).toBeNull();
    expect(codes(during)).toContain("keyword-index-rebuilding");
    expect(codes(during)).not.toContain("index-missing-observations");
    expect(codes(during)).not.toContain("index-check-unavailable");
    expect(kv.listCalls).not.toContain(KV.sessions);

    await rebuildKeywordIndex(kv as never);

    const after = await statusReport({ health: null, scanMaxAgeMs: 30_000 });
    expect(after.index.missingObservations).toBe(0);
    expect(codes(after)).not.toContain("keyword-index-rebuilding");
    expect(codes(after)).not.toContain("index-missing-observations");
  });

  it("drops a cached scan taken before a rebuild completed", async () => {
    getSearchIndex().clear();
    const kv = seedStore();
    const statusReport = createStatusReporter(sdk as never, kv as never, {});

    const before = await statusReport({ health: null, scanMaxAgeMs: 30_000 });
    expect(before.index.missingObservations).toBe(3);

    await rebuildKeywordIndex(kv as never);

    const after = await statusReport({ health: null, scanMaxAgeMs: 30_000 });
    expect(after.index.missingObservations).toBe(0);
  });
});
