import { describe, it, expect, vi, afterEach } from "vitest";
import {
  OpencodeProvider,
  OPENCODE_DEFAULT_BASE_URL,
} from "../src/providers/opencode.js";

const BASE = "https://opencode.ai/zen/go/v1";

// lastInit captures the latest fetchWithTimeout init (module-mocked).
let lastInit: RequestInit | undefined;
vi.mock("../src/providers/_fetch.js", () => ({
  fetchWithTimeout: vi.fn(async (_url: string, init: RequestInit) => {
    lastInit = init;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  lastInit = undefined;
});

describe("OpencodeProvider", () => {
  it("uses the OpenCode Go relay URL by default", () => {
    expect(OPENCODE_DEFAULT_BASE_URL).toBe(BASE);
    expect(new OpencodeProvider("k", "m", 1024)).toBeTruthy();
  });

  it("attaches a stable x-opencode-session header", async () => {
    const p = new OpencodeProvider("k", "m", 1024);
    await p.compress("s", "u");
    const session = (lastInit?.headers as Record<string, string>)[
      "x-opencode-session"
    ];
    expect(session).toBeTruthy();
    expect(session).toMatch(/[0-9a-f-]{36}/);
  });

  it("reuses one session id across calls of one instance", async () => {
    const p = new OpencodeProvider("k", "m", 1024);
    await p.compress("s", "u");
    const first = (lastInit?.headers as Record<string, string>)[
      "x-opencode-session"
    ];
    await p.summarize("s", "u");
    const second = (lastInit?.headers as Record<string, string>)[
      "x-opencode-session"
    ];
    expect(second).toBe(first);
  });

  it("prefers OPENCODE_SESSION_ID over the random fallback", async () => {
    vi.stubEnv("OPENCODE_SESSION_ID", "sess-fixed");
    const p = new OpencodeProvider("k", "m", 1024);
    await p.compress("s", "u");
    expect(
      (lastInit?.headers as Record<string, string>)["x-opencode-session"],
    ).toBe("sess-fixed");
  });

  it("sends the OpenAI-compatible body shape", async () => {
    const p = new OpencodeProvider("k", "m", 1024);
    await p.compress("system prompt", "user prompt");
    const body = JSON.parse(lastInit?.body as string);
    expect(body).toMatchObject({
      model: "m",
      max_tokens: 1024,
      stream: false,
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
    });
  });

  it("honors a custom base URL (secure proxy)", () => {
    const p = new OpencodeProvider(
      "k",
      "m",
      1024,
      "https://my-proxy.internal/zen/go/v1",
    );
    expect(p.name).toBe("opencode");
  });

  it("falls back to reasoning content when content is absent", async () => {
    const { fetchWithTimeout } = await import("../src/providers/_fetch.js");
    (fetchWithTimeout as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { reasoning: "think" } }] }),
          { status: 200 },
        ),
    );
    const p = new OpencodeProvider("k", "m", 1024);
    await expect(p.compress("s", "u")).resolves.toBe("think");
  });

  it("throws a descriptive error on HTTP failure", async () => {
    const { fetchWithTimeout } = await import("../src/providers/_fetch.js");
    (fetchWithTimeout as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => new Response("MissingSessionID: no session", { status: 400 }),
    );
    const p = new OpencodeProvider("k", "m", 1024);
    await expect(p.compress("s", "u")).rejects.toThrow(
      /opencode API error \(400\)/,
    );
  });
});
