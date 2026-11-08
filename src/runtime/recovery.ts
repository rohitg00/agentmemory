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

export function shouldRearmIndex(input: RearmConditions): boolean {
  return input.bm25Incomplete || input.persistencePaused || input.lastRecoveryFailed;
}
