import { describe, expect, it, vi } from "vitest";
import { FallbackChainProvider } from "../src/providers/fallback-chain.js";
import { ResilientProvider } from "../src/providers/resilient.js";
import type { MemoryProvider } from "../src/types.js";

function textOnly(name: string): MemoryProvider {
  return {
    name,
    compress: async () => `compressed by ${name}`,
    summarize: async () => `summarized by ${name}`,
  };
}

function withVision(
  name: string,
  describeImage: MemoryProvider["describeImage"],
): MemoryProvider {
  return { ...textOnly(name), describeImage };
}

describe("provider wrappers keep image description", () => {
  it("ResilientProvider forwards describeImage with its arguments", async () => {
    const describe = vi.fn(async () => "a red dot");
    const provider = new ResilientProvider(withVision("vision", describe));

    await expect(provider.describeImage?.("data", "image/png", "prompt")).resolves.toBe(
      "a red dot",
    );
    expect(describe).toHaveBeenCalledWith("data", "image/png", "prompt");
  });

  it("ResilientProvider leaves describeImage absent for a text-only provider", () => {
    expect(new ResilientProvider(textOnly("text")).describeImage).toBeUndefined();
  });

  it("ResilientProvider counts image failures in the shared circuit breaker", async () => {
    const provider = new ResilientProvider(
      withVision("vision", async () => {
        throw new Error("gateway down");
      }),
    );
    for (let i = 0; i < 5; i++) {
      await provider.describeImage?.("data", "image/png", "prompt").catch(() => {});
    }
    await expect(provider.compress("sys", "user")).rejects.toThrow(/circuit/i);
  });

  it("FallbackChainProvider skips text-only providers and falls through in order", async () => {
    const failing = vi.fn(async () => {
      throw new Error("first down");
    });
    const working = vi.fn(async () => "from second");
    const chain = new FallbackChainProvider([
      textOnly("text"),
      withVision("first", failing),
      withVision("second", working),
    ]);

    await expect(chain.describeImage?.("data", "image/png", "prompt")).resolves.toBe(
      "from second",
    );
    expect(failing).toHaveBeenCalledOnce();
    expect(working).toHaveBeenCalledWith("data", "image/png", "prompt");
  });

  it("FallbackChainProvider leaves describeImage absent when no provider supports it", () => {
    expect(
      new FallbackChainProvider([textOnly("a"), textOnly("b")]).describeImage,
    ).toBeUndefined();
  });
});
