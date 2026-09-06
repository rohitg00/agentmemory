import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@huggingface/transformers", () => {
  throw new Error("not installed");
});

import { rerank, isRerankerAvailable } from "../src/state/reranker.js";

describe("reranker", () => {
  it("returns results unchanged when @huggingface/transformers is unavailable", async () => {
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

describe("reranker with loaded pipeline", () => {
  afterEach(() => {
    vi.doUnmock("@huggingface/transformers");
    vi.resetModules();
  });

  it("invokes the @huggingface/transformers pipeline and reorders by score", async () => {
    const mockPipeline = vi.fn(async (text: string) => [
      { score: text.includes("First") ? 0.9 : 0.1 },
    ]);
    vi.doMock("@huggingface/transformers", () => ({
      pipeline: () => Promise.resolve(mockPipeline),
    }));
    vi.resetModules();

    const { rerank } = await import("../src/state/reranker.js");

    const results = [
      { observation: { id: "o2", title: "Second", narrative: "" }, combinedScore: 0.9 },
      { observation: { id: "o1", title: "First", narrative: "" }, combinedScore: 0.5 },
    ] as any;

    const reranked = await rerank("query", results);

    expect(mockPipeline).toHaveBeenCalled();
    expect(reranked[0].observation.id).toBe("o1");
  });
});

describe("reranker with OpenRouter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const results = [
    { observation: { id: "o1", title: "First", narrative: "one" }, combinedScore: 0.5 },
    { observation: { id: "o2", title: "Second", narrative: "two" }, combinedScore: 0.4 },
  ] as any;

  it("uses the configured model and key and reorders by response indexes", async () => {
    vi.stubEnv("RERANK_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "rerank-key");
    vi.stubEnv("OPENAI_API_KEY", "different-openai-key");
    vi.stubEnv("OPENROUTER_RERANK_MODEL", "custom/rerank");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 1, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.2 },
        ],
      }),
    } as Response);

    const reranked = await rerank("query", results);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/rerank",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer rerank-key" }),
        body: expect.stringContaining('"model":"custom/rerank"'),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.query).toBe("query");
    expect(body.documents).toEqual(["First one", "Second two"]);
    expect(body.top_n).toBe(2);
    expect(isRerankerAvailable()).toBe(false);
    expect(reranked.map((item) => item.observation.id)).toEqual(["o2", "o1"]);
    expect(reranked[0].combinedScore).toBe(0.9);
  });

  it("throws for invalid response and HTTP errors", async () => {
    vi.stubEnv("RERANK_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "rerank-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ index: 0, relevance_score: 0.9 }, { index: 0, relevance_score: 0.1 }] }),
    } as Response);
    await expect(rerank("query", results)).rejects.toThrow("Invalid OpenRouter rerank response");

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    } as Response);
    await expect(rerank("query", results)).rejects.toThrow("OpenRouter rerank failed (502)");
  });
});
