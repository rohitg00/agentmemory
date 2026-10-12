import { AsyncLocalStorage } from "node:async_hooks";
import type { StateKV } from "./kv.js";
import type { GraphSnapshot } from "../types.js";
import { KV } from "./schema.js";
import { isKeyedLockHeld, withKeyedLock } from "./keyed-mutex.js";

const recovering = new AsyncLocalStorage<boolean>();
type SnapshotCheck = { clean: boolean };
const checks = new WeakMap<StateKV, Map<string, SnapshotCheck>>();
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
    checks.get(kv)?.delete(scope);
  }
}

function snapshotCheck(kv: StateKV, scope: string): SnapshotCheck {
  let entries = checks.get(kv);
  if (!entries) checks.set(kv, entries = new Map());
  let check = entries.get(scope);
  if (!check) {
    if (entries.size >= 64) entries.clear();
    check = { clean: false };
    entries.set(scope, check);
  }
  return check;
}

function markChecked(kv: StateKV, scope: string, check: SnapshotCheck): void {
  if (checks.get(kv)?.get(scope) === check) check.clean = true;
}

export async function ensureGraphConsistency(kv: StateKV, scope: string): Promise<void> {
  if (recovering.getStore()) return;
  const snapshot = snapshotScope(scope);
  if (!snapshot) return;
  const check = snapshotCheck(kv, snapshot);
  if (check.clean) return;
  const recover = () => withoutGraphRecovery(async () => {
    const recoveryCheck = snapshotCheck(kv, snapshot);
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
    markChecked(kv, snapshot, recoveryCheck);
  });
  if (isKeyedLockHeld("graph:persist")) return recover();
  const peek = await withoutGraphRecovery(() => kv.get<GraphSnapshot>(snapshot, "current"));
  // Writes invalidate before and after awaiting the engine, including failures.
  // Retain a clean check only if neither a write nor eviction replaced its token.
  if (!peek?.pendingMutation) {
    markChecked(kv, snapshot, check);
    return;
  }
  await withKeyedLock("graph:persist", recover);
}
