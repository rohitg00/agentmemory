import type { IIIClient } from 'iii-sdk'
import { withKeyedLock } from './keyed-mutex.js'

export type StateBackend = 'file' | 'redis'

export interface StateKVOptions {
  backend?: StateBackend
}

type UpdateOp = { type: string; path: string; value?: unknown }

type UpdateResult = { old_value: unknown; new_value: unknown; errors: unknown[] }

const LOCAL_UPDATE_OPS = new Set(['set', 'remove', 'merge'])
const UNSAFE_PATHS = new Set(['__proto__', 'constructor', 'prototype'])
const ORDER_FIELDS = ['createdAt', 'timestamp', 'startedAt', 'updatedAt'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canApplyLocally(ops: UpdateOp[]): boolean {
  return ops.every(
    (op) =>
      LOCAL_UPDATE_OPS.has(op.type) &&
      typeof (op.path ?? '') === 'string' &&
      !UNSAFE_PATHS.has(op.path ?? '') &&
      (op.type !== 'merge' || isPlainObject(op.value)),
  )
}

export function applyUpdateOps(oldValue: unknown, ops: UpdateOp[]): unknown {
  let current: unknown =
    oldValue === null || oldValue === undefined ? {} : structuredClone(oldValue)
  for (const op of ops) {
    const path = op.path ?? ''
    if (op.type === 'set') {
      if (path === '') current = op.value ?? null
      else if (isPlainObject(current)) current[path] = op.value ?? null
    } else if (op.type === 'remove') {
      if (path === '') current = null
      else if (isPlainObject(current)) delete current[path]
    } else if (op.type === 'merge' && isPlainObject(op.value)) {
      if (path === '') {
        if (isPlainObject(current)) Object.assign(current, op.value)
      } else {
        const root: Record<string, unknown> = isPlainObject(current) ? current : {}
        const existing = root[path]
        const target = isPlainObject(existing) ? existing : {}
        Object.assign(target, op.value)
        root[path] = target
        current = root
      }
    }
  }
  return current
}

const MIN_ID_TIME = Date.UTC(2020, 0, 1)
const MAX_ID_TIME = Date.UTC(2100, 0, 1)

export function generatedIdTime(id: unknown): number | null {
  if (typeof id !== 'string') return null
  const parts = id.split('_')
  if (parts.length < 3) return null
  const segment = parts[parts.length - 2]!
  if (!/^[0-9a-z]{6,10}$/.test(segment)) return null
  const ms = parseInt(segment, 36)
  return ms >= MIN_ID_TIME && ms < MAX_ID_TIME ? ms : null
}

function orderKey(value: unknown): number {
  if (!isPlainObject(value)) return Number.POSITIVE_INFINITY
  const fromId = generatedIdTime(value.id)
  if (fromId !== null) return fromId
  for (const field of ORDER_FIELDS) {
    const raw = value[field]
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string') {
      const parsed = Date.parse(raw)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return Number.POSITIVE_INFINITY
}

function idKey(value: unknown): string {
  if (!isPlainObject(value)) return ''
  const id = value.id ?? value.key
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : ''
}

export function orderLikeInsertion<T>(values: T[]): T[] {
  return values
    .map((value) => ({ value, at: orderKey(value), id: idKey(value) }))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? -1 : 1
      if (a.id === b.id) return 0
      return a.id < b.id ? -1 : 1
    })
    .map((entry) => entry.value)
}

export class StateKV {
  readonly backend: StateBackend

  constructor(
    private sdk: IIIClient,
    options: StateKVOptions = {},
  ) {
    this.backend = options.backend ?? 'file'
  }

  async get<T = unknown>(scope: string, key: string): Promise<T | null> {
    return this.sdk.trigger<{ scope: string; key: string }, T | null>({
      function_id: 'state::get',
      payload: { scope, key },
    })
  }

  async set<T = unknown>(scope: string, key: string, value: T): Promise<T> {
    return this.sdk.trigger<{ scope: string; key: string; value: T }, T>({
      function_id: 'state::set',
      payload: { scope, key, value },
    })
  }

  async update<T = unknown>(scope: string, key: string, ops: UpdateOp[]): Promise<T> {
    if (this.backend === 'redis' && canApplyLocally(ops)) {
      return withKeyedLock(`state-update:${scope}\u0000${key}`, async () => {
        const oldValue = await this.get<unknown>(scope, key)
        const newValue = applyUpdateOps(oldValue, ops)
        await this.set(scope, key, newValue)
        const result: UpdateResult = { old_value: oldValue, new_value: newValue, errors: [] }
        return result as T
      })
    }
    return this.sdk.trigger<{ scope: string; key: string; ops: UpdateOp[] }, T>({
      function_id: 'state::update',
      payload: { scope, key, ops },
    })
  }

  async delete(scope: string, key: string): Promise<void> {
    return this.sdk.trigger<{ scope: string; key: string }, void>({
      function_id: 'state::delete',
      payload: { scope, key },
    })
  }

  async list<T = unknown>(scope: string): Promise<T[]> {
    const values = await this.sdk.trigger<{ scope: string }, T[]>({
      function_id: 'state::list',
      payload: { scope },
    })
    if (this.backend !== 'redis' || !Array.isArray(values)) return values
    return orderLikeInsertion(values)
  }
}
