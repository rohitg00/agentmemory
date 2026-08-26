import { SearchIndex } from "./search-index.js";
import { VectorIndex } from "./vector-index.js";
import type {
  EmbeddingProvider,
  HybridSearchResult,
  CompressedObservation,
  Memory,
  QueryExpansion,
} from "../types.js";
import { memoryToObservation } from "./memory-utils.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import {
  GraphRetrieval,
  type GraphRetrievalResult,
} from "../functions/graph-retrieval.js";
import { extractEntitiesFromQuery } from "../functions/query-expansion.js";
import { rerank } from "./reranker.js";

const RRF_K = 60;

export class HybridSearch {
  private graphRetrieval: GraphRetrieval;

  constructor(
    private bm25: SearchIndex,
    private vector: VectorIndex | null,
    private embeddingProvider: EmbeddingProvider | null,
    private kv: StateKV,
    private bm25Weight = 0.4,
    private vectorWeight = 0.6,
    private graphWeight = 0.3,
    private rerankEnabled = process.env.RERANK_ENABLED === "true",
  ) {
    this.graphRetrieval = new GraphRetrieval(kv);
  }

  async search(query: string, limit = 20): Promise<HybridSearchResult[]> {
    return this.tripleStreamSearch(query, limit);
  }

  async searchWithExpansion(
    query: string,
    limit: number,
    expansion: QueryExpansion,
  ): Promise<HybridSearchResult[]> {
    const allQueries = [
      query,
      ...expansion.reformulations,
      ...expansion.temporalConcretizations,
    ];

    const allEntities = [
      ...expansion.entityExtractions,
      ...extractEntitiesFromQuery(query),
    ];

    const resultSets = await Promise.all(
      allQueries.map((q) => this.tripleStreamSearch(q, limit, allEntities)),
    );

    const merged = new Map<string, HybridSearchResult>();
    for (const results of resultSets) {
      for (const r of results) {
        const existing = merged.get(r.observation.id);
        if (!existing || r.combinedScore > existing.combinedScore) {
          merged.set(r.observation.id, r);
        }
      }
    }

    return Array.from(merged.values())
      .sort(
        (a, b) =>
          b.combinedScore - a.combinedScore ||
          (a.obsId < b.obsId ? -1 : a.obsId > b.obsId ? 1 : 0),
      )
      .slice(0, limit);
  }

  private async tripleStreamSearch(
    query: string,
    limit: number,
    entityHints?: string[],
  ): Promise<HybridSearchResult[]> {
    const bm25Results = this.bm25.search(query, limit * 2);

    let vectorResults: Array<{
      obsId: string;
      sessionId: string;
      score: number;
    }> = [];
    let queryEmbedding: Float32Array | null = null;

    if (this.vector && this.embeddingProvider && this.vector.size > 0) {
      try {
        queryEmbedding = await this.embeddingProvider.embed(query);
        vectorResults = this.vector.search(queryEmbedding, limit * 2);
      } catch {
        // fall through to BM25-only
      }
    }

    const entities =
      entityHints && entityHints.length > 0
        ? entityHints
        : extractEntitiesFromQuery(query);
    let graphResults: GraphRetrievalResult[] = [];
    if (entities.length > 0) {
      try {
        graphResults = await this.graphRetrieval.searchByEntities(
          entities,
          2,
          limit,
        );
      } catch {
        // graph search is best-effort
      }
    }

    const topVectorObs = vectorResults.slice(0, 5).map((r) => r.obsId);
    if (topVectorObs.length > 0) {
      try {
        const expansionResults =
          await this.graphRetrieval.expandFromChunks(topVectorObs, 1, 5);
        graphResults = [...graphResults, ...expansionResults];
      } catch {
        // expansion is best-effort
      }
    }

    const scores = new Map<
      string,
      {
        bm25Rank: number;
        vectorRank: number;
        graphRank: number;
        sessionId: string;
        bm25Score: number;
        vectorScore: number;
        graphScore: number;
        graphContext?: string;
      }
    >();

    bm25Results.forEach((r, i) => {
      scores.set(r.obsId, {
        bm25Rank: i + 1,
        vectorRank: Infinity,
        graphRank: Infinity,
        sessionId: r.sessionId,
        bm25Score: r.score,
        vectorScore: 0,
        graphScore: 0,
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
          graphRank: Infinity,
          sessionId: r.sessionId,
          bm25Score: 0,
          vectorScore: r.score,
          graphScore: 0,
        });
      }
    });

    graphResults.forEach((r, i) => {
      const existing = scores.get(r.obsId);
      if (existing) {
        existing.graphRank = Math.min(existing.graphRank, i + 1);
        existing.graphScore = Math.max(existing.graphScore, r.score);
        if (r.graphContext && !existing.graphContext) {
          existing.graphContext = r.graphContext;
        }
      } else {
        scores.set(r.obsId, {
          bm25Rank: Infinity,
          vectorRank: Infinity,
          graphRank: i + 1,
          sessionId: r.sessionId,
          bm25Score: 0,
          vectorScore: 0,
          graphScore: r.score,
          graphContext: r.graphContext,
        });
      }
    });

    // Normalize once per query by the best attainable weighted score over
    // the streams that produced results, so configured stream weights
    // survive for single-stream hits and a silent stream carries no penalty.
    const AGREEMENT_BONUS = 0.05;
    const activeWeight =
      (bm25Results.length > 0 ? this.bm25Weight : 0) +
      (vectorResults.length > 0 ? this.vectorWeight : 0) +
      (graphResults.length > 0 ? this.graphWeight : 0);
    const maxAttainable = activeWeight * (1 / (RRF_K + 1));
    const ranked = Array.from(scores.entries()).map(([obsId, s]) => {
      const wB = Number.isFinite(s.bm25Rank) ? this.bm25Weight : 0;
      const wV = Number.isFinite(s.vectorRank) ? this.vectorWeight : 0;
      const wG = Number.isFinite(s.graphRank) ? this.graphWeight : 0;
      const matchedStreams =
        (wB > 0 ? 1 : 0) + (wV > 0 ? 1 : 0) + (wG > 0 ? 1 : 0);
      const weighted =
        wB * (1 / (RRF_K + s.bm25Rank)) +
        wV * (1 / (RRF_K + s.vectorRank)) +
        wG * (1 / (RRF_K + s.graphRank));
      const rrf = maxAttainable > 0 ? weighted / maxAttainable : 0;
      return {
        obsId,
        s,
        combinedScore: rrf * (1 + AGREEMENT_BONUS * (matchedStreams - 1)),
        minRank: Math.min(s.bm25Rank, s.vectorRank, s.graphRank),
      };
    });

    ranked.sort(
      (a, b) =>
        b.combinedScore - a.combinedScore ||
        a.minRank - b.minRank ||
        (a.obsId < b.obsId ? -1 : a.obsId > b.obsId ? 1 : 0),
    );
    const combined = ranked.map(({ obsId, s, combinedScore }) => ({
      obsId,
      sessionId: s.sessionId,
      bm25Score: s.bm25Score,
      vectorScore: s.vectorScore,
      graphScore: s.graphScore,
      graphContext: s.graphContext,
      combinedScore,
    }));

    const retrievalDepth = Math.max(limit, 20);
    const rerankWindow = 20;
    const diversified = this.diversifyBySession(combined, retrievalDepth);
    const enriched = await this.enrichResults(diversified, retrievalDepth);

    if (this.rerankEnabled && enriched.length > 1) {
      try {
        const head = enriched.slice(0, rerankWindow);
        const tail = enriched.slice(rerankWindow);
        const reranked = await rerank(query, head, rerankWindow);
        return reranked.concat(tail).slice(0, limit);
      } catch {
        return enriched.slice(0, limit);
      }
    }

    return enriched.slice(0, limit);
  }

  private diversifyBySession(
    results: Array<{
      obsId: string;
      sessionId: string;
      bm25Score: number;
      vectorScore: number;
      graphScore: number;
      combinedScore: number;
      graphContext?: string;
    }>,
    limit: number,
    maxPerSession = 3,
  ): typeof results {
    const selected: typeof results = [];
    const sessionCounts = new Map<string, number>();

    for (const r of results) {
      const count = sessionCounts.get(r.sessionId) || 0;
      if (count >= maxPerSession) continue;
      selected.push(r);
      sessionCounts.set(r.sessionId, count + 1);
      if (selected.length >= limit) break;
    }

    if (selected.length < limit) {
      for (const r of results) {
        if (selected.length >= limit) break;
        if (!selected.some(s => s.obsId === r.obsId)) {
          selected.push(r);
        }
      }
    }

    return selected;
  }

  private async enrichResults(
    results: Array<{
      obsId: string;
      sessionId: string;
      bm25Score: number;
      vectorScore: number;
      graphScore: number;
      combinedScore: number;
      graphContext?: string;
    }>,
    limit: number,
  ): Promise<HybridSearchResult[]> {
    const sliced = results.slice(0, limit);
    const observations = await Promise.all(
      sliced.map(async (r) => {
        const obs = await this.kv
          .get<CompressedObservation>(KV.observations(r.sessionId), r.obsId)
          .catch(() => null);
        if (obs) return obs;
        // Fallback: indexed entry may originate from mem::remember, which
        // writes to KV.memories with a synthetic sessionId ("memory" or the
        // memory's first associated session). Coerce the Memory record into
        // a CompressedObservation so search/recall surface saved memories.
        const mem = await this.kv
          .get<Memory>(KV.memories, r.obsId)
          .catch(() => null);
        return mem ? memoryToObservation(mem) : null;
      }),
    );
    const enriched: HybridSearchResult[] = [];
    for (let i = 0; i < sliced.length; i++) {
      const obs = observations[i];
      if (obs) {
        enriched.push({
          observation: obs,
          bm25Score: sliced[i].bm25Score,
          vectorScore: sliced[i].vectorScore,
          graphScore: sliced[i].graphScore,
          combinedScore: sliced[i].combinedScore,
          sessionId: sliced[i].sessionId,
          graphContext: sliced[i].graphContext,
        });
      }
    }
    return enriched;
  }
}
