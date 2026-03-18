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
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 1000);

      const tokenCache = new Map<string, Set<string>>();
      for (const mem of latestMemories) {
        tokenCache.set(
          mem.id,
          new Set(
            mem.content
              .toLowerCase()
              .split(/\s+/)
              .filter((t) => t.length > 2),
          ),
        );
      }

      const memById = new Map(latestMemories.map((m) => [m.id, m]));
      const conceptIndex = new Map<string, string[]>();
      for (const mem of latestMemories) {
        const concepts = mem.concepts || [];
        for (const c of concepts) {
          const key = c.toLowerCase();
          if (!conceptIndex.has(key)) conceptIndex.set(key, []);
          conceptIndex.get(key)!.push(mem.id);
        }
      }

      const compared = new Set<string>();
      for (const [, memIds] of conceptIndex) {
        for (let i = 0; i < memIds.length; i++) {
          for (let j = i + 1; j < memIds.length; j++) {
            const key =
              memIds[i] < memIds[j]
                ? `${memIds[i]}|${memIds[j]}`
                : `${memIds[j]}|${memIds[i]}`;
            if (compared.has(key)) continue;
            compared.add(key);

            const setA = tokenCache.get(memIds[i])!;
            const setB = tokenCache.get(memIds[j])!;
            let intersection = 0;
            if (setA.size === 0 && setB.size === 0) continue;
            if (setA.size === 0 || setB.size === 0) continue;
            for (const word of setA) {
              if (setB.has(word)) intersection++;
            }
            const sim =
              intersection / (setA.size + setB.size - intersection);

            if (sim > CONTRADICTION_THRESHOLD) {
              const memA = memById.get(memIds[i])!;
              const memB = memById.get(memIds[j])!;
              result.contradictions.push({
                memoryA: memA.id,
                memoryB: memB.id,
                similarity: sim,
              });

              if (!dryRun) {
                const older =
                  new Date(memA.createdAt).getTime() <
                  new Date(memB.createdAt).getTime()
                    ? memA
                    : memB;
                older.isLatest = false;
                await kv.set(KV.memories, older.id, older);
              }
            }
          }
        }
      }

      const sessions = await kv.list<Session>(KV.sessions);
      const obsPerSession: CompressedObservation[][] = [];
      for (let batch = 0; batch < sessions.length; batch += 10) {
        const chunk = sessions.slice(batch, batch + 10);
        const results = await Promise.all(
          chunk.map((s) =>
            kv
              .list<CompressedObservation>(KV.observations(s.id))
              .catch(() => [] as CompressedObservation[]),
          ),
        );
        obsPerSession.push(...results);
      }
      for (let i = 0; i < sessions.length; i++) {
        for (const obs of obsPerSession[i]) {
          if (!obs.timestamp) continue;
          const age = now - new Date(obs.timestamp).getTime();
          if (age > 180 * MS_PER_DAY && (obs.importance ?? 5) <= 2) {
            result.lowValueObs.push(obs.id);
            if (!dryRun) {
              await kv
                .delete(KV.observations(sessions[i].id), obs.id)
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
