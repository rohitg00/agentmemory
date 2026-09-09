import { isDeepStrictEqual } from "node:util";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { KV, generateId } from "../state/schema.js";
import type {
  Action,
  ActionCollectionState,
  ActionEdge,
  ActionEvent,
  ActionEventType,
  Checkpoint,
  Sentinel,
} from "../types.js";
import {
  ACTION_SCHEMA_VERSION,
  normalizeActionV2,
  type NormalizeActionOptions,
  type NormalizeActionResult,
} from "./action-model.js";

const ACTION_STATE_KEY = "current";
const ACTION_STORE_LOCK = "mem:actions:v2";

export interface ActionStoreSnapshot {
  state: ActionCollectionState;
  actions: Action[];
  edges: ActionEdge[];
  events: ActionEvent[];
}

export interface PersistActionOptions extends NormalizeActionOptions {
  actor?: string;
  type?: ActionEventType;
  reason?: string;
  correctionOf?: string;
  before?: Action | null;
}

export interface PersistActionResult extends NormalizeActionResult {
  event: ActionEvent;
  state: ActionCollectionState;
}

export class ActionNormalizationError extends Error {
  constructor(readonly conflicts: string[]) {
    super(`Action normalization failed: ${conflicts.join(", ")}`);
    this.name = "ActionNormalizationError";
  }
}

export class ActionRevisionConflictError extends Error {
  constructor(
    readonly actionId: string,
    readonly fields: string[],
  ) {
    super(
      fields.length > 0
        ? `Action ${actionId} changed concurrently in: ${fields.join(", ")}`
        : `Action ${actionId} changed concurrently`,
    );
    this.name = "ActionRevisionConflictError";
  }
}

export function withActionStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  return withKeyedLock(ACTION_STORE_LOCK, fn);
}

export async function readActionStoreSnapshot(
  kv: StateKV,
  options: { includeEvents?: boolean } = {},
): Promise<ActionStoreSnapshot> {
  return withActionStoreLock(async () => {
    const state = await recoverActionStoreUnlocked(kv);
    const [actions, edges, events] = await Promise.all([
      kv.list<Action>(KV.actions).catch(() => []),
      kv.list<ActionEdge>(KV.actionEdges).catch(() => []),
      options.includeEvents
        ? kv.list<ActionEvent>(KV.actionEvents).catch(() => [])
        : Promise.resolve([] as ActionEvent[]),
    ]);
    return { state, actions, edges, events };
  });
}

export async function persistAction(
  kv: StateKV,
  input: Action,
  options: PersistActionOptions = {},
): Promise<PersistActionResult> {
  return withActionStoreLock(() =>
    persistActionUnlocked(kv, input, options),
  );
}

export async function persistActionUnlocked(
  kv: StateKV,
  input: Action,
  options: PersistActionOptions = {},
): Promise<PersistActionResult> {
  const state = await recoverActionStoreUnlocked(kv);
  const current = await kv.get<Action>(KV.actions, input.id);
  const candidate =
    options.before === undefined
      ? input
      : rebaseActionMutation(input, options.before, current);
  const before = current;
  const revision = state.revision + 1;
  const hasDerivedBlockers =
    options.hasDerivedBlockers ??
    (await actionHasUnresolvedDerivedBlockers(kv, input.id));
  const normalization = normalizeActionV2(candidate, {
    projectAliases: options.projectAliases,
    defaultProjectId: options.defaultProjectId,
    hasDerivedBlockers,
    revision,
  });
  if (normalization.conflicts.length > 0) {
    throw new ActionNormalizationError(normalization.conflicts);
  }
  const action = normalization.action;
  const timestamp = new Date().toISOString();
  const event: ActionEvent = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    id: generateId("aev"),
    actionId: action.id,
    entityType: "action",
    revision,
    type:
      options.type ??
      inferActionEventType(before, action, options.correctionOf),
    actor:
      options.actor ||
      action.owner ||
      action.assignedTo ||
      action.createdBy ||
      "unknown",
    timestamp,
    reason: options.reason,
    correctionOf: options.correctionOf,
    before: before ? clone(before) : undefined,
    after: clone(action),
  };
  const nextState = await commitEventUnlocked(kv, state, event);
  return { ...normalization, action, event, state: nextState };
}

export async function deleteAction(
  kv: StateKV,
  actionId: string,
  options: {
    actor?: string;
    reason?: string;
    correctionOf?: string;
  } = {},
): Promise<{ deleted: boolean; event?: ActionEvent; state: ActionCollectionState }> {
  return withActionStoreLock(async () => {
    const state = await recoverActionStoreUnlocked(kv);
    const before = await kv.get<Action>(KV.actions, actionId);
    if (!before) return { deleted: false, state };
    const event: ActionEvent = {
      schemaVersion: ACTION_SCHEMA_VERSION,
      id: generateId("aev"),
      actionId,
      entityType: "action",
      revision: state.revision + 1,
      type: "deleted",
      actor: options.actor || before.owner || before.createdBy || "unknown",
      timestamp: new Date().toISOString(),
      reason: options.reason,
      correctionOf: options.correctionOf,
      before: clone(before),
    };
    const nextState = await commitEventUnlocked(kv, state, event);
    return { deleted: true, event, state: nextState };
  });
}

export async function persistActionEdge(
  kv: StateKV,
  edge: ActionEdge,
  options: {
    actor?: string;
    reason?: string;
    before?: ActionEdge | null;
  } = {},
): Promise<{ edge: ActionEdge; event: ActionEvent; state: ActionCollectionState }> {
  return withActionStoreLock(() =>
    persistActionEdgeUnlocked(kv, edge, options),
  );
}

export async function persistActionEdgeUnlocked(
  kv: StateKV,
  edge: ActionEdge,
  options: {
    actor?: string;
    reason?: string;
    before?: ActionEdge | null;
  } = {},
): Promise<{ edge: ActionEdge; event: ActionEvent; state: ActionCollectionState }> {
  const state = await recoverActionStoreUnlocked(kv);
  const before =
    options.before === undefined
      ? await kv.get<ActionEdge>(KV.actionEdges, edge.id)
      : options.before;
  const event: ActionEvent = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    id: generateId("aev"),
    actionId: edge.sourceActionId,
    entityType: "edge",
    revision: state.revision + 1,
    type: before ? "fields_changed" : "edge_created",
    actor: options.actor || "unknown",
    timestamp: new Date().toISOString(),
    reason: options.reason,
    before: before ? clone(before) : undefined,
    after: clone(edge),
  };
  const nextState = await commitEventUnlocked(kv, state, event);
  return { edge, event, state: nextState };
}

export async function deleteActionEdge(
  kv: StateKV,
  edgeId: string,
  options: { actor?: string; reason?: string } = {},
): Promise<{ deleted: boolean; event?: ActionEvent; state: ActionCollectionState }> {
  return withActionStoreLock(async () => {
    const state = await recoverActionStoreUnlocked(kv);
    const before = await kv.get<ActionEdge>(KV.actionEdges, edgeId);
    if (!before) return { deleted: false, state };
    const event: ActionEvent = {
      schemaVersion: ACTION_SCHEMA_VERSION,
      id: generateId("aev"),
      actionId: before.sourceActionId,
      entityType: "edge",
      revision: state.revision + 1,
      type: "edge_deleted",
      actor: options.actor || "unknown",
      timestamp: new Date().toISOString(),
      reason: options.reason,
      before: clone(before),
    };
    const nextState = await commitEventUnlocked(kv, state, event);
    return { deleted: true, event, state: nextState };
  });
}

export async function recoverActionStore(kv: StateKV): Promise<ActionCollectionState> {
  return withActionStoreLock(() => recoverActionStoreUnlocked(kv));
}

/** Read collection metadata without repairing a pending write. */
export async function peekActionCollectionState(
  kv: StateKV,
): Promise<ActionCollectionState> {
  return readActionCollectionState(kv);
}

export async function recoverActionStoreUnlocked(
  kv: StateKV,
): Promise<ActionCollectionState> {
  const state = await readActionCollectionState(kv);
  if (!state.pending) return state;
  const event = await kv.get<ActionEvent>(KV.actionEvents, state.pending.eventId);
  if (event && event.revision === state.pending.revision) {
    await applyEventProjection(kv, event);
    const recovered: ActionCollectionState = {
      schemaVersion: ACTION_SCHEMA_VERSION,
      revision: Math.max(state.revision, event.revision),
      updatedAt: new Date().toISOString(),
    };
    await kv.set(KV.actionState, ACTION_STATE_KEY, recovered);
    return recovered;
  }
  const cleared: ActionCollectionState = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    revision: state.revision,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(KV.actionState, ACTION_STATE_KEY, cleared);
  return cleared;
}

async function commitEventUnlocked(
  kv: StateKV,
  state: ActionCollectionState,
  event: ActionEvent,
): Promise<ActionCollectionState> {
  const pendingState: ActionCollectionState = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    revision: state.revision,
    updatedAt: event.timestamp,
    pending: { revision: event.revision, eventId: event.id },
  };
  await kv.set(KV.actionState, ACTION_STATE_KEY, pendingState);
  await kv.set(KV.actionEvents, event.id, event);
  await applyEventProjection(kv, event);
  const committed: ActionCollectionState = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    revision: event.revision,
    updatedAt: event.timestamp,
  };
  await kv.set(KV.actionState, ACTION_STATE_KEY, committed);
  return committed;
}

async function applyEventProjection(
  kv: StateKV,
  event: ActionEvent,
): Promise<void> {
  if (event.entityType === "action") {
    if (event.after) {
      await kv.set(KV.actions, event.actionId, event.after as Action);
    } else {
      await kv.delete(KV.actions, event.actionId);
    }
    return;
  }
  const edge = (event.after ?? event.before) as ActionEdge | undefined;
  if (!edge) return;
  if (event.after) {
    await kv.set(KV.actionEdges, edge.id, event.after as ActionEdge);
  } else {
    await kv.delete(KV.actionEdges, edge.id);
  }
}

async function readActionCollectionState(
  kv: StateKV,
): Promise<ActionCollectionState> {
  const state = await kv.get<ActionCollectionState>(KV.actionState, ACTION_STATE_KEY);
  if (
    state?.schemaVersion === ACTION_SCHEMA_VERSION &&
    Number.isInteger(state.revision) &&
    state.revision >= 0
  ) {
    return state;
  }
  return {
    schemaVersion: ACTION_SCHEMA_VERSION,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

function inferActionEventType(
  before: Action | null,
  after: Action,
  correctionOf?: string,
): ActionEventType {
  if (!before) return "created";
  if (correctionOf) return "corrected";
  if (before.result !== after.result) return "result_recorded";
  if (
    before.lifecycle !== after.lifecycle ||
    before.status !== after.status
  ) {
    return "lifecycle_changed";
  }
  return "fields_changed";
}

async function actionHasUnresolvedDerivedBlockers(
  kv: StateKV,
  actionId: string,
): Promise<boolean> {
  const edges = (await kv.list<ActionEdge>(KV.actionEdges).catch(() => []))
    .filter(
      (edge) =>
        edge.sourceActionId === actionId &&
        (edge.type === "requires" || edge.type === "gated_by"),
    );
  for (const edge of edges) {
    if (edge.type === "requires") {
      const dependency = await kv.get<Action>(KV.actions, edge.targetActionId);
      if ((dependency?.lifecycle ?? dependency?.status) !== "done") return true;
      continue;
    }
    const [checkpoint, sentinel] = await Promise.all([
      kv.get<Checkpoint>(KV.checkpoints, edge.targetActionId),
      kv.get<Sentinel>(KV.sentinels, edge.targetActionId),
    ]);
    if (
      checkpoint?.status !== "passed" &&
      sentinel?.status !== "triggered"
    ) {
      return true;
    }
  }
  return false;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rebaseActionMutation(
  input: Action,
  expectedBefore: Action | null,
  current: Action | null,
): Action {
  if (!expectedBefore || !current) {
    if (expectedBefore === current) return input;
    throw new ActionRevisionConflictError(input.id, []);
  }

  const managedFields = new Set<keyof Action>([
    "schemaVersion",
    "revision",
    "updatedAt",
  ]);
  const keys = new Set<keyof Action>([
    ...(Object.keys(expectedBefore) as Array<keyof Action>),
    ...(Object.keys(input) as Array<keyof Action>),
    ...(Object.keys(current) as Array<keyof Action>),
  ]);
  const intendedFields = [...keys].filter(
    (field) =>
      !managedFields.has(field) &&
      !isDeepStrictEqual(expectedBefore[field], input[field]),
  );
  const conflicts = intendedFields.filter(
    (field) =>
      !isDeepStrictEqual(expectedBefore[field], current[field]) &&
      !isDeepStrictEqual(input[field], current[field]),
  );
  if (conflicts.length > 0) {
    throw new ActionRevisionConflictError(
      input.id,
      conflicts.map(String).sort(),
    );
  }

  const rebased = structuredClone(current) as Action &
    Record<string, unknown>;
  const rebasedFields = rebased as Record<string, unknown>;
  const source = input as Action & Record<string, unknown>;
  for (const field of intendedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      rebasedFields[field] = structuredClone(source[field]);
    } else {
      delete rebasedFields[field];
    }
  }
  rebased.updatedAt = input.updatedAt;
  return rebased;
}
