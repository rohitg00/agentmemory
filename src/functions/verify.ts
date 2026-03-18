import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type {
  Memory,
  CompressedObservation,
  Session,
} from "../types.js";

export function registerVerifyFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::verify" },
    async (data: { id: string }) => {
      if (!data.id || typeof data.id !== "string") {
        return { success: false, error: "id is required" };
      }

      const memory = await kv.get<Memory>(KV.memories, data.id);
      if (memory) {
        const observationIds = memory.sourceObservationIds || [];
        const observations: Array<{
          observation: CompressedObservation;
          session?: Session;
        }> = [];

        for (const obsId of observationIds) {
          const obs = await findObservation(kv, obsId, memory.sessionIds);
          if (obs) {
            const session = await kv.get<Session>(KV.sessions, obs.sessionId);
            observations.push({ observation: obs, session: session || undefined });
          }
        }

        return {
          success: true,
          type: "memory",
          memory: {
            id: memory.id,
            title: memory.title,
            type: memory.type,
            version: memory.version,
            strength: memory.strength,
            isLatest: memory.isLatest,
            createdAt: memory.createdAt,
            updatedAt: memory.updatedAt,
            supersedes: memory.supersedes,
            parentId: memory.parentId,
          },
          citations: observations.map((o) => ({
            observationId: o.observation.id,
            title: o.observation.title,
            type: o.observation.type,
            confidence: o.observation.confidence,
            timestamp: o.observation.timestamp,
            sessionId: o.observation.sessionId,
            sessionProject: o.session?.project,
            sessionStatus: o.session?.status,
          })),
          citationCount: observations.length,
        };
      }

      const obs = await findObservation(kv, data.id);
      if (obs) {
        const session = await kv.get<Session>(KV.sessions, obs.sessionId);
        return {
          success: true,
          type: "observation",
          observation: {
            id: obs.id,
            title: obs.title,
            type: obs.type,
            confidence: obs.confidence,
            importance: obs.importance,
            timestamp: obs.timestamp,
            sessionId: obs.sessionId,
          },
          session: session
            ? {
                id: session.id,
                project: session.project,
                status: session.status,
                startedAt: session.startedAt,
              }
            : null,
          citationCount: 0,
          citations: [],
        };
      }

      return { success: false, error: "not found" };
    },
  );
}

async function findObservation(
  kv: StateKV,
  obsId: string,
  hintSessionIds?: string[],
): Promise<CompressedObservation | null> {
  if (hintSessionIds) {
    for (const sid of hintSessionIds) {
      const obs = await kv.get<CompressedObservation>(KV.observations(sid), obsId);
      if (obs) return obs;
    }
  }
  const sessions = await kv.list<Session>(KV.sessions);
  for (const session of sessions) {
    if (hintSessionIds?.includes(session.id)) continue;
    const obs = await kv.get<CompressedObservation>(
      KV.observations(session.id),
      obsId,
    );
    if (obs) return obs;
  }
  return null;
}
