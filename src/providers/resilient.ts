import type { MemoryProvider, CircuitBreakerState } from "../types.js";
import { CircuitBreaker, type CircuitBreakerOptions } from "./circuit-breaker.js";

const DEFAULT_MAX_CONCURRENT = 4;

/**
 * Bounds how many calls are inside the provider at once.
 *
 * Without this, every captured observation fired a compress() immediately and
 * unbounded, so load meant dozens of simultaneous upstream calls and the
 * provider answered with `429 too many concurrent requests`.
 *
 * release() hands its slot directly to the next waiter rather than decrementing
 * and letting it race for the opening, so the limit holds under a burst.
 */
class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}

/**
 * A 429 says "slow down", not "you are broken".
 *
 * Counting it as a circuit-breaker failure turns backpressure into an outage:
 * three of them inside the failure window open the breaker, and then every
 * compression fails fast for the whole recovery timeout even though the
 * provider is healthy and merely busy.
 */
function isRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /\b429\b/.test(message) ||
    /rate.?limit|too many (concurrent )?requests/i.test(message)
  );
}

function resolveMaxConcurrent(configured: number | undefined): number {
  const candidate =
    configured ??
    Number(process.env["AGENTMEMORY_MAX_PROVIDER_CONCURRENCY"] ?? NaN);
  if (!Number.isFinite(candidate)) return DEFAULT_MAX_CONCURRENT;
  const whole = Math.floor(candidate);
  return whole >= 1 ? whole : DEFAULT_MAX_CONCURRENT;
}

export interface ResilientProviderOptions {
  maxConcurrent?: number;
  breaker?: CircuitBreakerOptions;
}

export class ResilientProvider implements MemoryProvider {
  private breaker: CircuitBreaker;
  private gate: Semaphore;
  name: string;

  constructor(
    private inner: MemoryProvider,
    options: ResilientProviderOptions = {},
  ) {
    this.breaker = new CircuitBreaker(options.breaker);
    this.gate = new Semaphore(resolveMaxConcurrent(options.maxConcurrent));
    this.name = `resilient(${inner.name})`;
  }

  private async call(fn: () => Promise<string>): Promise<string> {
    // Checked before queueing. An open breaker should fail fast rather than
    // occupy a slot that a call with a chance of succeeding could use.
    if (!this.breaker.isAllowed) {
      throw new Error("circuit_breaker_open");
    }
    await this.gate.acquire();
    try {
      const result = await fn();
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      if (!isRateLimited(err)) this.breaker.recordFailure();
      throw err;
    } finally {
      // In `finally` so a throw cannot leak the slot and deadlock every call
      // queued behind it.
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
