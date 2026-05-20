import type { Question, RankedDoc, ScoreRow } from "./types.js";

export function scoreQuestion(
  q: Question,
  ranked: RankedDoc[],
  k: number,
  adapter: string,
  latencyMs: number,
): ScoreRow {
  const topK = ranked.slice(0, k).map((r) => r.sessionId);
  const gold = new Set(q.goldSessionIds);
  const hits = topK.filter((id) => gold.has(id)).length;
  const precisionAtK = k > 0 ? hits / k : 0;
  const recallAtK = gold.size === 0 ? 0 : hits / gold.size;
  const hit = hits > 0;
  let topGoldRank: number | null = null;
  for (let i = 0; i < ranked.length; i++) {
    if (gold.has(ranked[i].sessionId)) {
      topGoldRank = i + 1;
      break;
    }
  }
  return {
    questionId: q.id,
    questionType: q.type,
    adapter,
    k,
    precisionAtK,
    recallAtK,
    hit,
    topGoldRank,
    latencyMs,
  };
}

export function aggregate(rows: ScoreRow[]): {
  byAdapter: Record<string, { p: number; r: number; hit: number; n: number; latencyP50: number }>;
  byType: Record<string, Record<string, { p: number; r: number; hit: number; n: number }>>;
} {
  const byAdapter: Record<
    string,
    { p: number; r: number; hit: number; n: number; latencyP50: number }
  > = {};
  const latencies: Record<string, number[]> = {};
  for (const r of rows) {
    const a = (byAdapter[r.adapter] ??= { p: 0, r: 0, hit: 0, n: 0, latencyP50: 0 });
    a.p += r.precisionAtK;
    a.r += r.recallAtK;
    a.hit += r.hit ? 1 : 0;
    a.n += 1;
    (latencies[r.adapter] ??= []).push(r.latencyMs);
  }
  for (const adapter of Object.keys(byAdapter)) {
    const a = byAdapter[adapter];
    a.p = a.p / a.n;
    a.r = a.r / a.n;
    const sorted = latencies[adapter].slice().sort((x, y) => x - y);
    a.latencyP50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  }
  const byType: Record<string, Record<string, { p: number; r: number; hit: number; n: number }>> =
    {};
  for (const r of rows) {
    const t = (byType[r.questionType] ??= {});
    const a = (t[r.adapter] ??= { p: 0, r: 0, hit: 0, n: 0 });
    a.p += r.precisionAtK;
    a.r += r.recallAtK;
    a.hit += r.hit ? 1 : 0;
    a.n += 1;
  }
  for (const t of Object.keys(byType)) {
    for (const adapter of Object.keys(byType[t])) {
      const a = byType[t][adapter];
      a.p = a.p / a.n;
      a.r = a.r / a.n;
    }
  }
  return { byAdapter, byType };
}
