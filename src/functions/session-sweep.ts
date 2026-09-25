import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Session } from "../types.js";
import { logger } from "../logger.js";
import {
  isSessionSweepEnabled,
  getSessionSweepStaleHours,
} from "../config.js";

const HOUR_MS = 60 * 60 * 1000;

export function registerSessionSweepFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction(
    "mem::session-sweep",
    async (): Promise<{
      success: boolean;
      scanned: number;
      abandoned: number;
      error?: string;
    }> => {
      if (!isSessionSweepEnabled()) {
        return { success: false, scanned: 0, abandoned: 0, error: "session sweep disabled" };
      }
      const now = Date.now();
      const cutoff = now - getSessionSweepStaleHours() * HOUR_MS;
      let sessions: Session[];
      try {
        sessions = await kv.list<Session>(KV.sessions);
      } catch (err) {
        logger.error("Session sweep scan failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          success: false,
          scanned: 0,
          abandoned: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }

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

      if (abandoned > 0) {
        logger.info("Session sweep complete", { scanned: sessions.length, abandoned });
      }
      return { success: true, scanned: sessions.length, abandoned };
    },
  );
}
