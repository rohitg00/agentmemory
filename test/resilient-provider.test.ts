import { describe, it, expect, vi } from "vitest";
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

describe("ResilientProvider rate-limit classification", () => {
  it("still opens the breaker when a real failure merely mentions a rate limit", async () => {
    // The filter matches on message text, and providers interpolate the whole
    // upstream body. A 500 whose body carries a docs link like
    // /docs/guides/rate-limits would otherwise be excused forever, leaving the
    // breaker permanently blind to a genuinely broken provider.
    const inner = countingProvider(async () => {
      throw new Error(
        "HTTP 500 upstream failure, see https://example.com/docs/guides/rate-limits",
      );
    });
    const provider = new ResilientProvider(inner);

    for (let i = 0; i < 3; i++) {
      await provider.compress("sys", "user").catch(() => undefined);
    }

    expect(provider.circuitState.state).toBe("open");
  });

  it("opens the breaker on quota exhaustion even though it arrives as a 429", async () => {
    // Quota exhaustion and billing failures use the same status as
    // backpressure, but they do not resolve on their own. Excusing them means
    // the breaker can never open for a provider that will stay broken.
    const inner = countingProvider(async () => {
      throw new Error(
        'API error (429): {"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}',
      );
    });
    const provider = new ResilientProvider(inner);

    for (let i = 0; i < 3; i++) {
      await provider.compress("sys", "user").catch(() => undefined);
    }

    expect(provider.circuitState.state).toBe("open");
  });

  it("treats an overloaded provider as backpressure", async () => {
    // Anthropic signals the same "busy, retry" condition as 529
    // overloaded_error rather than 429.
    const inner = countingProvider(async (n) => {
      if (n <= 5) throw new Error('{"type":"overloaded_error"} (529)');
      return "ok";
    });
    const provider = new ResilientProvider(inner);

    for (let i = 0; i < 5; i++) {
      await provider.compress("sys", "user").catch(() => undefined);
    }

    expect(provider.circuitState.state).toBe("closed");
  });
});

describe("ResilientProvider half-open probe", () => {
  it("does not get stuck in half-open when the probe is rate limited", async () => {
    // Nothing else records an outcome for the probe, so excusing a
    // rate-limited one leaves the breaker in half-open admitting every call,
    // with no path back to open or closed. Half-open must never be a state you
    // can enter and not leave.
    let mode: "fail" | "ratelimit" = "fail";
    const inner = countingProvider(async () => {
      throw mode === "fail"
        ? new Error("upstream exploded")
        : new Error("API error (429): rate limited");
    });
    const provider = new ResilientProvider(inner);

    for (let i = 0; i < 3; i++) {
      await provider.compress("sys", "user").catch(() => undefined);
    }
    expect(provider.circuitState.state).toBe("open");

    // Move the clock past the 30s recovery window so the next call is the
    // probe. Sleeping a few milliseconds instead would leave the breaker still
    // open, the probe would never happen, and this test would pass without
    // exercising anything — it did exactly that before this was fixed.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31_000);
    try {
      mode = "ratelimit";
      await provider.compress("sys", "user").catch(() => undefined);

      // Assert the probe actually dispatched. Without this the test passes
      // vacuously if the clock advance does not take: the breaker would still
      // be open, the first isAllowed check would throw before reaching fn(),
      // and "open" !== "half-open" would hold while nothing was exercised.
      expect(inner.calls).toBe(4);
      // Must be exactly open. `not.toBe("half-open")` would also accept
      // "closed", which is the worse bug — a rate-limited probe mistaken for
      // full recovery.
      expect(provider.circuitState.state).toBe("open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails a call queued before the breaker opened, without calling the provider", async () => {
    // The post-acquire re-check. A call admitted while the breaker was closed
    // can wait behind others that fail and open it; without the re-check it is
    // still handed to a provider already known to be down.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const inner = countingProvider(async (n) => {
      if (n === 1) {
        await gate;
        throw new Error("upstream exploded");
      }
      throw new Error("upstream exploded");
    });
    const provider = new ResilientProvider(inner, { maxConcurrent: 1 });

    // One call occupies the only slot; three more queue behind it.
    const first = provider.compress("sys", "user").catch((e) => e);
    const queued = Array.from({ length: 3 }, () =>
      provider.compress("sys", "user").catch((e: Error) => e),
    );
    release();
    const results = [await first, ...(await Promise.all(queued))];

    // Three failures open the breaker, so the last queued call must be turned
    // away at the re-check rather than reaching the provider.
    expect(provider.circuitState.state).toBe("open");
    expect(inner.calls).toBeLessThan(4);
    expect(
      results.some((r) => (r as Error).message === "circuit_breaker_open"),
    ).toBe(true);
  });
});
