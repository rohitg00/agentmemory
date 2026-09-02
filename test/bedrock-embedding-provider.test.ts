import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the bodies sent to InvokeModel and return canned responses, so no
// real AWS call is made. The mock records each request body for assertions.
const sentBodies: Array<Record<string, unknown>> = [];
let cannedResponse: (body: Record<string, unknown>) => unknown;

vi.mock("@aws-sdk/client-bedrock-runtime", () => {
  class InvokeModelCommand {
    input: { body: string; modelId: string };
    constructor(input: { body: string; modelId: string }) {
      this.input = input;
    }
  }
  class BedrockRuntimeClient {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
    async send(cmd: InvokeModelCommand) {
      const body = JSON.parse(cmd.input.body) as Record<string, unknown>;
      sentBodies.push(body);
      const payload = cannedResponse(body);
      return { body: new TextEncoder().encode(JSON.stringify(payload)) };
    }
  }
  return { BedrockRuntimeClient, InvokeModelCommand };
});

import { BedrockEmbeddingProvider } from "../src/providers/embedding/bedrock.js";
import { detectEmbeddingProvider } from "../src/config.js";

const ENV_KEYS = [
  "AWS_REGION",
  "AWS_BEDROCK_EMBEDDING_MODEL",
  "AWS_BEDROCK_EMBEDDING_DIMENSIONS",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "EMBEDDING_PROVIDER",
  "AWS_BEDROCK",
  "OPENAI_API_KEY",
] as const;

describe("BedrockEmbeddingProvider", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    sentBodies.length = 0;
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env["AWS_REGION"] = "us-east-2";
    // Default canned response: float vectors of the right length, one per text.
    cannedResponse = (body) => {
      const dim = (body.output_dimension as number) ?? 1024;
      const texts = (body.texts as string[]) ?? [body.inputText as string];
      return { embeddings: { float: texts.map(() => new Array(dim).fill(0.1)) } };
    };
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to cohere.embed-v4:0 at 1024 dimensions", () => {
    const p = new BedrockEmbeddingProvider();
    expect(p.name).toBe("bedrock");
    expect(p.dimensions).toBe(1024);
  });

  // Note: the AWS_REGION-required guard is not unit-tested here because
  // getEnvVar merges the real ~/.agentmemory/.env (which may set AWS_REGION),
  // so the absence can't be reliably simulated through the merged-env path.

  it("honors AWS_BEDROCK_EMBEDDING_DIMENSIONS override", () => {
    process.env["AWS_BEDROCK_EMBEDDING_DIMENSIONS"] = "512";
    const p = new BedrockEmbeddingProvider();
    expect(p.dimensions).toBe(512);
  });

  it("throws for an unknown model with no dimensions override", () => {
    process.env["AWS_BEDROCK_EMBEDDING_MODEL"] = "cohere.embed-future-v9:0";
    expect(() => new BedrockEmbeddingProvider()).toThrow(/AWS_BEDROCK_EMBEDDING_DIMENSIONS/);
  });

  it("rejects a non-cohere/non-titan model family", () => {
    process.env["AWS_BEDROCK_EMBEDDING_MODEL"] = "meta.llama-embed";
    process.env["AWS_BEDROCK_EMBEDDING_DIMENSIONS"] = "1024";
    expect(() => new BedrockEmbeddingProvider()).toThrow(/cohere\.|titan/);
  });

  it("accepts a us.-prefixed cross-region inference profile ID (family + dims resolve)", () => {
    // cohere.embed-v4:0 is INFERENCE_PROFILE-only in some regions, so users set
    // us.cohere.embed-v4:0 — family detection and known-dims must see through the
    // geo prefix rather than demanding a dimensions override or throwing.
    process.env["AWS_BEDROCK_EMBEDDING_MODEL"] = "us.cohere.embed-v4:0";
    const p = new BedrockEmbeddingProvider();
    expect(p.dimensions).toBe(1024);
  });

  it("uses the Cohere body shape for a global.-prefixed profile ID", async () => {
    process.env["AWS_BEDROCK_EMBEDDING_MODEL"] = "global.cohere.embed-v4:0";
    const p = new BedrockEmbeddingProvider();
    await p.embedBatch(["x"]);
    expect(sentBodies[0]).toMatchObject({
      input_type: "search_document",
      embedding_types: ["float"],
      output_dimension: 1024,
    });
  });

  it("uses the Cohere body shape and reads embeddings.float (v4)", async () => {
    const p = new BedrockEmbeddingProvider();
    const vecs = await p.embedBatch(["hello", "world"]);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[0].length).toBe(1024);
    // v4 request: input_type required, float type, explicit output_dimension.
    expect(sentBodies[0]).toMatchObject({
      input_type: "search_document",
      texts: ["hello", "world"],
      embedding_types: ["float"],
      output_dimension: 1024,
    });
  });

  it("throws when the response returns fewer vectors than inputs (no silent misalignment)", async () => {
    // Two inputs, but the model returns one vector — must fail fast rather than
    // misalign texts to vectors downstream.
    cannedResponse = () => ({ embeddings: { float: [new Array(1024).fill(0.1)] } });
    const p = new BedrockEmbeddingProvider();
    await expect(p.embedBatch(["one", "two"])).rejects.toThrow(/1 vectors for 2 inputs|misalign/);
  });

  it("parses the bare-array response shape for Cohere v3", async () => {
    process.env["AWS_BEDROCK_EMBEDDING_MODEL"] = "cohere.embed-english-v3";
    cannedResponse = (body) => {
      const texts = (body.texts as string[]) ?? [];
      return { embeddings: texts.map(() => new Array(1024).fill(0.2)) };
    };
    const p = new BedrockEmbeddingProvider();
    const vecs = await p.embedBatch(["a"]);
    expect(vecs[0].length).toBe(1024);
    // v3 does not send output_dimension.
    expect(sentBodies[0].output_dimension).toBeUndefined();
  });

  it("uses the Titan body shape (inputText) and fans out one call per text", async () => {
    process.env["AWS_BEDROCK_EMBEDDING_MODEL"] = "amazon.titan-embed-text-v2:0";
    cannedResponse = (body) => ({
      embedding: new Array((body.dimensions as number) ?? 1024).fill(0.3),
    });
    const p = new BedrockEmbeddingProvider();
    const vecs = await p.embedBatch(["one", "two", "three"]);
    expect(vecs).toHaveLength(3);
    expect(vecs[0].length).toBe(1024);
    expect(sentBodies).toHaveLength(3); // one InvokeModel call per input
    expect(sentBodies[0]).toMatchObject({
      inputText: expect.any(String),
      dimensions: 1024,
      normalize: true,
    });
  });

  it("passes explicit static creds only when both halves are set", () => {
    process.env["AWS_ACCESS_KEY_ID"] = "AKIA";
    process.env["AWS_SECRET_ACCESS_KEY"] = "secret";
    const p = new BedrockEmbeddingProvider();
    const cfg = (p as unknown as { client: { config: { credentials?: unknown } } })
      .client.config;
    expect(cfg.credentials).toMatchObject({ accessKeyId: "AKIA", secretAccessKey: "secret" });
  });
});

describe("detectEmbeddingProvider — bedrock", () => {
  it("selects bedrock when EMBEDDING_PROVIDER=bedrock", () => {
    expect(detectEmbeddingProvider({ EMBEDDING_PROVIDER: "bedrock" })).toBe("bedrock");
  });

  it("does NOT auto-select bedrock from AWS_BEDROCK=true (local-embeddings stays)", () => {
    // AWS_BEDROCK opts into the LLM provider only; embeddings need an explicit
    // EMBEDDING_PROVIDER. With no embedding key set, detection returns null
    // (caller falls back to local).
    expect(detectEmbeddingProvider({ AWS_BEDROCK: "true" })).toBeNull();
  });
});
