import type { MemoryProvider, CircuitBreakerState } from "../types.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { getEnvVar } from "../config.js";

const DEFAULT_MAX_CONCURRENT = 4;

/**
 * Bounds how many calls are inside the provider at once.
 *
 * release() hands its slot directly to the next waiter rather than
 * decrementing and letting waiters race for the opening, so the limit holds
 * under a burst.
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

// 429 is backpressure, not a fault. Counting it opened the breaker on a healthy
// provider and failed every compression for the recovery window.
function isRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|too many (concurrent )?requests/i.test(message);
}

// Option is the test seam, env is the operator knob on Railway, constant is the
// default. getEnvVar rather than process.env so ~/.agentmemory/.env is honoured,
// which is how every sibling provider reads config.
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
