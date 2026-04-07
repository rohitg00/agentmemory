import type { HybridSearchResult } from "../types.js";

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
  return pipeline !== null;
}
