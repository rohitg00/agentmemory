import type { ISdk } from 'iii-sdk'

export class StateKV {
  constructor(private sdk: ISdk) {}

  async get<T = unknown>(scope: string, key: string): Promise<T | null> {
    return this.sdk.trigger<{ scope: string; key: string }, T | null>(
      'state::get',
      { scope, key },
    )
  }

  async set<T = unknown>(scope: string, key: string, data: T): Promise<T> {
    return this.sdk.trigger<{ scope: string; key: string; data: T }, T>(
      'state::set',
      { scope, key, data },
    )
  }

  async delete(scope: string, key: string): Promise<void> {
    return this.sdk.trigger<{ scope: string; key: string }, void>(
      'state::delete',
      { scope, key },
    )
  }

  async list<T = unknown>(scope: string): Promise<T[]> {
    return this.sdk.trigger<{ scope: string }, T[]>(
      'state::list',
      { scope },
    )
  }
}
