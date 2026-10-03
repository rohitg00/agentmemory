import { createHash } from "node:crypto";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";

export const PROMPT_LEDGER_MAX_KEYS = 1000;

export const PROMPT_LEDGER_MAX_REFS = 200;

interface PromptRefs {
  live: string[];
  claimed: string[];
}

export interface PromptLedger {
  sessionId: string;
  updatedAt: string;
  prompts: Record<string, PromptRefs>;
}

export function isBackfillPrompt(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as Record<string, unknown>)["backfill"] === true;
}

export function promptContentKey(prompt: string): string | null {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

function ledgerKey(sessionId: string): string {
  return `pl_${createHash("sha256").update(sessionId).digest("hex").slice(0, 40)}`;
}

function refs(value: unknown): PromptRefs | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v["live"]) || !Array.isArray(v["claimed"])) return null;
  return {
    live: v["live"].filter((x): x is string => typeof x === "string"),
    claimed: v["claimed"].filter((x): x is string => typeof x === "string"),
  };
}

async function load(kv: StateKV, sessionId: string): Promise<PromptLedger> {
  const stored = await kv.get<PromptLedger>(KV.capturePrompts, ledgerKey(sessionId));
  const prompts: Record<string, PromptRefs> = {};
  if (stored && typeof stored.prompts === "object" && stored.prompts !== null) {
    for (const [key, value] of Object.entries(stored.prompts)) {
      const entry = refs(value);
      if (entry) prompts[key] = entry;
    }
  }
  return { sessionId, updatedAt: stored?.updatedAt ?? new Date().toISOString(), prompts };
}

async function save(kv: StateKV, ledger: PromptLedger): Promise<void> {
  const keys = Object.keys(ledger.prompts);
  for (const key of keys.slice(0, Math.max(0, keys.length - PROMPT_LEDGER_MAX_KEYS))) {
    delete ledger.prompts[key];
  }
  ledger.updatedAt = new Date().toISOString();
  await kv.set(KV.capturePrompts, ledgerKey(ledger.sessionId), ledger);
}

function bounded(list: string[]): string[] {
  return list.length > PROMPT_LEDGER_MAX_REFS ? list.slice(list.length - PROMPT_LEDGER_MAX_REFS) : list;
}

export async function recordLivePrompt(kv: StateKV, sessionId: string, prompt: string, ref: string): Promise<void> {
  const key = promptContentKey(prompt);
  if (!key) return;
  const ledger = await load(kv, sessionId);
  const current = ledger.prompts[key] ?? { live: [], claimed: [] };
  if (current.live.includes(ref)) return;
  delete ledger.prompts[key];
  ledger.prompts[key] = { live: bounded([...current.live, ref]), claimed: current.claimed };
  await save(kv, ledger);
}

export async function claimBackfillPrompt(kv: StateKV, sessionId: string, prompt: string, ref: string): Promise<boolean> {
  const key = promptContentKey(prompt);
  if (!key) return false;
  const ledger = await load(kv, sessionId);
  const current = ledger.prompts[key];
  if (!current) return false;
  if (current.claimed.includes(ref)) return true;
  if (current.claimed.length >= current.live.length) return false;
  current.claimed = bounded([...current.claimed, ref]);
  await save(kv, ledger);
  return true;
}

export async function prunePromptLedgers(kv: StateKV, cutoffMs: number, maxLedgers: number): Promise<number> {
  const ledgers = await kv.list<PromptLedger>(KV.capturePrompts).catch(() => [] as PromptLedger[]);
  const sorted = ledgers
    .filter((l): l is PromptLedger => !!l && typeof l.sessionId === "string")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let removed = 0;
  for (let i = 0; i < sorted.length; i++) {
    const ledger = sorted[i]!;
    if (i >= maxLedgers || Date.parse(ledger.updatedAt) < cutoffMs) {
      await kv.delete(KV.capturePrompts, ledgerKey(ledger.sessionId)).catch(() => {});
      removed++;
    }
  }
  return removed;
}
