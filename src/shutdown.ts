export const SHUTDOWN_FLUSH_TIMEOUT_MS = 4000;
export const SHUTDOWN_HARD_EXIT_MS = 8000;

interface StartupCleanup {
  cleanup: () => Promise<void>;
  pending?: Promise<void>;
  exitCode?: number;
}

// The CLI and worker are built separately, but share startup ownership in one process.
const STARTUP_CLEANUP = Symbol.for("@agentmemory/startup-cleanup");
const startupGlobal = globalThis as typeof globalThis & { [STARTUP_CLEANUP]?: StartupCleanup };

export function registerStartupCleanup(cleanup: () => Promise<void>): () => void {
  const state: StartupCleanup = { cleanup };
  startupGlobal[STARTUP_CLEANUP] = state;
  return () => {
    if (startupGlobal[STARTUP_CLEANUP] === state) delete startupGlobal[STARTUP_CLEANUP];
  };
}

export async function runStartupCleanup(exitCode: number): Promise<number> {
  const state = startupGlobal[STARTUP_CLEANUP];
  if (!state) return exitCode;
  state.exitCode ??= exitCode;
  state.pending ??= Promise.resolve().then(state.cleanup);
  await state.pending;
  return state.exitCode;
}

export async function settleWithin(
  work: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([work.then(() => true), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
