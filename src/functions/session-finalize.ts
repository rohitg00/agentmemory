import { TriggerAction, type IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Session } from "../types.js";
import { logger } from "../logger.js";
import { getFinalizeIdleMs } from "../config.js";

export const FINALIZE_DUE_KEY = "finalize:due";
export const FINALIZE_TICK_MS = 30_000;
const FINALIZE_BATCH = 50;

type FinalizeDue = Record<string, number>;

export interface SessionFinalizeResult {
  success: boolean;
  due: number;
  finalized: number;
  rescheduled: number;
  dropped: number;
  failed: number;
  error?: string;
}

async function readDue(kv: StateKV): Promise<FinalizeDue> {
  const record = await kv.get<FinalizeDue>(KV.config, FINALIZE_DUE_KEY).catch(() => null);
  if (!record || typeof record !== "object") return {};
  const due: FinalizeDue = {};
  for (const [sessionId, at] of Object.entries(record)) {
    if (typeof at === "number" && Number.isFinite(at)) due[sessionId] = at;
  }
  return due;
}

export function scheduleSessionFinalize(
  kv: StateKV,
  sessionId: string,
  dueAt: number = Date.now() + getFinalizeIdleMs(),
): Promise<number> {
  return withKeyedLock(FINALIZE_DUE_KEY, async () => {
    const due = await readDue(kv);
    due[sessionId] = dueAt;
    await kv.set(KV.config, FINALIZE_DUE_KEY, due);
    return dueAt;
  });
}

export function clearSessionFinalize(kv: StateKV, sessionId: string): Promise<void> {
  return withKeyedLock(FINALIZE_DUE_KEY, async () => {
    const due = await readDue(kv);
    if (!(sessionId in due)) return;
    delete due[sessionId];
    await kv.set(KV.config, FINALIZE_DUE_KEY, due);
  });
}

function lastActivityMs(session: Session): number {
  const ts = new Date(session.updatedAt ?? session.startedAt).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function registerSessionFinalizeFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction(
    "mem::session-finalize",
    async (data?: { now?: number }): Promise<SessionFinalizeResult> => {
      const now = typeof data?.now === "number" ? data.now : Date.now();
      const idleMs = getFinalizeIdleMs();
      const due = await readDue(kv);
      const dueCount = Object.keys(due).length;
      const ready = Object.entries(due)
        .filter(([, at]) => at <= now)
        .sort((a, b) => a[1] - b[1])
        .slice(0, FINALIZE_BATCH);

      let finalized = 0;
      let rescheduled = 0;
      let dropped = 0;
      let failed = 0;
      for (const [sessionId] of ready) {
        try {
          const outcome = await withKeyedLock(`obs:${sessionId}`, async () => {
            const session = await kv.get<Session>(KV.sessions, sessionId);
            if (!session || session.id !== sessionId || session.status !== "active") {
              return "drop" as const;
            }
            const idleUntil = lastActivityMs(session) + idleMs;
            if (idleUntil > now) return idleUntil;
            await kv.update(KV.sessions, sessionId, [
              { type: "set", path: "endedAt", value: new Date(now).toISOString() },
              { type: "set", path: "status", value: "completed" },
            ]);
            return "ended" as const;
          });
          if (typeof outcome === "number") {
            await scheduleSessionFinalize(kv, sessionId, outcome);
            rescheduled++;
            continue;
          }
          await clearSessionFinalize(kv, sessionId);
          if (outcome === "drop") {
            dropped++;
            continue;
          }
          finalized++;
          void sdk
            .trigger({
              function_id: "event::session::stopped",
              payload: { sessionId },
              action: TriggerAction.Void(),
            })
            .catch((err) => {
              logger.warn("event::session::stopped trigger failed", {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        } catch (err) {
          failed++;
          logger.warn("Session finalize failed", {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (finalized > 0 || failed > 0) {
        logger.info("Idle sessions finalized", {
          due: dueCount,
          finalized,
          rescheduled,
          dropped,
          failed,
        });
      }
      return {
        success: failed === 0,
        due: dueCount,
        finalized,
        rescheduled,
        dropped,
        failed,
        ...(failed > 0 ? { error: `${failed} session finalize(s) failed` } : {}),
      };
    },
  );
}
