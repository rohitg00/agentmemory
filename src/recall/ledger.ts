import type { RecallInjectionConfig } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";

interface SessionRecallState {
  sessionId: string;
  turn: number;
  contextEpoch: number;
}

export interface InjectionLedgerEntry {
  sessionId: string;
  contextEpoch: number;
  queryFingerprint?: string;
  itemId: string;
  itemVersion?: number;
  injectedAtTurn: number;
  injectedAt: string;
}

function stateKey(sessionId: string): string {
  return `recall-session:${sessionId}`;
}

function ledgerKey(sessionId: string, itemId: string): string {
  return `${sessionId}:${itemId}`;
}

export async function currentRecallTurn(
  kv: StateKV,
  sessionId: string | undefined,
  increment: boolean,
): Promise<SessionRecallState | null> {
  if (!sessionId) return null;
  const current = (await kv.get<SessionRecallState>(KV.state, stateKey(sessionId))) || {
    sessionId,
    turn: 0,
    contextEpoch: 0,
  };
  const next = increment ? { ...current, turn: current.turn + 1 } : current;
  if (increment) await kv.set(KV.state, stateKey(sessionId), next);
  return next;
}

export async function advanceRecallContextEpoch(
  kv: StateKV,
  sessionId: string,
): Promise<SessionRecallState> {
  const current = (await currentRecallTurn(kv, sessionId, false)) || {
    sessionId,
    turn: 0,
    contextEpoch: 0,
  };
  const next = { ...current, contextEpoch: current.contextEpoch + 1 };
  await kv.set(KV.state, stateKey(sessionId), next);
  return next;
}

export async function isDuplicateInjection(
  kv: StateKV,
  state: SessionRecallState | null,
  itemId: string,
  itemVersion: number | undefined,
  queryFingerprint: string | undefined,
  config: RecallInjectionConfig,
): Promise<boolean> {
  if (!state) return false;
  const prior = await kv.get<InjectionLedgerEntry>(KV.injectionLedger, ledgerKey(state.sessionId, itemId));
  return Boolean(
    prior &&
      prior.contextEpoch === state.contextEpoch &&
      prior.itemVersion === itemVersion &&
      prior.queryFingerprint === queryFingerprint &&
      state.turn - prior.injectedAtTurn < config.reinjectionTurnWindow,
  );
}

export async function recordInjection(
  kv: StateKV,
  state: SessionRecallState | null,
  itemId: string,
  itemVersion: number | undefined,
  queryFingerprint: string | undefined,
): Promise<void> {
  if (!state) return;
  await kv.set<InjectionLedgerEntry>(KV.injectionLedger, ledgerKey(state.sessionId, itemId), {
    sessionId: state.sessionId,
    contextEpoch: state.contextEpoch,
    queryFingerprint,
    itemId,
    itemVersion,
    injectedAtTurn: state.turn,
    injectedAt: new Date().toISOString(),
  });
}
