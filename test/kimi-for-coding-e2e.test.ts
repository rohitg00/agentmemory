import { describe, expect, it } from "vitest";
import { KimiForCodingProvider } from "../src/providers/kimi-for-coding.js";

describe("KimiForCodingProvider — request shape", () => {
  it("sends correct headers and body to Anthropic-compatible endpoint", async () => {
    let capturedRequest: {
      url: string;
      headers: Record<string, string>;
      body: unknown;
    } | null = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const requestUrl = url.toString();
      const headers: Record<string, string> = {};
      if (init?.headers) {
        const h = init.headers;
        if (h instanceof Headers) {
          h.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(h)) {
          for (const [k, v] of h) headers[k] = v;
        } else {
          Object.assign(headers, h);
        }
      }
      capturedRequest = {
        url: requestUrl,
        headers,
        body: init?.body ? JSON.parse(init.body as string) : null,
      };
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "mocked response" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      const provider = new KimiForCodingProvider("sk-test-key", "kimi-k2", 512);
      const result = await provider.compress("Be concise", "Summarize this");

      expect(result).toBe("mocked response");
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.url).toBe(
        "https://api.kimi.com/coding/v1/messages",
      );
      expect(capturedRequest!.headers["x-api-key"]).toBe("sk-test-key");
      expect(capturedRequest!.headers["anthropic-version"]).toBe("2023-06-01");
      expect(capturedRequest!.headers["User-Agent"]).toBe("KimiCLI/1.5");
      expect(capturedRequest!.headers["Content-Type"]).toBe("application/json");

      const body = capturedRequest!.body as Record<string, unknown>;
      expect(body.model).toBe("kimi-k2");
      expect(body.max_tokens).toBe(512);
      expect(body.system).toBe("Be concise");
      expect(body.messages).toEqual([
        { role: "user", content: "Summarize this" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on API error with status and body", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("engine overloaded", {
        status: 429,
        statusText: "Too Many Requests",
      });

    try {
      const provider = new KimiForCodingProvider("sk-test", "kimi-k2", 100);
      await expect(provider.summarize("sys", "user")).rejects.toThrow(
        "Kimi for Coding error 429: engine overloaded",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
