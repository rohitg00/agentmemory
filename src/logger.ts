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

// ---------- boot log ----------
//
// `bootLog` is for the one-shot status lines that every register-*
// function used to dump via `console.log` during engine startup. On a
// fresh install that's ~25 lines of `[agentmemory] X enabled` noise
// before the user can see a prompt. In quiet mode (default), each
// line is captured into a buffer and discarded; the CLI surfaces a
// single compressed summary instead. In verbose mode (set by
// `--verbose` or `AGENTMEMORY_VERBOSE=1`) the lines pass straight
// through to stderr exactly like the old console.log calls.

let bootVerbose =
  process.env["AGENTMEMORY_VERBOSE"] === "1" ||
  process.env["AGENTMEMORY_VERBOSE"] === "true";

const bootBuffer: string[] = [];

export function setBootVerbose(enabled: boolean): void {
  bootVerbose = enabled;
}

export function isBootVerbose(): boolean {
  return bootVerbose;
}

export function bootLog(msg: string): void {
  if (bootVerbose) {
    try {
      process.stderr.write(`[agentmemory] ${msg}\n`);
    } catch {
      // stderr unavailable — drop.
    }
    return;
  }
  if (bootBuffer.length < 500) bootBuffer.push(msg);
}

export function bootWarn(msg: string): void {
  // Warnings always surface; they're rare and the user needs to see
  // them even when the rest of the boot log is suppressed.
  try {
    process.stderr.write(`[agentmemory] warn ${msg}\n`);
  } catch {}
}

export function getBootBuffer(): readonly string[] {
  return bootBuffer;
}
