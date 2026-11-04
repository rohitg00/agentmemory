import { TriggerAction, type IIIClient } from "iii-sdk";
import type { CompressedObservation, Session, SessionSummary, SessionSummaryRepair } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";
import { compressionInFlight } from "./compress.js";
import { compressionRaw, needsCompression, type StoredObservation } from "./compression-state.js";
import { summaryCovers, summaryObservations } from "./summary-state.js";

export const SUMMARY_RETRY_MS = 30_000;
export const SUMMARY_RETRY_MAX_MS = 60 * 60_000;
const MAX_ACTIVE = 2;
const activeByStore = new WeakMap<StateKV, Set<string>>();

type CompressionRetryResult = { nextCursor?: string; recovered?: number; failed?: number; error?: string };

export function registerSummaryRecoveryFunction(sdk: IIIClient, kv: StateKV, hasProvider: () => boolean): void {
  const active = activeByStore.get(kv) ?? new Set<string>();
  activeByStore.set(kv, active);

  async function repair(request: SessionSummaryRepair): Promise<void> {
    const { sessionId } = request;
    const current = await kv.get<SessionSummaryRepair>(KV.summaryRepairs, sessionId);
    if (!current || current.token !== request.token) return;
    let lastError: NonNullable<SessionSummaryRepair["lastError"]> = "pending";
    let delay = SUMMARY_RETRY_MS;
    let compressionCursor = current.compressionCursor;
    let progress = false;
    try {
      const session = await kv.get<Session>(KV.sessions, sessionId);
      if (session?.id === sessionId && session.status !== "active") {
        if (!hasProvider()) {
          lastError = "no_provider";
          delay = SUMMARY_RETRY_MAX_MS;
        } else {
          let observations = await kv.list<StoredObservation>(KV.observations(sessionId));
          const pending = observations.filter(needsCompression);
          if (!pending.some((row) => compressionInFlight(kv, sessionId, row.id))) {
            if (pending.length) {
              const retried = await sdk.trigger<Record<string, unknown>, CompressionRetryResult>({
                function_id: "mem::compression-retry",
                payload: { sessionId, limit: 1, ...(compressionCursor ? { cursor: compressionCursor } : {}) },
              });
              compressionCursor = retried?.nextCursor;
              progress = (retried?.recovered ?? 0) > 0 || Boolean(compressionCursor && compressionCursor !== current.compressionCursor && !retried?.failed);
              observations = await kv.list<StoredObservation>(KV.observations(sessionId));
            }
            const remaining = observations.filter(needsCompression);
            if (remaining.length === 0) {
              const result = await sdk.trigger<{ sessionId: string }, { success?: boolean; incomplete?: boolean }>({
                function_id: "mem::summarize", payload: { sessionId },
              });
              if (!result?.success || result.incomplete) lastError = "summary_failed";
            } else if (remaining.every((row) => !compressionRaw(row))) {
              lastError = "source_unavailable";
              delay = SUMMARY_RETRY_MAX_MS;
              progress = false;
            } else lastError = "compression_pending";
          } else lastError = "compression_pending";
        }
      }
    } catch (error) {
      lastError = "recovery_failed";
      logger.warn("Session summary recovery failed", { sessionId, error: error instanceof Error ? error.message : String(error) });
    }

    await withKeyedLock(`obs:${sessionId}`, async () => {
      const latest = await kv.get<SessionSummaryRepair>(KV.summaryRepairs, sessionId);
      if (!latest || latest.token !== request.token) return;
      try {
        const session = await kv.get<Session>(KV.sessions, sessionId);
        if (!session) {
          await kv.delete(KV.summaryRepairs, sessionId);
          return;
        }
        const rows = await kv.list<StoredObservation>(KV.observations(sessionId));
        if (session.id === sessionId && session.status !== "active" && !rows.some(needsCompression) &&
            (rows.length === 0 || summaryCovers(session, summaryObservations(rows as CompressedObservation[]),
              await kv.get<SessionSummary>(KV.summaries, sessionId)))) {
          await kv.delete(KV.summaryRepairs, sessionId);
          return;
        }
      } catch {
        lastError = "recovery_failed";
      }
      const attempts = Number.isSafeInteger(latest.attempts) && latest.attempts >= 0 ? latest.attempts : 0;
      await kv.set<SessionSummaryRepair>(KV.summaryRepairs, sessionId, {
        ...latest, attempts: progress ? 0 : Math.min(attempts + 1, 100), compressionCursor, lastError,
        dueAt: Date.now() + (progress ? SUMMARY_RETRY_MS : Math.min(SUMMARY_RETRY_MAX_MS, delay * 2 ** Math.min(attempts, 7))),
      });
    });
  }

  sdk.registerFunction("mem::summary-repair", async (request: SessionSummaryRepair) => {
    if (!request?.sessionId || !request.token || active.has(request.sessionId) || active.size >= MAX_ACTIVE) return;
    active.add(request.sessionId);
    try { await repair(request); }
    catch (error) { logger.warn("Could not persist summary recovery progress", { sessionId: request.sessionId, error: error instanceof Error ? error.message : String(error) }); }
    finally { active.delete(request.sessionId); }
  });
  sdk.registerFunction("mem::summary-recover", async (data?: { now?: number }) => {
    const now = typeof data?.now === "number" && Number.isFinite(data.now) ? data.now : Date.now();
    const pending = await kv.list<SessionSummaryRepair>(KV.summaryRepairs);
    const ready = pending.filter((entry) => entry && typeof entry.sessionId === "string" &&
      typeof entry.token === "string" && Number.isFinite(entry.dueAt) &&
      (entry.dueAt <= now || (entry.lastError === "no_provider" && hasProvider())) && !active.has(entry.sessionId))
      .sort((a, b) => a.dueAt - b.dueAt).slice(0, Math.max(0, MAX_ACTIVE - active.size));
    for (const entry of ready) await sdk.trigger({ function_id: "mem::summary-repair", payload: entry, action: TriggerAction.Void() });
    return { scheduled: ready.length };
  });
}
