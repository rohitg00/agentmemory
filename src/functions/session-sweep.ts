import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Session } from "../types.js";
import { logger } from "../logger.js";
import { safeAudit } from "./audit.js";
import {
  isSessionSweepEnabled,
  getSessionSweepStaleHours,
} from "../config.js";

const HOUR_MS = 60 * 60 * 1000;

export interface SessionSweepResult {
  success: boolean;
  scanned: number;
  abandoned: number;
  failed: number;
  error?: string;
}

function isStaleActive(session: Session | null, cutoff: number): session is Session {
  if (!session || session.status !== "active") return false;
  const freshness = session.updatedAt ?? session.startedAt;
  if (!freshness) return false;
  const ts = new Date(freshness).getTime();
  return Number.isFinite(ts) && ts < cutoff;
}

export function registerSessionSweepFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction(
    "mem::session-sweep",
    async (): Promise<SessionSweepResult> => {
      if (!isSessionSweepEnabled()) {
        return { success: false, scanned: 0, abandoned: 0, failed: 0, error: "session sweep disabled" };
      }
      const cutoff = Date.now() - getSessionSweepStaleHours() * HOUR_MS;
      let sessions: Session[];
      try {
        sessions = await kv.list<Session>(KV.sessions);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error("Session sweep scan failed", { error });
        return { success: false, scanned: 0, abandoned: 0, failed: 0, error };
      }

      const abandonedIds: string[] = [];
      let failed = 0;
      for (const candidate of sessions) {
        if (!isStaleActive(candidate, cutoff)) continue;
        try {
          const marked = await withKeyedLock(`obs:${candidate.id}`, async () => {
            const current = await kv.get<Session>(KV.sessions, candidate.id);
            if (!isStaleActive(current, cutoff)) return false;
            await kv.update(KV.sessions, candidate.id, [
              { type: "set", path: "status", value: "abandoned" },
              { type: "set", path: "endedAt", value: new Date().toISOString() },
            ]);
            return true;
          });
          if (marked) abandonedIds.push(candidate.id);
        } catch (err) {
          failed++;
          logger.warn("Session sweep update failed", {
            sessionId: candidate.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (abandonedIds.length > 0) {
        await safeAudit(kv, "session_sweep", "mem::session-sweep", abandonedIds, {
          abandoned: abandonedIds.length,
          staleHours: getSessionSweepStaleHours(),
        });
        logger.info("Session sweep complete", {
          scanned: sessions.length,
          abandoned: abandonedIds.length,
          failed,
        });
      }
      return {
        success: failed === 0,
        scanned: sessions.length,
        abandoned: abandonedIds.length,
        failed,
        ...(failed > 0 ? { error: `${failed} session update(s) failed` } : {}),
      };
    },
  );
}
