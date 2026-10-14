import { afterEach, describe, expect, it, vi } from "vitest";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { SearchIndex } from "../src/state/search-index.js";
import { KV } from "../src/state/schema.js";
import { initializeGraphIndex, reconcileGraphIndexRecord } from "../src/state/graph-retrieval-index.js";
import type { CompressedObservation } from "../src/types.js";

const observation: CompressedObservation = {
  id: "obs_ready", sessionId: "ses_ready", timestamp: "2026-01-01T00:00:00.000Z",
  type: "discovery", title: "Cobalt authentication", subtitle: "", facts: [],
  narrative: "Cobalt validates tokens", concepts: ["Cobalt"], files: [], importance: 5,
};

async function fixture(hold = true) {
  const index = new SearchIndex();
  index.add(observation);
  const records = new Map<string, unknown>();
  let release!: (row: unknown) => void;
  const held = new Promise<unknown>((resolve) => { release = resolve; });
  const reads: string[] = [];
  let holding = false;
  const kv = {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      reads.push(scope);
      if (holding && scope === KV.graphRetrievalControl) { await held; holding = false; }
      return (records.get(`${scope}/${key}`) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, value: T) => { records.set(`${scope}/${key}`, value); return value; },
    delete: async (scope: string, key: string) => { records.delete(`${scope}/${key}`); },
    list: vi.fn(async () => { throw new Error("Unexpected full graph list"); }),
  };
  await kv.set(KV.observations(observation.sessionId), observation.id, observation);
  await initializeGraphIndex(kv as never, { status: "ready" });
  await reconcileGraphIndexRecord(kv as never, "node", "cobalt", {
    id: "cobalt", name: "Cobalt", type: "concept", properties: {},
    sourceObservationIds: [observation.id], createdAt: observation.timestamp,
  });
  reads.length = 0;
  holding = hold;
  return { hybrid: new HybridSearch(index, null, null, kv as never), release, reads, kv, index };
}

afterEach(() => vi.useRealTimers());

describe("optional graph retrieval budget", () => {
  it("returns ready keyword results while graph storage is still unresponsive", async () => {
    vi.useFakeTimers();
    const { hybrid, release } = await fixture();
    let results: Awaited<ReturnType<HybridSearch["search"]>> | undefined;
    const search = hybrid.search("Cobalt").then((value) => { results = value; });
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(results?.map((result) => result.observation.id)).toEqual([observation.id]);
      expect(results?.[0].graphScore).toBe(0);
    } finally {
      release([]);
      await search;
    }
  });

  it("does not start the edge read when a timed-out node read arrives late", async () => {
    vi.useFakeTimers();
    const { hybrid, release, reads, kv } = await fixture();
    const search = hybrid.search("Cobalt");
    await vi.advanceTimersByTimeAsync(500);
    expect((await search).map((result) => result.observation.id)).toEqual([observation.id]);
    release([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(kv.list).not.toHaveBeenCalled();
    expect(reads).not.toContain(KV.graphRetrievalData);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps fast graph enrichment and clears its deadline", async () => {
    vi.useFakeTimers();
    const { kv, index } = await fixture(false);
    const hybrid = new HybridSearch(index, null, null, kv as never);
    const results = await hybrid.search("Cobalt");
    expect(results[0].graphScore).toBeGreaterThan(0);
    expect(results[0].graphContext).toContain(observation.title);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds concurrent query reformulations and can recover on the next search", async () => {
    vi.useFakeTimers();
    const { hybrid, kv, release } = await fixture();
    const search = hybrid.searchWithExpansion("Cobalt", 5, {
      reformulations: ["Cobalt tokens", "Cobalt authentication"],
      temporalConcretizations: [], entityExtractions: ["Cobalt"],
    });
    await vi.advanceTimersByTimeAsync(500);
    expect((await search).map((result) => result.observation.id)).toEqual([observation.id]);
    release([]);
    await vi.advanceTimersByTimeAsync(0);
    expect((await hybrid.search("Cobalt"))[0].graphScore).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
