export function singleFlight<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  let inFlight: Promise<R> | null = null;
  return (...args: A) => {
    if (!inFlight) {
      inFlight = fn(...args).finally(() => { inFlight = null; });
    }
    return inFlight;
  };
}

export interface RearmConditions {
  bm25Incomplete: boolean;
  persistencePaused: boolean;
  lastRecoveryFailed: boolean;
  checkpointSaveFailed: boolean;
}

export interface RearmSteps {
  retryCheckpoint: () => Promise<boolean>;
  indexNeedsRearm: () => boolean;
  runIndexRecovery: () => Promise<unknown>;
}

export async function rearmIndexRecovery(steps: RearmSteps): Promise<void> {
  const restored = await steps.retryCheckpoint();
  if (restored || steps.indexNeedsRearm()) await steps.runIndexRecovery();
}

export interface RetryBackoff {
  readonly stopped: boolean;
  /** True once the current delay has passed and retries were not stopped. */
  due(): boolean;
  /** Records a failed attempt and doubles the delay, up to maxMs. */
  failed(): void;
  /** Stops retrying for the life of the process. */
  stop(): void;
}

export function createRetryBackoff(opts: { initialMs: number; maxMs: number; now?: () => number }): RetryBackoff {
  const now = opts.now ?? (() => Date.now());
  let delay = opts.initialMs;
  let nextAt = now() + delay;
  let stopped = false;
  return {
    get stopped() {
      return stopped;
    },
    due: () => !stopped && now() >= nextAt,
    failed: () => {
      delay = Math.min(delay * 2, opts.maxMs);
      nextAt = now() + delay;
    },
    stop: () => {
      stopped = true;
    },
  };
}

export function backfillFailedOutright(result: { added: number; failed: number }): boolean {
  return result.failed > 0 && result.added === 0;
}

export function shouldRearmIndex(input: RearmConditions): boolean {
  return input.bm25Incomplete || input.persistencePaused || input.lastRecoveryFailed || input.checkpointSaveFailed;
}
