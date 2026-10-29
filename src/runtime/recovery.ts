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
  vectorBackfillState?: string;
  vectorBackfillErrorCode?: string;
}

export function shouldRearmIndex(input: RearmConditions): boolean {
  if (input.bm25Incomplete) return true;
  if (input.vectorBackfillState === "paused" || input.vectorBackfillState === "failed") {
    const code = input.vectorBackfillErrorCode ?? "";
    return code === "" || /payload_too_large|function_not_found|timeout|unavailable|not.ready/i.test(code);
  }
  return false;
}
