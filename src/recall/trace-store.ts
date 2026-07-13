import { createHmac, randomBytes } from "node:crypto";
import type { RecallItemStats, RecallTrace, RecallTraceConfig } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { stripPrivateData } from "../functions/privacy.js";
import { withKeyedLock } from "../state/keyed-mutex.js";

const QUERY_SALT_KEY = "recall-query-salt";
const SCORE_SCALE = 1_000_000;

async function querySalt(kv: StateKV): Promise<string> {
  const existing = await kv.get<string>(KV.state, QUERY_SALT_KEY).catch(() => null);
  if (existing) return existing;
  const salt = randomBytes(32).toString("base64url");
  await kv.set(KV.state, QUERY_SALT_KEY, salt);
  return salt;
}

export async function redactQuery(
  kv: StateKV,
  query: string | undefined,
): Promise<Pick<RecallTrace, "query" | "queryFingerprint" | "redactionKinds">> {
  if (!query) return { redactionKinds: [] };
  const redacted = stripPrivateData(query);
  const redactionKinds: string[] = [];
  if (redacted.includes("[REDACTED_SECRET]")) redactionKinds.push("secret");
  if (redacted.includes("[REDACTED]")) redactionKinds.push("private_tag");
  const salt = await querySalt(kv);
  return {
    query: redacted,
    queryFingerprint: createHmac("sha256", salt).update(query).digest("hex"),
    redactionKinds,
  };
}

function emptyStats(itemId: string): RecallItemStats {
  return {
    itemId,
    recallCount: 0,
    averageScore: 0,
    scopeMismatchCount: 0,
    scoreTotalMicros: 0,
  };
}

export function materializeRecallStats(stats: RecallItemStats): RecallItemStats {
  return stats.scoreTotalMicros !== undefined && stats.recallCount > 0
    ? { ...stats, averageScore: stats.scoreTotalMicros / SCORE_SCALE / stats.recallCount }
    : stats;
}

async function ensureStats(kv: StateKV, itemId: string): Promise<void> {
  // Initialization/migration is guarded in-process; all recurring counters use
  // state::update, whose ordered increments are atomic across workers.
  await withKeyedLock(`recallStats:${itemId}`, async () => {
    const current = await kv.get<RecallItemStats>(KV.recallStats, itemId);
    if (!current) {
      await kv.set(KV.recallStats, itemId, emptyStats(itemId));
      return;
    }
    if (current.scoreTotalMicros === undefined) {
      await kv.set(KV.recallStats, itemId, {
        ...current,
        scoreTotalMicros: Math.round(current.averageScore * current.recallCount * SCORE_SCALE),
      });
    }
  });
}

async function updateSelectedStats(
  kv: StateKV,
  itemId: string,
  score: number,
  timestamp: string,
  query?: string,
): Promise<void> {
  await ensureStats(kv, itemId);
  await kv.update(KV.recallStats, itemId, [
    { type: "increment", path: "recallCount", by: 1 },
    { type: "increment", path: "scoreTotalMicros", by: Math.round(score * SCORE_SCALE) },
    { type: "set", path: "lastRecalledAt", value: timestamp },
    { type: "set", path: "recentQuery", value: query },
  ]);
}

async function updateMismatchStats(kv: StateKV, itemId: string): Promise<void> {
  await ensureStats(kv, itemId);
  await kv.update(KV.recallStats, itemId, [
    { type: "increment", path: "scopeMismatchCount", by: 1 },
  ]);
}

export async function persistRecallTrace(
  kv: StateKV,
  trace: RecallTrace,
  config: RecallTraceConfig,
): Promise<void> {
  await kv.set(KV.recallTraces, trace.id, trace);
  const now = new Date(trace.timestamp).getTime();
  const traces = await kv.list<RecallTrace>(KV.recallTraces).catch(() => []);
  const cutoff = now - config.retentionDays * 86_400_000;
  const retained = traces
    .filter((entry) => new Date(entry.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const allowed = new Set(retained.slice(0, config.maxTraces).map((entry) => entry.id));
  await Promise.all(
    traces
      .filter((entry) => !allowed.has(entry.id))
      .map((entry) => kv.delete(KV.recallTraces, entry.id)),
  );

  await Promise.all(trace.selected.map((item) => updateSelectedStats(
    kv,
    item.id,
    item.score,
    trace.timestamp,
    trace.query,
  )));
  const mismatches = trace.dropped.filter((item) => item.decision === "scope_mismatch");
  await Promise.all(mismatches.map((item) => updateMismatchStats(kv, item.id)));
}
