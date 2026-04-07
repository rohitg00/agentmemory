import { describe, it, expect, vi } from "vitest";

vi.mock("@xenova/transformers", () => {
  throw new Error("not installed");
});

import { rerank, isRerankerAvailable } from "../src/state/reranker.js";

describe("reranker", () => {
  it("returns results unchanged when @xenova/transformers is unavailable", async () => {
    const results = [
      {
        observation: {
          id: "o1",
          title: "First",
          narrative: "First result",
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
          narrative: "Second result",
        },
        bm25Score: 0.3,
        vectorScore: 0.4,
        graphScore: 0,
        combinedScore: 0.5,
        sessionId: "s1",
      },
    ] as any;

    const reranked = await rerank("test query", results);
    expect(reranked).toEqual(results);
  });

  it("isRerankerAvailable returns false when not loaded", () => {
    expect(isRerankerAvailable()).toBe(false);
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
