import { AsyncLocalStorage } from "node:async_hooks";

type LockContext = { active: boolean; after: Map<string | symbol, () => Promise<void>> };
type LockFrame = { key: string; context: LockContext; parent?: LockFrame };
const held = new AsyncLocalStorage<LockFrame>();

function heldContext(key: string): LockContext | undefined {
  for (let frame = held.getStore(); frame; frame = frame.parent) {
    if (frame.key === key) return frame.context;
  }
}

export function isKeyedLockHeld(key: string): boolean {
  return heldContext(key)?.active ?? false;
}

export function afterKeyedLock(key: string, fn: () => Promise<void>, taskKey?: string): boolean {
  const context = heldContext(key);
  if (!context?.active) return false;
  context.after.set(taskKey ?? Symbol(), fn);
  return true;
}

const locks = new Map<string, Promise<void>>();

export function withKeyedLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const context: LockContext = { active: true, after: new Map() };
  const run = () => held.run({ key, context, parent: held.getStore() }, fn);
  const next = prev.then(run, run);
  const cleanup = next.then(
    () => { context.active = false; },
    () => { context.active = false; },
  );
  locks.set(key, cleanup);
  cleanup.then(() => {
    if (locks.get(key) === cleanup) locks.delete(key);
  });
  const flush = async () => {
    await cleanup;
    const errors: unknown[] = [];
    for (const notify of context.after.values()) {
      try { await notify(); } catch (error) { errors.push(error); }
    }
    return errors;
  };
  return next.then(
    async (value) => {
      const errors = await flush();
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "Deferred lock callbacks failed");
      return value;
    },
    async (error) => { await flush(); throw error; },
  );
}

export function withKeyedLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  const ordered = [...new Set(keys)].sort();
  const acquire = (index: number): Promise<T> => index === ordered.length
    ? fn()
    : withKeyedLock(ordered[index], () => acquire(index + 1));
  return acquire(0);
}
