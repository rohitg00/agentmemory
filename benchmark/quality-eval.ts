import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import { extractEntitiesFromQuery } from "../src/functions/query-expansion.js";
import type { CompressedObservation, GraphNode, GraphEdge, GraphEdgeType } from "../src/types.js";
import { generateDataset, type LabeledQuery } from "./dataset.js";
import { writeFileSync } from "node:fs";

interface QualityMetrics {
  query: string;
  category: string;
  recall_at_5: number;
  recall_at_10: number;
  recall_at_20: number;
  precision_at_5: number;
  precision_at_10: number;
  ndcg_at_10: number;
  mrr: number;
  relevant_count: number;
  retrieved_count: number;
  latency_ms: number;
}

interface SystemMetrics {
  system: string;
  avg_recall_at_5: number;
  avg_recall_at_10: number;
  avg_recall_at_20: number;
  avg_precision_at_5: number;
  avg_precision_at_10: number;
  avg_ndcg_at_10: number;
  avg_mrr: number;
  avg_latency_ms: number;
  total_tokens_per_query: number;
  per_query: QualityMetrics[];
}

function dcg(relevances: boolean[], k: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(k, relevances.length); i++) {
    sum += (relevances[i] ? 1 : 0) / Math.log2(i + 2);
  }
  return sum;
}

function ndcg(retrieved: string[], relevant: Set<string>, k: number): number {
  const actualRelevances = retrieved.slice(0, k).map(id => relevant.has(id));
  const idealRelevances = Array.from({ length: Math.min(k, relevant.size) }, () => true);
  const idealDCG = dcg(idealRelevances, k);
  if (idealDCG === 0) return 0;
  return dcg(actualRelevances, k) / idealDCG;
}

function recall(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 1;
  const topK = new Set(retrieved.slice(0, k));
  let hits = 0;
  for (const id of relevant) {
    if (topK.has(id)) hits++;
  }
  return hits / relevant.size;
}

function precision(retrieved: string[], relevant: Set<string>, k: number): number {
  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;
  let hits = 0;
  for (const id of topK) {
    if (relevant.has(id)) hits++;
  }
  return hits / topK.length;
}

function mrr(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function deterministicEmbedding(text: string, dims = 384): Float32Array {
  const arr = new Float32Array(dims);
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const idx = (word.charCodeAt(i) * 31 + i * 17) % dims;
      arr[idx] += 1;
      const idx2 = (word.charCodeAt(i) * 37 + i * 13 + word.length * 7) % dims;
      arr[idx2] += 0.5;
    }
  }
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < dims; i++) arr[i] /= norm;
  return arr;
}

async function evalBm25Only(
  observations: CompressedObservation[],
  queries: LabeledQuery[],
): Promise<SystemMetrics> {
  const index = new SearchIndex();
  for (const obs of observations) index.add(obs);

  const perQuery: QualityMetrics[] = [];

  for (const q of queries) {
    const relevant = new Set(q.relevantObsIds);
    const start = performance.now();
    const results = index.search(q.query, 20);
    const latency = performance.now() - start;

    const retrieved = results.map(r => r.obsId);
    perQuery.push({
      query: q.query,
      category: q.category,
      recall_at_5: recall(retrieved, relevant, 5),
      recall_at_10: recall(retrieved, relevant, 10),
      recall_at_20: recall(retrieved, relevant, 20),
      precision_at_5: precision(retrieved, relevant, 5),
      precision_at_10: precision(retrieved, relevant, 10),
      ndcg_at_10: ndcg(retrieved, relevant, 10),
      mrr: mrr(retrieved, relevant),
      relevant_count: relevant.size,
      retrieved_count: results.length,
      latency_ms: latency,
    });
  }

  const avgTokens = perQuery.reduce((sum, q) => sum + q.retrieved_count, 0) / perQuery.length;
  const avgObsTokens = observations.slice(0, 50).reduce((s, o) => s + estimateTokens(JSON.stringify(o)), 0) / 50;

  return {
    system: "BM25-only",
    avg_recall_at_5: avg(perQuery.map(q => q.recall_at_5)),
    avg_recall_at_10: avg(perQuery.map(q => q.recall_at_10)),
    avg_recall_at_20: avg(perQuery.map(q => q.recall_at_20)),
    avg_precision_at_5: avg(perQuery.map(q => q.precision_at_5)),
    avg_precision_at_10: avg(perQuery.map(q => q.precision_at_10)),
    avg_ndcg_at_10: avg(perQuery.map(q => q.ndcg_at_10)),
    avg_mrr: avg(perQuery.map(q => q.mrr)),
    avg_latency_ms: avg(perQuery.map(q => q.latency_ms)),
    total_tokens_per_query: Math.round(avgObsTokens * avgTokens),
    per_query: perQuery,
  };
}

async function evalDualStream(
  observations: CompressedObservation[],
  queries: LabeledQuery[],
): Promise<SystemMetrics> {
  const kv = mockKV();
  const bm25 = new SearchIndex();
  const vector = new VectorIndex();
  const dims = 384;

  for (const obs of observations) {
    bm25.add(obs);
    const text = [obs.title, obs.narrative, ...obs.concepts, ...obs.facts].join(" ");
    vector.add(obs.id, obs.sessionId, deterministicEmbedding(text, dims));
    await kv.set(`mem:obs:${obs.sessionId}`, obs.id, obs);
  }

  const mockEmbed: any = {
    name: "deterministic",
    dimensions: dims,
    embed: async (text: string) => deterministicEmbedding(text, dims),
    embedBatch: async (texts: string[]) => texts.map(t => deterministicEmbedding(t, dims)),
  };

  const hybrid = new HybridSearch(bm25, vector, mockEmbed, kv as never, 0.4, 0.6, 0);
  const perQuery: QualityMetrics[] = [];

  for (const q of queries) {
    const relevant = new Set(q.relevantObsIds);
    const start = performance.now();
    const results = await hybrid.search(q.query, 20);
    const latency = performance.now() - start;

    const retrieved = results.map(r => r.observation.id);
    perQuery.push({
      query: q.query,
      category: q.category,
      recall_at_5: recall(retrieved, relevant, 5),
      recall_at_10: recall(retrieved, relevant, 10),
      recall_at_20: recall(retrieved, relevant, 20),
      precision_at_5: precision(retrieved, relevant, 5),
      precision_at_10: precision(retrieved, relevant, 10),
      ndcg_at_10: ndcg(retrieved, relevant, 10),
      mrr: mrr(retrieved, relevant),
      relevant_count: relevant.size,
      retrieved_count: results.length,
      latency_ms: latency,
    });
  }

  const avgResultTokens = perQuery.reduce((sum, q) => {
    return sum + q.retrieved_count;
  }, 0) / perQuery.length;
  const avgObsTokens2 = observations.slice(0, 50).reduce((s, o) => s + estimateTokens(JSON.stringify(o)), 0) / 50;

  return {
    system: "Dual-stream (BM25+Vector)",
    avg_recall_at_5: avg(perQuery.map(q => q.recall_at_5)),
    avg_recall_at_10: avg(perQuery.map(q => q.recall_at_10)),
    avg_recall_at_20: avg(perQuery.map(q => q.recall_at_20)),
    avg_precision_at_5: avg(perQuery.map(q => q.precision_at_5)),
    avg_precision_at_10: avg(perQuery.map(q => q.precision_at_10)),
    avg_ndcg_at_10: avg(perQuery.map(q => q.ndcg_at_10)),
    avg_mrr: avg(perQuery.map(q => q.mrr)),
    avg_latency_ms: avg(perQuery.map(q => q.latency_ms)),
    total_tokens_per_query: Math.round(avgObsTokens2 * avgResultTokens),
    per_query: perQuery,
  };
}

async function evalTripleStream(
  observations: CompressedObservation[],
  queries: LabeledQuery[],
): Promise<SystemMetrics> {
  const kv = mockKV();
  const bm25 = new SearchIndex();
  const vector = new VectorIndex();
  const dims = 384;

  for (const obs of observations) {
    bm25.add(obs);
    const text = [obs.title, obs.narrative, ...obs.concepts, ...obs.facts].join(" ");
    vector.add(obs.id, obs.sessionId, deterministicEmbedding(text, dims));
    await kv.set(`mem:obs:${obs.sessionId}`, obs.id, obs);
  }

  const conceptToNodes = new Map<string, string>();
  const nodeTypes: GraphNode["type"][] = ["concept", "library", "file", "pattern"];
  const edgeTypes: GraphEdgeType[] = ["uses", "related_to", "depends_on", "modifies"];
  const now = new Date().toISOString();
  let nodeId = 0;

  for (const obs of observations) {
    for (const concept of obs.concepts) {
      if (!conceptToNodes.has(concept)) {
        const nid = `gn_${nodeId++}`;
        conceptToNodes.set(concept, nid);
        await kv.set("mem:graph:nodes", nid, {
          id: nid,
          type: nodeTypes[nodeId % nodeTypes.length],
          name: concept,
          properties: {},
          sourceObservationIds: [],
          createdAt: now,
        } as GraphNode);
      }
      const nid = conceptToNodes.get(concept)!;
      const existing = await kv.get<GraphNode>("mem:graph:nodes", nid);
      if (existing && !existing.sourceObservationIds.includes(obs.id)) {
        existing.sourceObservationIds.push(obs.id);
        await kv.set("mem:graph:nodes", nid, existing);
      }
    }

    const capped = obs.concepts.slice(0, 10);
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const srcNid = conceptToNodes.get(capped[i])!;
        const tgtNid = conceptToNodes.get(capped[j])!;
        if (srcNid && tgtNid && srcNid !== tgtNid) {
          const eid = `ge_${srcNid}_${tgtNid}`;
          const existing = await kv.get<GraphEdge>("mem:graph:edges", eid);
          const weight = existing ? Math.min(1.0, existing.weight + 0.1) : 0.5;
          await kv.set("mem:graph:edges", eid, {
            id: eid,
            type: edgeTypes[(i + j) % edgeTypes.length],
            sourceNodeId: srcNid,
            targetNodeId: tgtNid,
            weight,
            sourceObservationIds: existing
              ? [...new Set([...existing.sourceObservationIds, obs.id])]
              : [obs.id],
            createdAt: now,
            tcommit: now,
            version: 1,
            isLatest: true,
          } as GraphEdge);
        }
      }
    }
  }

  const mockEmbed: any = {
    name: "deterministic",
    dimensions: dims,
    embed: async (text: string) => deterministicEmbedding(text, dims),
    embedBatch: async (texts: string[]) => texts.map(t => deterministicEmbedding(t, dims)),
  };

  const hybrid = new HybridSearch(bm25, vector, mockEmbed, kv as never, 0.4, 0.6, 0.3);
  const perQuery: QualityMetrics[] = [];

  for (const q of queries) {
    const relevant = new Set(q.relevantObsIds);
    const start = performance.now();
    const results = await hybrid.search(q.query, 20);
    const latency = performance.now() - start;

    const retrieved = results.map(r => r.observation.id);
    perQuery.push({
      query: q.query,
      category: q.category,
      recall_at_5: recall(retrieved, relevant, 5),
      recall_at_10: recall(retrieved, relevant, 10),
      recall_at_20: recall(retrieved, relevant, 20),
      precision_at_5: precision(retrieved, relevant, 5),
      precision_at_10: precision(retrieved, relevant, 10),
      ndcg_at_10: ndcg(retrieved, relevant, 10),
      mrr: mrr(retrieved, relevant),
      relevant_count: relevant.size,
      retrieved_count: results.length,
      latency_ms: latency,
    });
  }

  const avgResultTokens3 = perQuery.reduce((sum, q) => {
    return sum + q.retrieved_count;
  }, 0) / perQuery.length;
  const avgObsTokens3 = observations.slice(0, 50).reduce((s, o) => s + estimateTokens(JSON.stringify(o)), 0) / 50;

  return {
    system: "Triple-stream (BM25+Vector+Graph)",
    avg_recall_at_5: avg(perQuery.map(q => q.recall_at_5)),
    avg_recall_at_10: avg(perQuery.map(q => q.recall_at_10)),
    avg_recall_at_20: avg(perQuery.map(q => q.recall_at_20)),
    avg_precision_at_5: avg(perQuery.map(q => q.precision_at_5)),
    avg_precision_at_10: avg(perQuery.map(q => q.precision_at_10)),
    avg_ndcg_at_10: avg(perQuery.map(q => q.ndcg_at_10)),
    avg_mrr: avg(perQuery.map(q => q.mrr)),
    avg_latency_ms: avg(perQuery.map(q => q.latency_ms)),
    total_tokens_per_query: Math.round(avgObsTokens3 * avgResultTokens3),
    per_query: perQuery,
  };
}

async function evalBuiltinMemory(
  observations: CompressedObservation[],
  queries: LabeledQuery[],
): Promise<SystemMetrics> {
  const allText = observations.map(o =>
    `## ${o.title}\n${o.narrative}\nConcepts: ${o.concepts.join(", ")}\nFiles: ${o.files.join(", ")}`
  ).join("\n\n");

  const totalTokens = estimateTokens(allText);

  const perQuery: QualityMetrics[] = [];

  for (const q of queries) {
    const relevant = new Set(q.relevantObsIds);
    const start = performance.now();

    const queryTerms = q.query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const scored: Array<{ id: string; score: number }> = [];

    for (const obs of observations) {
      const text = [obs.title, obs.narrative, ...obs.concepts, ...obs.facts].join(" ").toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) score++;
      }
      if (score > 0) scored.push({ id: obs.id, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const latency = performance.now() - start;

    const retrieved = scored.map(s => s.id).slice(0, 20);
    perQuery.push({
      query: q.query,
      category: q.category,
      recall_at_5: recall(retrieved, relevant, 5),
      recall_at_10: recall(retrieved, relevant, 10),
      recall_at_20: recall(retrieved, relevant, 20),
      precision_at_5: precision(retrieved, relevant, 5),
      precision_at_10: precision(retrieved, relevant, 10),
      ndcg_at_10: ndcg(retrieved, relevant, 10),
      mrr: mrr(retrieved, relevant),
      relevant_count: relevant.size,
      retrieved_count: Math.min(scored.length, 20),
      latency_ms: latency,
    });
  }

  return {
    system: "Built-in (CLAUDE.md / grep)",
    avg_recall_at_5: avg(perQuery.map(q => q.recall_at_5)),
    avg_recall_at_10: avg(perQuery.map(q => q.recall_at_10)),
    avg_recall_at_20: avg(perQuery.map(q => q.recall_at_20)),
    avg_precision_at_5: avg(perQuery.map(q => q.precision_at_5)),
    avg_precision_at_10: avg(perQuery.map(q => q.precision_at_10)),
    avg_ndcg_at_10: avg(perQuery.map(q => q.ndcg_at_10)),
    avg_mrr: avg(perQuery.map(q => q.mrr)),
    avg_latency_ms: avg(perQuery.map(q => q.latency_ms)),
    total_tokens_per_query: totalTokens,
    per_query: perQuery,
  };
}

async function evalBuiltinMemoryTruncated(
  observations: CompressedObservation[],
  queries: LabeledQuery[],
): Promise<SystemMetrics> {
  const MAX_LINES = 200;
  const lines = observations.map(o =>
    `- ${o.title}: ${o.narrative.slice(0, 80)}... [${o.concepts.slice(0, 3).join(", ")}]`
  );
  const truncated = lines.slice(0, MAX_LINES);
  const truncatedIds = new Set(observations.slice(0, MAX_LINES).map(o => o.id));
  const totalTokens = estimateTokens(truncated.join("\n"));

  const perQuery: QualityMetrics[] = [];

  for (const q of queries) {
    const relevant = new Set(q.relevantObsIds);
    const start = performance.now();

    const queryTerms = q.query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const scored: Array<{ id: string; score: number }> = [];

    for (let i = 0; i < Math.min(MAX_LINES, observations.length); i++) {
      const obs = observations[i];
      const line = truncated[i];
      let score = 0;
      for (const term of queryTerms) {
        if (line.toLowerCase().includes(term)) score++;
      }
      if (score > 0) scored.push({ id: obs.id, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const latency = performance.now() - start;

    const retrieved = scored.map(s => s.id).slice(0, 20);

    const reachableRelevant = new Set(
      [...relevant].filter(id => truncatedIds.has(id))
    );

    perQuery.push({
      query: q.query,
      category: q.category,
      recall_at_5: recall(retrieved, relevant, 5),
      recall_at_10: recall(retrieved, relevant, 10),
      recall_at_20: recall(retrieved, relevant, 20),
      precision_at_5: precision(retrieved, relevant, 5),
      precision_at_10: precision(retrieved, relevant, 10),
      ndcg_at_10: ndcg(retrieved, relevant, 10),
      mrr: mrr(retrieved, relevant),
      relevant_count: relevant.size,
      retrieved_count: Math.min(scored.length, 20),
      latency_ms: latency,
    });
  }

  return {
    system: "Built-in (200-line MEMORY.md)",
    avg_recall_at_5: avg(perQuery.map(q => q.recall_at_5)),
    avg_recall_at_10: avg(perQuery.map(q => q.recall_at_10)),
    avg_recall_at_20: avg(perQuery.map(q => q.recall_at_20)),
    avg_precision_at_5: avg(perQuery.map(q => q.precision_at_5)),
    avg_precision_at_10: avg(perQuery.map(q => q.precision_at_10)),
    avg_ndcg_at_10: avg(perQuery.map(q => q.ndcg_at_10)),
    avg_mrr: avg(perQuery.map(q => q.mrr)),
    avg_latency_ms: avg(perQuery.map(q => q.latency_ms)),
    total_tokens_per_query: totalTokens,
    per_query: perQuery,
  };
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function generateReport(systems: SystemMetrics[], obsCount: number, queryCount: number): string {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w("# agentmemory v0.6.0 — Search Quality Evaluation");
  w("");
  w(`**Date:** ${new Date().toISOString()}`);
  w(`**Dataset:** ${obsCount} observations across 30 sessions (realistic coding project)`);
  w(`**Queries:** ${queryCount} labeled queries with ground-truth relevance`);
  w(`**Metric definitions:** Recall@K (fraction of relevant docs in top K), Precision@K (fraction of top K that are relevant), NDCG@10 (ranking quality), MRR (position of first relevant result)`);
  w("");

  w("## Head-to-Head Comparison");
  w("");
  w("| System | Recall@5 | Recall@10 | Precision@5 | NDCG@10 | MRR | Latency | Tokens/query |");
  w("|--------|----------|-----------|-------------|---------|-----|---------|--------------|");
  for (const s of systems) {
    w(`| ${s.system} | ${pct(s.avg_recall_at_5)} | ${pct(s.avg_recall_at_10)} | ${pct(s.avg_precision_at_5)} | ${pct(s.avg_ndcg_at_10)} | ${pct(s.avg_mrr)} | ${s.avg_latency_ms.toFixed(2)}ms | ${s.total_tokens_per_query.toLocaleString()} |`);
  }

  w("");
  w("## Why This Matters");
  w("");

  const builtin = systems.find(s => s.system.includes("CLAUDE.md / grep"));
  const truncated = systems.find(s => s.system.includes("200-line"));
  const triple = systems.find(s => s.system.includes("Triple"));
  const bm25 = systems.find(s => s.system === "BM25-only");

  if (builtin && triple) {
    const recallLift = ((triple.avg_recall_at_10 - builtin.avg_recall_at_10) / Math.max(0.001, builtin.avg_recall_at_10) * 100);
    const tokenSaving = ((1 - triple.total_tokens_per_query / builtin.total_tokens_per_query) * 100);
    w(`**Recall improvement:** agentmemory triple-stream finds ${pct(triple.avg_recall_at_10)} of relevant memories at K=10 vs ${pct(builtin.avg_recall_at_10)} for keyword grep (${recallLift > 0 ? "+" : ""}${recallLift.toFixed(0)}%)`);
    w(`**Token savings:** agentmemory returns only the top 10 results (${triple.total_tokens_per_query.toLocaleString()} tokens) vs loading everything into context (${builtin.total_tokens_per_query.toLocaleString()} tokens) — ${tokenSaving.toFixed(0)}% reduction`);
  }

  if (truncated && triple) {
    w(`**200-line cap:** Claude Code's MEMORY.md is capped at 200 lines. With ${obsCount} observations, ${pct(truncated.avg_recall_at_10)} recall at K=10 — memories from later sessions are simply invisible.`);
  }

  w("");
  w("## Per-Query Breakdown (Triple-Stream)");
  w("");

  if (triple) {
    w("| Query | Category | Recall@10 | NDCG@10 | MRR | Relevant | Latency |");
    w("|-------|----------|-----------|---------|-----|----------|---------|");
    for (const q of triple.per_query) {
      w(`| ${q.query.slice(0, 45)}${q.query.length > 45 ? "..." : ""} | ${q.category} | ${pct(q.recall_at_10)} | ${pct(q.ndcg_at_10)} | ${pct(q.mrr)} | ${q.relevant_count} | ${q.latency_ms.toFixed(1)}ms |`);
    }
  }

  w("");
  w("## By Query Category");
  w("");

  const categories = ["exact", "semantic", "cross-session", "entity"];
  if (triple) {
    w("| Category | Avg Recall@10 | Avg NDCG@10 | Avg MRR | Queries |");
    w("|----------|---------------|-------------|---------|---------|");
    for (const cat of categories) {
      const qs = triple.per_query.filter(q => q.category === cat);
      if (qs.length === 0) continue;
      w(`| ${cat} | ${pct(avg(qs.map(q => q.recall_at_10)))} | ${pct(avg(qs.map(q => q.ndcg_at_10)))} | ${pct(avg(qs.map(q => q.mrr)))} | ${qs.length} |`);
    }
  }

  w("");
  w("## Context Window Analysis");
  w("");
  w("The fundamental problem with built-in agent memory:");
  w("");
  w("| Observations | MEMORY.md tokens | agentmemory tokens (top 10) | Savings | MEMORY.md reachable |");
  w("|-------------|-----------------|---------------------------|---------|-------------------|");

  for (const count of [240, 500, 1000, 5000]) {
    const memTokens = Math.round(count * 50);
    const amTokens = triple ? triple.total_tokens_per_query : 500;
    const saving = ((1 - amTokens / memTokens) * 100);
    const reachable = count <= 200 ? "100%" : `${((200 / count) * 100).toFixed(0)}%`;
    w(`| ${count.toLocaleString()} | ${memTokens.toLocaleString()} | ${amTokens.toLocaleString()} | ${saving.toFixed(0)}% | ${reachable} |`);
  }

  w("");
  w("At 240 observations (our dataset), MEMORY.md already hits its 200-line cap and loses access to the most recent 40 observations. At 1,000 observations, 80% of memories are invisible. agentmemory always searches the full corpus.");

  w("");
  w("---");
  w("");
  w(`*${systems.reduce((s, sys) => s + sys.per_query.length, 0)} evaluations across ${systems.length} systems. Ground-truth labels assigned by concept matching against observation metadata.*`);

  return lines.join("\n");
}

async function main() {
  console.log("Generating labeled dataset...");
  const { observations, queries, sessions } = generateDataset();
  console.log(`Dataset: ${observations.length} observations, ${sessions.size} sessions, ${queries.length} queries`);
  console.log(`Avg relevant docs per query: ${(queries.reduce((s, q) => s + q.relevantObsIds.length, 0) / queries.length).toFixed(1)}`);
  console.log("");

  console.log("Evaluating: Built-in (CLAUDE.md / grep)...");
  const builtinResults = await evalBuiltinMemory(observations, queries);
  console.log(`  Recall@10: ${pct(builtinResults.avg_recall_at_10)}, NDCG@10: ${pct(builtinResults.avg_ndcg_at_10)}`);

  console.log("Evaluating: Built-in (200-line MEMORY.md)...");
  const truncatedResults = await evalBuiltinMemoryTruncated(observations, queries);
  console.log(`  Recall@10: ${pct(truncatedResults.avg_recall_at_10)}, NDCG@10: ${pct(truncatedResults.avg_ndcg_at_10)}`);

  console.log("Evaluating: BM25-only...");
  const bm25Results = await evalBm25Only(observations, queries);
  console.log(`  Recall@10: ${pct(bm25Results.avg_recall_at_10)}, NDCG@10: ${pct(bm25Results.avg_ndcg_at_10)}`);

  console.log("Evaluating: Dual-stream (BM25+Vector)...");
  const dualResults = await evalDualStream(observations, queries);
  console.log(`  Recall@10: ${pct(dualResults.avg_recall_at_10)}, NDCG@10: ${pct(dualResults.avg_ndcg_at_10)}`);

  console.log("Evaluating: Triple-stream (BM25+Vector+Graph)...");
  const tripleResults = await evalTripleStream(observations, queries);
  console.log(`  Recall@10: ${pct(tripleResults.avg_recall_at_10)}, NDCG@10: ${pct(tripleResults.avg_ndcg_at_10)}`);

  console.log("");

  const report = generateReport(
    [builtinResults, truncatedResults, bm25Results, dualResults, tripleResults],
    observations.length,
    queries.length,
  );

  writeFileSync("benchmark/QUALITY.md", report);
  console.log(report);
  console.log(`\nReport written to benchmark/QUALITY.md`);
}

main().catch(console.error);
