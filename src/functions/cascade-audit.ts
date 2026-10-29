import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { collectAll } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { AuditEntry, Memory, MemoryRelation, RelationReactionMark, Session } from "../types.js";
import { recordAudit } from "./audit.js";
import { deleteFacetsCascade } from "./facets.js";
import { getSearchIndex, scheduleIndexSave, vectorIndexAddGuarded, vectorIndexRemove } from "./search.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { singleFlight } from "../runtime/recovery.js";
import { logger } from "../logger.js";

const FAILURE_OPS: Record<string, AuditEntry["operation"]> = {
  "mem::compress": "compress-failed",
  "mem::summarize": "summarize-failed",
  "mem::graph-extract": "graph-extract-failed",
  "mem::consolidate-pipeline": "consolidate-failed",
  "mem::reflect": "reflect-failed",
  "mem::skill-extract": "skill-extract-failed",
};

const RETRYABLE_CODES = new Set([
  "compression_timeout", "timeout", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
  "circuit_breaker_open", "parse_failed", "empty_response", "overloaded", "compression_failed",
]);
const PERMANENT_CODES = new Set([
  "source_unavailable", "invalid_raw_observation", "invalid_observation_identity",
  "observation_changed", "observation_not_found", "prompt_too_long", "content_policy",
]);

function failureCode(envelope: Record<string, unknown>): string {
  const err = envelope.error as { code?: string; status?: number } | undefined;
  if (err?.code) return err.code;
  const output = envelope.output as { error?: string; code?: string } | undefined;
  if (typeof output?.error === "string") return output.error;
  if (typeof output?.code === "string") return output.code;
  if (typeof err?.status === "number") return `http_${err.status}`;
  return "unknown";
}

function isRetryable(code: string, envelope: Record<string, unknown>): boolean {
  if (RETRYABLE_CODES.has(code)) return true;
  if (PERMANENT_CODES.has(code)) return false;
  const err = envelope.error as { status?: number; statusCode?: number } | undefined;
  const status = err?.status ?? err?.statusCode;
  if (typeof status === "number") return status === 429 || status >= 500;
  if (code.startsWith("invalid_")) return false;
  if (code.includes("timeout") || code.includes("unavailable")) return true;
  return false;
}

const DEDUPE_WINDOW_MS = 60_000;
const DEDUPE_MAX = 512;
const dedupe = new Map<string, { seenAt: number; skipped: number }>();
const counters = { transient: 0, permanent: 0, lastAt: null as string | null };

export function failureCounters(): { transient: number; permanent: number; lastAt: string | null } {
  return { ...counters };
}

function extractTargetIds(envelope: Record<string, unknown>): string[] {
  const input = (envelope.input ?? {}) as Record<string, unknown>;
  const ids = [input.observationId, input.sessionId, input.memoryId, input.id]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const obs = input.observations;
  if (Array.isArray(obs)) {
    for (const o of obs.slice(0, 10)) {
      if (o && typeof o.id === "string" && !ids.includes(o.id)) ids.push(o.id);
    }
  }
  return [...new Set(ids)].slice(0, 20);
}

function pruneDedupe(now: number): void {
  if (dedupe.size <= DEDUPE_MAX) return;
  for (const [k, v] of dedupe) {
    if (now - v.seenAt > DEDUPE_WINDOW_MS) dedupe.delete(k);
  }
  while (dedupe.size > DEDUPE_MAX) {
    const first = dedupe.keys().next().value;
    if (first === undefined) break;
    dedupe.delete(first);
  }
}

const DELETE_BATCH_MS = 500;
const DELETE_BATCH_MAX = 200;
type PendingDelete = { id: string; kind: "memory" | "observation" | "lesson"; sessionId?: string };
const pendingDeletes = new Map<string, PendingDelete>();
const pendingSessions = new Set<string>();
let deleteTimer: ReturnType<typeof setTimeout> | null = null;
let deleteFlusher: (() => Promise<void>) | null = null;

function scheduleDeleteFlush(): void {
  if (deleteTimer) return;
  deleteTimer = setTimeout(() => { deleteTimer = null; void flushDeleteCascade().catch(() => reportFlushFailure()); }, DELETE_BATCH_MS);
  deleteTimer.unref();
}

function reportFlushFailure(): void {
  scheduleDeleteFlush();
}

function queueDeleteCascade(item: PendingDelete): void {
  pendingDeletes.set(`${item.kind}:${item.id}`, item);
  if (item.sessionId) pendingSessions.add(item.sessionId);
  if (pendingDeletes.size >= DELETE_BATCH_MAX) void flushDeleteCascade().catch(() => reportFlushFailure());
  else scheduleDeleteFlush();
}

async function deleteTargetGone(kv: StateKV, item: PendingDelete): Promise<boolean> {
  if (item.kind === "memory") return (await kv.get(KV.memories, item.id)) === null;
  if (item.kind === "observation" && item.sessionId) {
    return (await kv.get(KV.observations(item.sessionId), item.id)) === null;
  }
  if (item.kind === "lesson") {
    const lesson = await kv.get<{ deleted?: boolean }>(KV.lessons, item.id);
    return lesson === null || lesson.deleted === true;
  }
  return true;
}

const KIND_TARGET_TYPE: Record<string, string | null> = { memory: "memory", observation: "observation", lesson: "memory" };

export async function flushDeleteCascade(): Promise<void> {
  if (!deleteFlusher) return;
  await deleteFlusher();
}

export function registerCascadeFunctions(sdk: IIIClient, kv: StateKV): void {
  deleteFlusher = singleFlight(async () => {
    if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
    const items = [...pendingDeletes.values()];
    const sessions = [...pendingSessions];
    pendingDeletes.clear();
    pendingSessions.clear();
    if (items.length === 0 && sessions.length === 0) return;
    try {
      const gone = (await Promise.all(items.map((item) => deleteTargetGone(kv, item).catch(() => false))))
        .map((ok, i) => (ok ? items[i]! : null))
        .filter((item): item is PendingDelete => item !== null);
      await Promise.all(gone.map(async (item) => {
        const targetType = KIND_TARGET_TYPE[item.kind];
        if (!targetType) return;
        await deleteFacetsCascade(kv, [item.id], targetType);
      }));
      const reconciled: string[] = [];
      for (const sessionId of sessions) {
        await withKeyedLock(`obs:${sessionId}`, async () => {
          const keys = await kv.listKeys(KV.observations(sessionId));
          const session = await kv.get<Session>(KV.sessions, sessionId);
          if (session && keys.length !== session.observationCount) {
            await kv.update<Session>(KV.sessions, sessionId, [
              { type: "set", path: "observationCount", value: keys.length },
            ]);
            reconciled.push(sessionId);
          }
        });
      }
      await recordAudit(kv, "cascade", "mem::on-record-deleted", items.map((item) => item.id).slice(0, 20), {
        batched: items.length,
        sessionsReconciled: reconciled,
      });
    } catch (err) {
      logger.warn("Delete cascade flush failed", {
        ids: items.length,
        sessions: sessions.length,
        error: err instanceof Error ? err.message : String(err),
      });
      for (const item of items) pendingDeletes.set(`${item.kind}:${item.id}`, item);
      for (const sessionId of sessions) pendingSessions.add(sessionId);
      throw err;
    } finally {
      if (pendingDeletes.size > 0 || pendingSessions.size > 0) scheduleDeleteFlush();
    }
  });
  sdk.registerFunction("mem::record-failure", async (envelope: Record<string, unknown>) => {
    const meta = envelope.metadata as { function_id?: string; source_fn?: string; observer_id?: string } | undefined;
    const observerId = (envelope.observer_id ?? meta?.observer_id ?? envelope.observer) as string | undefined;
    const fromObserverId = typeof observerId === "string" ? /agentmemory:pipeline:failure:(mem::[a-z-]+):(?:error|soft)/.exec(observerId)?.[1] : undefined;
    const functionId = meta?.source_fn ?? meta?.function_id ?? fromObserverId ?? (envelope.caller as { function_id?: string } | undefined)?.function_id ?? "unknown";
    const code = failureCode(envelope);
    const retryable = isRetryable(code, envelope);
    const now = Date.now();
    const key = `${functionId}|${code}`;
    pruneDedupe(now);
    const prior = dedupe.get(key);
    const dedupedCount = prior?.skipped ?? 0;
    if (retryable) counters.transient++; else counters.permanent++;
    counters.lastAt = new Date(now).toISOString();
    if (prior && now - prior.seenAt < DEDUPE_WINDOW_MS) {
      prior.skipped++;
      return { deduped: true, code };
    }
    dedupe.set(key, { seenAt: now, skipped: 0 });
    const errMsg = (envelope.error as { message?: string } | undefined)?.message ??
      (envelope.output as { error?: string } | undefined)?.error ?? "";
    const op = FAILURE_OPS[functionId] ?? "cascade";
    await recordAudit(kv, op, functionId, extractTargetIds(envelope), {
      code,
      message: String(errMsg).slice(0, 300),
      retryable,
      durationMs: (envelope.metadata as { duration_ms?: number } | undefined)?.duration_ms,
      dedupedCount,
    });
    return { recorded: true, code, retryable };
  });

  sdk.registerFunction("mem::on-record-deleted", (event: Record<string, unknown>) => {
    const scope = String(event.scope ?? "");
    const id = String(event.key ?? "");
    if (!id) return Promise.resolve({ skipped: "no_key" });
    try { getSearchIndex().remove(id); } catch {}
    try { vectorIndexRemove(id); } catch {}
    const sessionId = scope.startsWith("mem:obs:") ? scope.slice("mem:obs:".length) : undefined;
    const kind = sessionId ? "observation" : scope === KV.lessons ? "lesson" : "memory";
    queueDeleteCascade({ id, kind, sessionId });
    return Promise.resolve({ removed: id, queued: true });
  });

  sdk.registerFunction("event::graph::edge-reaction", async (event: Record<string, unknown>) => {
    const rel = (event.event_type === "state:deleted" ? event.old_value : event.new_value) as MemoryRelation | undefined;
    if (!rel || typeof rel.targetId !== "string") return { skipped: "no_relation" };
    const relationId = String(event.key ?? `${rel.sourceId}->${rel.targetId}:${rel.type}`);
    const markKey = `${rel.targetId}:${rel.type}`;
    const deleted = event.event_type === "state:deleted";
    const result = await withKeyedLock(`mem:${rel.targetId}`, async () => {
      const target = await kv.get<Memory>(KV.memories, rel.targetId);
      if (!target) {
        await recordAudit(kv, "relation_reaction", "event::graph::edge-reaction", [rel.targetId], {
          skipped: "missing_target", type: rel.type, relationId,
        });
        return { skipped: "missing_target" as const };
      }
      const mark = await kv.get<RelationReactionMark>(KV.relationReactions, markKey);
      if (!deleted) {
        if (mark?.sources && Object.hasOwn(mark.sources, relationId)) {
          return { skipped: "already_applied" as const, relationId };
        }
        if (rel.type === "supersedes") {
          const reverseMark = await kv.get<RelationReactionMark>(KV.relationReactions, `${rel.sourceId}:supersedes`);
          if (reverseMark && Object.values(reverseMark.sources).includes(rel.targetId)) {
            await recordAudit(kv, "relation_reaction", "event::graph::edge-reaction", [rel.targetId, rel.sourceId], {
              skipped: "cycle", type: rel.type, relationId,
            });
            return { skipped: "cycle" as const };
          }
        }
        const next: RelationReactionMark = mark ?? {
          targetId: rel.targetId,
          type: rel.type,
          sources: {},
          firstAppliedAt: rel.createdAt,
          lastAppliedAt: rel.createdAt,
        };
        next.sources[relationId] = rel.sourceId;
        next.lastAppliedAt = rel.createdAt;
        if (rel.type === "supersedes") {
          if (!mark) {
            next.isLatestBefore = target.isLatest;
            next.strengthBefore = target.strength;
            const wasLatest = target.isLatest === true;
            target.isLatest = false;
            target.strength = target.strength * 0.5;
            if (wasLatest) {
              try { getSearchIndex().remove(rel.targetId); } catch {}
              try { vectorIndexRemove(rel.targetId); } catch {}
            }
          }
        } else if (rel.type === "contradicts") {
          const before = target.confidence;
          target.confidence = Math.max(0.05, target.confidence - (rel.confidence ?? 0.5) * 0.3);
          next.contradictDeltas = { ...(next.contradictDeltas ?? {}), [relationId]: before - target.confidence };
        } else if (rel.type === "extends") {
          const related = target.relatedIds ?? [];
          if (!related.includes(rel.sourceId)) {
            target.relatedIds = [...related, rel.sourceId];
            next.relatedIdsAdded = [...(next.relatedIdsAdded ?? []), rel.sourceId];
          }
        } else {
          return { skipped: "unsupported_type" as const };
        }
        await kv.set(KV.memories, rel.targetId, target);
        await kv.set(KV.relationReactions, markKey, next);
        return { reacted: true as const, contributors: Object.keys(next.sources).length };
      }
      if (!mark || !Object.hasOwn(mark.sources, relationId)) {
        return { skipped: "no_mark" as const };
      }
      delete mark.sources[relationId];
      if (rel.type === "contradicts" && mark.contradictDeltas) {
        const delta = mark.contradictDeltas[relationId];
        if (delta !== undefined) {
          target.confidence = Math.min(1, target.confidence + delta);
          delete mark.contradictDeltas[relationId];
        }
      }
      if (Object.keys(mark.sources).length > 0) {
        await kv.set(KV.memories, rel.targetId, target);
        await kv.set(KV.relationReactions, markKey, mark);
        return { unreacted: false as const, remaining: Object.keys(mark.sources).length };
      }
      const restoredLatest = mark.isLatestBefore !== undefined && target.isLatest !== true && mark.isLatestBefore === true;
      if (mark.isLatestBefore !== undefined) target.isLatest = mark.isLatestBefore;
      if (mark.strengthBefore !== undefined) target.strength = mark.strengthBefore;
      if (mark.confidenceBefore !== undefined) target.confidence = mark.confidenceBefore;
      if (restoredLatest) {
        try { getSearchIndex().add(memoryToObservation(target), "memory"); scheduleIndexSave(); } catch {}
        try { void vectorIndexAddGuarded(rel.targetId, memoryToObservation(target)); } catch {}
      }
      if (mark.relatedIdsAdded?.length) {
        const added = new Set(mark.relatedIdsAdded);
        target.relatedIds = (target.relatedIds ?? []).filter((id) => !added.has(id));
      }
      await kv.set(KV.memories, rel.targetId, target);
      await kv.delete(KV.relationReactions, markKey);
      return { unreacted: true as const };
    });
    const skip = (result as { skipped?: string }).skipped;
    if (skip !== "cycle" && skip !== "missing_target") {
      await recordAudit(kv, "relation_reaction", "event::graph::edge-reaction", [rel.targetId], {
        type: rel.type, relationId, deleted, ...result,
      });
    }
    return { relationId, markKey, ...result };
  });
}
