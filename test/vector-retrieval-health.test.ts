import { describe, expect, it, vi } from "vitest";
import { VectorRetrievalHealth } from "../src/recall/vector-health.js";

describe("VectorRetrievalHealth", () => {
  it("opens after transient failures and allows only one half-open probe", () => {
    vi.useFakeTimers();
    const health = new VectorRetrievalHealth(2, 1000);
    expect(health.begin(true, true)).toMatchObject({ status: "healthy", attempted: true });
    health.failure(new Error("429 quota exceeded"));
    expect(health.begin(true, true)).toMatchObject({ status: "healthy", attempted: true });
    health.failure(new Error("429 quota exceeded"));
    expect(health.begin(true, true)).toMatchObject({ status: "degraded", attempted: false });
    vi.advanceTimersByTime(1000);
    expect(health.begin(true, true)).toMatchObject({ status: "healthy", attempted: true });
    expect(health.begin(true, true)).toMatchObject({ status: "degraded", attempted: false });
    health.success();
    expect(health.begin(true, true)).toMatchObject({ status: "healthy", attempted: true });
    vi.useRealTimers();
  });

  it("latches permanent authentication failures", () => {
    const health = new VectorRetrievalHealth();
    health.begin(true, true);
    expect(health.failure(new Error("401 invalid API key"))).toMatchObject({ status: "disabled" });
    expect(health.begin(true, true)).toMatchObject({ status: "disabled", attempted: false });
  });
});
