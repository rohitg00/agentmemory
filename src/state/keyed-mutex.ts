const locks = new Map<string, Promise<void>>();

export function withKeyedLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const cleanup = next.then(
    () => {},
    () => {},
  );
  locks.set(key, cleanup);
  cleanup.then(() => {
    if (locks.get(key) === cleanup) locks.delete(key);
  });
  return next;
}

// Held by mem::summarize over its summary-row write and by every path
// that deletes a whole session: unshared, a run that already passed its
// session-exists check writes the rows back after a delete, and every
// later run bails at session_not_found before reaching any cleanup.
// Separate from mem::summarize's own lock, which spans the provider call
// and would park a user-initiated mem::forget behind an LLM round trip.
export function sessionWriteLockKey(sessionId: string): string {
  return `mem:session-write:${sessionId}`;
}
