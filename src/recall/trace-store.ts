import { createHmac, randomBytes } from "node:crypto";
import type { RecallItemStats, RecallTrace, RecallTraceConfig } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { stripPrivateData } from "../functions/privacy.js";

const QUERY_SALT_KEY = "recall-query-salt";

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
  };
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

  await Promise.all(trace.selected.map(async (item) => {
    const current = (await kv.get<RecallItemStats>(KV.recallStats, item.id)) || emptyStats(item.id);
    const count = current.recallCount + 1;
    await kv.set(KV.recallStats, item.id, {
      ...current,
      recallCount: count,
      averageScore: ((current.averageScore * current.recallCount) + item.score) / count,
      lastRecalledAt: trace.timestamp,
      recentQuery: trace.query,
    });
  }));
  const mismatches = trace.dropped.filter((item) => item.decision === "scope_mismatch");
  await Promise.all(mismatches.map(async (item) => {
    const current = (await kv.get<RecallItemStats>(KV.recallStats, item.id)) || emptyStats(item.id);
    await kv.set(KV.recallStats, item.id, {
      ...current,
      scopeMismatchCount: current.scopeMismatchCount + 1,
    });
  }));
}
