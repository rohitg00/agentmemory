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
} as const;

export const STREAM = {
  name: "mem-live",
  group: (sessionId: string) => sessionId,
} as const;

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${ts}_${rand}`;
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
