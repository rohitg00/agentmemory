import { TriggerAction, type ISdk } from "iii-sdk";
import type { SessionBudget } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { SYSTEM_SESSION } from "../state/session-context.js";
import {
  getSessionTokenCap,
  getSystemTokenCap,
  getSessionBudgetRetentionDays,
  getCostRatesPer1M,
  SESSION_BUDGET_WARN_RATIO,
} from "../config.js";
import { safeAudit } from "./audit.js";
import { getHistograms } from "../telemetry/setup.js";
import { logger } from "../logger.js";

function defaultCapFor(sessionId: string): number {
  return sessionId === SYSTEM_SESSION ? getSystemTokenCap() : getSessionTokenCap();
}

function newBudget(
  sessionId: string,
  tokenCap: number,
  now: string,
): SessionBudget {
  return {
    sessionId,
    tokenCap,
    tokensUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
    costEstimate: 0,
    callCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function emitBudgetEvent(
  sdk: ISdk,
  functionId: string,
  budget: SessionBudget,
): Promise<unknown> {
  return Promise.resolve(
    sdk.trigger({
      function_id: functionId,
      payload: { budget },
      action: TriggerAction.Void(),
    }),
  ).catch(() => {});
}

// Returns the existing budget untouched if one already exists
// so a re-fired session/start never resets a live counter. Fresh per
// sessionId — a forked session gets its own row and its own cap.
export async function initBudget(
  kv: StateKV,
  params: { sessionId: string; tokenCap?: number },
): Promise<SessionBudget> {
  const sessionId = params.sessionId;
  return withKeyedLock(`budget:${sessionId}`, async () => {
    const existing = await kv
      .get<SessionBudget>(KV.sessionBudget, sessionId)
      .catch(() => null);
    if (existing) return existing;
    const now = new Date().toISOString();
    const cap = typeof params.tokenCap === "number" && params.tokenCap > 0
        ? Math.floor(params.tokenCap)
        : defaultCapFor(sessionId);
    const budget = newBudget(sessionId, cap, now);
    await kv.set(KV.sessionBudget, sessionId, budget);
    return budget;
  });
}

export async function getBudget(
  kv: StateKV,
  sessionId: string,
): Promise<SessionBudget | null> {
  return kv.get<SessionBudget>(KV.sessionBudget, sessionId).catch(() => null);
}

// Read-only fast path used by the provider wrapper before each LLM call.
export async function isBudgetExhausted(
  kv: StateKV,
  sessionId: string,
): Promise<boolean> {
  const b = await getBudget(kv, sessionId);
  if (!b) return false;
  if (b.exhaustedAt) return true;
  return b.tokensUsed >= b.tokenCap;
}


export async function recordBudget(
  kv: StateKV,
  sdk: ISdk,
  params: {
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    model?: string;
  },
): Promise<SessionBudget> {
  const sessionId =
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : SYSTEM_SESSION;
  const inTok = Math.max(0, Math.floor(params.inputTokens || 0));
  const outTok = Math.max(0, Math.floor(params.outputTokens || 0));

  return withKeyedLock(`budget:${sessionId}`, async () => {
    const now = new Date().toISOString();
    const existing = await kv
      .get<SessionBudget>(KV.sessionBudget, sessionId)
      .catch(() => null);
    const budget =
      existing ?? newBudget(sessionId, defaultCapFor(sessionId), now);
    const rates = getCostRatesPer1M();

    const prevUsed = budget.tokensUsed;
    budget.inputTokens += inTok;
    budget.outputTokens += outTok;
    budget.tokensUsed += inTok + outTok;
    budget.callCount += 1;
    budget.costEstimate +=
      (inTok / 1_000_000) * rates.input +
      (outTok / 1_000_000) * rates.output;
    budget.updatedAt = now;

    const warnAt = Math.floor(budget.tokenCap * SESSION_BUDGET_WARN_RATIO);
    const crossedWarn =
      !budget.warnEmittedAt &&
      prevUsed < warnAt &&
      budget.tokensUsed >= warnAt &&
      budget.tokensUsed < budget.tokenCap;
    const crossedExhausted =
      !budget.exhaustedAt && budget.tokensUsed >= budget.tokenCap;

    if (crossedWarn) budget.warnEmittedAt = now;
    if (crossedExhausted) budget.exhaustedAt = now;

    await kv.set(KV.sessionBudget, sessionId, budget);

    try {
      getHistograms().sessionTokensUsed.record(budget.tokensUsed);
    } catch {}

    if (crossedWarn) {
      void emitBudgetEvent(sdk, "event::mem::budget::soft-warned", budget);
      await safeAudit(
        kv,
        "budget_warn",
        "mem::session::budget::record",
        [sessionId],
        { tokensUsed: budget.tokensUsed, tokenCap: budget.tokenCap },
      );
    }
    if (crossedExhausted) {
      void emitBudgetEvent(sdk, "event::mem::budget::exhausted", budget);
      await safeAudit(
        kv,
        "budget_exhausted",
        "mem::session::budget::record",
        [sessionId],
        { tokensUsed: budget.tokensUsed, tokenCap: budget.tokenCap },
      );
    }
    return budget;
  });
}

export async function reapBudgets(
  kv: StateKV,
): Promise<{ swept: number; kept: number }> {
  const retentionMs = getSessionBudgetRetentionDays() * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const budgets = await kv
    .list<SessionBudget>(KV.sessionBudget)
    .catch(() => [] as SessionBudget[]);

  let swept = 0;
  let kept = 0;
  for (const b of budgets) {
    if (!b || !b.sessionId || b.sessionId === SYSTEM_SESSION) {
      kept++;
      continue;
    }
    const session = await kv
      .get<{ endedAt?: string }>(KV.sessions, b.sessionId)
      .catch(() => null);

    let reapable = false;
    if (session?.endedAt) {
      reapable = new Date(session.endedAt).getTime() < cutoff;
    } else if (!session) {
      reapable = new Date(b.updatedAt).getTime() < cutoff;
    }

    if (reapable) {
      try {
        await kv.delete(KV.sessionBudget, b.sessionId);
        swept++;
      } catch (err) {
        kept++;
        logger.warn("session budget reap delete failed", {
          sessionId: b.sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      kept++;
    }
  }
  return { swept, kept };
}


export interface SessionBudgetMeter {
  isExhausted(sessionId: string): Promise<boolean>;
  record(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    model?: string,
  ): Promise<void>;
}

const NOOP_METER: SessionBudgetMeter = {
  isExhausted: async () => false,
  record: async () => {},
};

let activeMeter: SessionBudgetMeter = NOOP_METER;

export function initSessionBudgetMeter(
  kv: StateKV,
  sdk: ISdk,
): SessionBudgetMeter {
  activeMeter = {
    isExhausted: (sessionId) => isBudgetExhausted(kv, sessionId),
    record: async (sessionId, inputTokens, outputTokens, model) => {
      try {
        await recordBudget(kv, sdk, {
          sessionId,
          inputTokens,
          outputTokens,
          model,
        });
      } catch (err) {
        logger.warn("session budget record failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
  return activeMeter;
}

export function getSessionBudgetMeter(): SessionBudgetMeter {
  return activeMeter;
}

export function resetSessionBudgetMeter(): void {
  activeMeter = NOOP_METER;
}

export function registerSessionBudgetFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::session::budget::init",
    async (data: { sessionId?: string; tokenCap?: number } | undefined) => {
      if (!data?.sessionId || typeof data.sessionId !== "string") {
        return { success: false, error: "sessionId is required" };
      }
      const budget = await initBudget(kv, {
        sessionId: data.sessionId.trim(),
        tokenCap: data.tokenCap,
      });
      return { success: true, budget };
    },
  );

  sdk.registerFunction(
    "mem::session::budget::record",
    async (
      data:
        | {
            sessionId?: string;
            inputTokens?: number;
            outputTokens?: number;
            model?: string;
          }
        | undefined,
    ) => {
      if (!data?.sessionId || typeof data.sessionId !== "string") {
        return { success: false, error: "sessionId is required" };
      }
      const budget = await recordBudget(kv, sdk, {
        sessionId: data.sessionId.trim(),
        inputTokens: data.inputTokens ?? 0,
        outputTokens: data.outputTokens ?? 0,
        model: data.model,
      });
      return { success: true, budget };
    },
  );

  sdk.registerFunction(
    "mem::session::budget::get",
    async (data: { sessionId?: string } | undefined) => {
      if (data?.sessionId && typeof data.sessionId === "string") {
        const budget = await getBudget(kv, data.sessionId.trim());
        return { success: true, budget: budget ?? null };
      }
      const budgets = await kv
        .list<SessionBudget>(KV.sessionBudget)
        .catch(() => [] as SessionBudget[]);
      return { success: true, budgets };
    },
  );

  sdk.registerFunction("mem::session::budget::reap", async () => {
    const result = await reapBudgets(kv);
    if (result.swept > 0) {
      logger.info("Session budget reap complete", result);
    }
    return { success: true, ...result };
  });
}
