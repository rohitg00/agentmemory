import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../types.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { safeAudit } from "../functions/audit.js";

const IDENTITY_KEY = "vectors:embedding-identity";
const VECTOR_KEYS = ["vectors", "vectors:manifest", "vectors:meta"];
const VECTOR_SCOPE_PREFIXES = [`${KV.bm25Index}:vec:`, `${KV.bm25Index}:vectors:`];
const DELETE_CONCURRENCY = 32;

async function deleteKeys(kv: StateKV, scope: string, keys: string[]): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += DELETE_CONCURRENCY) {
    const results = await Promise.allSettled(keys.slice(offset, offset + DELETE_CONCURRENCY).map((key) => kv.delete(scope, key)));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}

/** Refuse unverified vectors before startup can migrate checkpoints or replay pending writes. */
export async function ensureEmbeddingIdentity(
  kv: StateKV,
  provider: EmbeddingProvider | null,
  dropStale: boolean,
): Promise<void> {
  if (!provider) return;
  const identity = createHash("sha256")
    .update(provider.indexIdentity ?? JSON.stringify([provider.name, provider.dimensions]))
    .digest("hex");
  const saved = await kv.get<{ v: number; identity: string }>(KV.bm25Index, IDENTITY_KEY);
  if (!saved && !provider.indexIdentity) return;
  if (saved?.v === 1 && saved.identity === identity) return;

  const groups = await kv.listGroups();
  const vectorScopes = groups.filter((scope) => VECTOR_SCOPE_PREFIXES.some((prefix) => scope.startsWith(prefix)));
  const snapshots = await Promise.all(VECTOR_KEYS.map((key) => kv.get(KV.bm25Index, key)));
  const pending = await kv.listKeys(KV.vectorPendingLog);
  const hasVectors = vectorScopes.length > 0 || snapshots.some((value) => value != null) || pending.length > 0;
  if (hasVectors && !dropStale) {
    throw new Error(
      "Persisted vector embedding configuration differs or is unknown. Refusing to restore vectors or replay the pending log. " +
      "Switch back to the original configuration, or back up the store and set AGENTMEMORY_DROP_STALE_INDEX=true once to discard derived vectors, and AGENTMEMORY_VECTOR_BACKFILL=all to run the full backfill. " +
      "Unidentified indexes from earlier versions also require this explicit rebuild.",
    );
  }
  if (hasVectors) {
    await kv.set(KV.bm25Index, "vectors:backfill", { v: 2, since: null });
    for (const scope of vectorScopes) {
      await deleteKeys(kv, scope, await kv.listKeys(scope));
    }
    await deleteKeys(kv, KV.vectorPendingLog, pending);
    await deleteKeys(kv, KV.bm25Index, VECTOR_KEYS);
    await safeAudit(kv, "index_persist", "mem::embedding-identity", [], {
      action: "rebuild", vectorScopes: vectorScopes.length, pendingEntries: pending.length,
    });
  }
  await kv.set(KV.bm25Index, IDENTITY_KEY, { v: 1, identity });
}
