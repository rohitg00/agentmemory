import { randomUUID } from "node:crypto";
import { startSandbox, type Sandbox } from "../sandbox.js";
import { sessionText } from "../input.js";
import type { Adapter, RankedDoc } from "../types.js";

interface AgentMemoryState {
  sandbox: Sandbox;
  scope: string;
  memoryToSession: Map<string, string>;
}

export function createAgentMemoryAdapter(factory: () => Promise<Sandbox> = startSandbox): Adapter<AgentMemoryState> {
  return {
    name: "agentmemory-http-bm25",
    async init(sessions) {
      const sandbox = await factory();
      const scope = "eval-" + randomUUID();
      const memoryToSession = new Map<string, string>();
      try {
        for (const session of sessions) {
          const body = await sandbox.request<{ success: boolean; memory?: { id: string } }>("/remember", {
            content: sessionText(session), type: "fact", project: scope, agentId: scope,
          });
          if (body.success !== true || !body.memory?.id) throw new Error("remember returned no memory ID");
          memoryToSession.set(body.memory.id, session.id);
        }
        return { sandbox, scope, memoryToSession };
      } catch (error) {
        await sandbox.close();
        throw error;
      }
    },
    async query(query, state, k) {
      const body = await state.sandbox.request<{ results?: Array<{ obsId?: string; id?: string;
        observation?: { id?: string; narrative?: string }; score?: number; combinedScore?: number }> }>("/search", {
        query, project: state.scope, agentId: state.scope, limit: Math.min(100, k * 3), format: "full",
      });
      if (!Array.isArray(body.results)) throw new Error("search returned no results array");
      const ranked: RankedDoc[] = [];
      const seen = new Set<string>();
      for (const row of body.results) {
        const id = row.observation?.id ?? row.obsId ?? row.id;
        const sessionId = id ? state.memoryToSession.get(id) : undefined;
        if (!sessionId) throw new Error("search returned a source outside this case");
        if (seen.has(sessionId)) continue;
        seen.add(sessionId);
        ranked.push({ sessionId, score: row.combinedScore ?? row.score ?? 0, content: row.observation?.narrative });
        if (ranked.length === k) break;
      }
      return ranked;
    },
    async teardown(state) { await state.sandbox.close(); },
  };
}

export const agentmemoryAdapter = createAgentMemoryAdapter();
