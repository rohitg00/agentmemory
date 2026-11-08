import { describe, expect, it } from "vitest";
import { ResilientProvider, isPayloadRejection } from "../src/providers/resilient.js";
import type { MemoryProvider } from "../src/types.js";

const CONTENT_FILTER_ERROR = new Error(
  'OpenAI API error (400): {"error":{"message":"The response was filtered due to ' +
    'the prompt triggering Azure OpenAI\'s content management policy.",' +
    '"code":"content_filter","status":400,"innererror":{"code":"ResponsibleAIPolicyViolation",' +
    '"content_filter_result":{"jailbreak":{"detected":true,"filtered":true}}}}}',
);

const GATEWAY_ECHO_ERROR = new Error(
  'OpenAI API error (502): {"error":{"message":"upstream returned an error: ' +
    '{\\"code\\":\\"content_filter\\",\\"innererror\\":' +
    '{\\"code\\":\\"ResponsibleAIPolicyViolation\\"}}","code":"bad_gateway"}}',
);

function providerThatFails(err: Error, okAfter = Infinity): MemoryProvider {
  let calls = 0;
  return {
    name: "stub",
    async compress() {
      calls += 1;
      if (calls > okAfter) return "<observation/>";
      throw err;
    },
    async summarize() {
      return "<summary/>";
    },
  } as MemoryProvider;
}

describe("isPayloadRejection", () => {
  it("recognises Azure content filter rejections", () => {
    expect(isPayloadRejection(CONTENT_FILTER_ERROR)).toBe(true);
    expect(
      isPayloadRejection(
        new Error('OpenAI API error (400): {"error":{"code":"ResponsibleAIPolicyViolation"}}'),
      ),
    ).toBe(true);
    expect(
      isPayloadRejection(
        new Error('openrouter API error (400): {"error":{"code":"content_filter"}}'),
      ),
    ).toBe(true);
  });

  it("does not treat the filter code alone as a rejection", () => {
    expect(isPayloadRejection(new Error("ResponsibleAIPolicyViolation"))).toBe(false);
  });

  it("treats genuine provider trouble as a failure", () => {
    expect(isPayloadRejection(new Error("OpenAI API error (503): upstream down"))).toBe(false);
    expect(isPayloadRejection(new Error("request timed out after 60000ms"))).toBe(false);
    expect(isPayloadRejection("socket hang up")).toBe(false);
  });

  it("does not excuse a gateway failure that merely quotes the filter body", () => {
    expect(isPayloadRejection(GATEWAY_ECHO_ERROR)).toBe(false);
  });
});

describe("ResilientProvider — content filter vs circuit breaker", () => {
  it("keeps the breaker closed across repeated filter rejections", async () => {
    const provider = new ResilientProvider(providerThatFails(CONTENT_FILTER_ERROR));

    for (let i = 0; i < 5; i++) {
      await expect(provider.compress("sys", "bad")).rejects.toThrow(/content_filter/);
    }

    expect(provider.circuitState.state).toBe("closed");
  });

  it("lets an unrelated call through after filtered ones", async () => {
    const provider = new ResilientProvider(providerThatFails(CONTENT_FILTER_ERROR, 3));

    for (let i = 0; i < 3; i++) {
      await expect(provider.compress("sys", "bad")).rejects.toThrow(/content_filter/);
    }

    await expect(provider.compress("sys", "harmless")).resolves.toBe("<observation/>");
  });

  it("opens the breaker when a gateway failure quotes the filter body", async () => {
    const provider = new ResilientProvider(providerThatFails(GATEWAY_ECHO_ERROR));

    for (let i = 0; i < 3; i++) {
      await expect(provider.compress("sys", "x")).rejects.toThrow(/502/);
    }

    expect(provider.circuitState.state).toBe("open");
  });

  it("still opens the breaker for real provider failures", async () => {
    const provider = new ResilientProvider(
      providerThatFails(new Error("OpenAI API error (503): upstream down")),
    );

    for (let i = 0; i < 3; i++) {
      await expect(provider.compress("sys", "x")).rejects.toThrow(/503/);
    }

    expect(provider.circuitState.state).toBe("open");
    await expect(provider.compress("sys", "x")).rejects.toThrow("circuit_breaker_open");
  });
});
