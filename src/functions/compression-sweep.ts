import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { collectAll } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { CompressedObservation, Session } from "../types.js";
import { compressMaxConcurrent, isAutoCompressEnabled } from "../config.js";
import { needsCompression } from "./compression-state.js";
import { logger } from "../logger.js";
import { singleFlight } from "../runtime/recovery.js";

const MAX_AGE_MS = 5 * 60_000;
const MAX_PER_RUN = 50;
export const MAX_SWEEP_ATTEMPTS = 5;

export function createCompressionSweep(sdk: IIIClient, kv: StateKV) {
  return singleFlight(async () => {
    const pending: Array<{ sessionId: string; observationId: string }> = [];
    const failed: Array<{ sessionId: string; observationId: string }> = [];
    const cutoff = Date.now() - MAX_AGE_MS;
    const sessions = await kv.list<Session>(KV.sessions);
    for (const session of sessions) {
      const observations = await collectAll<CompressedObservation>(kv, KV.observations(session.id));
      for (const obs of observations) {
        if (pending.length >= MAX_PER_RUN) break;
        if (!needsCompression(obs)) continue;
        if (Date.parse(obs.timestamp) > cutoff) continue;
        const candidate = { sessionId: session.id, observationId: obs.id };
        if (obs.compression?.status !== "failed") pending.push(candidate);
        else if (obs.compression.error !== "source_unavailable" && (obs.compression.attempts ?? 0) < MAX_SWEEP_ATTEMPTS && failed.length < MAX_PER_RUN) failed.push(candidate);
      }
      if (pending.length >= MAX_PER_RUN) break;
    }
    const candidates = [...pending, ...failed].slice(0, MAX_PER_RUN);
    const concurrency = Math.min(compressMaxConcurrent(), Math.max(1, candidates.length));
    let inFlight = 0;
    let dispatched = 0;
    await new Promise<void>((resolve) => {
      const next = () => {
        while (inFlight < concurrency && dispatched < candidates.length) {
          const c = candidates[dispatched++];
          inFlight++;
          sdk.trigger({ function_id: "mem::compress", payload: c })
            .catch(() => {})
            .finally(() => { inFlight--; if (dispatched >= candidates.length && inFlight === 0) resolve(); else next(); });
        }
        if (dispatched >= candidates.length && inFlight === 0) resolve();
      };
      next();
      if (candidates.length === 0) resolve();
    });
    if (candidates.length > 0) logger.info("Compression sweep dispatched stale observations", { count: candidates.length });
    return { dispatched: candidates.length };
  });
}

export function registerCompressionSweepFunction(sdk: IIIClient, kv: StateKV): () => Promise<{ dispatched: number }> {
  const run = createCompressionSweep(sdk, kv);
  sdk.registerFunction("mem::compression-sweep", () => run());
  return run;
}

export function compressionSweepEnabled(): boolean {
  return isAutoCompressEnabled();
}
