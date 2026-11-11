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
  private probeStartedAt: number | null = null;
  private probeId = 0;

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
    return this.admit() !== null;
  }

  admit(): number | null {
    if (this.state === "closed") return 0;
    const now = Date.now();
    if (this.state === "open") {
      if (!this.openedAt || now - this.openedAt < this.recoveryTimeoutMs) {
        return null;
      }
      this.state = "half-open";
    } else if (
      this.probeStartedAt !== null &&
      now - this.probeStartedAt < this.recoveryTimeoutMs
    ) {
      return null;
    }
    this.probeStartedAt = now;
    this.probeId += 1;
    return this.probeId;
  }

  private isStale(probe: number | undefined): boolean {
    if (probe === undefined) return false;
    return this.state === "half-open" ? probe !== this.probeId : probe !== 0;
  }

  recordSuccess(probe?: number): void {
    if (this.state === "open" || this.isStale(probe)) return;
    this.state = "closed";
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
    this.probeStartedAt = null;
  }

  recordFailure(probe?: number): void {
    if (this.isStale(probe)) return;
    const now = Date.now();
    if (this.state === "half-open") {
      this.state = "open";
      this.openedAt = now;
      this.probeStartedAt = null;
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
    // isAllowed only moves open → half-open on the next call; an idle breaker
    // must not keep reporting an outage that its recovery timeout has ended.
    const recoveryDue =
      this.state === "open" &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.recoveryTimeoutMs;
    return {
      state: recoveryDue ? "half-open" : this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }
}
