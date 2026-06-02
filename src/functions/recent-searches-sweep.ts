import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { logger } from "../logger.js";
import { getFollowupStats, type RecentSearch } from "./smart-search.js";
import { getFollowupWindowSeconds } from "../config.js";

// #771: TTL sweep for the followup-rate diagnostic scope. `recentSearches`
// only needs the most recent entry per session, but stale rows accumulate
// when sessions go idle. Hourly sweep deletes rows whose last update is
// older than the retention window.
const RETENTION_MS = 24 * 60 * 60 * 1000;

export function registerRecentSearchesSweepFunction(
  sdk: ISdk,
  kv: StateKV,
): void {
  sdk.registerFunction(
    "mem::diagnostic::recent-searches-sweep",
    async (): Promise<{ success: true; swept: number; skipped: number }> => {
      const cutoff = Date.now() - RETENTION_MS;
      const rows = await kv
        .list<Partial<RecentSearch>>(KV.recentSearches)
        .catch(() => []);
      let swept = 0;
      let skipped = 0;
      for (const row of rows) {
        if (!row || typeof row.sessionId !== "string" || !row.sessionId) {
          skipped++;
          continue;
        }
        const at = typeof row.at === "number" ? row.at : 0;
        if (at >= cutoff) continue;
        try {
          await kv.delete(KV.recentSearches, row.sessionId);
          swept++;
        } catch (err) {
          logger.warn("recent-searches sweep delete failed", {
            sessionId: row.sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (swept > 0 || skipped > 0) {
        logger.info("Recent-searches sweep complete", { swept, skipped });
      }
      return { success: true, swept, skipped };
    },
  );

  // #771: read-back surface for `agentmemory status` and external
  // dashboards that don't go through the OTEL collector.
  sdk.registerFunction(
    "mem::diagnostic::followup-stats",
    async (): Promise<{
      success: true;
      windowSeconds: number;
      agentInitiatedSearches: number;
      followupWithinWindow: number;
      rate: number;
    }> => {
      const stats = getFollowupStats();
      return {
        success: true,
        windowSeconds: getFollowupWindowSeconds(),
        agentInitiatedSearches: stats.agentInitiatedSearches,
        followupWithinWindow: stats.followupWithinWindow,
        rate: stats.rate,
      };
    },
  );
}
