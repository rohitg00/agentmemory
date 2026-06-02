import type { StateKV } from "../state/kv.js";
import type {
  SemanticMemory,
  ProceduralMemory,
  Crystal,
  Insight,
  HighOrderTier,
  CompactHighOrderResult,
} from "../types.js";
import { KV } from "../state/schema.js";

const TIER_CAP = 50;
const CONTENT_PREVIEW_CHARS = 240;

interface TierCandidate {
  id: string;
  tier: HighOrderTier;
  text: string;
  content: string;
  confidence: number;
  project?: string;
  createdAt: string;
}

import { getEmbeddingProvider } from "./search.js";
import { base64ToFloat32 } from "../state/vector-index.js";

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function searchHighOrderTiers(
  kv: StateKV,
  query: string,
  options: {
    confidenceFloor: number;
    project?: string;
    limit?: number;
  },
): Promise<{ results: CompactHighOrderResult[], needsBackfill: boolean }> {
  const ep = getEmbeddingProvider();
  const [semantics, procedurals, crystals, insights] = await Promise.all([
    kv.list<SemanticMemory>(KV.semantic).catch(() => []),
    kv.list<ProceduralMemory>(KV.procedural).catch(() => []),
    kv.list<Crystal>(KV.crystals).catch(() => []),
    kv.list<Insight>(KV.insights).catch(() => []),
  ]);

  let needsBackfill = false;
  let queryVector: Float32Array | null = null;
  if (ep) {
    try {
      queryVector = await ep.embed(query);
    } catch {
      // Ignore embed error
    }
  }

  const candidates: Array<TierCandidate & { embedding?: Float32Array }> = [];

  for (const s of semantics) {
    const effectiveConfidence = Math.min(s.confidence, s.strength);
    if (effectiveConfidence < options.confidenceFloor) continue;
    if (ep && (!s.embedding || s.embeddingModel !== ep.name)) needsBackfill = true;
    candidates.push({
      id: s.id,
      tier: "semantic",
      text: s.fact,
      content: truncate(s.fact),
      confidence: effectiveConfidence,
      createdAt: s.createdAt,
      embedding: s.embedding ? base64ToFloat32(s.embedding) : undefined,
    });
  }

  for (const p of procedurals) {
    if (p.strength < options.confidenceFloor) continue;
    if (ep && (!p.embedding || p.embeddingModel !== ep.name)) needsBackfill = true;
    const text = `${p.name} ${p.triggerCondition} ${p.steps.join(" ")} ${(p.tags || []).join(" ")}`;
    candidates.push({
      id: p.id,
      tier: "procedural",
      text,
      content: truncate(`${p.name}: ${p.triggerCondition}`),
      confidence: p.strength,
      createdAt: p.createdAt,
      embedding: p.embedding ? base64ToFloat32(p.embedding) : undefined,
    });
  }

  for (const c of crystals) {
    if (options.project && c.project && c.project !== options.project) continue;
    if (ep && (!c.embedding || c.embeddingModel !== ep.name)) needsBackfill = true;
    const text = `${c.narrative} ${c.keyOutcomes.join(" ")} ${c.lessons.join(" ")}`;
    candidates.push({
      id: c.id,
      tier: "crystal",
      text,
      content: truncate(c.narrative),
      confidence: 1.0,
      project: c.project,
      createdAt: c.createdAt,
      embedding: c.embedding ? base64ToFloat32(c.embedding) : undefined,
    });
  }

  for (const i of insights) {
    if (i.deleted) continue;
    if (i.confidence < options.confidenceFloor) continue;
    if (options.project && i.project && i.project !== options.project) continue;
    if (ep && (!i.embedding || i.embeddingModel !== ep.name)) needsBackfill = true;
    const text = `${i.title} ${i.content} ${(i.tags || []).join(" ")}`;
    candidates.push({
      id: i.id,
      tier: "insight",
      text,
      content: truncate(`${i.title}: ${i.content}`),
      confidence: i.confidence,
      project: i.project,
      createdAt: i.createdAt,
      embedding: i.embedding ? base64ToFloat32(i.embedding) : undefined,
    });
  }

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  
  // Scored candidates
  const bm25Scored = candidates.map((c) => {
    const lower = c.text.toLowerCase();
    const matchCount = terms.length === 0 ? 0 : terms.filter((t) => lower.includes(t)).length;
    const relevance = terms.length === 0 ? 0 : matchCount / terms.length;
    const confBoost = c.confidence > 0.85 ? 1.2 : 1.0;
    return { candidate: c, score: relevance * c.confidence * confBoost };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  const vectorScored = candidates.map((c) => {
    const score = (queryVector && c.embedding) ? cosineSimilarity(queryVector, c.embedding) : 0;
    return { candidate: c, score: score * c.confidence };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  // RRF
  const rrfMap = new Map<string, { candidate: any; rrfScore: number }>();
  const K = 60;

  bm25Scored.forEach((item, index) => {
    const rank = index + 1;
    rrfMap.set(item.candidate.id, { candidate: item.candidate, rrfScore: 1 / (K + rank) });
  });

  vectorScored.forEach((item, index) => {
    const rank = index + 1;
    const existing = rrfMap.get(item.candidate.id);
    if (existing) {
      existing.rrfScore += 1 / (K + rank);
    } else {
      rrfMap.set(item.candidate.id, { candidate: item.candidate, rrfScore: 1 / (K + rank) });
    }
  });

  const finalScored = Array.from(rrfMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(x => {
      const c = x.candidate;
      return {
        id: c.id,
        tier: c.tier as HighOrderTier,
        content: c.content,
        score: Math.round(x.rrfScore * 10000) / 10000,
        confidence: c.confidence,
        project: c.project,
        createdAt: c.createdAt,
      };
    });

  const tierCounts = new Map<string, number>();
  const capped: CompactHighOrderResult[] = [];
  for (const r of finalScored) {
    const count = tierCounts.get(r.tier) || 0;
    if (count >= TIER_CAP) continue;
    tierCounts.set(r.tier, count + 1);
    capped.push(r);
  }

  return { results: capped.slice(0, options.limit ?? 20), needsBackfill };
}

function truncate(text: string): string {
  if (text.length <= CONTENT_PREVIEW_CHARS) return text;
  return text.slice(0, CONTENT_PREVIEW_CHARS) + "…";
}
