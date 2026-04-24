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
