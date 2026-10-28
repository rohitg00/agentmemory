import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { afterKeyedLock } from "./keyed-mutex.js";
import { initializeGraphIndex } from "./graph-retrieval-index.js";

const CONTROL_SCOPE = KV.graphControl;
const CONTROL_KEY = "generation";
const GRAPH_SCOPES = new Set<string>([
  KV.graphNodes, KV.graphEdges, KV.graphEdgeHistory, KV.graphSnapshot,
  KV.graphNameIndex, KV.graphEdgeKey, KV.graphNodeDegree, KV.graphMembership,
  KV.graphRetrievalControl, KV.graphRetrievalData, KV.graphIndexMigration, KV.graphIndexManifest,
]);
const pinned = new AsyncLocalStorage<{ kv: StateKV; generation: string | null }>();
const views = new WeakMap<StateKV, { target: StateKV; id: string | null }>();
type GraphChange = "reset" | "snapshot" | "nodes" | "edges";
let onGraphChange: ((kind: GraphChange) => Promise<void>) | null = null;

export function setGraphGenerationListener(listener: typeof onGraphChange): void {
  onGraphChange = listener;
}

// The engine's legacy scope subscriptions cannot follow a rotated namespace.
export async function notifyGraphGenerationChange(kv: StateKV, scope: string, key: string): Promise<void> {
  if (!onGraphChange) return;
  const kind: GraphChange | undefined = scope === CONTROL_SCOPE && key === CONTROL_KEY ? "reset"
    : scope.startsWith(`${KV.graphSnapshot}:generation:`) ? "snapshot"
    : scope.startsWith(`${KV.graphNodes}:generation:`) ? "nodes"
    : scope.startsWith(`${KV.graphEdges}:generation:`) ? "edges" : undefined;
  if (!kind) return;
  if (afterKeyedLock("graph:persist", () => notifyGraphGenerationChange(kv, scope, key), scope)) return;
  if (kind !== "reset" && afterKeyedLock(`graph:retrieval:${scope.slice(scope.lastIndexOf(":generation:") + 12)}`,
    () => notifyGraphGenerationChange(kv, scope, key), scope)) return;
  if (afterKeyedLock("graph:viewer-events", () => notifyGraphGenerationChange(kv, scope, key), scope)) return;
  try {
    const current = await generation(kv);
    if (kind !== "reset" && !scope.endsWith(`:generation:${current}`)) return;
    await pinned.exit(() => onGraphChange!(kind));
  } catch {
    // Viewer delivery must not turn a committed state write into a failed mutation.
  }
}

export async function isLegacyGraphState(kv: StateKV): Promise<boolean> {
  return await generation(kv) === null;
}

export async function getGraphGeneration(kv: StateKV): Promise<string | null> {
  const view = views.get(kv);
  if (view) return view.id;
  const context = pinned.getStore();
  return context?.kv === kv ? context.generation : generation(kv);
}

export function pinGraphStateGeneration(kv: StateKV, id: string | null): StateKV {
  return graphView(views.get(kv)?.target ?? kv, id);
}

async function generation(kv: StateKV): Promise<string | null> {
  const value = await kv.get<unknown>(CONTROL_SCOPE, CONTROL_KEY);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("Invalid graph generation");
  }
  return value;
}

function physicalScope(scope: string, id: string | null): string {
  return id !== null && GRAPH_SCOPES.has(scope) ? `${scope}:generation:${id}` : scope;
}

/** Used by StateKV so every graph consumer respects reset, including fallback reads. */
export async function resolveGraphScope(kv: StateKV, scope: string): Promise<string> {
  if (!GRAPH_SCOPES.has(scope)) return scope;
  const context = pinned.getStore();
  const id = context?.kv === kv ? context.generation : await generation(kv);
  return physicalScope(scope, id);
}

/** Pin an operation before any awaits: late writes remain in its original generation. */
export async function pinGraphState(kv: StateKV): Promise<StateKV> {
  if (views.has(kv)) return kv;
  const id = await generation(kv);
  return graphView(kv, id);
}

function graphView(kv: StateKV, id: string | null): StateKV {
  const methods = new Set(["get", "set", "update", "delete", "list"]);
  const view = new Proxy(kv, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !methods.has(property)) return value;
      return (scope: string, ...args: unknown[]) => pinned.run(
        { kv: target, generation: id },
        () => value.call(target, physicalScope(scope, id), ...args),
      );
    },
  });
  views.set(view, { target: kv, id });
  return view;
}

/** Initialize first, publish last; failures cannot expose a half-reset graph. */
export async function resetGraphGeneration(kv: StateKV, snapshot: unknown): Promise<void> {
  const id = randomUUID();
  await kv.set(physicalScope(KV.graphSnapshot, id), "current", snapshot);
  await initializeGraphIndex(graphView(kv, id), { status: "ready" });
  await kv.set(CONTROL_SCOPE, CONTROL_KEY, id);
}

export async function replaceGraphGeneration<T>(kv: StateKV, initialize: (fresh: StateKV) => Promise<T>): Promise<T> {
  const pinnedState = await pinGraphState(kv);
  const { target, id: previous } = views.get(pinnedState)!;
  const id = randomUUID();
  const fresh = graphView(target, id);
  await initializeGraphIndex(fresh, { status: "ready" });
  const result = await initialize(fresh);
  // A delayed import cannot replace a reset that happened after it was pinned.
  if (await generation(target) === previous) {
    await target.set(CONTROL_SCOPE, CONTROL_KEY, id);
  }
  return result;
}
