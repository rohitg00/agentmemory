/**
 * End-to-end recall benchmark runner.
 *
 * The runner intentionally uses an in-memory KV implementation and a lexical
 * hybrid provider.  It still exercises the production RecallCore (including
 * scope gates, packing, trace persistence and injection ledger) while keeping
 * benchmark execution deterministic and free of a configured provider/store.
 *
 * Usage: `npm run eval:recall` (optional `--json` for machine-readable output).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { RecallCore } from "../../src/recall/core.js";
import { scoreRecallBenchmark, type RecallBenchmarkCase, type RecallBenchmarkResult } from "./score.js";
import { KV } from "../../src/state/schema.js";
import type { HybridSearchResult, Memory, RecallConfig } from "../../src/types.js";

interface MemoryFixture {
  id: string;
  title: string;
  content: string;
  scope?: Memory["scope"];
  keywords: string[];
}

const CONFIG: RecallConfig = {
  budget: {
    maxContextTokens: 800,
    reservedBootstrapTokens: 200,
    maxSemanticTokens: 600,
    maxMemories: 5,
    maxSessionSummaries: 1,
    maxObservations: 3,
    maxContinuityItems: 1,
  },
  scope: { unknownAutoInjection: false, unknownExplicitSearch: true },
  trace: { retentionDays: 30, maxTraces: 10_000, maxDroppedItemsPerReason: 20 },
  injection: { reinjectionTurnWindow: 8 },
};

const FIXTURE_MEMORIES: MemoryFixture[] = [
  {
    id: "mem_pps_pair_cache",
    title: "PPS7000 pair cache",
    content: "PPS7000 weighted benchmark pair cache lives under the benchmark cache directory and uses a staged key.",
    scope: { level: "project", projectId: "pps7000" },
    keywords: ["pps7000", "pair cache", "weighted benchmark", "缓存", "目录"],
  },
  {
    id: "mem_pps_weighted_stage1",
    title: "PPS7000 weighted stage1",
    content: "The PPS7000 weighted benchmark stage1 reuses pair-cache entries and keeps the scoring contract stable.",
    scope: { level: "project", projectId: "pps7000" },
    keywords: ["pps7000", "weighted", "stage1", "benchmark", "评分"],
  },
  {
    id: "mem_gat_formula",
    title: "GAT edge weight formula",
    content: "GAT edge weight is multiplied into the attention message before aggregation.",
    scope: { level: "project", projectId: "study-heavy-industrial-chain" },
    keywords: ["gat", "edge weight", "公式", "attention", "边权"],
  },
  {
    id: "mem_ic_plan",
    title: "Ivan's Childhood implementation plan",
    content: "Ivan's Childhood next implementation step is to finish the scene index and continuity checks.",
    scope: { level: "project", projectId: "ivans-childhood" },
    keywords: ["ivan", "childhood", "implementation plan", "计划", "约束"],
  },
  {
    id: "mem_docs_preference",
    title: "Documentation preference",
    content: "Prefer concise README documentation with a problem statement, usage example and verification commands.",
    scope: { level: "user" },
    keywords: ["文档", "README", "写作", "结构", "documentation"],
  },
  {
    id: "mem_legacy_unknown",
    title: "Legacy note",
    content: "Legacy migration note retained for explicit recall only.",
    scope: { level: "unknown" },
    keywords: ["legacy", "migration", "旧记录"],
  },
];

function makeKv() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    async get<T>(scope: string, key: string): Promise<T | null> {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    async set<T>(scope: string, key: string, value: T): Promise<T> {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    },
    async delete(scope: string, key: string): Promise<void> {
      store.get(scope)?.delete(key);
    },
    async list<T>(scope: string): Promise<T[]> {
      return Array.from(store.get(scope)?.values() || []) as T[];
    },
  };
}

function asMemory(fixture: MemoryFixture): Memory {
  const now = "2026-07-01T00:00:00.000Z";
  return {
    id: fixture.id,
    createdAt: now,
    updatedAt: now,
    type: "fact",
    title: fixture.title,
    content: fixture.content,
    concepts: fixture.keywords,
    files: [],
    sessionIds: [],
    strength: 8,
    version: 1,
    isLatest: true,
    scope: fixture.scope,
    origin: "manual",
  };
}

function lexicalHits(query: string, memories: MemoryFixture[]): HybridSearchResult[] {
  const normalized = query.toLowerCase();
  return memories
    .map((memory) => {
      const matches = memory.keywords.filter((keyword) => normalized.includes(keyword.toLowerCase())).length;
      if (!matches) return null;
      const score = matches / memory.keywords.length;
      return {
        observation: {
          id: memory.id,
          sessionId: "benchmark",
          timestamp: "2026-07-01T00:00:00.000Z",
          type: "decision" as const,
          title: memory.title,
          facts: [],
          narrative: memory.content,
          concepts: memory.keywords,
          files: [],
          importance: 8,
        },
        bm25Score: score,
        vectorScore: 0,
        graphScore: 0,
        combinedScore: score,
        sessionId: "benchmark",
      } satisfies HybridSearchResult;
    })
    .filter((hit): hit is HybridSearchResult => hit !== null)
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

async function loadCases(): Promise<RecallBenchmarkCase[]> {
  const path = fileURLToPath(new URL("./fixtures/sanitized.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as RecallBenchmarkCase[];
}

export async function runRecallBenchmark() {
  const cases = await loadCases();
  const kv = makeKv();
  for (const fixture of FIXTURE_MEMORIES) await kv.set(KV.memories, fixture.id, asMemory(fixture));
  const core = new RecallCore(kv as never, CONFIG, async (query) => lexicalHits(query, FIXTURE_MEMORIES));
  const results: Record<string, RecallBenchmarkResult> = {};
  const traceIds: string[] = [];
  for (const [index, testCase] of cases.entries()) {
    const response = await core.recall({
      entryPoint: "prompt",
      outputMode: "prompt_injection",
      query: testCase.query,
      projectId: testCase.projectId,
      sessionId: `benchmark-${index}`,
    });
    traceIds.push(response.trace.id);
    results[testCase.id] = {
      selectedIds: response.trace.selected.map((item) => item.id),
      injectedTokens: response.trace.finalContextTokenCount,
      duplicateIds: response.trace.dropped.filter((item) => item.decision === "duplicate").map((item) => item.id),
      staleIds: response.trace.dropped.filter((item) => item.decision === "stale").map((item) => item.id),
    };
  }
  return { score: scoreRecallBenchmark(cases, results), traceIds, cases, results };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("eval/recall/runner.ts")) {
  const report = await runRecallBenchmark();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("Recall benchmark");
    console.table(report.score);
    console.log(`trace IDs: ${report.traceIds.join(", ")}`);
  }
}
