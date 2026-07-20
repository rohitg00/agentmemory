import type { HybridSearchResult } from "../types.js";
import { logger } from "../logger.js";

let pipeline: any = null;
let pipelineLoading: Promise<any> | null = null;
let pipelineUnavailable = false;

async function rerankExternal(
  query: string,
  results: HybridSearchResult[],
  topK: number,
): Promise<HybridSearchResult[] | null> {
  const baseUrl = process.env.RERANK_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;
  const openaiBaseUrl = (
    process.env.OPENAI_BASE_URL || "https://api.openai.com"
  ).replace(/\/+$/, "");
  const apiKey =
    process.env.RERANK_API_KEY ||
    (baseUrl === openaiBaseUrl ? process.env.OPENAI_API_KEY : undefined);
  const configuredTimeout = Number(process.env.RERANK_TIMEOUT_MS);
  const timeout =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 30_000;

  const candidates = results.slice(0, Math.min(results.length, topK));
  try {
    const response = await fetch(`${baseUrl}/rerank`, {
      method: "POST",
      headers: {
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.RERANK_MODEL || "bge-reranker-v2-m3",
        query,
        documents: candidates.map(
          (result) =>
            `${result.observation.title || ""} ${result.observation.narrative || ""}`,
        ),
        top_n: candidates.length,
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      logger.warn("External reranker request failed", {
        status: response.status,
      });
      return results;
    }
    const payload = (await response.json()) as {
      results?: Array<{
        index: number;
        relevance_score?: number;
        score?: number;
      }>;
    };
    const providerResults = payload.results;
    const seen = new Set<number>();
    const valid =
      Array.isArray(providerResults) &&
      providerResults.length > 0 &&
      providerResults.every((item) => {
        const score = item.relevance_score ?? item.score;
        if (
          !Number.isInteger(item.index) ||
          item.index < 0 ||
          item.index >= candidates.length ||
          seen.has(item.index) ||
          typeof score !== "number" ||
          !Number.isFinite(score)
        ) {
          return false;
        }
        seen.add(item.index);
        return true;
      });
    if (!valid) {
      logger.warn("External reranker returned invalid results", {
        resultCount: Array.isArray(providerResults)
          ? providerResults.length
          : 0,
      });
      return results;
    }
    const scores = new Map(
      providerResults.map((item) => [
        item.index,
        item.relevance_score ?? item.score ?? 0,
      ]),
    );
    return candidates
      .map((result, index) => ({
        result,
        score: scores.get(index) ?? result.combinedScore,
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ result, score }, index) => ({
        ...result,
        combinedScore: score,
        rerankPosition: index + 1,
      }));
  } catch (error) {
    logger.warn("External reranker request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return results;
  }
}

async function loadPipeline(): Promise<any> {
  if (pipelineUnavailable) return null;
  if (pipeline) return pipeline;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const { pipeline: createPipeline } = await import(
        "@xenova/transformers"
      );
      pipeline = await createPipeline(
        "text-classification",
        "Xenova/ms-marco-MiniLM-L-6-v2",
        { quantized: true },
      );
      return pipeline;
    } catch {
      pipeline = null;
      pipelineUnavailable = true;
      return null;
    } finally {
      pipelineLoading = null;
    }
  })();
  return pipelineLoading;
}

export async function rerank(
  query: string,
  results: HybridSearchResult[],
  topK = 20,
): Promise<HybridSearchResult[]> {
  if (results.length <= 1) return results;

  const external = await rerankExternal(query, results, topK);
  if (external) return external;

  const reranker = await loadPipeline();
  if (!reranker) return results;

  const candidates = results.slice(0, Math.min(results.length, topK));

  const pairs = candidates.map((r) => ({
    text: `${query} [SEP] ${r.observation.title || ""} ${r.observation.narrative || ""}`.slice(0, 512),
    result: r,
  }));

  const scores: Array<{ result: HybridSearchResult; rerankScore: number }> = [];

  for (const pair of pairs) {
    try {
      const output = await reranker(pair.text);
      const score = Array.isArray(output) ? output[0]?.score ?? 0 : 0;
      scores.push({ result: pair.result, rerankScore: score });
    } catch {
      scores.push({ result: pair.result, rerankScore: pair.result.combinedScore });
    }
  }

  scores.sort((a, b) => b.rerankScore - a.rerankScore);

  return scores.map((s, i) => ({
    ...s.result,
    combinedScore: s.rerankScore,
    rerankPosition: i + 1,
  }));
}

export function isRerankerAvailable(): boolean {
  return Boolean(process.env.RERANK_BASE_URL || pipeline);
}
