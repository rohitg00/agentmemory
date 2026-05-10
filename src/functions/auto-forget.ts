// ... (existing imports and constants)

const SIMILARITY_MERGE_THRESHOLD = 0.85;

interface AutoForgetResult {
  ttlExpired: string[];
  contradictions: Array<{
    memoryA: string;
    memoryB: string;
    similarity: number;
  }>;
  redundant: string[]; // New: Tracks merged/redundant memories
  lowValueObs: string[];
  dryRun: boolean;
}

export function registerAutoForgetFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::auto-forget",
    async (data: { dryRun?: boolean }): Promise<AutoForgetResult> => {
      const dryRun = data?.dryRun ?? false;
      const now = Date.now();
      const { decrementImageRef } = await import("./image-refs.js");

      const result: AutoForgetResult = { 
        ttlExpired: [], 
        contradictions: [], 
        redundant: [],
        lowValueObs: [], 
        dryRun 
      };

      // Fetch all active memories for the session
      const memories = await kv.getMany<Memory>(KV.MEMORIES);

      for (let i = 0; i < memories.length; i++) {
        const memA = memories[i];

        // 1. TTL Expiry Logic
        if (memA.metadata?.expiresAt && now > memA.metadata.expiresAt) {
          result.ttlExpired.push(memA.id);
          continue;
        }

        // 2. Conflict & Redundancy Detection
        for (let j = i + 1; j < memories.length; j++) {
          const memB = memories[j];
          const similarity = await sdk.vector.similarity(memA.embedding, memB.embedding);

          if (similarity > CONTRADICTION_THRESHOLD) {
            // Check if they actually contradict (logic assumed handled by SDK or LLM)
            const isContradictory = await sdk.llm.checkContradiction(memA.content, memB.content);
            if (isContradictory) {
              result.contradictions.push({ memoryA: memA.id, memoryB: memB.id, similarity });
            } else if (similarity > SIMILARITY_MERGE_THRESHOLD) {
              // Feature: Identify redundant memories for consolidation
              result.redundant.push(memB.id);
            }
          }
        }
      }

      // Execution Phase (if not dryRun)
      if (!dryRun) {
        const idsToDelete = [...result.ttlExpired, ...result.redundant];
        
        for (const id of idsToDelete) {
          await kv.delete(KV.MEMORIES, id);
          await deleteAccessLog(id);
          await recordAudit(sdk, "memory_auto_forgotten", { id, reason: "cleanup" });
          
          // Cleanup associated assets
          const mem = memories.find(m => m.id === id);
          if (mem?.imageId) await decrementImageRef(mem.imageId);
        }
        
        logger.info(`Auto-forget complete. Removed ${idsToDelete.length} memories.`);
      }

      return result;
    }
  );
}
      const memories = await kv.list<Memory>(KV.memories);
      const deletedIds = new Set<string>();
      for (const mem of memories) {
        if (mem.forgetAfter) {
          const expiry = new Date(mem.forgetAfter).getTime();
          if (now > expiry) {
            result.ttlExpired.push(mem.id);
            deletedIds.add(mem.id);
            if (!dryRun) {
              if (mem.imageRef) {
                await decrementImageRef(kv, sdk, mem.imageRef);
              }
              await kv.delete(KV.memories, mem.id);
              await recordAudit(kv, "delete", "mem::auto-forget", [mem.id], {
                resource: "memory",
                reason: "auto-forget TTL",
                timestamp: mem.forgetAfter,
              });
              await deleteAccessLog(kv, mem.id);
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
                await recordAudit(kv, "forget", "mem::auto-forget", [older.id], {
                  resource: "memory",
                  reason: "auto-forget contradiction",
                  olderId: older.id,
                  similarity: sim,
                });
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
              let deletedOk = false;
              try {
                await kv.delete(KV.observations(sessions[i].id), obs.id);
                deletedOk = true;
              } catch {
                deletedOk = false;
              }
              if (deletedOk) {
                if (obs.imageData) await decrementImageRef(kv, sdk, obs.imageData);
                if (obs.imageRef && obs.imageRef !== obs.imageData) {
                  await decrementImageRef(kv, sdk, obs.imageRef);
                }
                await recordAudit(kv, "delete", "mem::auto-forget", [obs.id], {
                  resource: "observation",
                  reason: "auto-forget low-value observation",
                  sessionId: sessions[i].id,
                  timestamp: obs.timestamp,
                });
              }
            }
          }
        }
      }

      logger.info("Auto-forget complete", {
        ttlExpired: result.ttlExpired.length,
        contradictions: result.contradictions.length,
        lowValueObs: result.lowValueObs.length,
        dryRun,
      });
      return result;
    },
  );
}
