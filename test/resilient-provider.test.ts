import { describe, it, expect } from "vitest";
import { ResilientProvider } from "../src/providers/resilient.js";
import type { MemoryProvider } from "../src/types.js";

// Tracks how many calls are inside the provider at once, which is the thing the
// upstream API actually rejects. Counting total calls would not discriminate.
function countingProvider(
  behaviour: (n: number) => Promise<string> = async () => "ok",
): MemoryProvider & { peak: number; calls: number } {
  let inFlight = 0;
  const state = {
    name: "counting",
    peak: 0,
    calls: 0,
    async compress(): Promise<string> {
      inFlight++;
      state.calls++;
      if (inFlight > state.peak) state.peak = inFlight;
      try {
        return await behaviour(state.calls);
      } finally {
        inFlight--;
      }
    },
    async summarize(): Promise<string> {
      return state.compress();
    },
  };
  return state;
}

function rateLimited(): Error {
  return new Error('OpenAI API error (429): {"error":"too many concurrent requests"}');
}

describe("ResilientProvider concurrency", () => {
  it("never runs more than the configured number of calls at once", async () => {
    const inner = countingProvider(
      () => new Promise((resolve) => setTimeout(() => resolve("ok"), 5)),
    );
    const provider = new ResilientProvider(inner, { maxConcurrent: 3 });

    const results = await Promise.all(
      Array.from({ length: 24 }, () => provider.compress("sys", "user")),
    );

    expect(inner.peak).toBeLessThanOrEqual(3);
    // Bounding must not drop work: every call still ran and still resolved.
    expect(inner.calls).toBe(24);
    expect(results.every((r) => r === "ok")).toBe(true);
  });

  it("releases its slot when a call throws", async () => {
    const inner = countingProvider(async (n) => {
      if (n <= 2) throw new Error("boom");
      return "ok";
    });
    // maxConcurrent 1 is load-bearing here: at the default of 4 a leaked slot
    // would not deadlock, and the test would pass despite the bug.
    const provider = new ResilientProvider(inner, { maxConcurrent: 1 });

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => provider.compress("sys", "user")),
    );

    expect(settled).toHaveLength(5);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(3);
  });
});

describe("ResilientProvider rate limiting", () => {
  it("does not open the breaker on 429s", async () => {
    const inner = countingProvider(async (n) => {
      if (n <= 5) throw rateLimited();
      return "ok";
    });
    const provider = new ResilientProvider(inner);

    // Five, against a default failure threshold of three.
    for (let i = 0; i < 5; i++) {
      await provider.compress("sys", "user").catch(() => undefined);
    }

    expect(provider.circuitState.state).toBe("closed");
    await expect(provider.compress("sys", "user")).resolves.toBe("ok");
  });

  it("still opens the breaker on genuine failures", async () => {
    const inner = countingProvider(async () => {
      throw new Error("upstream exploded");
    });
    const provider = new ResilientProvider(inner);

    for (let i = 0; i < 3; i++) {
      await provider.compress("sys", "user").catch(() => undefined);
    }

    expect(provider.circuitState.state).toBe("open");
    await expect(provider.compress("sys", "user")).rejects.toThrow(
      "circuit_breaker_open",
    );
  });
});
