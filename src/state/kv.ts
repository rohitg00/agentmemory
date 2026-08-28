import type { ISdk } from 'iii-sdk'
import { getEnvVar } from '../config.js'

// Worker-wide invocationTimeoutMs is 180000ms (src/index.ts), sized for
// LLM-backed functions like mem::graph-extract's provider.compress() call,
// which legitimately needs that much slack for slow local models. Plain KV
// round-trips share no such excuse — a healthy state::get/state::set is a
// local file-backed read/write and should return in well under a second.
// Before this fix, every StateKV call inherited the full 180s worker default
// via iii-sdk's per-call `timeoutMs` override (unused, defaulting through),
// so a single stalled KV call (contention, a stuck file_based adapter) could
// silently block for up to 3 minutes with zero visibility. Functions that
// issue many sequential KV calls per invocation — mem::graph-extract does up
// to 19 — had no per-call signal to distinguish "this one call is stuck" from
// "the LLM is just slow," and the eventual failure surfaced as an opaque
// "Invocation timeout after 180000ms: mem::graph-extract" with no indication
// the actual stall was in a KV call, not the LLM call (see #1127). A short,
// KV-specific timeoutMs makes a stuck call fail fast and attributably
// (function_id + scope/key in the resulting error) instead of silently
// consuming the same 180s budget reserved for LLM work.
//
// AGENTMEMORY_KV_TIMEOUT_MS overrides the default (see .env.example /
// plugin/skills/agentmemory-config/REFERENCE.md for the parsing contract).
const DEFAULT_KV_TIMEOUT_MS = 10_000
// setTimeout's delay is a 32-bit signed int; iii-sdk forwards timeoutMs to
// it uncapped, so anything above this silently becomes a ~1ms timeout.
const MAX_KV_TIMEOUT_MS = 2_147_483_647
const KV_TIMEOUT_MS = resolveKvTimeoutMs()

function resolveKvTimeoutMs(): number {
  const raw = getEnvVar('AGENTMEMORY_KV_TIMEOUT_MS')
  if (raw === undefined) return DEFAULT_KV_TIMEOUT_MS
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return DEFAULT_KV_TIMEOUT_MS
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_KV_TIMEOUT_MS) {
    return DEFAULT_KV_TIMEOUT_MS
  }
  return parsed
}

export class StateKV {
  constructor(private sdk: ISdk) {}

  async get<T = unknown>(scope: string, key: string): Promise<T | null> {
    return this.sdk.trigger<{ scope: string; key: string }, T | null>({
      function_id: 'state::get',
      payload: { scope, key },
      timeoutMs: KV_TIMEOUT_MS,
    })
  }

  async set<T = unknown>(scope: string, key: string, value: T): Promise<T> {
    return this.sdk.trigger<{ scope: string; key: string; value: T }, T>({
      function_id: 'state::set',
      payload: { scope, key, value },
      timeoutMs: KV_TIMEOUT_MS,
    })
  }

  async update<T = unknown>(
    scope: string,
    key: string,
    ops: Array<{ type: string; path: string; value?: unknown }>,
  ): Promise<T> {
    return this.sdk.trigger<
      { scope: string; key: string; ops: Array<{ type: string; path: string; value?: unknown }> },
      T
    >({
      function_id: 'state::update',
      payload: { scope, key, ops },
      timeoutMs: KV_TIMEOUT_MS,
    })
  }

  async delete(scope: string, key: string): Promise<void> {
    return this.sdk.trigger<{ scope: string; key: string }, void>({
      function_id: 'state::delete',
      payload: { scope, key },
      timeoutMs: KV_TIMEOUT_MS,
    })
  }

  async list<T = unknown>(scope: string): Promise<T[]> {
    return this.sdk.trigger<{ scope: string }, T[]>({
      function_id: 'state::list',
      payload: { scope },
      timeoutMs: KV_TIMEOUT_MS,
    })
  }
}
