import type { MemoryProvider, CircuitBreakerState } from "../types.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { getCircuitBreakerOptions } from "../config.js";

export class ResilientProvider implements MemoryProvider {
  // Thresholds come from config so a deployment sitting behind a flaky
  // proxy can widen them without a rebuild.
  private breaker = new CircuitBreaker(getCircuitBreakerOptions());
  name: string;

  constructor(private inner: MemoryProvider) {
    this.name = `resilient(${inner.name})`;
  }

  private async call(fn: () => Promise<string>): Promise<string> {
    if (!this.breaker.isAllowed) {
      throw new Error("circuit_breaker_open");
    }
    try {
      const result = await fn();
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
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
