import type { Question, RankedDoc, ScoreRow } from "./types.js";

export function scoreQuestion(q: Question, ranked: RankedDoc[], k: number, adapter: string, latencyMs: number, ingestionMs = 0): ScoreRow {
  if (!Number.isInteger(k) || k <= 0) throw new Error("k must be a positive integer");
  const unique = [...new Set(ranked.map((r) => r.sessionId))];
  const topK = unique.slice(0, k);
  const gold = new Set(q.goldSessionIds);
  const answerability = q.answerability ?? "answerable";
  if (answerability === "answerable" && !gold.size) throw new Error("Answerable question has no gold sessions");
  const scoreable = answerability === "answerable";
  const hits = topK.filter((id) => gold.has(id)).length;
  const rank = topK.findIndex((id) => gold.has(id));
  return {
    questionId: q.id, questionType: q.type, answerability, adapter, k, status: "ok",
    precisionAtK: scoreable ? hits / k : null,
    recallAtK: scoreable ? hits / gold.size : null,
    recallAllAtK: scoreable ? Number(hits === gold.size) : null,
    hit: scoreable ? hits > 0 : null,
    returnedCount: topK.length,
    topGoldRank: scoreable && rank >= 0 ? rank + 1 : null,
    latencyMs, ingestionMs,
  };
}

export interface AggregateStats {
  n: number;
  completed: number;
  failed: number;
  scored: number;
  answerable: { attempted: number; completed: number; failed: number };
  unanswerable: number;
  unanswerableCompleted: number;
  unanswerableFailed: number;
  p: number | null;
  r: number | null;
  recallAll: number | null;
  hit: number;
  strictSuccessOverAttempts: number | null;
  latencyP50: number;
  latencyP95: number;
  ingestionP50: number;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : 0;
}

function summarize(rows: ScoreRow[]): AggregateStats {
  const completed = rows.filter((r) => r.status === "ok");
  const scored = completed.filter((r) => r.recallAtK !== null);
  const unanswerable = rows.filter((r) => r.answerability === "unanswerable");
  const unanswerableCompleted = unanswerable.filter((r) => r.status === "ok").length;
  const sum = (field: "precisionAtK" | "recallAtK" | "recallAllAtK") => scored.reduce((n, r) => n + (r[field] ?? 0), 0);
  const answerableAttempts = rows.filter((r) => r.recallAtK !== null).length;
  return {
    n: rows.length, completed: completed.length, failed: rows.length - completed.length,
    scored: scored.length,
    answerable: { attempted: answerableAttempts, completed: scored.length, failed: answerableAttempts - scored.length },
    unanswerable: unanswerable.length, unanswerableCompleted,
    unanswerableFailed: unanswerable.length - unanswerableCompleted,
    p: scored.length ? sum("precisionAtK") / scored.length : null,
    r: scored.length ? sum("recallAtK") / scored.length : null,
    recallAll: scored.length ? sum("recallAllAtK") / scored.length : null,
    hit: scored.filter((r) => r.hit).length,
    strictSuccessOverAttempts: answerableAttempts ? sum("recallAllAtK") / answerableAttempts : null,
    latencyP50: percentile(completed.map((r) => r.latencyMs), 0.5),
    latencyP95: percentile(completed.map((r) => r.latencyMs), 0.95),
    ingestionP50: percentile(completed.map((r) => r.ingestionMs), 0.5),
  };
}

export function aggregate(rows: ScoreRow[]): {
  byAdapter: Record<string, AggregateStats>;
  byType: Record<string, Record<string, AggregateStats>>;
} {
  const byAdapter: Record<string, AggregateStats> = {};
  const byType: Record<string, Record<string, AggregateStats>> = {};
  for (const adapter of new Set(rows.map((r) => r.adapter))) {
    byAdapter[adapter] = summarize(rows.filter((r) => r.adapter === adapter));
  }
  for (const type of new Set(rows.map((r) => r.questionType))) {
    byType[type] = {};
    for (const adapter of new Set(rows.filter((r) => r.questionType === type).map((r) => r.adapter))) {
      byType[type][adapter] = summarize(rows.filter((r) => r.adapter === adapter && r.questionType === type));
    }
  }
  return { byAdapter, byType };
}
