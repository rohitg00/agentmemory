// Thin logging shim for agentmemory.
//
// iii-sdk v0.11 dropped `getContext()`, which had been the source of a
// contextual logger in every function handler (`getContext().logger`).
// Migrating directly to the v0.11 OTEL-based `getLogger()` would force
// every call site to care about the OTEL Logger API shape (`emit(...)`
// with severity numbers and attributes maps). Instead, this module
// exposes a single `logger` singleton with the same `.info/.warn/.error`
// signature the old code used, so the mechanical replacement across
// 30+ function files is: drop the `getContext` import, drop the
// `const ctx = getContext();` line, and rename `ctx.logger.*` to
// `logger.*`. Nothing else changes.
//
// Output goes to stderr as `[agentmemory] <level> <msg> <json-fields>`.
// The iii-engine's `iii-exec` worker runs the agentmemory binary as a
// child process and forwards stderr into `docker logs
// agentmemory-iii-engine-1`, so these lines end up next to the engine's
// own output without needing any OTEL wiring. If we later want
// structured OTEL logs, this file is the only thing that changes.
//
// See rohitg00/agentmemory#143 follow-up — the #116 migration updated
// test mocks but left the real `getContext()` imports in place, which
// passed `npm test` (tests mock iii-sdk) and `npm run build` (tsdown
// doesn't type-check) but crashed `node dist/index.mjs` on first
// import.

type Fields = Record<string, unknown> | undefined;

function fmt(level: string, msg: string, fields: Fields): string {
  if (!fields || Object.keys(fields).length === 0) {
    return `[agentmemory] ${level} ${msg}`;
  }
  try {
    return `[agentmemory] ${level} ${msg} ${JSON.stringify(fields)}`;
  } catch {
    // Fields contained a circular reference or a BigInt — fall back
    // to the plain message so a log line never throws.
    return `[agentmemory] ${level} ${msg}`;
  }
}

function emit(level: string, msg: string, fields: Fields): void {
  try {
    process.stderr.write(fmt(level, msg, fields) + "\n");
  } catch {
    // stderr is unavailable in some weird test/worker contexts — swallow
    // so no log line can ever crash a handler.
  }
}

export const logger = {
  info(msg: string, fields?: Fields): void {
    emit("info", msg, fields);
  },
  warn(msg: string, fields?: Fields): void {
    emit("warn", msg, fields);
  },
  error(msg: string, fields?: Fields): void {
    emit("error", msg, fields);
  },
};
