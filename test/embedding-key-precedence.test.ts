import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const KEYS = [
  "EMBEDDING_PROVIDER",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_EMBEDDING_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_EMBEDDING_BASE_URL",
  "OPENAI_EMBEDDING_MODEL",
  "OPENAI_EMBEDDING_DIMENSIONS",
  "VOYAGE_API_KEY",
  "COHERE_API_KEY",
  "OPENROUTER_API_KEY",
];

describe("OpenAI embedding key precedence", () => {
  const saved: Record<string, string | undefined> = {};
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-embed-key-"));
    for (const k of [...KEYS, "HOME", "USERPROFILE"]) saved[k] = process.env[k];
    for (const k of KEYS) delete process.env[k];
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.resetModules();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpHome, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function embedAndCapture(): Promise<{ url: string; auth: string }> {
    const { createEmbeddingProvider } = await import(
      "../src/providers/embedding/index.js"
    );
    const provider = createEmbeddingProvider();
    expect(provider?.name).toBe("openai");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ embedding: new Array(1536).fill(0.1) }] }),
          { status: 200 },
        ),
      );
    await provider!.embed("hello");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    return { url, auth: headers["Authorization"] ?? headers["authorization"] ?? "" };
  }

  it("sends OPENAI_EMBEDDING_API_KEY when both keys are set", async () => {
    process.env["OPENAI_API_KEY"] = "chat-key";
    process.env["OPENAI_EMBEDDING_API_KEY"] = "embed-key";
    const { auth } = await embedAndCapture();
    expect(auth).toBe("Bearer embed-key");
  });

  it("falls back to OPENAI_API_KEY when no embedding key is set", async () => {
    process.env["OPENAI_API_KEY"] = "chat-key";
    const { auth } = await embedAndCapture();
    expect(auth).toBe("Bearer chat-key");
  });

  it("treats a blank OPENAI_EMBEDDING_API_KEY as unset", async () => {
    process.env["OPENAI_API_KEY"] = "chat-key";
    process.env["OPENAI_EMBEDDING_API_KEY"] = "   ";
    const { auth } = await embedAndCapture();
    expect(auth).toBe("Bearer chat-key");
  });

  it("pairs the embedding key with OPENAI_EMBEDDING_BASE_URL", async () => {
    process.env["OPENAI_API_KEY"] = "chat-key";
    process.env["OPENAI_BASE_URL"] = "https://chat.example.com";
    process.env["OPENAI_EMBEDDING_BASE_URL"] = "https://embed.example.com";
    process.env["OPENAI_EMBEDDING_API_KEY"] = "embed-key";
    const { url, auth } = await embedAndCapture();
    expect(url).toBe("https://embed.example.com/v1/embeddings");
    expect(auth).toBe("Bearer embed-key");
  });

  it("selects the openai provider when only OPENAI_EMBEDDING_API_KEY is set", async () => {
    process.env["OPENAI_EMBEDDING_API_KEY"] = "embed-key";
    const { auth } = await embedAndCapture();
    expect(auth).toBe("Bearer embed-key");
  });

  it("reads the embedding key from ~/.agentmemory/.env", async () => {
    mkdirSync(join(tmpHome, ".agentmemory"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".agentmemory", ".env"),
      "OPENAI_API_KEY=chat-key\nOPENAI_EMBEDDING_API_KEY=file-embed-key\n",
    );
    const { auth } = await embedAndCapture();
    expect(auth).toBe("Bearer file-embed-key");
  });
});
