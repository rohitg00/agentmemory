import { AsyncLocalStorage } from "node:async_hooks";

export const SYSTEM_SESSION = "__system__";

interface SessionStore {
  sessionId: string;
}

export const sessionContext = new AsyncLocalStorage<SessionStore>();

export function withSession<T>(sessionId: string | undefined, fn: () => Promise<T>): Promise<T> {
  const id = typeof sessionId === "string" && sessionId.trim().length > 0
      ? sessionId.trim()
      : SYSTEM_SESSION;
  return sessionContext.run({ sessionId: id }, fn);
}

export function currentSessionId(): string {
  return sessionContext.getStore()?.sessionId ?? SYSTEM_SESSION;
}
