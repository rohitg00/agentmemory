import { createHash } from "node:crypto";
import { hasCjk, segmentCjk } from "./cjk-segmenter.js";

export const KV = {
  sessions: "mem:sessions",
  observations: (sessionId: string) => `mem:obs:${sessionId}`,
  memories: "mem:memories",
  summaries: "mem:summaries",
  config: "mem:config",
  metrics: "mem:metrics",
  health: "mem:health",
  embeddings: (obsId: string) => `mem:emb:${obsId}`,
  bm25Index: "mem:index:bm25",
  vectorPendingLog: "mem:index:vec-pending",
  relations: "mem:relations",
  profiles: "mem:profiles",
  claudeBridge: "mem:claude-bridge",
  graphNodes: "mem:graph:nodes",
  graphEdges: "mem:graph:edges",
  graphSnapshot: "mem:graph:snapshot",
  graphNameIndex: "mem:graph:name-index",
  graphEdgeKey: "mem:graph:edge-key",
  graphNodeDegree: "mem:graph:node-degree",
  semantic: "mem:semantic",
  procedural: "mem:procedural",
  teamShared: (teamId: string) => `mem:team:${teamId}:shared`,
  teamUsers: (teamId: string, userId: string) =>
    `mem:team:${teamId}:users:${userId}`,
  teamProfile: (teamId: string) => `mem:team:${teamId}:profile`,
  audit: "mem:audit",
  auditMonth: (month: string) => `mem:audit:${month}`,
  auditMonths: "mem:audit:months",
  actions: "mem:actions",
  actionEdges: "mem:action-edges",
  leases: "mem:leases",
  routines: "mem:routines",
  routineRuns: "mem:routine-runs",
  signals: "mem:signals",
  checkpoints: "mem:checkpoints",
  mesh: "mem:mesh",
  sketches: "mem:sketches",
  facets: "mem:facets",
  sentinels: "mem:sentinels",
  crystals: "mem:crystals",
  lessons: "mem:lessons",
  insights: "mem:insights",
  graphEdgeHistory: "mem:graph:edge-history",
  enrichedChunks: (sessionId: string) => `mem:enriched:${sessionId}`,
  latentEmbeddings: (obsId: string) => `mem:latent:${obsId}`,
  retentionScores: "mem:retention",
  accessLog: "mem:access",
  imageRefs: "mem:image-refs",
  imageEmbeddings: "mem:image-embeddings",
  slots: "mem:slots",
  globalSlots: "mem:slots:global",
  state: "mem:state",
  commits: "mem:commits",
  recentSearches: "mem:recent-searches",
  projectSessionsIndex: "mem:idx:project-sessions",
  obsSessionIndex: (shard: number) => `mem:idx:obs:${shard}`,
  captureInbox: "mem:capture:inbox",
  captureEvents: (shard: string) => `mem:capture:events:${shard}`,
  capturePrompts: "mem:capture:prompts",
} as const;

export const STREAM = {
  name: "mem-live",
  viewerGroup: "viewer",
} as const;

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${ts}_${rand}`;
}

export function fingerprintId(prefix: string, content: string): string {
  const hash = createHash("sha256").update(content).digest("hex");
  return `${prefix}_${hash.slice(0, 16)}`;
}

// CJK/Japanese/Thai text carries no inter-word whitespace, so a plain
// split(/\s+/) collapses a whole sentence into one token and the two token
// sets never overlap — dedup silently stops working. When either input
// contains CJK we segment the CJK runs (word tokens via the shared
// segmenter, plus character bigram shingles so near-identical strings still
// overlap even when the optional segmenter deps fall back to whole-string).
// ASCII text keeps the original word-level behavior.
function jaccardTokens(text: string): Set<string> {
  if (!hasCjk(text)) {
    return new Set(text.split(/\s+/).filter((t) => t.length > 2));
  }
  const tokens = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    if (hasCjk(raw)) {
      for (const seg of segmentCjk(raw)) {
        if (seg) tokens.add(seg);
      }
      // Character bigram shingles keep the CJK signal even when the
      // segmenter returns the whole run: overlapping bigrams make
      // near-identical strings match while unrelated ones ("北京" vs
      // "上海") share none. Never drop short CJK tokens.
      const chars = Array.from(raw);
      if (chars.length === 1) {
        tokens.add(chars[0]);
      } else {
        for (let i = 0; i < chars.length - 1; i++) {
          tokens.add(chars[i] + chars[i + 1]);
        }
      }
    } else if (raw.length > 2) {
      tokens.add(raw);
    }
  }
  return tokens;
}

export function jaccardSimilarity(a: string, b: string): number {
  const na = a.normalize("NFC");
  const nb = b.normalize("NFC");
  const setA = jaccardTokens(na);
  const setB = jaccardTokens(nb);
  // An empty token set carries no signal for the overlap metric. Very short
  // ASCII text ("AI", "a b", "go") tokenizes to nothing because words <=2
  // chars are dropped. Fall back to exact normalized equality so re-saving
  // the identical short memory still supersedes, while unrelated short
  // strings ("AI" vs "ML") correctly score 0. Returning 1 unconditionally
  // here (as an "both empty" shortcut once did) would let any short memory
  // falsely supersede another, silently marking a real memory not-latest.
  if (setA.size === 0 || setB.size === 0) {
    return na.trim().replace(/\s+/g, " ") === nb.trim().replace(/\s+/g, " ")
      ? 1
      : 0;
  }
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}
