import { AsyncLocalStorage } from "node:async_hooks";
import type { StateKV } from "./kv.js";
import type { GraphSnapshot } from "../types.js";
import { KV } from "./schema.js";
import { isKeyedLockHeld, withKeyedLock } from "./keyed-mutex.js";

const recovering = new AsyncLocalStorage<boolean>();
const checked = new WeakMap<StateKV, Set<string>>();
const scopes = [KV.graphNodes, KV.graphEdges, KV.graphEdgeHistory, KV.graphSnapshot,
  KV.graphNameIndex, KV.graphEdgeKey, KV.graphNodeDegree, KV.graphMembership];

function snapshotScope(scope: string): string | null {
  for (const logical of scopes) {
    if (scope === logical) return KV.graphSnapshot;
    if (scope.startsWith(`${logical}:generation:`)) return KV.graphSnapshot + scope.slice(logical.length);
  }
  return null;
}

export function withoutGraphRecovery<T>(fn: () => Promise<T>): Promise<T> {
  return recovering.run(true, fn);
}

export function noteGraphSnapshotWrite(kv: StateKV, scope: string, key: string): void {
  if (key === "current" && (scope === KV.graphSnapshot || scope.startsWith(`${KV.graphSnapshot}:generation:`))) {
    checked.get(kv)?.delete(scope);
  }
}

export async function ensureGraphConsistency(kv: StateKV, scope: string): Promise<void> {
  if (recovering.getStore()) return;
  const snapshot = snapshotScope(scope);
  if (!snapshot || checked.get(kv)?.has(snapshot)) return;
  const recover = () => withoutGraphRecovery(async () => {
    const current = await kv.get<GraphSnapshot>(snapshot, "current");
    const pending = current?.pendingMutation;
    if (pending) {
      if (!current.dirty || !Array.isArray(pending.writes) || pending.snapshot?.version !== 1 || pending.snapshot.pendingMutation) {
        throw new Error("Invalid graph reconciliation journal");
      }
      const suffix = snapshot.slice(KV.graphSnapshot.length);
      for (const write of pending.writes) {
        if (!write || typeof write !== "object") throw new Error("Invalid graph reconciliation write");
        if (!scopes.includes(write.scope as typeof scopes[number]) || write.scope === KV.graphSnapshot || typeof write.key !== "string") {
          throw new Error("Invalid graph reconciliation write");
        }
      }
      for (const write of pending.writes) {
        if (write.value === null) await kv.delete(write.scope + suffix, write.key);
        else await kv.set(write.scope + suffix, write.key, write.value);
      }
      await kv.set(snapshot, "current", pending.snapshot);
    }
    let entries = checked.get(kv);
    if (!entries) checked.set(kv, entries = new Set());
    if (entries.size >= 64) entries.clear();
    entries.add(snapshot);
  });
  if (isKeyedLockHeld("graph:persist")) return recover();
  const peek = await withoutGraphRecovery(() => kv.get<GraphSnapshot>(snapshot, "current"));
  // An unlocked clean read must not restore a cache entry invalidated by an
  // in-flight snapshot write. Only the locked recovery path can cache it.
  if (!peek?.pendingMutation) return;
  await withKeyedLock("graph:persist", recover);
}
