import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  callTimeoutMs,
  resolveHandle,
  resetHandleForTests,
} from "../src/mcp/rest-proxy.js";

// ─────────────────────────────────────────────────────────────
// callTimeoutMs() unit tests
// Mirrors the AGENTMEMORY_LLM_TIMEOUT_MS suite in fetch-timeout.test.ts
// and the resolveEnvOrEmpty suite in mcp-env-placeholder.test.ts.
// ─────────────────────────────────────────────────────────────
describe("callTimeoutMs — AGENTMEMORY_CALL_TIMEOUT_MS env var", () => {
  beforeEach(() => {
    delete process.env["AGENTMEMORY_CALL_TIMEOUT_MS"];
  });

  afterEach(() => {
    delete process.env["AGENTMEMORY_CALL_TIMEOUT_MS"];
  });

  it("returns 600 000 when env var is not set", () => {
    expect(callTimeoutMs()).toBe(600_000);
  });

  it("returns 600 000 when env var is empty string", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "";
    expect(callTimeoutMs()).toBe(600_000);
  });

  it("reads a valid numeric value from AGENTMEMORY_CALL_TIMEOUT_MS", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "30000";
    expect(callTimeoutMs()).toBe(30_000);
  });

  it("floors a float value", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "1500.9";
    expect(callTimeoutMs()).toBe(1_500);
  });

  it("falls back to 600 000 for a zero value", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "0";
    expect(callTimeoutMs()).toBe(600_000);
  });

  it("falls back to 600 000 for a negative value", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "-1";
    expect(callTimeoutMs()).toBe(600_000);
  });

  it("falls back to 600 000 for malformed values (CodeRabbit parity with fetch-timeout tests)", () => {
    for (const bad of ["30ms", "1_000", "60s", "30abc", "Infinity", "NaN"]) {
      process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = bad;
      expect(callTimeoutMs()).toBe(600_000);
    }
  });

  it("clamps values above the Node.js 32-bit timer ceiling to 2 147 483 647", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "9999999999";
    expect(callTimeoutMs()).toBe(2_147_483_647);
  });

  it("returns the exact ceiling value when set to 2 147 483 647", () => {
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "2147483647";
    expect(callTimeoutMs()).toBe(2_147_483_647);
  });
});

// ─────────────────────────────────────────────────────────────
// Proxy call respects AGENTMEMORY_CALL_TIMEOUT_MS override
// Sets a tiny timeout (50 ms), installs a hanging fetch that
// honours AbortSignal, and asserts the proxy call aborts instead
// of running forever.
// ─────────────────────────────────────────────────────────────
describe("proxy call — AGENTMEMORY_CALL_TIMEOUT_MS aborts hung requests", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetHandleForTests();
    process.env["AGENTMEMORY_URL"] = "http://localhost:3111";
    process.env["AGENTMEMORY_FORCE_PROXY"] = "1";
    process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "50";

    // Fetch that never resolves but respects AbortSignal.
    globalThis.fetch = vi.fn(
      async (_url: string | URL, init?: RequestInit): Promise<Response> => {
        return new Promise<Response>((_resolve, reject) => {
          const sig = init?.signal;
          if (!sig) return;
          if (sig.aborted) {
            reject(new DOMException("AbortError", "AbortError"));
            return;
          }
          sig.addEventListener("abort", () =>
            reject(new DOMException("AbortError", "AbortError")),
          );
        });
      },
    ) as typeof fetch;
  });

  afterEach(() => {
    resetHandleForTests();
    globalThis.fetch = originalFetch;
    delete process.env["AGENTMEMORY_URL"];
    delete process.env["AGENTMEMORY_FORCE_PROXY"];
    delete process.env["AGENTMEMORY_CALL_TIMEOUT_MS"];
  });

  it("aborts a proxy call that hangs beyond the configured timeout", async () => {
    const handle = await resolveHandle();
    expect(handle.mode).toBe("proxy");
    if (handle.mode !== "proxy") return;

    await expect(
      handle.call("/agentmemory/smart-search", {
        method: "POST",
        body: JSON.stringify({ query: "test" }),
      }),
    ).rejects.toThrow();
  });

  it("does NOT abort when the server responds before the deadline", async () => {
    // Replace the hanging mock with one that resolves immediately.
    globalThis.fetch = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as typeof fetch;

    resetHandleForTests();
    const handle = await resolveHandle();
    expect(handle.mode).toBe("proxy");
    if (handle.mode !== "proxy") return;

    const result = await handle.call("/agentmemory/smart-search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });
    expect(result).toEqual({ results: [] });
  });
});
