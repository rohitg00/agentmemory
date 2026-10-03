import { createHash } from "node:crypto";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";

export const PROMPT_LEDGER_MAX_KEYS = 1000;

interface PromptCount {
  live: number;
  matched: number;
}

export interface PromptLedger {
  sessionId: string;
  updatedAt: string;
  prompts: Record<string, PromptCount>;
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

async function load(kv: StateKV, sessionId: string): Promise<PromptLedger> {
  const stored = await kv.get<PromptLedger>(KV.capturePrompts, ledgerKey(sessionId)).catch(() => null);
  if (stored && typeof stored.prompts === "object" && stored.prompts !== null) return stored;
  return { sessionId, updatedAt: new Date().toISOString(), prompts: {} };
}

async function save(kv: StateKV, ledger: PromptLedger): Promise<void> {
  const keys = Object.keys(ledger.prompts);
  for (const key of keys.slice(0, Math.max(0, keys.length - PROMPT_LEDGER_MAX_KEYS))) {
    delete ledger.prompts[key];
  }
  ledger.updatedAt = new Date().toISOString();
  await kv.set(KV.capturePrompts, ledgerKey(ledger.sessionId), ledger);
}

export async function recordLivePrompt(kv: StateKV, sessionId: string, prompt: string): Promise<void> {
  const key = promptContentKey(prompt);
  if (!key) return;
  const ledger = await load(kv, sessionId);
  const current = ledger.prompts[key] ?? { live: 0, matched: 0 };
  delete ledger.prompts[key];
  ledger.prompts[key] = { live: current.live + 1, matched: current.matched };
  await save(kv, ledger);
}

export async function claimBackfillPrompt(kv: StateKV, sessionId: string, prompt: string): Promise<boolean> {
  const key = promptContentKey(prompt);
  if (!key) return false;
  const ledger = await load(kv, sessionId);
  const current = ledger.prompts[key];
  if (!current || current.matched >= current.live) return false;
  current.matched++;
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
