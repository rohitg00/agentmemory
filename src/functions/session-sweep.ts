import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Session } from "../types.js";
import { logger } from "../logger.js";

// #1410: sessions started by reused runtimes (gateways, cron workers) whose
// host process never delivers session/end stay "active" forever. The Session
// type already reserves "abandoned" for exactly this case, and mem::evict
// already implements the recovery/deletion policy for stale sessions — but
// nothing ever writes "abandoned" and nothing ever invokes mem::evict on a
// schedule. This sweep closes that gap: mark stale active sessions as
// abandoned, then let the existing eviction pass do its documented job.
const DEFAULT_STALE_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export function getSessionSweepStaleHours(): number {
  const raw = parseInt(process.env.SESSION_SWEEP_STALE_HOURS || "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_STALE_HOURS;
}

export function registerSessionSweepFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction(
    "mem::session-sweep",
    async (): Promise<{
      success: boolean;
      scanned: number;
      abandoned: number;
      evictQueued: boolean;
    }> => {
      const now = Date.now();
      const cutoff = now - getSessionSweepStaleHours() * HOUR_MS;
      const sessions = await kv
        .list<Session>(KV.sessions)
        .catch(() => [] as Session[]);

      let abandoned = 0;
      for (const session of sessions) {
        if (!session || session.status !== "active") continue;
        const freshness = session.updatedAt ?? session.startedAt;
        if (!freshness) continue;
        if (new Date(freshness).getTime() >= cutoff) continue;
        try {
          await kv.update(KV.sessions, session.id, [
            { type: "set", path: "status", value: "abandoned" },
            { type: "set", path: "endedAt", value: new Date().toISOString() },
          ]);
          abandoned++;
        } catch (err) {
          logger.warn("Session sweep update failed", {
            sessionId: session.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // The eviction pass re-reads sessions from KV, so queue it only when
      // something actually changed; it applies its own staleSessionDays
      // policy, so freshly abandoned sessions are not deleted on day one.
      let evictQueued = false;
      if (abandoned > 0) {
        try {
          await sdk.trigger({
            function_id: "mem::evict",
            payload: { dryRun: false },
          });
          evictQueued = true;
        } catch (err) {
          logger.warn("Session sweep evict trigger failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (abandoned > 0) {
        logger.info("Session sweep complete", { scanned: sessions.length, abandoned, evictQueued });
      }
      return { success: true, scanned: sessions.length, abandoned, evictQueued };
    },
  );
}
