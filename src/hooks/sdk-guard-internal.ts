// Canonical SDK-child guard, shared across hook entries.
//
// Why this lives outside `hookEntries` in tsdown.config.ts:
// when a util file is listed as a hook entry, tsdown emits it as its own
// bundle and turns it into a hash-named shared chunk (sdk-guard-<HASH>.mjs)
// that every hook then imports. That hash churns on every rebuild and the
// compiled .mjs imports break with ERR_MODULE_NOT_FOUND. By placing this
// file *outside* the hook-entries list, tsdown treats it as an internal
// dependency and inlines it into each hook bundle — so each compiled
// hook is self-contained, the function stays DRY in source, and there is
// no shared chunk to churn.
//
// Do NOT add this file to hookEntries.

export function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}
