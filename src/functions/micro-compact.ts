import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";
import { recordAudit } from "./audit.js";
import type { Session, CompressedObservation } from "../types.js";

export interface MicroCompactPayload {
  sessionId: string;
  force?: boolean;
}

export function registerMicroCompactFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::micro-compact", async (payload: MicroCompactPayload) => {
    if (!payload?.sessionId || typeof payload.sessionId !== "string") {
      return { success: false, error: "sessionId is required" };
    }
    const sessionId = payload.sessionId.trim();

    return withKeyedLock(`obs:${sessionId}`, async () => {
      const session = await kv.get<Session>(KV.sessions, sessionId);
      if (!session) {
        return { success: false, error: "session_not_found" };
      }

      const uncompacted = session.uncompactedCount || 0;
      if (!payload.force && uncompacted < 50) {
        return { success: true, skipped: true, reason: "below_threshold" };
      }

      const observations = await kv.list<CompressedObservation>(KV.observations(sessionId));
      if (observations.length === 0) {
        return { success: true, skipped: true, reason: "no_observations" };
      }

      observations.sort((a, b) => {
        const tA = new Date(a.timestamp || 0).getTime();
        const tB = new Date(b.timestamp || 0).getTime();
        return tA - tB;
      });

      const watermark = session.compactedWatermark || 0;
      const slice = observations.slice(watermark, watermark + uncompacted);
      if (slice.length === 0) {
        return { success: true, skipped: true, reason: "empty_slice" };
      }

      const narrativeLines = slice
        .map((o) => {
          const title = o.title?.trim();
          const nar = o.narrative?.trim();
          if (title && nar) return `- ${title}: ${nar}`;
          if (title) return `- ${title}`;
          if (nar) return `- ${nar}`;
          return "";
        })
        .filter(Boolean)
        .slice(0, 50);

      const files = Array.from(
        new Set(
          slice.flatMap((o) => (Array.isArray(o.files) ? o.files : [])),
        ),
      ).slice(0, 20);

      const now = new Date().toISOString();
      const checkpointId = generateId("ckpt");
      const checkpointDigest = {
        id: checkpointId,
        sessionId,
        project: session.project,
        watermarkStart: watermark,
        watermarkEnd: watermark + slice.length,
        summary: `Episodic Checkpoint (${watermark} - ${watermark + slice.length}):\n${narrativeLines.join("\n")}`,
        filesModified: files,
        createdAt: now,
      };

      await kv.set(KV.checkpoints, checkpointId, checkpointDigest);

      const newWatermark = watermark + slice.length;
      const remainingUncompacted = Math.max(
        0,
        (session.observationCount || observations.length) - newWatermark,
      );

      await kv.update(KV.sessions, sessionId, [
        { type: "set", path: "compactedWatermark", value: newWatermark },
        { type: "set", path: "uncompactedCount", value: remainingUncompacted },
        { type: "set", path: "updatedAt", value: now },
      ]);

      await recordAudit(kv, "micro_compact", "mem::micro-compact", [checkpointId, sessionId], {
        compactedCount: slice.length,
        newWatermark,
        remainingUncompacted,
      });

      logger.info("Session micro-compacted successfully", {
        sessionId,
        checkpointId,
        compactedCount: slice.length,
        newWatermark,
        remainingUncompacted,
      });

      return {
        success: true,
        checkpointId,
        compactedCount: slice.length,
        newWatermark,
        remainingUncompacted,
      };
    });
  });
}
