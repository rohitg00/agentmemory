import type { CircuitBreakerState } from "../types.js";

interface CircuitBreakerOptions {
  failureThreshold?: number;
  failureWindowMs?: number;
  recoveryTimeoutMs?: number;
}

function positiveFinite(val: number | undefined, fallback: number): number {
  return Number.isFinite(val) && val! > 0 ? val! : fallback;
}

export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0;
  private lastFailureAt: number | null = null;
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;
  private readonly recoveryTimeoutMs: number;

  constructor(opts?: CircuitBreakerOptions) {
    this.failureThreshold = Math.max(
      1,
      Math.floor(positiveFinite(opts?.failureThreshold, 3)),
    );
    this.failureWindowMs = positiveFinite(opts?.failureWindowMs, 60_000);
    this.recoveryTimeoutMs = positiveFinite(opts?.recoveryTimeoutMs, 30_000);
  }

  get isAllowed(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (
        this.openedAt &&
        Date.now() - this.openedAt >= this.recoveryTimeoutMs
      ) {
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
    if (this.lastFailureAt && now - this.lastFailureAt > this.failureWindowMs) {
      this.failures = 0;
    }
    this.failures += 1;
    this.lastFailureAt = now;
    if (this.failures >= this.failureThreshold) {
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
