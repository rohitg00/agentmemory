import { SearchIndex } from "./search-index.js";
import { VectorIndex } from "./vector-index.js";
import type {
  EmbeddingProvider,
  HybridSearchResult,
  CompressedObservation,
} from "../types.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";

const RRF_K = 60;

export class HybridSearch {
  constructor(
    private bm25: SearchIndex,
    private vector: VectorIndex | null,
    private embeddingProvider: EmbeddingProvider | null,
    private kv: StateKV,
    private bm25Weight = 0.4,
    private vectorWeight = 0.6,
  ) {}

  async search(query: string, limit = 20): Promise<HybridSearchResult[]> {
    const bm25Results = this.bm25.search(query, limit * 2);

    if (!this.vector || !this.embeddingProvider || this.vector.size === 0) {
      return this.enrichResults(
        bm25Results.map((r) => ({
          obsId: r.obsId,
          sessionId: r.sessionId,
          bm25Score: r.score,
          vectorScore: 0,
          combinedScore: r.score,
        })),
        limit,
      );
    }

    let queryEmbedding: Float32Array;
    try {
      queryEmbedding = await this.embeddingProvider.embed(query);
    } catch {
      return this.enrichResults(
        bm25Results.map((r) => ({
          obsId: r.obsId,
          sessionId: r.sessionId,
          bm25Score: r.score,
          vectorScore: 0,
          combinedScore: r.score,
        })),
        limit,
      );
    }
    const vectorResults = this.vector.search(queryEmbedding, limit * 2);

    const scores = new Map<
      string,
      {
        bm25Rank: number;
        vectorRank: number;
        sessionId: string;
        bm25Score: number;
        vectorScore: number;
      }
    >();

    bm25Results.forEach((r, i) => {
      scores.set(r.obsId, {
        bm25Rank: i + 1,
        vectorRank: Infinity,
        sessionId: r.sessionId,
        bm25Score: r.score,
        vectorScore: 0,
      });
    });

    vectorResults.forEach((r, i) => {
      const existing = scores.get(r.obsId);
      if (existing) {
        existing.vectorRank = i + 1;
        existing.vectorScore = r.score;
      } else {
        scores.set(r.obsId, {
          bm25Rank: Infinity,
          vectorRank: i + 1,
          sessionId: r.sessionId,
          bm25Score: 0,
          vectorScore: r.score,
        });
      }
    });

    const combined = Array.from(scores.entries()).map(([obsId, s]) => ({
      obsId,
      sessionId: s.sessionId,
      bm25Score: s.bm25Score,
      vectorScore: s.vectorScore,
      combinedScore:
        this.bm25Weight * (1 / (RRF_K + s.bm25Rank)) +
        this.vectorWeight * (1 / (RRF_K + s.vectorRank)),
    }));

    combined.sort((a, b) => b.combinedScore - a.combinedScore);
    return this.enrichResults(combined.slice(0, limit), limit);
  }

  private async enrichResults(
    results: Array<{
      obsId: string;
      sessionId: string;
      bm25Score: number;
      vectorScore: number;
      combinedScore: number;
    }>,
    limit: number,
  ): Promise<HybridSearchResult[]> {
    const enriched: HybridSearchResult[] = [];
    for (const r of results.slice(0, limit)) {
      const obs = await this.kv.get<CompressedObservation>(
        KV.observations(r.sessionId),
        r.obsId,
      );
      if (obs) {
        enriched.push({ observation: obs, ...r });
      }
    }
    return enriched;
  }
}
