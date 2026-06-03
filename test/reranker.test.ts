import { describe, it, expect, vi } from "vitest";

vi.mock("@xenova/transformers", () => {
  return {
    pipeline: vi.fn(async () => vi.fn(async (text: string) => {
      if (text.includes("same-score")) return [{ label: "LABEL_0", score: 1 }];
      if (text.includes("strong-match")) return [{ label: "LABEL_0", score: 0.9 }];
      return [{ label: "LABEL_0", score: 0.1 }];
    })),
  };
});

import { rerank, isRerankerAvailable } from "../src/state/reranker.js";

describe("reranker", () => {
  it("keeps retrieval scores when the reranker returns constant scores", async () => {
    const results = [
      {
        observation: {
          id: "o1",
          title: "First",
          narrative: "same-score first result",
        },
        bm25Score: 0.5,
        vectorScore: 0.6,
        graphScore: 0,
        combinedScore: 0.8,
        sessionId: "s1",
      },
      {
        observation: {
          id: "o2",
          title: "Second",
          narrative: "same-score second result",
        },
        bm25Score: 0.3,
        vectorScore: 0.4,
        graphScore: 0,
        combinedScore: 0.5,
        sessionId: "s1",
      },
    ] as any;

    const reranked = await rerank("test query", results);
    expect(reranked.map((r) => r.observation.id)).toEqual(["o1", "o2"]);
    expect(reranked.map((r) => r.combinedScore)).toEqual([0.8, 0.5]);
    expect(reranked.map((r) => r.rerankPosition)).toEqual([1, 2]);
  });

  it("uses discriminative reranker scores for ordering without overwriting retrieval score", async () => {
    const results = [
      {
        observation: {
          id: "o1",
          title: "First",
          narrative: "weak-match first result",
        },
        bm25Score: 0.5,
        vectorScore: 0.6,
        graphScore: 0,
        combinedScore: 0.8,
        sessionId: "s1",
      },
      {
        observation: {
          id: "o2",
          title: "Second",
          narrative: "strong-match second result",
        },
        bm25Score: 0.3,
        vectorScore: 0.4,
        graphScore: 0,
        combinedScore: 0.5,
        sessionId: "s1",
      },
    ] as any;

    const reranked = await rerank("test query", results);
    expect(reranked.map((r) => r.observation.id)).toEqual(["o2", "o1"]);
    expect(reranked[0].combinedScore).toBe(0.5);
    expect(reranked[0].rerankScore).toBe(0.9);
    expect(reranked[0].rerankPosition).toBe(1);
  });

  it("isRerankerAvailable reflects the loaded pipeline", () => {
    expect(isRerankerAvailable()).toBe(true);
  });

  it("handles single result gracefully", async () => {
    const results = [
      {
        observation: { id: "o1", title: "Only" },
        combinedScore: 1.0,
      },
    ] as any;

    const reranked = await rerank("query", results);
    expect(reranked).toHaveLength(1);
  });

  it("handles empty results", async () => {
    const reranked = await rerank("query", []);
    expect(reranked).toHaveLength(0);
  });
});
