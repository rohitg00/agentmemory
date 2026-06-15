import { afterEach, describe, expect, it, vi } from "vitest";
import type { HybridSearchResult } from "../src/types.js";

function makeResult(
  id: string,
  narrative: string,
  combinedScore: number,
): HybridSearchResult {
  return {
    observation: {
      id,
      sessionId: "s1",
      timestamp: "2026-06-15T00:00:00.000Z",
      type: "file_edit",
      title: id,
      narrative,
      facts: [],
      concepts: [],
      files: [],
      importance: 5,
    },
    bm25Score: combinedScore,
    vectorScore: 0,
    graphScore: 0,
    combinedScore,
    sessionId: "s1",
  };
}

async function importRerankerWithScores(scoreForText: (text: string) => number) {
  vi.resetModules();
  vi.doMock("@xenova/transformers", () => ({
    pipeline: vi.fn(async () =>
      vi.fn(async (text: string) => [
        { label: "LABEL_0", score: scoreForText(text) },
      ]),
    ),
  }));

  return import("../src/state/reranker.js");
}

async function importUnavailableReranker() {
  vi.resetModules();
  vi.doMock("@xenova/transformers", () => {
    throw new Error("not installed");
  });

  return import("../src/state/reranker.js");
}

afterEach(() => {
  vi.doUnmock("@xenova/transformers");
  vi.resetModules();
});

describe("reranker", () => {
  it("returns results unchanged when @xenova/transformers is unavailable", async () => {
    const { rerank } = await importUnavailableReranker();
    const results = [
      makeResult("o1", "First result", 0.8),
      makeResult("o2", "Second result", 0.5),
    ];

    const reranked = await rerank("test query", results);
    expect(reranked).toEqual(results);
  });

  it("isRerankerAvailable returns false when not loaded", async () => {
    const { isRerankerAvailable } = await importUnavailableReranker();
    expect(isRerankerAvailable()).toBe(false);
  });

  it("keeps retrieval order and scores when the reranker returns constant scores", async () => {
    const { rerank } = await importRerankerWithScores(() => 1);
    const results = [
      makeResult("o1", "same-score first result", 0.8),
      makeResult("o2", "same-score second result", 0.5),
    ];

    const reranked = await rerank("test query", results);
    expect(reranked.map((r) => r.observation.id)).toEqual(["o1", "o2"]);
    expect(reranked.map((r) => r.combinedScore)).toEqual([0.8, 0.5]);
    expect(reranked.map((r) => r.rerankScore)).toEqual([
      undefined,
      undefined,
    ]);
    expect(reranked.map((r) => r.rerankPosition)).toEqual([1, 2]);
  });

  it("uses discriminative reranker scores for ordering without overwriting retrieval score", async () => {
    const { rerank } = await importRerankerWithScores((text) =>
      text.includes("strong-match") ? 0.9 : 0.1,
    );
    const results = [
      makeResult("o1", "weak-match first result", 0.8),
      makeResult("o2", "strong-match second result", 0.5),
    ];

    const reranked = await rerank("test query", results);
    expect(reranked.map((r) => r.observation.id)).toEqual(["o2", "o1"]);
    expect(reranked[0].combinedScore).toBe(0.5);
    expect(reranked[0].rerankScore).toBe(0.9);
    expect(reranked[0].rerankPosition).toBe(1);
  });

  it("isRerankerAvailable reflects the loaded pipeline", async () => {
    const { rerank, isRerankerAvailable } = await importRerankerWithScores(
      () => 0.5,
    );
    const results = [
      makeResult("o1", "first result", 0.8),
      makeResult("o2", "second result", 0.5),
    ];

    await rerank("test query", results);
    expect(isRerankerAvailable()).toBe(true);
  });

  it("handles single result gracefully", async () => {
    const { rerank } = await importUnavailableReranker();
    const results = [makeResult("o1", "Only", 1.0)];

    const reranked = await rerank("query", results);
    expect(reranked).toHaveLength(1);
  });

  it("handles empty results", async () => {
    const { rerank } = await importUnavailableReranker();

    const reranked = await rerank("query", []);
    expect(reranked).toHaveLength(0);
  });
});
