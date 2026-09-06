import type { HybridSearchResult } from "../types.js";
import { getEnvVar } from "../config.js";
import { fetchWithTimeout } from "../providers/_fetch.js";

let pipeline: any = null;
let pipelineLoading: Promise<any> | null = null;
let pipelineUnavailable = false;

async function loadPipeline(): Promise<any> {
  if (pipelineUnavailable) return null;
  if (pipeline) return pipeline;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const { pipeline: createPipeline } = await import(
        "@huggingface/transformers"
      );
      pipeline = await createPipeline(
        "text-classification",
        "Xenova/ms-marco-MiniLM-L-6-v2",
        { dtype: "q8" },
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

  const candidates = results.slice(0, Math.min(results.length, topK));

  if (getEnvVar("RERANK_PROVIDER") === "openrouter") {
    return rerankWithOpenRouter(query, candidates);
  }

  const reranker = await loadPipeline();
  if (!reranker) return results;

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

async function rerankWithOpenRouter(
  query: string,
  candidates: HybridSearchResult[],
): Promise<HybridSearchResult[]> {
  const apiKey = getEnvVar("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for reranking");

  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getEnvVar("OPENROUTER_RERANK_MODEL") || "cohere/rerank-v3.5",
      query,
      documents: candidates.map(
        (candidate) =>
          `${candidate.observation.title || ""} ${candidate.observation.narrative || ""}`.trim(),
      ),
      top_n: candidates.length,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter rerank failed (${response.status})`);
  }

  const data = (await response.json()) as {
    results?: Array<{ index?: unknown; relevance_score?: unknown }>;
  };
  const ranked = data.results;
  if (!Array.isArray(ranked) || ranked.length !== candidates.length) {
    throw new Error("Invalid OpenRouter rerank response");
  }

  const seen = new Set<number>();
  const scores = ranked.map((item) => {
    const index = item.index;
    const score = item.relevance_score;
    if (
      !Number.isInteger(index) ||
      (index as number) < 0 ||
      (index as number) >= candidates.length ||
      seen.has(index as number) ||
      typeof score !== "number" ||
      !Number.isFinite(score)
    ) {
      throw new Error("Invalid OpenRouter rerank response");
    }
    seen.add(index as number);
    return { index: index as number, score };
  });

  return scores.map(({ index, score }, position) => ({
    ...candidates[index],
    combinedScore: score,
    rerankPosition: position + 1,
  }));
}

export function isRerankerAvailable(): boolean {
  return pipeline !== null;
}
