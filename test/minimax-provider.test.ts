import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimaxProvider } from "../src/providers/minimax.js";

describe("MinimaxProvider — base URL resolution (#285)", () => {
  let originalBaseUrl: string | undefined;

  beforeEach(() => {
    originalBaseUrl = process.env["MINIMAX_BASE_URL"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalBaseUrl === undefined) {
      delete process.env["MINIMAX_BASE_URL"];
    } else {
      process.env["MINIMAX_BASE_URL"] = originalBaseUrl;
    }
  });

  function mockSuccessfulResponse() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }

  it("sends default requests to the global Anthropic-compatible endpoint", async () => {
    delete process.env["MINIMAX_BASE_URL"];
    const fetchSpy = mockSuccessfulResponse();
    const provider = new MinimaxProvider("test-key", "MiniMax-M3", 800);

    await provider.compress("system", "user");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.minimax.io/anthropic/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchSpy.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: "MiniMax-M3",
    });
  });

  it.each([
    [
      "China regional",
      "https://api.minimaxi.com/anthropic/",
      "https://api.minimaxi.com/anthropic/v1/messages",
    ],
    [
      "versioned custom",
      "https://custom.example.com/anthropic/v1",
      "https://custom.example.com/anthropic/v1/messages",
    ],
  ])(
    "normalizes %s base URLs before sending requests",
    async (_name, baseUrl, expectedUrl) => {
      process.env["MINIMAX_BASE_URL"] = baseUrl;
      const fetchSpy = mockSuccessfulResponse();
      const provider = new MinimaxProvider("test-key", "MiniMax-M2.7", 800);

      await provider.compress("system", "user");

      expect(fetchSpy).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({ method: "POST" }),
      );
      const request = fetchSpy.mock.calls[0]?.[1];
      expect(JSON.parse(String(request?.body))).toMatchObject({
        model: "MiniMax-M2.7",
      });
    },
  );
});
