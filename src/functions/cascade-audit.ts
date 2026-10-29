import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { collectAll } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { AuditEntry, Memory, MemoryRelation, RelationReactionMark, Session } from "../types.js";
import { recordAudit } from "./audit.js";
import { deleteFacetsCascade } from "./facets.js";
import { getSearchIndex, vectorIndexRemove } from "./search.js";

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

export function registerCascadeFunctions(sdk: IIIClient, kv: StateKV): void {
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
    if (prior && now - prior.seenAt < DEDUPE_WINDOW_MS) {
      prior.skipped++;
      prior.seenAt = now;
      return { deduped: true, code };
    }
    dedupe.set(key, { seenAt: now, skipped: 0 });
    if (retryable) counters.transient++; else counters.permanent++;
    counters.lastAt = new Date().toISOString();
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

  sdk.registerFunction("mem::on-record-deleted", async (event: Record<string, unknown>) => {
    const scope = String(event.scope ?? "");
    const id = String(event.key ?? "");
    if (!id) return { skipped: "no_key" };
    try { getSearchIndex().remove(id); } catch {}
    try { vectorIndexRemove(id); } catch {}
    await deleteFacetsCascade(kv, [id]);
    let sessionReconciled = false;
    if (scope.startsWith("mem:obs:")) {
      const sessionId = scope.slice("mem:obs:".length);
      const keys = await kv.listKeys(scope);
      const session = await kv.get<Session>(KV.sessions, sessionId);
      if (session && keys.length !== session.observationCount) {
        await kv.update<Session>(KV.sessions, sessionId, [
          { op: "set", path: "observationCount", value: keys.length },
        ]);
        sessionReconciled = true;
      }
    }
    await recordAudit(kv, "cascade", "mem::on-record-deleted", [id], {
      scope,
      eventType: event.event_type,
      sessionReconciled,
    });
    return { removed: id, sessionReconciled };
  });

  sdk.registerFunction("event::graph::edge-reaction", async (event: Record<string, unknown>) => {
    const rel = (event.event_type === "state:deleted" ? event.old_value : event.new_value) as MemoryRelation | undefined;
    if (!rel || typeof rel.targetId !== "string") return { skipped: "no_relation" };
    const relationId = String(event.key ?? `${rel.sourceId}->${rel.targetId}:${rel.type}`);
    const deleted = event.event_type === "state:deleted";
    if (!deleted) {
      const existing = await kv.get<RelationReactionMark>(KV.relationReactions, relationId);
      if (existing) return { skipped: "already_applied", relationId };
    }
    const all = await collectAll<MemoryRelation>(kv, KV.relations);
    if (!deleted) {
      const cyclic = all.find((r) => r.type === rel.type && r.sourceId === rel.targetId && r.targetId === rel.sourceId && `${r.sourceId}->${r.targetId}:${r.type}` !== relationId);
      if (cyclic) {
        await recordAudit(kv, "relation_reaction", "event::graph::edge-reaction", [rel.targetId, rel.sourceId], {
          skipped: "cycle", type: rel.type, relationId,
        });
        return { skipped: "cycle", relationId };
      }
    }
    if (deleted) {
      const remaining = all.find((r) => r.type === rel.type && r.targetId === rel.targetId && `${r.sourceId}->${r.targetId}:${r.type}` !== relationId);
      if (remaining) return { unreacted: false, remaining: true };
    }
    const mark = deleted ? await kv.get<RelationReactionMark>(KV.relationReactions, relationId) : null;
    const result = await withKeyedLock(`mem:${rel.targetId}`, async () => {
      const target = await kv.get<Memory>(KV.memories, rel.targetId);
      if (!target) {
        await recordAudit(kv, "relation_reaction", "event::graph::edge-reaction", [rel.targetId], {
          skipped: "missing_target", type: rel.type, relationId,
        });
        return { skipped: "missing_target" as const };
      }
      if (deleted) {
        if (!mark) return { skipped: "no_mark" as const };
        if (mark.isLatestBefore !== undefined) target.isLatest = mark.isLatestBefore;
        if (mark.strengthBefore !== undefined) target.strength = mark.strengthBefore;
        if (mark.confidenceBefore !== undefined) target.confidence = mark.confidenceBefore;
        if (mark.relatedIdsBefore !== undefined) target.relatedIds = mark.relatedIdsBefore;
        await kv.set(KV.memories, rel.targetId, target);
        return { unreacted: true as const };
      }
      const appliedAt = rel.createdAt;
      const nextMark: RelationReactionMark = { relationId, type: rel.type, targetId: rel.targetId, appliedAt };
      if (rel.type === "supersedes") {
        nextMark.isLatestBefore = target.isLatest;
        nextMark.strengthBefore = target.strength;
        target.isLatest = false;
        target.strength = target.strength * 0.5;
      } else if (rel.type === "contradicts") {
        nextMark.confidenceBefore = target.confidence;
        target.confidence = Math.max(0.05, target.confidence - (rel.confidence ?? 0.5) * 0.3);
      } else if (rel.type === "extends") {
        nextMark.relatedIdsBefore = target.relatedIds ?? [];
        target.relatedIds = [...new Set([...(target.relatedIds ?? []), rel.sourceId])];
      } else {
        return { skipped: "unsupported_type" as const };
      }
      await kv.set(KV.memories, rel.targetId, target);
      await kv.set(KV.relationReactions, relationId, nextMark);
      return { reacted: true as const };
    });
    if (deleted && (result as { unreacted?: boolean }).unreacted) {
      await kv.delete(KV.relationReactions, relationId).catch(() => {});
    }
    await recordAudit(kv, "relation_reaction", "event::graph::edge-reaction", [rel.targetId], {
      type: rel.type, relationId, deleted, ...result,
    });
    return { relationId, ...result };
  });
}
