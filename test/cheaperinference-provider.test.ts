import { describe, expect, it, vi, afterEach } from "vitest";
import { CheaperInferenceProvider } from "../src/providers/cheaperinference.js";

describe("CheaperInferenceProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts an OpenAI-compatible chat completion to api.cheaperinference.com", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CheaperInferenceProvider("test-key", "gpt-5.4-mini", 64);
    await expect(provider.compress("system", "user")).resolves.toBe("ok");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cheaperinference.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "gpt-5.4-mini",
      max_tokens: 64,
    });
  });
});
