import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@xenova/transformers", () => {
  throw new Error("not installed");
});

import { rerank, isRerankerAvailable } from "../src/state/reranker.js";
import { logger } from "../src/logger.js";
import type { HybridSearchResult } from "../src/types.js";

function makeResult(
  id: string,
  title: string,
  narrative: string,
  combinedScore: number,
): HybridSearchResult {
  return {
    observation: {
      id,
      sessionId: "s1",
      timestamp: "2026-07-19T00:00:00Z",
      type: "decision",
      title,
      facts: [],
      narrative,
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

describe("reranker", () => {
  const resetEnvironment = () => {
    delete process.env.RERANK_BASE_URL;
    delete process.env.RERANK_API_KEY;
    delete process.env.RERANK_MODEL;
    delete process.env.RERANK_TIMEOUT_MS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  };

  beforeEach(resetEnvironment);

  afterEach(() => {
    resetEnvironment();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns results unchanged when @xenova/transformers is unavailable", async () => {
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    const reranked = await rerank("test query", results);
    expect(reranked).toEqual(results);
  });

  it("isRerankerAvailable returns false when not loaded", () => {
    expect(isRerankerAvailable()).toBe(false);
  });

  it("handles single result gracefully", async () => {
    const results = [makeResult("o1", "Only", "", 1)];

    const reranked = await rerank("query", results);
    expect(reranked).toHaveLength(1);
  });

  it("handles empty results", async () => {
    const reranked = await rerank("query", []);
    expect(reranked).toHaveLength(0);
  });

  it("uses an OpenAI-compatible external rerank endpoint when configured", async () => {
    process.env.RERANK_BASE_URL = "http://reranker.test";
    process.env.RERANK_API_KEY = "test-key";
    process.env.RERANK_MODEL = "bge-reranker-v2-m3";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    const reranked = await rerank("test query", results);

    expect(reranked.map((result) => result.observation.id)).toEqual(["o2", "o1"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://reranker.test/rerank",
      expect.objectContaining({ method: "POST" }),
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
  });

  it("supports local external rerank endpoints without an API key", async () => {
    process.env.RERANK_BASE_URL = "http://reranker.test";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    const reranked = await rerank("test query", results);

    expect(reranked.map((result) => result.observation.id)).toEqual(["o2", "o1"]);
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("authorization");
  });

  it("does not send OPENAI_API_KEY to a different rerank endpoint", async () => {
    process.env.RERANK_BASE_URL = "https://reranker.test";
    process.env.OPENAI_BASE_URL = "https://api.openai.com";
    process.env.OPENAI_API_KEY = "openai-secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    await rerank("test query", results);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("authorization");
  });

  it("uses OPENAI_API_KEY when the rerank endpoint matches OPENAI_BASE_URL", async () => {
    process.env.RERANK_BASE_URL = "https://api.openai.com/";
    process.env.OPENAI_BASE_URL = "https://api.openai.com";
    process.env.OPENAI_API_KEY = "openai-secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    await rerank("test query", results);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer openai-secret");
  });

  it.each([undefined, "invalid", "0", "-1", "Infinity"])(
    "defaults invalid timeout %s to 30 seconds",
    async (timeout) => {
      process.env.RERANK_BASE_URL = "http://reranker.test";
      if (timeout !== undefined) process.env.RERANK_TIMEOUT_MS = timeout;
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(new AbortController().signal);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
      );
      const results = [
        makeResult("o1", "First", "First result", 0.8),
        makeResult("o2", "Second", "Second result", 0.5),
      ];

      await rerank("test query", results);

      expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    },
  );

  it("fails open and logs non-successful external responses", async () => {
    process.env.RERANK_BASE_URL = "http://reranker.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    expect(await rerank("test query", results)).toEqual(results);
    expect(warn).toHaveBeenCalledWith(
      "External reranker request failed",
      expect.objectContaining({ status: 503 }),
    );
  });

  it("fails open and logs malformed external responses", async () => {
    process.env.RERANK_BASE_URL = "http://reranker.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    expect(await rerank("test query", results)).toEqual(results);
    expect(warn).toHaveBeenCalledWith(
      "External reranker request failed",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("fails open and logs timeout or network errors", async () => {
    process.env.RERANK_BASE_URL = "http://reranker.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    expect(await rerank("test query", results)).toEqual(results);
    expect(warn).toHaveBeenCalledWith(
      "External reranker request failed",
      expect.objectContaining({ error: "timed out" }),
    );
  });

  it.each([
    {
      name: "out-of-range",
      providerResults: [{ index: 7, relevance_score: 0.9 }],
    },
    {
      name: "duplicate",
      providerResults: [
        { index: 0, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.1 },
      ],
    },
  ])("fails open for $name result indices", async ({ providerResults }) => {
    process.env.RERANK_BASE_URL = "http://reranker.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: providerResults }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const results = [
      makeResult("o1", "First", "First result", 0.8),
      makeResult("o2", "Second", "Second result", 0.5),
    ];

    expect(await rerank("test query", results)).toEqual(results);
    expect(warn).toHaveBeenCalledWith(
      "External reranker returned invalid results",
      expect.any(Object),
    );
  });
});
