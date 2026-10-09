import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../src/providers/openai.js";

const responseBody = {
  object: "response",
  status: "completed",
  output: [
    { type: "reasoning", summary: [] },
    { type: "message", content: [{ type: "output_text", text: "saved memory" }] },
  ],
};

describe("OpenAIProvider Responses API", () => {
  const originalBaseURL = process.env["OPENAI_BASE_URL"];
  const originalEffort = process.env["OPENAI_REASONING_EFFORT"];

  beforeEach(() => {
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_REASONING_EFFORT"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalBaseURL === undefined) delete process.env["OPENAI_BASE_URL"];
    else process.env["OPENAI_BASE_URL"] = originalBaseURL;
    if (originalEffort === undefined) delete process.env["OPENAI_REASONING_EFFORT"];
    else process.env["OPENAI_REASONING_EFFORT"] = originalEffort;
  });

  it.each(["compress", "summarize"] as const)("sends %s to /v1/responses", async (method) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const provider = new OpenAIProvider("test-key", "test-model", 1024);
    expect(await provider[method]("system guidance", "user input")).toBe("saved memory");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "test-model",
      instructions: "system guidance",
      input: "user input",
      max_output_tokens: 1024,
      store: false,
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("messages");
  });

  it("uses an explicit base URL without doubling /v1 and maps reasoning effort", async () => {
    process.env["OPENAI_REASONING_EFFORT"] = "low";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const provider = new OpenAIProvider("test-key", "test-model", 1024, "https://proxy.example/v1/");
    expect(await provider.compress("system", "user")).toBe("saved memory");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://proxy.example/v1/responses");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      reasoning: { effort: "low" },
    });
  });

  it("uses OPENAI_BASE_URL from environment when no constructor URL is supplied", async () => {
    process.env["OPENAI_BASE_URL"] = "https://configured.example/v1";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const provider = new OpenAIProvider("test-key", "test-model", 1024);
    expect(await provider.compress("system", "user")).toBe("saved memory");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://configured.example/v1/responses");
  });

  it("surfaces SDK HTTP errors without falling back to Chat Completions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ error: { message: "not supported" } }), { status: 400 }),
    );
    const provider = new OpenAIProvider("test-key", "test-model", 1024);
    await expect(provider.compress("system", "user")).rejects.toThrow(/not supported/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/responses$/);
  });

  it("rejects refusals rather than returning them as memory", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({
        object: "response",
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot help" }] }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const provider = new OpenAIProvider("test-key", "test-model", 1024);
    await expect(provider.summarize("system", "user")).rejects.toThrow(/Cannot help/);
  });
});
