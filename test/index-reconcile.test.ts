import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSearchIndex,
  reconcileIndex,
  setIndexPersistence,
} from "../src/functions/search.js";
import { SearchIndex } from "../src/state/search-index.js";
import type { CompressedObservation, Session } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const list = vi.fn(async <T>(scope: string): Promise<T[]> => {
    const entries = store.get(scope);
    return entries ? (Array.from(entries.values()) as T[]) : [];
  });
  return {
    list,
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
  };
}

function makeObs(id: string, sessionId: string): CompressedObservation {
  return {
    id,
    sessionId,
    timestamp: new Date().toISOString(),
    type: "decision",
    title: `observation ${id}`,
    facts: [`fact about ${id}`],
    narrative: `narrative for ${id}`,
    concepts: ["reconcile"],
    files: [],
    importance: 5,
  };
}

function makeSession(id: string, observationCount: number): Session {
  return {
    id,
    project: "agentmemory",
    cwd: "/tmp",
    startedAt: new Date().toISOString(),
    status: "active",
    observationCount,
  };
}

describe("reconcileIndex", () => {
  const persistence = { scheduleSave: vi.fn(), save: vi.fn(async () => {}) };

  beforeEach(() => {
    getSearchIndex().clear();
    persistence.scheduleSave.mockClear();
    setIndexPersistence(persistence);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  it("re-indexes observations missing from the loaded snapshot and schedules a save", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "s1", makeSession("s1", 2));
    await kv.set("mem:obs:s1", "obs_a", makeObs("obs_a", "s1"));
    await kv.set("mem:obs:s1", "obs_b", makeObs("obs_b", "s1"));
    getSearchIndex().add(makeObs("obs_a", "s1"));

    const added = await reconcileIndex(kv as never);

    expect(added).toBe(1);
    expect(getSearchIndex().has("obs_b")).toBe(true);
    expect(getSearchIndex().size).toBe(2);
    expect(persistence.scheduleSave).toHaveBeenCalled();
  });

  it("does not list observations for sessions the snapshot already covers", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "s1", makeSession("s1", 2));
    await kv.set("mem:obs:s1", "obs_a", makeObs("obs_a", "s1"));
    await kv.set("mem:obs:s1", "obs_b", makeObs("obs_b", "s1"));
    getSearchIndex().add(makeObs("obs_a", "s1"));
    getSearchIndex().add(makeObs("obs_b", "s1"));

    const added = await reconcileIndex(kv as never);

    expect(added).toBe(0);
    expect(kv.list).toHaveBeenCalledTimes(1);
    expect(kv.list).toHaveBeenCalledWith("mem:sessions");
    expect(persistence.scheduleSave).not.toHaveBeenCalled();
  });

  it("does not let indexed memories mask a missing observation", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "s1", makeSession("s1", 1));
    await kv.set("mem:obs:s1", "obs_a", makeObs("obs_a", "s1"));
    getSearchIndex().add(makeObs("mem_x", "s1"));

    const added = await reconcileIndex(kv as never);

    expect(added).toBe(1);
    expect(getSearchIndex().has("obs_a")).toBe(true);
  });

  it("skips observations that are already indexed or not indexable", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "s1", makeSession("s1", 3));
    await kv.set("mem:obs:s1", "obs_a", makeObs("obs_a", "s1"));
    await kv.set("mem:obs:s1", "obs_b", { ...makeObs("obs_b", "s1"), narrative: "" });
    await kv.set("mem:obs:s1", "obs_c", makeObs("obs_c", "s1"));
    getSearchIndex().add(makeObs("obs_a", "s1"));

    const added = await reconcileIndex(kv as never);

    expect(added).toBe(1);
    expect(getSearchIndex().has("obs_c")).toBe(true);
    expect(getSearchIndex().has("obs_b")).toBe(false);
  });

  it("treats a zero observation count as unknown and still checks the session", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "s1", makeSession("s1", 0));
    await kv.set("mem:obs:s1", "obs_a", makeObs("obs_a", "s1"));

    const added = await reconcileIndex(kv as never);

    expect(added).toBe(1);
    expect(getSearchIndex().has("obs_a")).toBe(true);
  });

  it("does not re-add an observation a live write indexed while it was collecting", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "s1", makeSession("s1", 1));
    await kv.set("mem:sessions", "s2", makeSession("s2", 1));
    await kv.set("mem:obs:s1", "obs_a", makeObs("obs_a", "s1"));
    await kv.set("mem:obs:s2", "obs_b", makeObs("obs_b", "s2"));
    const realList = kv.list;
    kv.list = vi.fn(async (scope: string) => {
      if (scope === "mem:obs:s2") getSearchIndex().add(makeObs("obs_a", "s1"));
      return realList(scope);
    }) as typeof kv.list;

    const added = await reconcileIndex(kv as never);

    expect(added).toBe(1);
    expect(getSearchIndex().size).toBe(2);
  });
});

describe("SearchIndex.add on an existing id", () => {
  it("replaces the document instead of stacking postings and doc length", () => {
    const first = { ...makeObs("obs_a", "s1"), title: "alpha token", narrative: "alpha token", facts: [] };
    const second = { ...makeObs("obs_a", "s1"), title: "bravo token", narrative: "bravo token", facts: [] };
    const idx = new SearchIndex();
    idx.add(first);
    idx.add(second);
    const fresh = new SearchIndex();
    fresh.add(second);

    expect(idx.size).toBe(1);
    expect(idx.search("alpha").map((r) => r.obsId)).toEqual([]);
    expect(idx.search("bravo").map((r) => r.obsId)).toEqual(["obs_a"]);
    expect(JSON.parse(idx.serialize()).totalDocLength).toBe(
      JSON.parse(fresh.serialize()).totalDocLength,
    );
  });
});
