import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { BedrockProvider } from "../src/providers/bedrock.js";
import { detectProvider } from "../src/config.js";

// Env keys this suite mutates — saved/restored so tests don't leak into each
// other or pick up the developer's real ~/.agentmemory/.env values.
const ENV_KEYS = [
  "AWS_BEDROCK",
  "AWS_REGION",
  "AWS_BEDROCK_MODEL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_FOR_LLM",
] as const;

describe("BedrockProvider", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("constructs with only a region (no explicit keys) — relies on the credential chain", () => {
    expect(
      () => new BedrockProvider("anthropic.claude-haiku-4-5-20251001-v1:0", 800, "us-east-1"),
    ).not.toThrow();
  });

  it("constructs with explicit static keys when present", () => {
    process.env["AWS_ACCESS_KEY_ID"] = "AKIAEXAMPLE";
    process.env["AWS_SECRET_ACCESS_KEY"] = "secret";
    const provider = new BedrockProvider("model-id", 800, "eu-west-1");
    const client = (provider as unknown as { client: { awsAccessKey: string | null } }).client;
    expect(client.awsAccessKey).toBe("AKIAEXAMPLE");
  });

  it("ignores a lone access key (omits both, falls back to the credential chain)", () => {
    // Only one of the pair set — must NOT pass it through (the SDK deprecates
    // partial static creds); the provider chain handles it instead.
    process.env["AWS_ACCESS_KEY_ID"] = "AKIAEXAMPLE";
    const provider = new BedrockProvider("model-id", 800, "us-east-1");
    const client = (provider as unknown as { client: { awsAccessKey: string | null } }).client;
    expect(client.awsAccessKey).toBeNull();
  });

  it("threads the region through to the client", () => {
    const provider = new BedrockProvider("model-id", 800, "ap-southeast-2");
    const client = (provider as unknown as { client: { awsRegion: string } }).client;
    expect(client.awsRegion).toBe("ap-southeast-2");
  });
});

describe("detectProvider — bedrock branch", () => {
  // Tests the pure detection function with explicit env maps, so they are
  // independent of the developer's real ~/.agentmemory/.env.
  it("selects bedrock when AWS_BEDROCK=true and AWS_REGION is set", () => {
    const config = detectProvider({ AWS_BEDROCK: "true", AWS_REGION: "us-east-1" });
    expect(config.provider).toBe("bedrock");
  });

  it("defaults the model to Claude Haiku 4.5 when AWS_BEDROCK_MODEL is unset", () => {
    const config = detectProvider({ AWS_BEDROCK: "true", AWS_REGION: "us-east-1" });
    expect(config.model).toBe("anthropic.claude-haiku-4-5-20251001-v1:0");
  });

  it("honors an explicit AWS_BEDROCK_MODEL (e.g. a us.-prefixed inference profile)", () => {
    const config = detectProvider({
      AWS_BEDROCK: "true",
      AWS_REGION: "us-east-1",
      AWS_BEDROCK_MODEL: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    });
    expect(config.model).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
  });

  it("does NOT select bedrock when AWS_BEDROCK is unset, even with an OpenAI key (regression guard)", () => {
    const config = detectProvider({ OPENAI_API_KEY: "sk-test" });
    expect(config.provider).toBe("openai");
  });

  it("does NOT select bedrock when AWS_BEDROCK has any value other than the literal 'true'", () => {
    const config = detectProvider({
      AWS_BEDROCK: "1",
      AWS_REGION: "us-east-1",
      OPENAI_API_KEY: "sk-test",
    });
    expect(config.provider).not.toBe("bedrock");
  });

  it("selects bedrock for a case-insensitive AWS_BEDROCK (True/TRUE/ true )", () => {
    for (const flag of ["True", "TRUE", " true "]) {
      const config = detectProvider({ AWS_BEDROCK: flag, AWS_REGION: "us-east-1" });
      expect(config.provider).toBe("bedrock");
    }
  });

  it("rejects bedrock when AWS_REGION is unset and falls through to the next provider", () => {
    // AWS_BEDROCK=true but no region → Bedrock can't be constructed, so detection
    // must not return an unusable bedrock config; it falls through to OpenAI here.
    const config = detectProvider({ AWS_BEDROCK: "true", OPENAI_API_KEY: "sk-test" });
    expect(config.provider).toBe("openai");
  });

  it("falls through to noop when AWS_BEDROCK=true but no region and no other provider", () => {
    const config = detectProvider({ AWS_BEDROCK: "true" });
    expect(config.provider).toBe("noop");
  });
});
