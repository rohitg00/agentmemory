import type { CircuitBreakerState } from "../types.js";

const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 60_000;
const RECOVERY_TIMEOUT_MS = 30_000;

export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0;
  private lastFailureAt: number | null = null;
  private openedAt: number | null = null;

  get isAllowed(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (this.openedAt && Date.now() - this.openedAt >= RECOVERY_TIMEOUT_MS) {
        this.state = "half-open";
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failures = 0;
      this.lastFailureAt = null;
      this.openedAt = null;
    }
  }

  recordFailure(): void {
    const now = Date.now();
    if (this.state === "half-open") {
      this.state = "open";
      this.openedAt = now;
      return;
    }
    if (this.lastFailureAt && now - this.lastFailureAt > FAILURE_WINDOW_MS) {
      this.failures = 0;
    }
    this.failures += 1;
    this.lastFailureAt = now;
    if (this.failures >= FAILURE_THRESHOLD) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }
}
