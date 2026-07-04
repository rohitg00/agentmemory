import { createHash } from "node:crypto";

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

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const setB = new Set(b.split(/\s+/).filter((t) => t.length > 2));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}
