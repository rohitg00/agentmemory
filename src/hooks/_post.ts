// A hook fires once and exits, so a failed POST used to vanish: the caller
// swallowed the error and the process was gone before anything noticed.
// Retries once on a bad status or a network error, and never rejects.
//
// Both attempts and the delay between them must fit inside the caller's exit
// timer, or the process dies mid-retry and the retry silently stops existing.
// The hooks arm 1000ms; 400 + 100 + 400 leaves 100ms of margin. A test pins
// this, so raising either number without raising the timer fails the suite.
export const RETRY_DELAY_MS = 100;
export const DEFAULT_ATTEMPT_MS = 400;

export async function postWithRetry(
  url: string,
  headers: Record<string, string>,
  body: string,
  attemptMs = DEFAULT_ATTEMPT_MS,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      // Fresh signal per attempt: a reused one arrives already spent.
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(attemptMs),
      });
      if (res.ok) return;
    } catch (err) {
      // A timeout leaves delivery UNKNOWN, so retrying it can duplicate.
      // See the client-timeout cases in test/hook-post-retry.test.ts.
      const name = (err as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") return;
    }
  }
}
