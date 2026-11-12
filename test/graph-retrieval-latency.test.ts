import { afterEach, describe, expect, it, vi } from "vitest";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { SearchIndex } from "../src/state/search-index.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { KV } from "../src/state/schema.js";
import { initializeGraphIndex, reconcileGraphIndexRecord } from "../src/state/graph-retrieval-index.js";
import { createGraphIndexState } from "./helpers/graph-index-state.js";
import type { Memory } from "../src/types.js";

afterEach(() => vi.useRealTimers());

describe("graph-only recall with storage latency", () => {
  it("retains exact memory evidence while examining unrelated partial-name candidates", async () => {
    const { kv, intercept } = createGraphIndexState();
    const timestamp = "2026-10-14T00:00:00.000Z";
    const memory: Memory = {
      id: "mem_durable", createdAt: timestamp, updatedAt: timestamp,
      type: "fact", title: "Indigo durable capture", content: "Stored evidence",
      concepts: [], files: [], sessionIds: [], strength: 5, version: 1,
      isLatest: true,
    };
    const index = new SearchIndex();
    index.add(memoryToObservation(memory), "memory");
    await kv.set(KV.memories, memory.id, memory);
    await initializeGraphIndex(kv, { status: "ready" });
    for (let i = 0; i < 100; i++) {
      const id = `node-${i}`;
      await reconcileGraphIndexRecord(kv, "node", id, {
        id, name: i === 0 ? "OnyxRestored" : `Cobalt${i}`,
        type: "concept", properties: {}, createdAt: timestamp,
        sourceObservationIds: i === 0 ? [memory.id] : ["legacy_observation"],
      });
    }

    vi.useFakeTimers();
    let active = 0;
    let maximumActive = 0;
    intercept(async (id) => {
      if (id !== "state::get") return;
      active++;
      maximumActive = Math.max(maximumActive, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 3));
      } finally {
        active--;
      }
    });
    const hybrid = new HybridSearch(index, null, null, kv);
    expect(index.search("OnyxRestored", 5, "memory")).toEqual([]);
    const search = hybrid.search("OnyxRestored", 5, "memory");
    await vi.runAllTimersAsync();
    const results = await search;

    expect(results.map((result) => result.observation.id)).toContain(memory.id);
    expect(results.find((result) => result.observation.id === memory.id)?.graphScore).toBeGreaterThan(0);
    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(active).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
