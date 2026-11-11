import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    getContext: () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    }),
  };
});

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const removedFromBm25: string[] = [];
const removedFromVector: string[] = [];
const releasedImageRefs: string[] = [];

vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({
    remove: (id: string) => {
      removedFromBm25.push(id);
    },
    add: () => {},
    has: () => false,
  }),
  getVectorIndex: () => null,
  scheduleIndexSave: () => {},
  vectorIndexAddGuarded: async () => false,
  vectorIndexRemove: (id: string) => {
    removedFromVector.push(id);
  },
}));

vi.mock("../src/functions/image-refs.js", () => ({
  incrementImageRef: async () => {},
  decrementImageRef: async (_kv: unknown, _sdk: unknown, ref: string) => {
    releasedImageRefs.push(ref);
  },
}));

import { mockKV, mockSdk, currentAuditScope } from "./helpers/mocks.js";
import { indexObservationSession, lookupObservationSession } from "../src/state/obs-index.js";
import type { AuditEntry } from "../src/types.js";
import { SESSION_SOURCE_MAX_BYTES } from "../src/functions/observation-source-budget.js";

const SESSION = "ses_capped";
const SCOPE = `mem:obs:${SESSION}`;

type Row = { id: string; importance?: number; ts: string; imageData?: string };

async function seed(kv: ReturnType<typeof mockKV>, rows: Row[]) {
  for (const row of rows) {
    await kv.set(SCOPE, row.id, {
      id: row.id,
      sessionId: SESSION,
      timestamp: row.ts,
      type: "command_run",
      title: row.id,
      facts: [],
      narrative: "",
      concepts: [],
      files: [],
      importance: row.importance,
      ...(row.imageData ? { imageData: row.imageData } : {}),
    });
    await indexObservationSession(kv as never, row.id, SESSION);
  }
}

async function observeOnce(sdk: ReturnType<typeof mockSdk>, text: string) {
  return (await sdk.trigger("mem::observe", {
    sessionId: SESSION,
    hookType: "post_tool_use",
    timestamp: new Date().toISOString(),
    data: { tool_name: "Bash", tool_input: { command: text } },
  })) as { success?: boolean; observationId?: string; error?: string };
}

async function setup(cap: number) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const sdk = mockSdk({ looseTrigger: true });
  const kv = mockKV();
  registerObserveFunction(sdk as never, kv as never, undefined, cap);
  return { sdk, kv };
}

function storedIds(kv: ReturnType<typeof mockKV>): string[] {
  return Array.from(kv.store.get(SCOPE)?.keys() ?? []);
}

describe("session observation cap evicts instead of refusing", () => {
  beforeEach(() => {
    vi.resetModules();
    removedFromBm25.length = 0;
    removedFromVector.length = 0;
    releasedImageRefs.length = 0;
  });

  it("accepts the new observation at the cap and drops the least valuable row", async () => {
    const { sdk, kv } = await setup(3);
    await seed(kv, [
      { id: "obs_keep_high", importance: 9, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_evict_low", importance: 1, ts: "2026-01-02T00:00:00.000Z" },
      { id: "obs_keep_mid", importance: 5, ts: "2026-01-03T00:00:00.000Z" },
    ]);

    const result = await observeOnce(sdk, "the newest command");

    expect(result.observationId).toBeTruthy();
    expect(result.error).toBeUndefined();
    const ids = storedIds(kv);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("obs_evict_low");
    expect(ids).toContain("obs_keep_high");
    expect(ids).toContain("obs_keep_mid");
    expect(ids).toContain(result.observationId);
  });

  it("evicts the oldest row on an importance tie and clears it from every index", async () => {
    const { sdk, kv } = await setup(2);
    await seed(kv, [
      { id: "obs_older", importance: 4, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_newer", importance: 4, ts: "2026-02-01T00:00:00.000Z" },
    ]);

    await observeOnce(sdk, "another command");

    const ids = storedIds(kv);
    expect(ids).not.toContain("obs_older");
    expect(ids).toContain("obs_newer");
    expect(removedFromBm25).toEqual(["obs_older"]);
    expect(removedFromVector).toEqual(["obs_older"]);
    expect(await lookupObservationSession(kv as never, "obs_older")).toBeNull();
    expect(await lookupObservationSession(kv as never, "obs_newer")).toBe(SESSION);
  });

  it("treats a missing importance like the synthetic default", async () => {
    const { sdk, kv } = await setup(2);
    await seed(kv, [
      { id: "obs_unscored", ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_low", importance: 4, ts: "2026-02-01T00:00:00.000Z" },
    ]);

    await observeOnce(sdk, "next command");

    expect(storedIds(kv)).toContain("obs_unscored");
    expect(storedIds(kv)).not.toContain("obs_low");
  });

  it("records one audit entry for the eviction", async () => {
    const { sdk, kv } = await setup(1);
    await seed(kv, [{ id: "obs_victim", importance: 2, ts: "2026-01-01T00:00:00.000Z" }]);

    await observeOnce(sdk, "audited command");

    const audits = await kv.list<AuditEntry>(currentAuditScope());
    const evictions = audits.filter((a) => a.functionId === "mem::observe" && a.operation === "delete");
    expect(evictions).toHaveLength(1);
    expect(evictions[0]!.targetIds).toEqual(["obs_victim"]);
    expect(evictions[0]!.details).toMatchObject({ reason: "session_observation_cap", sessionId: SESSION, evicted: 1 });
  });

  it("releases the image ref held by an evicted observation", async () => {
    const { sdk, kv } = await setup(1);
    await seed(kv, [
      { id: "obs_with_image", importance: 1, ts: "2026-01-01T00:00:00.000Z", imageData: "/tmp/agentmemory-test/img.png" },
    ]);

    await observeOnce(sdk, "text only");

    expect(releasedImageRefs).toEqual(["/tmp/agentmemory-test/img.png"]);
  });

  it("evicts down to the cap when the session is already above it", async () => {
    const { sdk, kv } = await setup(2);
    await seed(kv, [
      { id: "obs_a", importance: 1, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_b", importance: 2, ts: "2026-01-02T00:00:00.000Z" },
      { id: "obs_c", importance: 8, ts: "2026-01-03T00:00:00.000Z" },
      { id: "obs_d", importance: 9, ts: "2026-01-04T00:00:00.000Z" },
    ]);

    const result = await observeOnce(sdk, "over the cap");

    const ids = storedIds(kv);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("obs_d");
    expect(ids).toContain(result.observationId);
  });

  it("moves to the next candidate when a delete fails and keeps the cap", async () => {
    const { sdk, kv } = await setup(2);
    await seed(kv, [
      { id: "obs_stuck", importance: 1, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_next", importance: 2, ts: "2026-01-02T00:00:00.000Z" },
    ]);
    const realDelete = kv.delete;
    kv.delete = async (scope: string, key: string) => {
      if (key === "obs_stuck") throw new Error("disk busy");
      return realDelete(scope, key);
    };

    const result = await observeOnce(sdk, "after a failed delete");

    expect(result.observationId).toBeTruthy();
    const ids = storedIds(kv);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("obs_stuck");
    expect(ids).not.toContain("obs_next");
    expect(removedFromBm25).toEqual(["obs_next"]);
  });

  it("keeps the incoming write and retries eviction later when no row can be evicted", async () => {
    const { sdk, kv } = await setup(1);
    await seed(kv, [{ id: "obs_stuck", importance: 1, ts: "2026-01-01T00:00:00.000Z" }]);
    const realDelete = kv.delete.bind(kv);
    kv.delete = async () => {
      throw new Error("disk busy");
    };

    const result = await observeOnce(sdk, "cannot fit");

    expect(typeof result.observationId).toBe("string");
    expect(storedIds(kv).sort()).toEqual([result.observationId!, "obs_stuck"].sort());
    expect(removedFromBm25).toHaveLength(0);

    kv.delete = realDelete;
    const next = await observeOnce(sdk, "after recovery");

    expect(storedIds(kv)).toEqual([next.observationId!]);
  });

  it("evicts nothing when the incoming write fails", async () => {
    const { sdk, kv } = await setup(1);
    await seed(kv, [{ id: "obs_keep", importance: 1, ts: "2026-01-01T00:00:00.000Z" }]);
    const realSet = kv.set.bind(kv);
    kv.set = (async (scope: string, key: string, value: unknown) => {
      if (scope === SCOPE) throw new Error("write failed");
      return realSet(scope, key, value);
    }) as typeof kv.set;

    await expect(observeOnce(sdk, "will fail")).rejects.toThrow("write failed");

    expect(storedIds(kv)).toEqual(["obs_keep"]);
    expect(removedFromBm25).toHaveLength(0);
    expect(removedFromVector).toHaveLength(0);
  });

  it("budgets the incoming source against the rows that remain after eviction", async () => {
    const { sdk, kv } = await setup(1);
    await seed(kv, [{ id: "obs_big", importance: 1, ts: "2026-01-01T00:00:00.000Z" }]);
    const big = (await kv.get<Record<string, unknown>>(SCOPE, "obs_big"))!;
    await kv.set(SCOPE, "obs_big", {
      ...big,
      source: { hookType: "post_tool_use", toolOutput: "x".repeat(SESSION_SOURCE_MAX_BYTES - 1024) },
    });

    const result = await observeOnce(sdk, "y".repeat(8 * 1024));

    expect(storedIds(kv)).toEqual([result.observationId!]);
    const stored = await kv.get<{ source?: { truncated?: boolean } }>(SCOPE, result.observationId!);
    expect(stored?.source).toBeDefined();
    expect(stored?.source?.truncated).toBe(false);
  });

  it("re-budgets the incoming source when the planned victim cannot be evicted", async () => {
    const { sdk, kv } = await setup(1);
    await seed(kv, [{ id: "obs_big", importance: 1, ts: "2026-01-01T00:00:00.000Z" }]);
    const big = (await kv.get<Record<string, unknown>>(SCOPE, "obs_big"))!;
    await kv.set(SCOPE, "obs_big", {
      ...big,
      source: { hookType: "post_tool_use", toolOutput: "x".repeat(SESSION_SOURCE_MAX_BYTES - 1024) },
    });
    kv.delete = async () => {
      throw new Error("disk busy");
    };

    const result = await observeOnce(sdk, "y".repeat(8 * 1024));

    expect(storedIds(kv).sort()).toEqual([result.observationId!, "obs_big"].sort());
    const stored = await kv.get<{ source?: { truncated?: boolean } }>(SCOPE, result.observationId!);
    expect(stored?.source === undefined || stored.source.truncated === true).toBe(true);
  });

  it("keeps the session observation count equal to retained rows after eviction", async () => {
    const { sdk, kv } = await setup(2);
    await seed(kv, [
      { id: "obs_a", importance: 1, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_b", importance: 5, ts: "2026-01-02T00:00:00.000Z" },
    ]);
    await kv.set("mem:sessions", SESSION, { id: SESSION, status: "active", observationCount: 2 });

    await observeOnce(sdk, "third");

    const session = await kv.get<{ observationCount: number }>("mem:sessions", SESSION);
    expect(storedIds(kv)).toHaveLength(2);
    expect(session?.observationCount).toBe(2);
  });

  it("keeps the cap when several observations arrive at once", async () => {
    const { sdk, kv } = await setup(3);
    await seed(kv, [
      { id: "obs_1", importance: 5, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_2", importance: 5, ts: "2026-01-02T00:00:00.000Z" },
      { id: "obs_3", importance: 5, ts: "2026-01-03T00:00:00.000Z" },
    ]);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => observeOnce(sdk, `parallel ${i}`)),
    );

    expect(results.every((r) => typeof r.observationId === "string")).toBe(true);
    expect(storedIds(kv)).toHaveLength(3);
  });

  it("leaves capture untouched when the session is under the cap", async () => {
    const { sdk, kv } = await setup(10);
    await seed(kv, [{ id: "obs_only", importance: 1, ts: "2026-01-01T00:00:00.000Z" }]);

    await observeOnce(sdk, "still room");

    expect(storedIds(kv)).toContain("obs_only");
    expect(removedFromBm25).toHaveLength(0);
  });
});
