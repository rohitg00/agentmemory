import type { Adapter, RankedDoc, Session } from "../types.js";

interface AgentMemoryState {
  baseUrl: string;
  secret?: string;
  sessions: Session[];
  observationToSession: Map<string, string>;
}

interface RememberResponse {
  memory?: { id?: string };
  observationId?: string;
  id?: string;
  observation?: { id?: string };
}

interface SmartSearchResponse {
  results?: Array<{
    obsId?: string;
    id?: string;
    observationId?: string;
    sessionId?: string;
    score?: number;
    content?: string;
  }>;
  observations?: Array<{
    obsId?: string;
    id?: string;
    sessionId?: string;
    score?: number;
    content?: string;
  }>;
}

function authHeaders(secret?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) h.Authorization = `Bearer ${secret}`;
  return h;
}

export const agentmemoryAdapter: Adapter<AgentMemoryState> = {
  name: "agentmemory-hybrid",
  async init(sessions, config) {
    const baseUrl = (config?.baseUrl as string) ?? process.env.AGENTMEMORY_BASE_URL ?? "http://localhost:3111";
    const secret = (config?.secret as string) ?? process.env.AGENTMEMORY_SECRET;
    const observationToSession = new Map<string, string>();
    for (const s of sessions) {
      const res = await fetch(`${baseUrl}/agentmemory/remember`, {
        method: "POST",
        headers: authHeaders(secret),
        body: JSON.stringify({
          content: s.content,
          type: "eval-session",
          concepts: [s.id],
        }),
      });
      if (!res.ok) {
        throw new Error(`remember failed for ${s.id}: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as RememberResponse;
      const obsId =
        body.memory?.id ?? body.observationId ?? body.id ?? body.observation?.id;
      if (obsId) observationToSession.set(obsId, s.id);
    }
    return { baseUrl, secret, sessions, observationToSession };
  },
  async query(q, state, k) {
    const res = await fetch(`${state.baseUrl}/agentmemory/smart-search`, {
      method: "POST",
      headers: authHeaders(state.secret),
      body: JSON.stringify({ query: q, limit: Math.max(k * 10, 50) }),
    });
    if (!res.ok) {
      throw new Error(`smart-search failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as SmartSearchResponse;
    const rows = body.results ?? body.observations ?? [];
    const ranked: RankedDoc[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      let sessionId = row.sessionId;
      if (!sessionId) {
        const memId = row.obsId ?? row.id ?? row.observationId;
        sessionId = memId ? state.observationToSession.get(memId) : undefined;
      }
      if (!sessionId || seen.has(sessionId)) continue;
      seen.add(sessionId);
      ranked.push({ sessionId, score: row.score ?? 0 });
      if (ranked.length >= k) break;
    }
    return ranked;
  },
};
