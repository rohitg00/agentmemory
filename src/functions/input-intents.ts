import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { fingerprintId, generateId, KV } from "../state/schema.js";
import type {
  InputDeliveryEvidence,
  InputIntent,
  InputIntentStatus,
} from "../types.js";
import { recordAudit } from "./audit.js";

const DEFAULT_CLAIM_TTL_MS = 60_000;
const MAX_CLAIM_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 10;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_LIST_LIMIT = 500;
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SESSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const ERROR_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const INPUT_CLAIM_LOCK = "mem:input-intents:claim";

type EnqueueInput = {
  idempotencyKey: string;
  targetSession: string;
  sourceSession?: string;
  payloadRef: string;
  payloadSha256: string;
  payloadBytes: number;
  maxAttempts?: number;
  notBefore?: string;
  expiresAt?: string;
  actor?: string;
};

type ClaimInput = {
  workerId: string;
  targetSession?: string;
  ttlMs?: number;
};

type SettleOutcome = "accepted" | "ambiguous" | "blocked" | "retry";

function nonEmpty(value: unknown, maxLength = 256): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function validIso(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return null;
  }
  return value;
}

function clearClaim(intent: InputIntent): void {
  intent.claimedBy = undefined;
  intent.claimToken = undefined;
  intent.claimExpiresAt = undefined;
}

function immutableInputMatches(
  existing: InputIntent,
  input: {
    idempotencyKey: string;
    targetSession: string;
    sourceSession?: string;
    payloadRef: string;
    payloadSha256: string;
    payloadBytes: number;
  },
): boolean {
  return (
    existing.idempotencyKey === input.idempotencyKey &&
    existing.targetSession === input.targetSession &&
    existing.sourceSession === input.sourceSession &&
    existing.payloadRef === input.payloadRef &&
    existing.payloadSha256 === input.payloadSha256 &&
    existing.payloadBytes === input.payloadBytes
  );
}

function isDue(intent: InputIntent, now: number): boolean {
  return (
    intent.status === "queued" &&
    (!intent.notBefore || new Date(intent.notBefore).getTime() <= now) &&
    (!intent.expiresAt || new Date(intent.expiresAt).getTime() > now)
  );
}

function parseEvidence(
  value: unknown,
  expectedSha256: string,
): InputDeliveryEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.source !== "provider_transcript") return null;
  if (raw.messageSha256 !== expectedSha256) return null;
  const observedAt = validIso(raw.observedAt);
  if (!observedAt) return null;
  const transcriptCursor =
    raw.transcriptCursor === undefined
      ? undefined
      : nonEmpty(raw.transcriptCursor, 512);
  if (raw.transcriptCursor !== undefined && !transcriptCursor) return null;
  return {
    source: "provider_transcript",
    observedAt,
    messageSha256: expectedSha256,
    ...(transcriptCursor ? { transcriptCursor } : {}),
  };
}

async function persistAutomaticTransition(
  kv: StateKV,
  intent: InputIntent,
  status: InputIntentStatus,
  errorCode: string,
  nowIso: string,
): Promise<void> {
  const previousStatus = intent.status;
  intent.status = status;
  intent.lastErrorCode = errorCode;
  intent.updatedAt = nowIso;
  intent.revision += 1;
  clearClaim(intent);
  await kv.set(KV.inputIntents, intent.id, intent);
  await recordAudit(
    kv,
    "input_settle",
    "mem::input-claim",
    [intent.id],
    { previousStatus, status, errorCode, automatic: true },
  );
}

export function registerInputIntentsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::input-enqueue", async (data: EnqueueInput) => {
    const idempotencyKey = nonEmpty(data.idempotencyKey, 256);
    const targetSession = nonEmpty(data.targetSession, 256);
    const sourceSession =
      data.sourceSession === undefined
        ? undefined
        : nonEmpty(data.sourceSession, 256);
    const payloadRef = nonEmpty(data.payloadRef, 200);
    const payloadSha256 = nonEmpty(data.payloadSha256, 64);
    const payloadBytes =
      data.payloadBytes === undefined
        ? null
        : boundedInteger(data.payloadBytes, 0, 1, MAX_PAYLOAD_BYTES);
    const maxAttempts = boundedInteger(
      data.maxAttempts,
      DEFAULT_MAX_ATTEMPTS,
      1,
      MAX_ATTEMPTS,
    );
    const notBefore = validIso(data.notBefore);
    const expiresAt = validIso(data.expiresAt);
    if (
      !idempotencyKey ||
      !OPAQUE_REF.test(idempotencyKey) ||
      !targetSession ||
      !SESSION_REF.test(targetSession) ||
      (data.sourceSession !== undefined && !sourceSession) ||
      (sourceSession && !SESSION_REF.test(sourceSession)) ||
      !payloadRef ||
      !OPAQUE_REF.test(payloadRef) ||
      !payloadSha256 ||
      !SHA256.test(payloadSha256) ||
      payloadBytes === null ||
      maxAttempts === null ||
      notBefore === null ||
      expiresAt === null
    ) {
      return { success: false, error: "invalid_input_intent" };
    }
    if (
      notBefore &&
      expiresAt &&
      new Date(expiresAt).getTime() <= new Date(notBefore).getTime()
    ) {
      return { success: false, error: "expiresAt_must_follow_notBefore" };
    }

    const id = fingerprintId(
      "inp",
      `${targetSession}\0${idempotencyKey}`,
    );
    return withKeyedLock(`mem:input-intent:${id}`, async () => {
      const existing = await kv.get<InputIntent>(KV.inputIntents, id);
      const immutable = {
        idempotencyKey,
        targetSession,
        sourceSession: sourceSession ?? undefined,
        payloadRef,
        payloadSha256,
        payloadBytes,
      };
      if (existing) {
        if (!immutableInputMatches(existing, immutable)) {
          return {
            success: false,
            error: "idempotency_conflict",
            intentId: id,
          };
        }
        return {
          success: true,
          intent: existing,
          deduplicated: true,
          receipt: { intentId: id, revision: existing.revision },
        };
      }

      const now = new Date().toISOString();
      const intent: InputIntent = {
        schemaVersion: 1,
        id,
        ...immutable,
        status: "queued",
        attempts: 0,
        maxAttempts,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        ...(notBefore ? { notBefore } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      };
      await kv.set(KV.inputIntents, id, intent);
      await recordAudit(kv, "input_enqueue", "mem::input-enqueue", [id], {
        targetSession,
        sourceSession,
        payloadSha256,
        payloadBytes,
        maxAttempts,
        actor: data.actor,
      });
      return {
        success: true,
        intent,
        deduplicated: false,
        receipt: { intentId: id, revision: intent.revision },
      };
    });
  });

  sdk.registerFunction("mem::input-claim", async (data: ClaimInput) => {
    const workerId = nonEmpty(data.workerId, 256);
    const targetSession =
      data.targetSession === undefined
        ? undefined
        : nonEmpty(data.targetSession, 256);
    const ttlMs = boundedInteger(
      data.ttlMs,
      DEFAULT_CLAIM_TTL_MS,
      1_000,
      MAX_CLAIM_TTL_MS,
    );
    if (
      !workerId ||
      !SESSION_REF.test(workerId) ||
      (data.targetSession !== undefined && !targetSession) ||
      (targetSession && !SESSION_REF.test(targetSession)) ||
      ttlMs === null
    ) {
      return { success: false, error: "invalid_claim_request" };
    }

    return withKeyedLock(INPUT_CLAIM_LOCK, async () => {
      const intents = await kv.list<InputIntent>(KV.inputIntents);
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      for (const intent of intents) {
        if (
          intent.status === "claimed" &&
          intent.claimExpiresAt &&
          new Date(intent.claimExpiresAt).getTime() <= now
        ) {
          if (intent.deliveryStartedAt) {
            await persistAutomaticTransition(
              kv,
              intent,
              "ambiguous",
              "claim_expired_after_delivery_start",
              nowIso,
            );
          } else {
            await persistAutomaticTransition(
              kv,
              intent,
              "queued",
              "claim_expired_before_delivery_start",
              nowIso,
            );
          }
        }
        if (
          intent.status === "queued" &&
          intent.expiresAt &&
          new Date(intent.expiresAt).getTime() <= now
        ) {
          await persistAutomaticTransition(
            kv,
            intent,
            "blocked",
            "intent_expired",
            nowIso,
          );
        }
        if (intent.status === "queued" && intent.attempts >= intent.maxAttempts) {
          await persistAutomaticTransition(
            kv,
            intent,
            "blocked",
            "attempt_budget_exhausted",
            nowIso,
          );
        }
      }

      const candidate = intents
        .filter(
          (intent) =>
            isDue(intent, now) &&
            intent.attempts < intent.maxAttempts &&
            (!targetSession || intent.targetSession === targetSession),
        )
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
              new Date(right.createdAt).getTime() ||
            left.id.localeCompare(right.id),
        )[0];
      if (!candidate) {
        return { success: true, intent: null };
      }

      const claimToken = generateId("ict");
      candidate.status = "claimed";
      candidate.claimedBy = workerId;
      candidate.claimToken = claimToken;
      candidate.claimExpiresAt = new Date(now + ttlMs).toISOString();
      candidate.deliveryStartedAt = undefined;
      candidate.attempts += 1;
      candidate.updatedAt = nowIso;
      candidate.revision += 1;
      await kv.set(KV.inputIntents, candidate.id, candidate);
      await recordAudit(
        kv,
        "input_claim",
        "mem::input-claim",
        [candidate.id],
        {
          workerId,
          targetSession: candidate.targetSession,
          attempts: candidate.attempts,
          claimExpiresAt: candidate.claimExpiresAt,
        },
      );
      return { success: true, intent: candidate, claimToken };
    });
  });

  sdk.registerFunction(
    "mem::input-start",
    async (data: {
      intentId: string;
      workerId: string;
      claimToken: string;
    }) => {
      const intentId = nonEmpty(data.intentId, 256);
      const workerId = nonEmpty(data.workerId, 256);
      const claimToken = nonEmpty(data.claimToken, 256);
      if (!intentId || !workerId || !claimToken) {
        return { success: false, error: "invalid_delivery_start" };
      }
      return withKeyedLock(`mem:input-intent:${intentId}`, async () => {
        const intent = await kv.get<InputIntent>(KV.inputIntents, intentId);
        if (!intent) return { success: false, error: "intent_not_found" };
        if (
          intent.status !== "claimed" ||
          intent.claimedBy !== workerId ||
          intent.claimToken !== claimToken
        ) {
          return { success: false, error: "claim_mismatch" };
        }
        if (intent.deliveryStartedAt) {
          return { success: true, intent, deduplicated: true };
        }
        intent.deliveryStartedAt = new Date().toISOString();
        intent.updatedAt = intent.deliveryStartedAt;
        intent.revision += 1;
        await kv.set(KV.inputIntents, intent.id, intent);
        await recordAudit(
          kv,
          "input_delivery",
          "mem::input-start",
          [intent.id],
          { workerId, deliveryStartedAt: intent.deliveryStartedAt },
        );
        return { success: true, intent, deduplicated: false };
      });
    },
  );

  sdk.registerFunction(
    "mem::input-settle",
    async (data: {
      intentId: string;
      workerId: string;
      claimToken: string;
      outcome: SettleOutcome;
      evidence?: unknown;
      errorCode?: string;
      notBefore?: string;
    }) => {
      const intentId = nonEmpty(data.intentId, 256);
      const workerId = nonEmpty(data.workerId, 256);
      const claimToken = nonEmpty(data.claimToken, 256);
      const outcomes: SettleOutcome[] = [
        "accepted",
        "ambiguous",
        "blocked",
        "retry",
      ];
      const errorCode =
        data.errorCode === undefined
          ? undefined
          : nonEmpty(data.errorCode, 128);
      const notBefore = validIso(data.notBefore);
      if (
        !intentId ||
        !workerId ||
        !claimToken ||
        !outcomes.includes(data.outcome) ||
        (data.errorCode !== undefined && !errorCode) ||
        (errorCode && !ERROR_CODE.test(errorCode)) ||
        notBefore === null
      ) {
        return { success: false, error: "invalid_settlement" };
      }
      return withKeyedLock(`mem:input-intent:${intentId}`, async () => {
        const intent = await kv.get<InputIntent>(KV.inputIntents, intentId);
        if (!intent) return { success: false, error: "intent_not_found" };
        if (
          intent.status !== "claimed" ||
          intent.claimedBy !== workerId ||
          intent.claimToken !== claimToken
        ) {
          return { success: false, error: "claim_mismatch" };
        }
        if (data.outcome === "retry" && intent.deliveryStartedAt) {
          return {
            success: false,
            error: "unsafe_retry_after_delivery_start",
          };
        }

        const evidence =
          data.outcome === "accepted"
            ? parseEvidence(data.evidence, intent.payloadSha256)
            : undefined;
        if (data.outcome === "accepted" && !evidence) {
          return {
            success: false,
            error: "accepted_requires_matching_transcript_evidence",
          };
        }

        const previousStatus = intent.status;
        const now = new Date().toISOString();
        if (data.outcome === "retry") {
          intent.status = "queued";
          intent.notBefore = notBefore;
          intent.deliveryStartedAt = undefined;
        } else {
          intent.status = data.outcome;
          intent.settledAt = now;
        }
        intent.evidence = evidence ?? undefined;
        intent.lastErrorCode = errorCode ?? undefined;
        intent.updatedAt = now;
        intent.revision += 1;
        clearClaim(intent);
        await kv.set(KV.inputIntents, intent.id, intent);
        await recordAudit(
          kv,
          "input_settle",
          "mem::input-settle",
          [intent.id],
          {
            workerId,
            previousStatus,
            status: intent.status,
            errorCode,
            evidenceSource: evidence?.source,
          },
        );
        return { success: true, intent };
      });
    },
  );

  sdk.registerFunction(
    "mem::input-list",
    async (data: {
      intentId?: string;
      targetSession?: string;
      statuses?: InputIntentStatus[];
      limit?: number;
    }) => {
      const intentId =
        data.intentId === undefined ? undefined : nonEmpty(data.intentId, 256);
      const targetSession =
        data.targetSession === undefined
          ? undefined
          : nonEmpty(data.targetSession, 256);
      const allowedStatuses: InputIntentStatus[] = [
        "queued",
        "claimed",
        "accepted",
        "ambiguous",
        "blocked",
        "cancelled",
      ];
      const statuses =
        data.statuses === undefined
          ? undefined
          : Array.isArray(data.statuses)
            ? data.statuses.filter((status) => allowedStatuses.includes(status))
            : null;
      const limit = boundedInteger(data.limit, 100, 1, MAX_LIST_LIMIT);
      if (
        (data.intentId !== undefined && !intentId) ||
        (data.targetSession !== undefined && !targetSession) ||
        (data.statuses !== undefined &&
          (statuses == null || statuses.length !== data.statuses.length)) ||
        limit === null
      ) {
        return { success: false, error: "invalid_input_list_query" };
      }
      let intents = await kv.list<InputIntent>(KV.inputIntents);
      if (intentId) intents = intents.filter((intent) => intent.id === intentId);
      if (targetSession) {
        intents = intents.filter(
          (intent) => intent.targetSession === targetSession,
        );
      }
      if (statuses) {
        intents = intents.filter((intent) => statuses.includes(intent.status));
      }
      intents.sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime() ||
          left.id.localeCompare(right.id),
      );
      return { success: true, intents: intents.slice(0, limit) };
    },
  );

  sdk.registerFunction(
    "mem::input-cancel",
    async (data: { intentId: string; actor: string; reason?: string }) => {
      const intentId = nonEmpty(data.intentId, 256);
      const actor = nonEmpty(data.actor, 256);
      const reason =
        data.reason === undefined ? undefined : nonEmpty(data.reason, 256);
      if (
        !intentId ||
        !actor ||
        !SESSION_REF.test(actor) ||
        (reason && !ERROR_CODE.test(reason)) ||
        (data.reason !== undefined && !reason)
      ) {
        return { success: false, error: "invalid_cancel_request" };
      }
      return withKeyedLock(`mem:input-intent:${intentId}`, async () => {
        const intent = await kv.get<InputIntent>(KV.inputIntents, intentId);
        if (!intent) return { success: false, error: "intent_not_found" };
        if (intent.status === "claimed") {
          return { success: false, error: "claimed_intent_cannot_be_cancelled" };
        }
        if (intent.status === "accepted" || intent.status === "cancelled") {
          return { success: false, error: `intent_already_${intent.status}` };
        }
        const previousStatus = intent.status;
        intent.status = "cancelled";
        intent.settledAt = new Date().toISOString();
        intent.updatedAt = intent.settledAt;
        intent.lastErrorCode = reason ?? undefined;
        intent.revision += 1;
        clearClaim(intent);
        await kv.set(KV.inputIntents, intent.id, intent);
        await recordAudit(
          kv,
          "input_cancel",
          "mem::input-cancel",
          [intent.id],
          { actor, previousStatus, reason },
        );
        return { success: true, intent };
      });
    },
  );
}
