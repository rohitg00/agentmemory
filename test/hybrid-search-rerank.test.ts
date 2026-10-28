import { beforeEach, describe, expect, it, vi } from "vitest";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { SearchIndex } from "../src/state/search-index.js";
import type { CompressedObservation, HybridSearchResult } from "../src/types.js";

const { rerank } = vi.hoisted(() => ({ rerank: vi.fn() }));
vi.mock("../src/state/reranker.js", () => ({ rerank }));

function setup(enabled = true) {
  const index = new SearchIndex();
  const observations = new Map<string, CompressedObservation>();
  for (let i = 0; i < 25; i++) {
    const observation: CompressedObservation = {
      id: `obs-${i}`, sessionId: `session-${i}`, title: `query result ${i}`, narrative: "query variation", timestamp: "2026-01-01T00:00:00Z", type: "other", facts: [], concepts: [], files: [], importance: 5,
    };
    index.add(observation);
    observations.set(observation.id, observation);
  }
  const kv = { get: async (_scope: string, id: string) => observations.get(id) ?? null };
  return new HybridSearch(index, null, null, kv as never, 0.4, 0.6, 0, enabled);
}
const expansion = { original: "query", reformulations: ["query variation"], temporalConcretizations: [], entityExtractions: [] };

beforeEach(() => {
  rerank.mockReset();
  rerank.mockImplementation(async (_query: string, results: HybridSearchResult[], topK: number) =>
    results.slice(0, topK).reverse().map((r, i) => ({ ...r, rerankScore: -i, rerankPosition: i + 1 })).concat(results.slice(topK)),
  );
});

describe("hybrid cross-encoder ordering", () => {
  it("reranks expanded-query fusion once against the original query without duplicates or lost tails", async () => {
    const baseline = await setup(false).searchWithExpansion("query", 25, expansion);
    const output = await setup().searchWithExpansion("query", 25, expansion);
    expect(rerank).toHaveBeenCalledTimes(1);
    expect(rerank.mock.calls[0][0]).toBe("query");
    expect(rerank.mock.calls[0][1]).toEqual(baseline);
    expect(output.map((r) => r.observation.id)).toEqual([...baseline.slice(0, 20).reverse(), ...baseline.slice(20)].map((r) => r.observation.id));
    expect(new Set(output.map((r) => r.observation.id)).size).toBe(25);
    expect(output.slice(20)).toEqual(baseline.slice(20));
    for (const item of output) expect(item.combinedScore).toBe(baseline.find((r) => r.observation.id === item.observation.id)!.combinedScore);
  });

  it("keeps direct-search limits and all candidates beyond the reranking window", async () => {
    const baseline = await setup(false).search("query", 25);
    const output = await setup().search("query", 25);
    expect(output).toHaveLength(25);
    expect(output.slice(20)).toEqual(baseline.slice(20));
    expect(rerank.mock.calls[0][2]).toBe(20);
  });

  it("retains a full candidate window before applying a small expanded-query limit", async () => {
    const baseline = await setup(false).searchWithExpansion("query", 20, expansion);
    const output = await setup().searchWithExpansion("query", 1, expansion);
    expect(rerank.mock.calls[0][1]).toHaveLength(20);
    expect(output).toHaveLength(1);
    expect(output[0].observation.id).toBe(baseline[19].observation.id);
  });

  it("retains a full candidate window before applying a small direct-search limit", async () => {
    const baseline = await setup(false).search("query", 20);
    const output = await setup().search("query", 1);
    expect(rerank.mock.calls[0][1]).toHaveLength(20);
    expect(output).toHaveLength(1);
    expect(output[0].observation.id).toBe(baseline[19].observation.id);
  });

  it("preserves merged hybrid ranking when reranking fails", async () => {
    const baseline = await setup(false).searchWithExpansion("query", 25, expansion);
    rerank.mockRejectedValue(new Error("optional model failed"));
    expect(await setup().searchWithExpansion("query", 25, expansion)).toEqual(baseline);
  });

  it("does not load or invoke the reranker when disabled", async () => {
    const output = await setup(false).searchWithExpansion("query", 5, expansion);
    expect(output).toHaveLength(5);
    expect(rerank).not.toHaveBeenCalled();
    expect(output.every((r) => r.rerankScore === undefined)).toBe(true);
  });
});
