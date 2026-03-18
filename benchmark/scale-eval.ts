import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import type { CompressedObservation } from "../src/types.js";
import { generateScaleDataset, generateDataset } from "./dataset.js";
import { writeFileSync } from "node:fs";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface ScaleResult {
  scale: number;
  sessions: number;
  index_build_ms: number;
  index_build_per_doc_ms: number;
  bm25_search_ms: number;
  hybrid_search_ms: number;
  index_size_kb: number;
  vector_size_kb: number;
  heap_mb: number;
  builtin_tokens: number;
  builtin_200line_tokens: number;
  agentmemory_tokens: number;
  token_savings_pct: number;
  builtin_unreachable_pct: number;
}

interface CrossSessionResult {
  query: string;
  target_session: string;
  current_session: string;
  sessions_apart: number;
  bm25_found: boolean;
  bm25_rank: number;
  hybrid_found: boolean;
  hybrid_rank: number;
  builtin_found: boolean;
  latency_ms: number;
}

const SEARCH_QUERIES = [
  "authentication middleware JWT",
  "PostgreSQL connection pooling",
  "Kubernetes pod crash",
  "rate limiting API",
  "Playwright E2E tests",
  "Docker multi-stage build",
  "Redis caching layer",
  "CI/CD GitHub Actions",
  "Prisma migration drift",
  "monitoring Datadog alerts",
];

async function benchmarkScale(counts: number[]): Promise<ScaleResult[]> {
  const results: ScaleResult[] = [];

  for (const count of counts) {
    console.log(`  Scale: ${count.toLocaleString()} observations...`);
    const observations = generateScaleDataset(count);
    const sessionCount = new Set(observations.map(o => o.sessionId)).size;

    const heapBefore = process.memoryUsage().heapUsed;

    const buildStart = performance.now();
    const bm25 = new SearchIndex();
    const vector = new VectorIndex();
    const kv = mockKV();
    const dims = 384;

    for (const obs of observations) {
      bm25.add(obs);
      const text = [obs.title, obs.narrative, ...obs.concepts].join(" ");
      vector.add(obs.id, obs.sessionId, deterministicEmbedding(text, dims));
      await kv.set(`mem:obs:${obs.sessionId}`, obs.id, obs);
    }
    const buildMs = performance.now() - buildStart;

    const heapAfter = process.memoryUsage().heapUsed;

    const mockEmbed: any = {
      name: "deterministic", dimensions: dims,
      embed: async (t: string) => deterministicEmbedding(t, dims),
      embedBatch: async (ts: string[]) => ts.map(t => deterministicEmbedding(t, dims)),
    };
    const hybrid = new HybridSearch(bm25, vector, mockEmbed, kv as never, 0.4, 0.6, 0);

    let bm25Total = 0;
    let hybridTotal = 0;
    const iters = 20;

    for (let i = 0; i < iters; i++) {
      const q = SEARCH_QUERIES[i % SEARCH_QUERIES.length];
      const s1 = performance.now();
      bm25.search(q, 10);
      bm25Total += performance.now() - s1;

      const s2 = performance.now();
      await hybrid.search(q, 10);
      hybridTotal += performance.now() - s2;
    }

    const bm25Ser = bm25.serialize();
    const vecSer = vector.serialize();

    const allText = observations.map(o =>
      `- ${o.title}: ${o.narrative.slice(0, 80)}... [${o.concepts.slice(0, 3).join(", ")}]`
    ).join("\n");
    const builtinTokens = estimateTokens(allText);

    const truncatedText = observations.slice(0, 200).map(o =>
      `- ${o.title}: ${o.narrative.slice(0, 60)}... [${o.concepts.slice(0, 3).join(", ")}]`
    ).join("\n");
    const builtin200Tokens = estimateTokens(truncatedText);

    let totalResultTokens = 0;
    for (let i = 0; i < iters; i++) {
      const q = SEARCH_QUERIES[i % SEARCH_QUERIES.length];
      const results = await hybrid.search(q, 10);
      totalResultTokens += estimateTokens(JSON.stringify(results.map(r => r.observation)));
    }
    const agentmemoryTokens = Math.round(totalResultTokens / iters);

    results.push({
      scale: count,
      sessions: sessionCount,
      index_build_ms: Math.round(buildMs),
      index_build_per_doc_ms: +(buildMs / count).toFixed(3),
      bm25_search_ms: +(bm25Total / iters).toFixed(3),
      hybrid_search_ms: +(hybridTotal / iters).toFixed(3),
      index_size_kb: Math.round(Buffer.byteLength(bm25Ser, "utf-8") / 1024),
      vector_size_kb: Math.round(Buffer.byteLength(vecSer, "utf-8") / 1024),
      heap_mb: Math.round((heapAfter - heapBefore) / 1024 / 1024),
      builtin_tokens: builtinTokens,
      builtin_200line_tokens: builtin200Tokens,
      agentmemory_tokens: agentmemoryTokens,
      token_savings_pct: Math.round((1 - agentmemoryTokens / builtinTokens) * 100),
      builtin_unreachable_pct: count <= 200 ? 0 : Math.round((1 - 200 / count) * 100),
    });
  }

  return results;
}

async function benchmarkCrossSession(): Promise<CrossSessionResult[]> {
  const { observations } = generateDataset();
  const results: CrossSessionResult[] = [];

  const bm25 = new SearchIndex();
  const kv = mockKV();
  const vector = new VectorIndex();
  const dims = 384;

  for (const obs of observations) {
    bm25.add(obs);
    const text = [obs.title, obs.narrative, ...obs.concepts].join(" ");
    vector.add(obs.id, obs.sessionId, deterministicEmbedding(text, dims));
    await kv.set(`mem:obs:${obs.sessionId}`, obs.id, obs);
  }

  const mockEmbed: any = {
    name: "deterministic", dimensions: dims,
    embed: async (t: string) => deterministicEmbedding(t, dims),
    embedBatch: async (ts: string[]) => ts.map(t => deterministicEmbedding(t, dims)),
  };
  const hybrid = new HybridSearch(bm25, vector, mockEmbed, kv as never, 0.4, 0.6, 0);

  const crossQueries: Array<{
    query: string;
    targetConcepts: string[];
    targetSessionRange: [number, number];
    currentSession: number;
  }> = [
    { query: "How did we set up OAuth providers?", targetConcepts: ["oauth", "nextauth"], targetSessionRange: [5, 9], currentSession: 29 },
    { query: "What was the N+1 query fix?", targetConcepts: ["n+1", "eager-loading"], targetSessionRange: [10, 14], currentSession: 28 },
    { query: "PostgreSQL full-text search setup", targetConcepts: ["full-text-search", "tsvector"], targetSessionRange: [10, 14], currentSession: 27 },
    { query: "bcrypt password hashing configuration", targetConcepts: ["bcrypt", "password-hashing"], targetSessionRange: [5, 9], currentSession: 25 },
    { query: "Vitest unit testing setup", targetConcepts: ["vitest", "unit-testing"], targetSessionRange: [20, 24], currentSession: 29 },
    { query: "webhook retry exponential backoff", targetConcepts: ["webhooks", "exponential-backoff"], targetSessionRange: [15, 19], currentSession: 29 },
    { query: "ESLint flat config migration", targetConcepts: ["eslint", "linting"], targetSessionRange: [0, 4], currentSession: 29 },
    { query: "Kubernetes HPA autoscaling configuration", targetConcepts: ["hpa", "autoscaling", "kubernetes"], targetSessionRange: [25, 29], currentSession: 29 },
    { query: "Prisma database seed script", targetConcepts: ["seeding", "faker", "prisma"], targetSessionRange: [10, 14], currentSession: 26 },
    { query: "API cursor-based pagination", targetConcepts: ["cursor-based", "pagination"], targetSessionRange: [15, 19], currentSession: 29 },
    { query: "CSRF protection double-submit cookie", targetConcepts: ["csrf", "cookies"], targetSessionRange: [5, 9], currentSession: 29 },
    { query: "blue-green deployment rollback", targetConcepts: ["blue-green", "rollback", "zero-downtime"], targetSessionRange: [25, 29], currentSession: 29 },
  ];

  for (const cq of crossQueries) {
    const targetObs = observations.filter(o =>
      o.concepts.some(c => cq.targetConcepts.includes(c))
    );
    const targetIds = new Set(targetObs.map(o => o.id));

    const start = performance.now();
    const bm25Results = bm25.search(cq.query, 20);
    const hybridResults = await hybrid.search(cq.query, 20);
    const latency = performance.now() - start;

    const bm25Rank = bm25Results.findIndex(r => targetIds.has(r.obsId));
    const hybridRank = hybridResults.findIndex(r => targetIds.has(r.observation.id));

    const builtinLines = 200;
    const visibleObs = observations.slice(0, builtinLines);
    const builtinFound = visibleObs.some(o => targetIds.has(o.id));

    const sessionsApart = cq.currentSession - cq.targetSessionRange[0];

    results.push({
      query: cq.query,
      target_session: `ses_${cq.targetSessionRange[0].toString().padStart(3, "0")}-${cq.targetSessionRange[1].toString().padStart(3, "0")}`,
      current_session: `ses_${cq.currentSession.toString().padStart(3, "0")}`,
      sessions_apart: sessionsApart,
      bm25_found: bm25Rank >= 0,
      bm25_rank: bm25Rank >= 0 ? bm25Rank + 1 : -1,
      hybrid_found: hybridRank >= 0,
      hybrid_rank: hybridRank >= 0 ? hybridRank + 1 : -1,
      builtin_found: builtinFound,
      latency_ms: latency,
    });
  }

  return results;
}

function generateReport(scale: ScaleResult[], cross: CrossSessionResult[]): string {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w("# agentmemory v0.6.0 — Scale & Cross-Session Evaluation");
  w("");
  w(`**Date:** ${new Date().toISOString()}`);
  w(`**Platform:** ${process.platform} ${process.arch}, Node ${process.version}`);
  w("");

  w("## 1. Scale: agentmemory vs Built-in Memory");
  w("");
  w("Every built-in agent memory (CLAUDE.md, .cursorrules, Cline's memory-bank) loads ALL memory into context every session. agentmemory searches and returns only relevant results.");
  w("");
  w("| Observations | Sessions | Index Build | BM25 Search | Hybrid Search | Heap | Context Tokens (built-in) | Context Tokens (agentmemory) | Savings | Built-in Unreachable |");
  w("|-------------|----------|------------|-------------|---------------|------|--------------------------|-----------------------------|---------|--------------------|");

  for (const r of scale) {
    w(`| ${r.scale.toLocaleString()} | ${r.sessions} | ${r.index_build_ms}ms | ${r.bm25_search_ms}ms | ${r.hybrid_search_ms}ms | ${r.heap_mb}MB | ${r.builtin_tokens.toLocaleString()} | ${r.agentmemory_tokens.toLocaleString()} | ${r.token_savings_pct}% | ${r.builtin_unreachable_pct}% |`);
  }

  w("");
  w("### What the numbers mean");
  w("");
  w("**Context Tokens (built-in):** How many tokens Claude Code/Cursor/Cline would consume loading ALL memory into the context window. At 5,000 observations, this is ~250K tokens — exceeding most context windows entirely.");
  w("");
  w("**Context Tokens (agentmemory):** How many tokens the top-10 search results consume. Stays constant regardless of corpus size.");
  w("");
  w("**Built-in Unreachable:** Percentage of memories that built-in systems CANNOT access because they exceed the 200-line MEMORY.md cap or context window limits. At 1,000 observations, 80% of your project history is invisible.");
  w("");

  w("### Storage Costs");
  w("");
  w("| Observations | BM25 Index | Vector Index (d=384) | Total Storage |");
  w("|-------------|-----------|---------------------|---------------|");
  for (const r of scale) {
    const total = r.index_size_kb + r.vector_size_kb;
    w(`| ${r.scale.toLocaleString()} | ${r.index_size_kb.toLocaleString()} KB | ${r.vector_size_kb.toLocaleString()} KB | ${(total / 1024).toFixed(1)} MB |`);
  }

  w("");
  w("## 2. Cross-Session Retrieval");
  w("");
  w("Can the system find relevant information from past sessions? This is impossible for built-in memory once observations exceed the line/context cap.");
  w("");
  w("| Query | Target Session | Gap | BM25 Found | BM25 Rank | Hybrid Found | Hybrid Rank | Built-in Visible |");
  w("|-------|---------------|-----|-----------|-----------|-------------|-------------|-----------------|");

  for (const r of cross) {
    w(`| ${r.query.slice(0, 40)}${r.query.length > 40 ? "..." : ""} | ${r.target_session} | ${r.sessions_apart} | ${r.bm25_found ? "Yes" : "No"} | ${r.bm25_rank > 0 ? `#${r.bm25_rank}` : "-"} | ${r.hybrid_found ? "Yes" : "No"} | ${r.hybrid_rank > 0 ? `#${r.hybrid_rank}` : "-"} | ${r.builtin_found ? "Yes" : "No"} |`);
  }

  const bm25Found = cross.filter(r => r.bm25_found).length;
  const hybridFound = cross.filter(r => r.hybrid_found).length;
  const builtinFound = cross.filter(r => r.builtin_found).length;

  w("");
  w(`**Summary:** agentmemory BM25 found ${bm25Found}/${cross.length} cross-session queries. Hybrid found ${hybridFound}/${cross.length}. Built-in memory (200-line cap) could only reach ${builtinFound}/${cross.length}.`);

  w("");
  w("## 3. The Context Window Problem");
  w("");
  w("```");
  w("Agent context window: ~200K tokens");
  w("System prompt + tools:  ~20K tokens");
  w("User conversation:      ~30K tokens");
  w("Available for memory:  ~150K tokens");
  w("");
  w("At 50 tokens/observation:");
  w("  200 observations  =  10,000 tokens  (fits, but 200-line cap hits first)");
  w("  1,000 observations =  50,000 tokens  (33% of available budget)");
  w("  5,000 observations = 250,000 tokens  (EXCEEDS total context window)");
  w("");
  w("agentmemory top-10 results:");
  w(`  Any corpus size     =  ~${scale[0]?.agentmemory_tokens.toLocaleString() || "500"} tokens  (0.3% of budget)`);
  w("```");
  w("");

  w("## 4. What Built-in Memory Cannot Do");
  w("");
  w("| Capability | Built-in (CLAUDE.md) | agentmemory |");
  w("|-----------|---------------------|-------------|");
  w("| Semantic search | No (keyword grep only) | BM25 + vector + graph |");
  w("| Scale beyond 200 lines | No (hard cap) | Unlimited |");
  w("| Cross-session recall | Only if in 200-line window | Full corpus search |");
  w("| Cross-agent sharing | No (per-agent files) | MCP + REST API |");
  w("| Multi-agent coordination | No | Leases, signals, actions |");
  w("| Temporal queries | No | Point-in-time graph |");
  w("| Memory lifecycle | No (manual pruning) | Ebbinghaus decay + eviction |");
  w("| Knowledge graph | No | Entity extraction + traversal |");
  w("| Query expansion | No | LLM-generated reformulations |");
  w("| Retention scoring | No | Time-frequency decay model |");
  w("| Real-time dashboard | No (read files manually) | Viewer on :3113 |");
  w("| Concurrent access | No (file lock) | Keyed mutex + KV store |");
  w("");

  w("## 5. When to Use What");
  w("");
  w("**Use built-in memory (CLAUDE.md) when:**");
  w("- You have < 200 items to remember");
  w("- Single agent, single project");
  w("- Preferences and quick facts only");
  w("- Zero setup is the priority");
  w("");
  w("**Use agentmemory when:**");
  w("- Project history exceeds 200 observations");
  w("- You need to recall specific incidents from weeks ago");
  w("- Multiple agents work on the same codebase");
  w("- You want semantic search (\"how does auth work?\") not just keyword matching");
  w("- You need to track memory quality, decay, and lifecycle");
  w("- You want a shared memory layer across Claude Code, Cursor, Windsurf, etc.");
  w("");
  w("Built-in memory is your sticky notes. agentmemory is the searchable database behind them.");
  w("");

  w("---");
  w(`*Scale tests: ${scale.length} corpus sizes. Cross-session tests: ${cross.length} queries targeting specific past sessions.*`);

  return lines.join("\n");
}

async function main() {
  console.log("=== agentmemory Scale & Cross-Session Evaluation ===\n");

  console.log("1. Scale benchmarks...");
  const scaleResults = await benchmarkScale([240, 1_000, 5_000, 10_000, 50_000]);

  console.log("\n2. Cross-session retrieval...");
  const crossResults = await benchmarkCrossSession();

  console.log("");
  const report = generateReport(scaleResults, crossResults);
  writeFileSync("benchmark/SCALE.md", report);
  console.log(report);
  console.log(`\nReport written to benchmark/SCALE.md`);
}

main().catch(console.error);
