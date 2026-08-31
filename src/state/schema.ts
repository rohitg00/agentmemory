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
  relations: "mem:relations",
  profiles: "mem:profiles",
  claudeBridge: "mem:claude-bridge",
  graphNodes: "mem:graph:nodes",
  graphEdges: "mem:graph:edges",
  // #814: precomputed snapshot of the top-degree subgraph and aggregate
  // type counts. Saves /graph/query and /graph/stats from a full
  // kv.list enumeration over 75K+ node corpora, which exceeds the iii
  // invocation timeout and surfaces as "Invocation stopped" 500s.
  // Single fixed key ("current") so writes are read-modify-write under
  // the same keyed mutex as graph-extract.
  graphSnapshot: "mem:graph:snapshot",
  // #814 v2: targeted-lookup indexes so graph-extract never enumerates
  // the full nodes/edges scope. Each entry is a single small kv.get,
  // bounded payload — works at 75K+ nodes where kv.list would block
  // the worker event loop (37MB WS frame parse blocks heartbeat,
  // worker is declared dead before any Promise.race timer can fire).
  // - graphNameIndex: key `${type}|${name}` -> nodeId. Replaces the
  //   existingNodes.find() O(n) dedup scan inside mem::graph-extract.
  // - graphEdgeKey: key `${src}|${tgt}|${type}` -> edgeId. Same for
  //   edge dedup.
  // - graphNodeDegree: key nodeId -> incident-edge count. Read /
  //   incremented on edge writes to maintain the snapshot top-N
  //   ranking without scanning all edges.
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
  // #771: tracks the most recent smart-search call per session, used by
  // the followup-rate diagnostic. Key = sessionId. TTL-swept hourly.
  recentSearches: "mem:recent-searches",
} as const;

export const STREAM = {
  name: "mem-live",
  group: (sessionId: string) => sessionId,
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
