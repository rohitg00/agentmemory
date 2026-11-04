import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../src/providers/openai.js";

function captureRequestBody(): () => Record<string, unknown> {
  let sent: Record<string, unknown> = {};
  vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);
  return () => sent;
}

describe("OPENAI_EXTRA_BODY", () => {
  beforeEach(() => {
    delete process.env["OPENAI_EXTRA_BODY"];
    delete process.env["OPENAI_REASONING_EFFORT"];
  });
  afterEach(() => {
    delete process.env["OPENAI_EXTRA_BODY"];
    delete process.env["OPENAI_REASONING_EFFORT"];
    vi.restoreAllMocks();
  });

  it("leaves the request body unchanged when unset", async () => {
    const body = captureRequestBody();
    await new OpenAIProvider("k", "m", 100).compress("s", "u");
    expect(Object.keys(body()).sort()).toEqual(["max_tokens", "messages", "model", "stream"]);
  });

  it("adds the configured fields to the request", async () => {
    process.env["OPENAI_EXTRA_BODY"] = '{"provider":{"order":["deepinfra"],"allow_fallbacks":false}}';
    const body = captureRequestBody();
    await new OpenAIProvider("k", "m", 100).compress("s", "u");
    expect(body()["provider"]).toEqual({ order: ["deepinfra"], allow_fallbacks: false });
  });

  it("never lets the extra body override the fields agentmemory sets", async () => {
    process.env["OPENAI_EXTRA_BODY"] = '{"model":"x","max_tokens":1,"stream":true,"reasoning_effort":"high"}';
    process.env["OPENAI_REASONING_EFFORT"] = "none";
    const body = captureRequestBody();
    await new OpenAIProvider("k", "m", 100).compress("s", "u");
    expect(body()).toMatchObject({ model: "m", max_tokens: 100, stream: false, reasoning_effort: "none" });
  });

  it.each(["not json", "[1,2]", "null", "42"])("rejects %s at construction", (raw) => {
    process.env["OPENAI_EXTRA_BODY"] = raw;
    expect(() => new OpenAIProvider("k", "m", 100)).toThrow(/OPENAI_EXTRA_BODY must be a JSON object/);
  });
});
