import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCompressionXml } from "../src/prompts/compression-output.js";
import { compressWithRetry } from "../src/eval/self-correct.js";
import { CompressOutputSchema } from "../src/eval/schemas.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { onLiveEvent } from "../src/viewer/live-events.js";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";
import { NoopProvider } from "../src/providers/noop.js";
import type { CompressedObservation, MemoryProvider, RawObservation } from "../src/types.js";

const search = vi.hoisted(() => ({ add: vi.fn(), save: vi.fn(), vector: vi.fn() }));
vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({ add: search.add }),
  scheduleIndexSave: search.save,
  vectorIndexAddGuarded: search.vector,
}));
vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const xml = `<observation>
<type>file_edit</type><title>Updated configuration</title>
<facts><fact>The server port is now 3111.</fact></facts>
<narrative>Updated the server configuration to use the documented port.</narrative>
<concepts><concept>configuration</concept></concepts><files><file>config.ts</file></files>
<importance>7</importance></observation>`;

const raw: RawObservation = {
  id: "obs-validation", sessionId: "session-validation", hookType: "post_tool_use",
  timestamp: "2026-10-12T00:00:00Z", toolName: "Edit",
  toolInput: { file_path: "config.ts" }, toolOutput: "Saved the original evidence", raw: {},
};

function rig(provider: MemoryProvider, previous: RawObservation | CompressedObservation = raw) {
  let stored = structuredClone(previous);
  const kv = {
    get: vi.fn(async () => structuredClone(stored)),
    list: vi.fn(async () => [structuredClone(stored)]),
    set: vi.fn(async (_scope: string, _id: string, value: CompressedObservation) => {
      stored = structuredClone(value);
      return value;
    }),
  };
  const trigger = vi.fn(async () => undefined);
  const record = vi.fn(async () => undefined);
  let handler!: (data: { observationId: string; sessionId: string; raw: RawObservation }) => Promise<unknown>;
  registerCompressFunction({ trigger, registerFunction: (_id: string, fn: typeof handler) => { if (_id === "mem::compress") handler = fn; } } as never,
    kv as never, provider, { record } as never);
  return {
    call: () => handler({ observationId: raw.id, sessionId: raw.sessionId, raw }),
    stored: () => stored, kv, trigger, record,
  };
}

function providerReturning(...responses: string[]): MemoryProvider {
  let index = 0;
  return { name: "test", summarize: vi.fn(), compress: vi.fn(async () => responses[Math.min(index++, responses.length - 1)]) };
}

beforeEach(() => vi.clearAllMocks());

describe("compression output boundaries", () => {
  it.each([
    ["observation", xml],
    ["XML fence", `\`\`\`xml\n${xml}\n\`\`\``],
    ["plain fence", `\`\`\`\n${xml}\n\`\`\``],
    ["thought preamble", `<thought><title>${"wrong ".repeat(150)}</title><type>other</type></thought>\n${xml}`],
    ["think then fence", `<think>Use <title>a title</title>.</think>\n\`\`\`xml\n${xml}\n\`\`\``],
  ])("reads only the observation in %s", (_name, response) => {
    const parsed = parseCompressionXml(response);
    expect(CompressOutputSchema.safeParse(parsed).success).toBe(true);
    expect(parsed?.title).toBe("Updated configuration");
    expect(parsed?.type).toBe("file_edit");
  });

  it("decodes XML text without interpreting encoded tags as structure", () => {
    const parsed = parseCompressionXml(xml.replace("Updated configuration", "Use &lt;title&gt; &amp; &#x1F600;")
      .replace("<concepts><concept>configuration</concept></concepts>", "<concepts />"));
    expect(parsed?.title).toBe("Use <title> & 😀");
    expect(parsed?.concepts).toEqual([]);
  });

  it.each([
    ["missing envelope", xml.replace(/<\/?observation>/g, "")],
    ["missing closing envelope", xml.replace("</observation>", "")],
    ["multiple observations", xml + xml],
    ["outer wrapper", `<result>${xml}</result>`],
    ["nested observations", `<observation>${xml}</observation>`],
    ["duplicate title", xml.replace("</title>", "</title><title>Other</title>")],
    ["nested title", xml.replace("Updated configuration", "<title>Other</title>")],
    ["nested field wrapper", xml.replace("<title>", "<result><title>").replace("</title>", "</title></result>")],
    ["mismatched closing field", xml.replace("</title>", "</subtitle>")],
    ["duplicate list", xml.replace("</facts>", "</facts><facts><fact>other</fact></facts>")],
    ["nested list item", xml.replace("The server port is now 3111.", "<fact>Other</fact>")],
    ["wrong list child", xml.replace(/<\/?fact>/g, (tag) => tag.replace("fact", "title"))],
    ["empty fact", xml.replace("The server port is now 3111.", " ")],
    ["unknown field", xml.replace("</observation>", "<surprise>data</surprise></observation>")],
    ["unclosed reasoning", `<think>Reasoning ${xml}`],
    ["content after envelope", `${xml}<title>Other</title>`],
    ["unescaped text", xml.replace("Updated configuration", "Config & settings")],
    ["unknown entity", xml.replace("Updated configuration", "&secret;")],
    ["invalid numeric entity", xml.replace("Updated configuration", "&#x110000;")],
    ["doctype", `<!DOCTYPE observation [<!ENTITY secret SYSTEM 'file:///fixture'>]>${xml}`],
  ])("rejects %s before persistence", async (_name, response) => {
    const provider = providerReturning(response);
    const r = rig(provider);
    expect(await r.call()).toEqual({ success: false, error: "parse_failed", retryable: true });
    expect(provider.compress).toHaveBeenCalledTimes(2);
    expect(r.stored()).toMatchObject({ ...raw, compression: { status: "failed" } });
    expect((r.stored() as CompressedObservation).compression?.status).toBe("failed");
    expect(search.add).not.toHaveBeenCalled();
    expect(search.vector).not.toHaveBeenCalled();
    expect(r.trigger).not.toHaveBeenCalled();
    expect(r.record).toHaveBeenCalledExactlyOnceWith("mem::compress", expect.any(Number), false);
  });
});

describe("compression validation and retry", () => {
  it.each([
    ["long title", xml.replace("Updated configuration", "x".repeat(121))],
    ["missing facts", xml.replace(/<facts>[\s\S]*?<\/facts>/, "")],
    ["short narrative", xml.replace(/<narrative>[\s\S]*?<\/narrative>/, "<narrative>short</narrative>")],
    ["unknown type", xml.replace("file_edit", "invalid_type")],
    ["out-of-range importance", xml.replace("<importance>7", "<importance>11")],
    ["partial numeric importance", xml.replace("<importance>7", "<importance>7bad")],
    ["missing importance", xml.replace(/<importance>.*?<\/importance>/, "")],
  ])("retains an existing valid summary and source after %s exhausts retries", async (_name, response) => {
    const previous = { ...buildSyntheticCompression(raw), ...CompressOutputSchema.parse(parseCompressionXml(xml)), confidence: 0.9 };
    const r = rig(providerReturning(response), previous);
    expect(await r.call()).toEqual({ success: false, error: "validation_failed", retryable: true });
    expect(r.stored()).toMatchObject({ ...previous, compression: { status: "failed" } });
    expect((r.stored() as CompressedObservation).compression?.status).toBe("failed");
    expect(r.trigger).not.toHaveBeenCalled();
    expect(search.add).toHaveBeenCalledWith(expect.objectContaining({ source: { ...buildSyntheticCompression(raw).source } }));
    expect(r.record).toHaveBeenCalledExactlyOnceWith("mem::compress", expect.any(Number), false);
  });

  it("persists only a successful retry and preserves the original evidence", async () => {
    const provider = providerReturning(xml.replace("Updated configuration", "x".repeat(900)), xml);
    const r = rig(provider, buildSyntheticCompression(raw));
    const unsubscribe = onLiveEvent((event) => { if (event.type === "compressed_observation") r.trigger(event); });
    expect(await r.call()).toMatchObject({ success: true, compressed: { title: "Updated configuration" } });
    unsubscribe();
    expect(provider.compress).toHaveBeenCalledTimes(2);
    expect((r.stored() as CompressedObservation).compression?.status).toBe("complete");
    expect((r.stored() as CompressedObservation).source?.toolOutput).toBe(raw.toolOutput);
    expect(search.add).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Updated configuration" }));
    expect(r.trigger).toHaveBeenCalledTimes(1);
    expect(r.record).toHaveBeenCalledExactlyOnceWith("mem::compress", expect.any(Number), true, expect.any(Number));
  });

  it("validates decoded and scrubbed output and never broadcasts retained source", async () => {
    const response = xml.replace("Updated configuration", "Updated &lt;private&gt;private-canary&lt;/private&gt;");
    const r = rig(providerReturning(response));
    const result = await r.call();
    expect(result).toMatchObject({ success: true, compressed: { title: "Updated [REDACTED]" } });
    expect(CompressOutputSchema.safeParse(r.stored()).success).toBe(true);
    expect(JSON.stringify(r.stored())).not.toContain("private-canary");
    expect(JSON.stringify(result)).not.toContain('"source"');
    expect(JSON.stringify(r.trigger.mock.calls)).not.toContain(raw.toolOutput);
  });

  it("leaves synthetic data intact when a noop provider has no model output", async () => {
    const previous = buildSyntheticCompression(raw);
    expect(previous.facts).toEqual([]);
    const r = rig(new NoopProvider(), previous);
    expect(await r.call()).toEqual({ success: false, error: "parse_failed", retryable: true });
    expect(r.stored()).toMatchObject({ ...previous, compression: { status: "failed" } });
    expect((r.stored() as CompressedObservation).compression?.status).toBe("failed");
  });

  it("leaves stored evidence intact if the retry provider call throws", async () => {
    const provider = providerReturning("invalid");
    vi.mocked(provider.compress)
      .mockResolvedValueOnce("invalid")
      .mockRejectedValueOnce(new Error("provider unavailable"));
    const r = rig(provider);
    expect(await r.call()).toEqual({ success: false, error: "compression_failed", retryable: true });
    expect(r.stored()).toMatchObject({ ...raw, compression: { status: "failed" } });
    expect((r.stored() as CompressedObservation).compression?.status).toBe("failed");
    expect(provider.compress).toHaveBeenCalledTimes(2);
    expect(r.record).toHaveBeenCalledExactlyOnceWith("mem::compress", expect.any(Number), false);
  });

  it("returns a validation failure without exposing rejected output when retries are disabled", async () => {
    const provider = providerReturning("invalid content");
    const result = await compressWithRetry(provider, "system", "prompt", () => ({ valid: false, errors: ["invalid"] }), 0);
    expect(result).toEqual({ valid: false, errors: ["invalid"], retried: false });
    expect(provider.compress).toHaveBeenCalledTimes(1);
  });
});
