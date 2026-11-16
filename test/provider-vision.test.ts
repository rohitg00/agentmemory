import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../src/state/kv.js";
import type { MemoryProvider, RawObservation, CompressedObservation } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

const sdkDouble = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: sdkDouble.create }; } }));
vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({ add: vi.fn() }), getVectorIndex: () => null,
  scheduleIndexSave: vi.fn(), vectorIndexAddGuarded: vi.fn().mockResolvedValue(false),
}));

import { AnthropicProvider } from "../src/providers/anthropic.js";
import { createProvider, createFallbackProvider } from "../src/providers/index.js";
import { ResilientProvider } from "../src/providers/resilient.js";
import { FallbackChainProvider } from "../src/providers/fallback-chain.js";
import { registerCompressFunction, type CompressResult } from "../src/functions/compress.js";
import { VISION_DESCRIPTION_PROMPT } from "../src/prompts/vision.js";
import { KV } from "../src/state/schema.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==";
const CAPTION = "TEST_VISION_RESULT: I see a red dot";
const XML = `<observation><type>image</type><title>Screenshot of Red Dot</title>
<subtitle>Test image observation</subtitle><facts><fact>Image shows a single red pixel</fact></facts>
<narrative>A vision model described a screenshot showing a red dot on a white background</narrative>
<concepts><concept>testing</concept><concept>screenshot</concept></concepts>
<files></files><importance>5</importance></observation>`;
type Request = { messages: Array<{ role?: string; content: string | Array<{ type: string; text?: string; source?: { data: string; media_type: string } }> }> };
type VisionCall = { name: string; receiverMatches: boolean; args: string[] };
let visionCalls: VisionCall[] = [];
let prompts: string[] = [];

function plain(name: string): MemoryProvider {
  return { name, compress: async (_system, user) => { prompts.push(user); return XML; }, summarize: async () => "summary" };
}

function capable(name: string, fails = false): MemoryProvider {
  const inner: MemoryProvider = { ...plain(name), async describeImage(image, mime, prompt) {
    visionCalls.push({ name, receiverMatches: this === inner, args: [image, mime, prompt] });
    if (fails) throw new Error(name + " vision unavailable");
    return CAPTION;
  } };
  return inner;
}

async function compress(provider: MemoryProvider, modality: "image" | "text" = "image") {
  const sdk = mockSdk({ looseTrigger: true });
  const kv = mockKV();
  const raw: RawObservation = { id: "obs_vision-boundary", sessionId: "session_vision-boundary",
    timestamp: "2026-06-01T00:00:00.000Z", hookType: "post_tool_use", toolName: "screenshot",
    toolOutput: "A screenshot was captured", raw: {}, modality,
    ...(modality === "image" ? { imageData: PNG } : {}) };
  await kv.set(KV.observations(raw.sessionId), raw.id, raw);
  registerCompressFunction(sdk as unknown as IIIClient, kv as unknown as StateKV, provider);
  const result = await sdk.trigger({ function_id: "mem::compress", payload: {
    observationId: raw.id, sessionId: raw.sessionId,
  } }) as CompressResult;
  const stored = await kv.get<CompressedObservation>(KV.observations(raw.sessionId), raw.id);
  return { result, stored, raw };
}

async function expectCaption(provider: MemoryProvider) {
  const { result, stored, raw } = await compress(provider);
  expect(result.success).toBe(true);
  expect(stored?.imageDescription).toBe(CAPTION);
  expect(result.compressed?.imageDescription).toBe(CAPTION);
  expect(stored?.id).toBe(raw.id);
  expect(stored?.sessionId).toBe(raw.sessionId);
  expect(stored?.imageRef).toBe(PNG);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain(CAPTION);
}

describe("provider vision boundary", () => {
  beforeEach(() => {
    visionCalls = []; prompts = [];
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-not-a-real-key");
    vi.stubEnv("OPENAI_API_KEY", "fixture-not-a-real-key");
    vi.stubEnv("ANTHROPIC_MODEL", "fixture-vision-model");
    vi.stubEnv("OPENAI_MODEL", "fixture-text-model");
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:1/v1");
    sdkDouble.create.mockReset();
    sdkDouble.create.mockImplementation(async (request: Request) => {
      const content = request.messages[0]!.content;
      if (Array.isArray(content)) {
        const image = content.find((part) => part.type === "image")!;
        const text = content.find((part) => part.type === "text")!;
        visionCalls.push({ name: "Anthropic SDK", receiverMatches: true,
          args: [image.source!.data, image.source!.media_type, text.text!] });
        return { content: [{ type: "text", text: CAPTION }] };
      }
      prompts.push(content);
      return { content: [{ type: "text", text: XML }] };
    });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as Request;
      const content = request.messages.find((message) => message.role === "user")!.content;
      if (typeof content !== "string") throw new Error("Unexpected text-provider payload");
      prompts.push(content);
      return new Response(JSON.stringify({ choices: [{ message: { content: XML }, finish_reason: "stop" }] }),
        { status: 200, headers: { "content-type": "application/json" } });
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });

  it("bare real Anthropic provider retains the existing image description", async () => {
    await expectCaption(new AnthropicProvider("fixture-key", "fixture-model", 512));
    expect(visionCalls).toEqual([{ name: "Anthropic SDK", receiverMatches: true,
      args: [PNG, "image/png", VISION_DESCRIPTION_PROMPT] }]);
  });

  it("createProvider Anthropic preserves caption through the resilience wrapper", async () => {
    await expectCaption(createProvider({ provider: "anthropic", model: "fixture-model", maxTokens: 512 }));
    expect(visionCalls).toEqual([{ name: "Anthropic SDK", receiverMatches: true,
      args: [PNG, "image/png", VISION_DESCRIPTION_PROMPT] }]);
  });

  it("createFallbackProvider preserves a capable primary through both wrappers", async () => {
    await expectCaption(createFallbackProvider({ provider: "anthropic", model: "fixture-model", maxTokens: 512 },
      { providers: ["openai"] }));
    expect(visionCalls).toHaveLength(1);
  });

  it("createFallbackProvider preserves a capable fallback after a text-only primary", async () => {
    await expectCaption(createFallbackProvider({ provider: "openai", model: "fixture-model", maxTokens: 512 },
      { providers: ["anthropic"] }));
    expect(visionCalls).toEqual([{ name: "Anthropic SDK", receiverMatches: true,
      args: [PNG, "image/png", VISION_DESCRIPTION_PROMPT] }]);
  });

  it("supported fallback preserves receiver arguments and order after the first vision failure", async () => {
    const p = new ResilientProvider(new FallbackChainProvider([plain("text"), capable("first", true), capable("second")]));
    await expectCaption(p);
    expect(visionCalls).toEqual(["first", "second"].map((name) => ({ name, receiverMatches: true,
      args: [PNG, "image/png", VISION_DESCRIPTION_PROMPT] })));
  });

  it("all capable failures are attempted in order and retain existing text fallback", async () => {
    const p = new ResilientProvider(new FallbackChainProvider([plain("text"), capable("first", true), capable("second", true)]));
    const { result, stored } = await compress(p);
    expect(result.success).toBe(true);
    expect(stored?.imageDescription).toBeUndefined();
    expect(stored?.imageRef).toBe(PNG);
    expect(visionCalls).toEqual(["first", "second"].map((name) => ({ name, receiverMatches: true,
      args: [PNG, "image/png", VISION_DESCRIPTION_PROMPT] })));
  });

  it("unsupported wrappers and chains keep capability absent and the text path works", async () => {
    const p = new ResilientProvider(new FallbackChainProvider([plain("text"), plain("other")]));
    expect(p).not.toHaveProperty("describeImage");
    expect(createProvider({ provider: "noop", model: "noop", maxTokens: 512 })).not.toHaveProperty("describeImage");
    const { result, stored } = await compress(p);
    expect(result.success).toBe(true);
    expect(stored?.imageDescription).toBeUndefined();
    expect(visionCalls).toEqual([]);
  });

  it("ordinary text through the real factory does not invoke image description", async () => {
    const p = createProvider({ provider: "anthropic", model: "fixture-model", maxTokens: 512 });
    const { result, stored } = await compress(p, "text");
    expect(result.success).toBe(true);
    expect(stored?.imageDescription).toBeUndefined();
    expect(visionCalls).toEqual([]);
    expect(prompts).toHaveLength(1);
  });

  it("empty and text-only chains leave image capability absent", async () => {
    const empty = new FallbackChainProvider([]);
    expect(empty).not.toHaveProperty("describeImage");
    expect(new ResilientProvider(empty)).not.toHaveProperty("describeImage");
    expect(new ResilientProvider(plain("text"))).not.toHaveProperty("describeImage");
    expect(new FallbackChainProvider([plain("text")])).not.toHaveProperty("describeImage");
    await expect(empty.compress("system", "user")).rejects.toThrow("No providers available");
    await expect(empty.summarize("system", "user")).rejects.toThrow("No providers available");
  });

  it("stops at the first successful image provider with its receiver and arguments", async () => {
    const chain = new FallbackChainProvider([
      plain("text"), capable("first"), capable("unused"),
    ]);
    await expect(chain.describeImage?.("image", "image/jpeg", "describe")).resolves.toBe(CAPTION);
    expect(visionCalls).toEqual([
      { name: "first", receiverMatches: true, args: ["image", "image/jpeg", "describe"] },
    ]);
  });

  it("propagates the last capable provider error after trying each in order", async () => {
    const lastError = new Error("last image provider unavailable");
    const first = capable("first", true);
    const last: MemoryProvider = {
      ...plain("last"),
      async describeImage(image, mime, prompt) {
        visionCalls.push({ name: "last", receiverMatches: this === last, args: [image, mime, prompt] });
        throw lastError;
      },
    };
    const chain = new FallbackChainProvider([first, plain("text"), last]);
    await expect(chain.describeImage?.("image", "image/webp", "describe")).rejects.toBe(lastError);
    expect(visionCalls).toEqual(["first", "last"].map((name) => ({
      name, receiverMatches: true, args: ["image", "image/webp", "describe"],
    })));
  });

  it("normalizes a non-Error rejection from the last image provider", async () => {
    const inner: MemoryProvider = {
      ...plain("text"),
      describeImage: async () => { throw "image request rejected"; },
    };
    const chain = new FallbackChainProvider([inner]);
    await expect(chain.describeImage?.("image", "image/png", "describe"))
      .rejects.toEqual(new Error("image request rejected"));
  });

  it("preserves the direct resilience delegate receiver and all image arguments", async () => {
    const provider = new ResilientProvider(capable("inner"));
    await expect(provider.describeImage?.("image", "image/gif", "describe")).resolves.toBe(CAPTION);
    expect(visionCalls).toEqual([
      { name: "inner", receiverMatches: true, args: ["image", "image/gif", "describe"] },
    ]);
  });

  it("counts image gateway failures and blocks all operations with the same breaker", async () => {
    const error = new Error('OpenAI API error (502): {"error":{"message":"content_filter","code":"bad_gateway"}}');
    const image = vi.fn().mockRejectedValue(error);
    const inner = { ...plain("inner"), describeImage: image };
    const provider = new ResilientProvider(inner);
    for (let i = 0; i < 3; i++) {
      await expect(provider.describeImage?.("image", "image/png", "describe")).rejects.toBe(error);
    }
    expect(provider.circuitState).toMatchObject({ state: "open", failures: 3 });
    await expect(provider.describeImage?.("image", "image/png", "describe")).rejects.toThrow("circuit_breaker_open");
    await expect(provider.compress("system", "user")).rejects.toThrow("circuit_breaker_open");
    await expect(provider.summarize("system", "user")).rejects.toThrow("circuit_breaker_open");
    expect(image).toHaveBeenCalledTimes(3);
    expect(prompts).toEqual([]);
  });

  it("blocks image requests after text failures have opened the shared breaker", async () => {
    const error = new Error("provider unavailable");
    const image = vi.fn().mockResolvedValue(CAPTION);
    const inner: MemoryProvider = {
      ...plain("inner"), describeImage: image,
      compress: async () => { throw error; },
    };
    const provider = new ResilientProvider(inner);
    for (let i = 0; i < 3; i++) {
      await expect(provider.compress("system", "user")).rejects.toBe(error);
    }
    await expect(provider.describeImage?.("image", "image/png", "describe")).rejects.toThrow("circuit_breaker_open");
    expect(provider.circuitState).toMatchObject({ state: "open", failures: 3 });
    expect(image).not.toHaveBeenCalled();
  });

  it("resets prior text failures when an image request succeeds", async () => {
    const error = new Error("text request failed");
    const inner: MemoryProvider = {
      ...capable("inner"), compress: async () => { throw error; },
    };
    const provider = new ResilientProvider(inner);
    for (let i = 0; i < 2; i++) {
      await expect(provider.compress("system", "user")).rejects.toBe(error);
    }
    expect(provider.circuitState.failures).toBe(2);
    await expect(provider.describeImage?.("image", "image/png", "describe")).resolves.toBe(CAPTION);
    expect(provider.circuitState).toEqual({ state: "closed", failures: 0, lastFailureAt: null, openedAt: null });
    expect(visionCalls).toHaveLength(1);
  });

  it("does not count image content-filter rejections as service failures", async () => {
    const error = new Error('OpenAI API error (400): {"error":{"code":"content_filter"}}');
    const image = vi.fn().mockRejectedValue(error);
    const provider = new ResilientProvider({ ...plain("inner"), describeImage: image });
    for (let i = 0; i < 5; i++) {
      await expect(provider.describeImage?.("image", "image/png", "describe")).rejects.toBe(error);
    }
    expect(provider.circuitState).toEqual({ state: "closed", failures: 0, lastFailureAt: null, openedAt: null });
    await expect(provider.compress("system", "user")).resolves.toBe(XML);
    expect(image).toHaveBeenCalledTimes(5);
  });

  it("sanitizes factory-provided captions before returning and persisting them", async () => {
    const secret = ["fixture", "password"].join("-");
    const caption = `terminal shows postgres://deploy:${secret}@db.example/app`;
    const sanitized = "terminal shows postgres://[REDACTED_SECRET]@db.example/app";
    sdkDouble.create.mockImplementation(async (request: Request) => ({
      content: [{ type: "text", text: Array.isArray(request.messages[0]!.content) ? caption : XML }],
    }));
    const { result, stored, raw } = await compress(createProvider({
      provider: "anthropic", model: "fixture-model", maxTokens: 512,
    }));
    expect(result.success).toBe(true);
    expect(result.compressed?.imageDescription).toBe(sanitized);
    expect(stored?.imageDescription).toBe(sanitized);
    expect(stored?.id).toBe(raw.id);
    expect(stored?.imageRef).toBe(PNG);
    expect(JSON.stringify({ result, stored })).not.toContain(secret);
    expect(sdkDouble.create).toHaveBeenCalledTimes(2);
  });
});
