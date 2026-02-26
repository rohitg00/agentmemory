import type { MemoryProvider, CircuitBreakerState } from "../types.js";
import { CircuitBreaker } from "./circuit-breaker.js";

export class ResilientProvider implements MemoryProvider {
  private breaker = new CircuitBreaker();
  name: string;

  constructor(private inner: MemoryProvider) {
    this.name = `resilient(${inner.name})`;
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.breaker.isAllowed) {
      throw new Error("circuit_breaker_open");
    }
    try {
      const result = await this.inner.compress(systemPrompt, userPrompt);
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
    }
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.breaker.isAllowed) {
      throw new Error("circuit_breaker_open");
    }
    try {
      const result = await this.inner.summarize(systemPrompt, userPrompt);
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
    }
  }

  get circuitState(): CircuitBreakerState {
    return this.breaker.getState();
  }
}
