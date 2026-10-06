import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker } from "../src/providers/circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState().state).toBe("closed");
    expect(cb.isAllowed).toBe(true);
  });

  it("stays closed after fewer than 3 failures", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe("closed");
    expect(cb.isAllowed).toBe(true);
  });

  it("opens after 3 failures within the window", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe("open");
    expect(cb.isAllowed).toBe(false);
  });

  it("resets failure count when failures are outside the window", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(61_000);
    cb.recordFailure();
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(1);
  });

  it("transitions to half-open after recovery timeout", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isAllowed).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(cb.isAllowed).toBe(true);
    expect(cb.getState().state).toBe("half-open");
  });

  it("closes on success in half-open state", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(30_000);
    cb.isAllowed;
    cb.recordSuccess();
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);
    expect(cb.getState().lastFailureAt).toBeNull();
  });

  it("reopens on failure in half-open state", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(30_000);
    cb.isAllowed;
    cb.recordFailure();
    expect(cb.getState().state).toBe("open");
  });

  it("records lastFailureAt timestamp", () => {
    const cb = new CircuitBreaker();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    cb.recordFailure();
    expect(cb.getState().lastFailureAt).toBe(
      new Date("2026-01-15T10:00:00Z").getTime(),
    );
  });

  it("records openedAt timestamp", () => {
    const cb = new CircuitBreaker();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().openedAt).toBe(
      new Date("2026-01-15T10:00:00Z").getTime(),
    );
  });

  it("success in closed state is a no-op", () => {
    const cb = new CircuitBreaker();
    cb.recordSuccess();
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);
  });

  it("a success in closed state clears the accumulated failure count", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().failures).toBe(2);
    cb.recordSuccess();
    expect(cb.getState().failures).toBe(0);
    expect(cb.getState().lastFailureAt).toBeNull();
  });

  // Regression: the breaker counted failures since the last window
  // expiry rather than since the last success, so a provider
  // succeeding 95% of the time still tripped — each failure landed
  // inside the 60s window opened by the previous one. In production
  // that turned a handful of real upstream errors into ~1100
  // consecutive circuit_breaker_open fast-fails.
  it("stays closed across 100 calls at a 5% failure rate", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 100; i++) {
      if (i % 20 === 0) cb.recordFailure();
      else cb.recordSuccess();
      vi.advanceTimersByTime(1_000);
      expect(cb.getState().state).toBe("closed");
    }
    expect(cb.isAllowed).toBe(true);
  });

  // An in-flight request can succeed after a different request has already
  // opened the breaker. That success must not strip the recovery deadline.
  it("keeps openedAt when a success arrives while open", () => {
    const cb = new CircuitBreaker();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe("open");
    const openedAt = cb.getState().openedAt;

    cb.recordSuccess();

    expect(cb.getState().state).toBe("open");
    expect(cb.getState().openedAt).toBe(openedAt);
    expect(cb.isAllowed).toBe(false);

    vi.advanceTimersByTime(30_000);
    expect(cb.isAllowed).toBe(true);
    expect(cb.getState().state).toBe("half-open");
  });

  it("still opens on a genuinely failing provider", () => {
    const cb = new CircuitBreaker({ failureThreshold: 10 });
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
      vi.advanceTimersByTime(1_000);
    }
    expect(cb.getState().state).toBe("open");
    expect(cb.isAllowed).toBe(false);
  });

  it("honors configured thresholds and recovery timeout", () => {
    const cb = new CircuitBreaker({
      failureThreshold: 10,
      recoveryTimeoutMs: 15_000,
    });
    for (let i = 0; i < 9; i++) cb.recordFailure();
    expect(cb.getState().state).toBe("closed");
    cb.recordFailure();
    expect(cb.getState().state).toBe("open");
    vi.advanceTimersByTime(15_000);
    expect(cb.isAllowed).toBe(true);
    expect(cb.getState().state).toBe("half-open");
  });
});
