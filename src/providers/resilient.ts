import type { MemoryProvider, CircuitBreakerState } from "../types.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { getEnvVar } from "../config.js";

// Matches CHUNK_CONCURRENCY_DEFAULT in src/functions/summarize.ts on purpose.
// That value is tuned so a ~100-chunk session finishes inside the 180s
// invocation budget at roughly 8s per call; a global gate below it would push
// that past the budget and silently make SUMMARIZE_CHUNK_CONCURRENCY a no-op
// above the gate. Raise them together, never one alone.
const DEFAULT_MAX_CONCURRENT = 6;

// A queued call still holds its prompts alive, so an unbounded queue is a
// memory leak on a service that is already memory-constrained. Compression is
// dispatched fire-and-forget, so nothing upstream applies backpressure for us.
const MAX_QUEUED = 512;

class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    if (this.waiting.length >= MAX_QUEUED) {
      throw new Error("provider_queue_full");
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}

function isBackpressure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Quota exhaustion and billing failures also come back as 429, but they are
  // persistent states rather than backpressure. Excusing them would mean the
  // breaker could never open for a provider that will not recover on its own,
  // so they are checked first and fall through to a genuine failure.
  if (/insufficient_quota|exceeded your current quota|billing/i.test(message)) {
    return false;
  }
  // Status codes and API error codes only. `rate.?limit` also matched the
  // hyphenated form in a docs URL, so a genuine 500 whose body linked to
  // /docs/guides/rate-limits was excused and the breaker stayed blind to a
  // provider that was actually broken. `rate[ _]limit` covers prose and the
  // rate_limit_error / rate_limit_exceeded codes without matching the URL.
  // 529 / overloaded_error is Anthropic's form of the same backpressure signal.
  return /\b429\b|\b529\b|rate[ _]limit|too many (concurrent )?requests|overloaded_error/i.test(
    message,
  );
}

function resolveMaxConcurrent(configured: number | undefined): number {
  const candidate =
    configured ??
    Number(getEnvVar("AGENTMEMORY_MAX_PROVIDER_CONCURRENCY") ?? NaN);
  if (!Number.isFinite(candidate)) return DEFAULT_MAX_CONCURRENT;
  const whole = Math.floor(candidate);
  return whole >= 1 ? whole : DEFAULT_MAX_CONCURRENT;
}

export class ResilientProvider implements MemoryProvider {
  private breaker: CircuitBreaker;
  private gate: Semaphore;
  name: string;

  constructor(
    private inner: MemoryProvider,
    options: { maxConcurrent?: number } = {},
  ) {
    this.breaker = new CircuitBreaker();
    this.gate = new Semaphore(resolveMaxConcurrent(options.maxConcurrent));
    this.name = `resilient(${inner.name})`;
  }

  private async call(fn: () => Promise<string>): Promise<string> {
    if (!this.breaker.isAllowed) {
      throw new Error("circuit_breaker_open");
    }
    await this.gate.acquire();
    // Re-checked after queueing. A call that passed the first check may have
    // waited while the running calls failed and opened the breaker; without
    // this it would still be sent to a provider already known to be down, and
    // each such failure pushes the recovery window further out.
    if (!this.breaker.isAllowed) {
      this.gate.release();
      throw new Error("circuit_breaker_open");
    }
    // Read after the isAllowed checks, which are what move open -> half-open.
    const probing = this.breaker.getState().state === "half-open";
    try {
      const result = await fn();
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      // Backpressure normally must not open the breaker. The half-open probe is
      // the exception: nothing else records an outcome for it, so excusing a
      // rate-limited probe leaves the breaker sitting in half-open admitting
      // every call, with no path back to either open or closed. A probe that
      // came back rate-limited has still failed as a probe.
      if (probing || !isBackpressure(err)) this.breaker.recordFailure();
      throw err;
    } finally {
      this.gate.release();
    }
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(() => this.inner.compress(systemPrompt, userPrompt));
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(() => this.inner.summarize(systemPrompt, userPrompt));
  }

  get circuitState(): CircuitBreakerState {
    return this.breaker.getState();
  }
}
