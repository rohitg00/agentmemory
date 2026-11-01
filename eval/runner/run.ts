import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { aggregate, scoreQuestion } from "./score.js";
import { fingerprint, fileDigest } from "./fingerprint.js";
import { validateQuestion } from "./load.js";
import type { Adapter, Question, ScoreRow, RankedDoc } from "./types.js";

export interface RunOptions {
  benchmark: string;
  questions: Question[];
  adapters: Adapter[];
  k: number;
  outDir: string;
  datasetFiles: string[];
  config?: Record<string, unknown>;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-|m0-)[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

export async function runEvaluation(options: RunOptions): Promise<ScoreRow[]> {
  const { adapters, k } = options;
  const questions = options.questions.map(validateQuestion);
  if (!questions.length || !adapters.length) throw new Error("A run needs questions and adapters");
  if (!Number.isInteger(k) || k <= 0 || k > 100) throw new Error("k must be between 1 and 100");
  if (new Set(adapters.map((a) => a.name)).size !== adapters.length) throw new Error("Duplicate adapter");
  if (new Set(questions.map((q) => q.id)).size !== questions.length) throw new Error("Duplicate question");
  const outDir = resolve(options.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length) throw new Error("Output directory is not empty: " + outDir);
  mkdirSync(outDir, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    metricVersion: "distinct-session-retrieval-v2",
    inputTransform: "role-flattened; opaque source IDs; all supplied dates retained; identical repeated IDs coalesced (v1)",
    benchmark: options.benchmark,
    scope: "supplied-session retrieval; no reader, judge, or capture-quality score",
    startedAt: new Date().toISOString(),
    source: fingerprint(adapters.some((a) => a.name === "agentmemory-http-bm25")),
    datasetFiles: options.datasetFiles.map((path) => ({ name: path.split(/[\\/]/).pop(), sha256: fileDigest(path) })),
    datasetSha256: createHash("sha256").update(JSON.stringify(options.datasetFiles.map(fileDigest))).digest("hex"),
    selectedQuestionIds: questions.map((q) => q.id),
    coalescedRepeatedSources: questions.reduce((count, q) => count + (q.coalescedSources ?? 0), 0),
    adapters: adapters.map((a) => a.name),
    k,
    retrievalUnit: "top k distinct source sessions",
    config: options.config ?? {},
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    planned: questions.length * adapters.length,
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  const rows: ScoreRow[] = [];
  for (const adapter of adapters) {
    for (const question of questions) {
      let state: unknown;
      let initialized = false;
      let phase: "init" | "query" | "teardown" = "init";
      let start = performance.now();
      let ingestionMs = 0;
      let latencyMs = 0;
      let ranked: RankedDoc[] = [];
      let row = scoreQuestion(question, [], k, adapter.name, 0);
      try {
        state = await adapter.init(question.haystack, options.config);
        initialized = true;
        ingestionMs = performance.now() - start;
        phase = "query";
        start = performance.now();
        const returned = await adapter.query(question.question, state, k, question.timestamp);
        if (!Array.isArray(returned) || returned.some((item) => !item || typeof item.sessionId !== "string" ||
            typeof item.score !== "number" || (item.content !== undefined && typeof item.content !== "string"))) {
          throw new Error("Adapter returned malformed results");
        }
        ranked = returned;
        latencyMs = performance.now() - start;
        const corpus = new Set(question.haystack.map((s) => s.id));
        if (ranked.some((r) => !corpus.has(r.sessionId) || !Number.isFinite(r.score))) {
          throw new Error("Adapter returned an unknown source or non-finite score");
        }
        row = scoreQuestion(question, ranked, k, adapter.name, latencyMs, ingestionMs);
      } catch (error) {
        if (phase === "init") ingestionMs = performance.now() - start;
        else latencyMs = performance.now() - start;
        row = { ...row, status: "error", phase, error: errorText(error), ingestionMs, latencyMs };
      } finally {
        if (initialized && adapter.teardown) {
          try {
            await adapter.teardown(state);
          } catch (error) {
            row = { ...row, status: "error", phase: "teardown",
              error: [row.error, errorText(error)].filter(Boolean).join("; ").slice(0, 500) };
          }
        }
      }
      appendFileSync(join(outDir, "evidence.ndjson"), JSON.stringify({
        questionId: question.id, adapter: adapter.name, goldSessionIds: question.goldSessionIds,
        returned: ranked.map((item) => ({ sessionId: item.sessionId, score: item.score,
          contentSha256: item.content === undefined ? null : createHash("sha256").update(item.content).digest("hex") })),
      }) + "\n");
      rows.push(row);
      appendFileSync(join(outDir, "scores.ndjson"), JSON.stringify(row) + "\n");
      console.log(adapter.name + " " + question.id + " " + row.status +
        " all@" + k + "=" + String(row.recallAllAtK) + " query=" + Math.round(row.latencyMs) + "ms");
    }
  }
  const summary = { ...aggregate(rows), planned: manifest.planned, completed: rows.filter((r) => r.status === "ok").length,
    failed: rows.filter((r) => r.status === "error").length, finishedAt: new Date().toISOString(),
    claim: "Development evaluation only. No competitor ranking or answer-accuracy claim." };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
  return rows;
}
