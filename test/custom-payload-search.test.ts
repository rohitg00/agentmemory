import { describe, expect, it } from "vitest";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";
import { createObservationSource, OBSERVATION_SOURCE_MAX_BYTES, rawFromObservationSource } from "../src/functions/observation-source.js";
import { SearchIndex } from "../src/state/search-index.js";
import type { HookType, RawObservation } from "../src/types.js";

function raw(payload: unknown, fields: Partial<RawObservation> = {}): RawObservation {
  return { id: "custom-observation", sessionId: "custom-session", timestamp: "2026-01-01T00:00:00Z",
    hookType: "custom_event" as HookType, raw: payload, ...fields };
}

describe("custom payload synthetic search", () => {
  it("indexes retained payload content without inventing tool or prompt fields", () => {
    const original = raw({ title: "Quasar dispatch choice", content: "Use quasar routing for the job queue" });
    const observation = buildSyntheticCompression(original);
    const index = new SearchIndex();
    index.add(observation);
    expect(index.search("quasar").map((hit) => hit.obsId)).toContain(observation.id);
    expect(observation.narrative).toContain("Use quasar routing");
    expect(observation.source).toEqual(createObservationSource(original));
    expect(observation.source?.toolOutput).toBeUndefined();
    expect(rawFromObservationSource(observation)?.raw).toEqual(original.raw);
  });

  it.each(["message canary", ["message canary"], { nested: { message: "message canary" } }, 0, false])(
    "keeps supported primitive and structured payloads: %j", (payload) => {
      const observation = buildSyntheticCompression(raw(payload));
      const expected = typeof payload === "string" ? payload : JSON.stringify(payload);
      expect(observation.narrative).toBe(expected);
      expect(observation.source?.payload).toEqual(payload);
    },
  );

  it.each([undefined, null, {}, [], ""])("does not invent narrative for empty data: %j", (payload) => {
    expect(buildSyntheticCompression(raw(payload)).narrative).toBe("");
  });

  it("uses the sanitized source and never indexes private data or credentials", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
    const observation = buildSyntheticCompression(raw({ content: `Public canary <private>hidden-canary</private> ${key}` }));
    expect(observation.narrative).toContain("Public canary");
    expect(observation.narrative).toContain("[REDACTED]");
    expect(observation.narrative).not.toContain("hidden-canary");
    expect(observation.narrative).not.toContain(key);
  });

  it("preserves canonical prompt/tool precedence without duplicating envelope metadata", () => {
    const observation = buildSyntheticCompression(raw({ message: "envelope-only-canary" }, {
      userPrompt: "Prompt canary", toolInput: { command: "run" }, toolOutput: "Output canary",
    }));
    expect(observation.narrative).toBe('Prompt canary | {"command":"run"} | Output canary');
    expect(observation.source).not.toHaveProperty("payload");
  });

  it("bounds large Unicode data while leaving the retained source budget intact", () => {
    const original = raw("x".repeat(398) + "😀" + "界".repeat(20000));
    const observation = buildSyntheticCompression(original);
    expect(observation.narrative.length).toBeLessThanOrEqual(400);
    expect(observation.narrative).toBe("x".repeat(398) + "…");
    expect(observation.source).toEqual(createObservationSource(original));
    expect(observation.source?.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(observation.source))).toBeLessThanOrEqual(OBSERVATION_SOURCE_MAX_BYTES);
  });
});
