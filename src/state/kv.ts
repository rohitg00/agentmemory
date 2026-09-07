import type { ISdk } from 'iii-sdk'
import { onGraphDelete, onGraphUpdate, onGraphWrite } from './graph-cache.js'

export class StateKV {
  constructor(private sdk: ISdk) {}

  async get<T = unknown>(scope: string, key: string): Promise<T | null> {
    return this.sdk.trigger<{ scope: string; key: string }, T | null>({
      function_id: 'state::get',
      payload: { scope, key },
    })
  }

  async set<T = unknown>(scope: string, key: string, value: T): Promise<T> {
    const result = await this.sdk.trigger<{ scope: string; key: string; value: T }, T>({
      function_id: 'state::set',
      payload: { scope, key, value },
    })
    // Graph writes arrive from graph-extract, mesh sync, import, cascade
    // and snapshot restore. Patching the cached graph view here — the one
    // path they all route through — keeps it warm instead of forcing the
    // next search to re-enumerate the whole graph scope.
    onGraphWrite(this, scope, key, value)
    return result
  }

  async update<T = unknown>(
    scope: string,
    key: string,
    ops: Array<{ type: string; path: string; value?: unknown }>,
  ): Promise<T> {
    const result = await this.sdk.trigger<
      { scope: string; key: string; ops: Array<{ type: string; path: string; value?: unknown }> },
      T
    >({
      function_id: 'state::update',
      payload: { scope, key, ops },
    })
    onGraphUpdate(this, scope)
    return result
  }

  async delete(scope: string, key: string): Promise<void> {
    await this.sdk.trigger<{ scope: string; key: string }, void>({
      function_id: 'state::delete',
      payload: { scope, key },
    })
    onGraphDelete(this, scope, key)
  }

  async list<T = unknown>(scope: string): Promise<T[]> {
    return this.sdk.trigger<{ scope: string }, T[]>({
      function_id: 'state::list',
      payload: { scope },
    })
  }
}
