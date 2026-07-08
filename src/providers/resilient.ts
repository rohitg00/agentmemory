import type { MemoryProvider, CircuitBreakerState } from "../types.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { currentSessionId } from "../state/session-context.js";
import { getSessionBudgetMeter } from "../functions/session-budget.js";

// Rough token estimate (char/3) reused from the context
// renderer. Per-session budgets are a cost safety net, not billing-grade
// accounting — providers return a bare string with no usage field, so we
// estimate from prompt + response length rather than threading exact usage
// through every provider method.
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3);
}

export class ResilientProvider implements MemoryProvider {
  private breaker = new CircuitBreaker();
  name: string;

  constructor(private inner: MemoryProvider, private modelName = inner.name) {
    this.name = `resilient(${inner.name})`;
  }

  // All LLM traffic funnels through here. Order: circuit-breaker gate ->
  // per-session budget gate -> inner call -> record estimated tokens in a
  // finally (0/0 on failure so partial calls are never double-counted).
  private async call(systemPrompt: string, userPrompt: string, fn: () => Promise<string>): Promise<string> {
    if (!this.breaker.isAllowed) {
      throw new Error("circuit_breaker_open");
    }

    const sessionId = currentSessionId();
    const meter = getSessionBudgetMeter();
    if (await meter.isExhausted(sessionId)) {
      throw new Error("session_budget_exhausted");
    }

    const inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
    let outputTokens = 0;
    let succeeded = false;
    try {
      const result = await fn();
      outputTokens = estimateTokens(result);
      succeeded = true;
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
    } finally {
      // Failed calls record 0/0: the inner provider may have aborted before
      // consuming tokens, and counting a best-guess input on every retry
      // would over-bill the cap on flaky providers.
      await meter
      .record(
          sessionId,
          succeeded ? inputTokens : 0,
          succeeded ? outputTokens : 0,
          this.modelName,
        )
        .catch(() => {});
    }
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt, () =>
      this.inner.compress(systemPrompt, userPrompt),
    );
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt, () =>
      this.inner.summarize(systemPrompt, userPrompt),
    );
  }

  get circuitState(): CircuitBreakerState {
    return this.breaker.getState();
  }
}
