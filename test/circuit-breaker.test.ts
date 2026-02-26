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
});
