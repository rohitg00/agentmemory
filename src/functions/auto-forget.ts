import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { Memory, CompressedObservation, Session } from "../types.js";
import { KV, jaccardSimilarity } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CONTRADICTION_THRESHOLD = 0.9;

interface AutoForgetResult {
  ttlExpired: string[];
  contradictions: Array<{
    memoryA: string;
    memoryB: string;
    similarity: number;
  }>;
  lowValueObs: string[];
  dryRun: boolean;
}

export function registerAutoForgetFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::auto-forget",
      description:
        "Auto-forget expired (TTL), contradictory, and low-value data",
    },
    async (data: { dryRun?: boolean }): Promise<AutoForgetResult> => {
      const ctx = getContext();
      const dryRun = data?.dryRun ?? false;
      const now = Date.now();

      const result: AutoForgetResult = {
        ttlExpired: [],
        contradictions: [],
        lowValueObs: [],
        dryRun,
      };

      const memories = await kv.list<Memory>(KV.memories);
      const deletedIds = new Set<string>();
      for (const mem of memories) {
        if (mem.forgetAfter) {
          const expiry = new Date(mem.forgetAfter).getTime();
          if (now > expiry) {
            result.ttlExpired.push(mem.id);
            deletedIds.add(mem.id);
            if (!dryRun) {
              await kv.delete(KV.memories, mem.id);
            }
          }
        }
      }

      const latestMemories = memories
        .filter((m) => m.isLatest !== false && !deletedIds.has(m.id))
        .slice(0, 1000);
      for (let i = 0; i < latestMemories.length; i++) {
        for (let j = i + 1; j < latestMemories.length; j++) {
          const sim = jaccardSimilarity(
            latestMemories[i].content.toLowerCase(),
            latestMemories[j].content.toLowerCase(),
          );
          if (sim > CONTRADICTION_THRESHOLD) {
            result.contradictions.push({
              memoryA: latestMemories[i].id,
              memoryB: latestMemories[j].id,
              similarity: sim,
            });

            if (!dryRun) {
              const older =
                new Date(latestMemories[i].createdAt).getTime() <
                new Date(latestMemories[j].createdAt).getTime()
                  ? latestMemories[i]
                  : latestMemories[j];
              older.isLatest = false;
              await kv.set(KV.memories, older.id, older);
            }
          }
        }
      }

      const sessions = await kv.list<Session>(KV.sessions);
      for (const session of sessions) {
        const observations = await kv
          .list<CompressedObservation>(KV.observations(session.id))
          .catch(() => []);
        for (const obs of observations) {
          if (!obs.timestamp) continue;
          const age = now - new Date(obs.timestamp).getTime();
          if (age > 180 * MS_PER_DAY && (obs.importance ?? 5) <= 2) {
            result.lowValueObs.push(obs.id);
            if (!dryRun) {
              await kv
                .delete(KV.observations(session.id), obs.id)
                .catch(() => {});
            }
          }
        }
      }

      ctx.logger.info("Auto-forget complete", {
        ttlExpired: result.ttlExpired.length,
        contradictions: result.contradictions.length,
        lowValueObs: result.lowValueObs.length,
        dryRun,
      });
      return result;
    },
  );
}
