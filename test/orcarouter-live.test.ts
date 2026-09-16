// Live end-to-end check against the real OrcaRouter relay.
//
// Everything here goes through the code paths this integration adds — the
// catalog fetch, the capability filters, and the provider itself. Nothing
// calls the relay directly with hand-rolled fetch options, so a green run is
// evidence that the wiring works, not that the network works.
//
// The key is supplied by the environment (ORCAROUTER_API_KEY). Without it the
// suite skips, so ordinary `npm test` runs on a clean checkout with no secrets
// stay green. Model *access* is scoped per key on the relay: a key can list a
// model in /v1/models and still be refused at inference time, so the inference
// check walks the filtered chat list and takes the first model the key can
// actually call instead of hardcoding one that may not be in scope.

import { describe, it, expect, beforeAll } from "vitest";
import { fetchModelCatalog, filterModels } from "../src/orcarouter/catalog.js";
import { resolveOrigins, modelsUrl } from "../src/orcarouter/origins.js";
import { createOrcaRouterProvider } from "../src/providers/orcarouter.js";

const HAS_KEY = Boolean(process.env["ORCAROUTER_API_KEY"]?.trim());
/**
 * A relay key can list models it is not scoped to call, and the scoped set is
 * not derivable from the catalog, so the inference check walks the filtered
 * chat list until one model answers. Bounded by both a count and a wall-clock
 * deadline so a narrow key still finishes with a usable message instead of
 * running out the test timeout.
 */
const INFERENCE_DEADLINE_MS = 120_000;

describe.skipIf(!HAS_KEY)("live OrcaRouter relay", () => {
  const origins = resolveOrigins();

  beforeAll(() => {
    expect(origins.apiBaseUrl).toBe("https://api.orcarouter.ai");
    expect(origins.authBaseUrl).toBe("https://www.orcarouter.ai");
  });

  it("discovers the workspace catalog from the API origin's /v1/models", async () => {
    expect(modelsUrl(origins)).toBe("https://api.orcarouter.ai/v1/models");

    const catalog = await fetchModelCatalog({ origins });
    expect(catalog.source).toBe("live");
    expect(catalog.degraded).toBe(false);
    expect(catalog.models.length).toBeGreaterThan(0);

    // Live success is authoritative — no seed entry may be mixed in.
    expect(catalog.models.every((m) => m.source === "live")).toBe(true);
    expect(catalog.models.every((m) => !m.verified)).toBe(true);
    // Ids are preserved verbatim: the vendor/model ones keep their namespace,
    // and the few unnamespaced ids the relay also publishes are left alone
    // rather than "corrected" into a shape the relay never advertised.
    expect(catalog.models.some((m) => m.id.includes("/"))).toBe(true);
    expect(
      catalog.models.every((m) => m.id.length > 0 && !/\s/.test(m.id)),
    ).toBe(true);
  });

  it("filters the live catalog per entry point without guessing", async () => {
    const catalog = await fetchModelCatalog({ origins });
    const chat = filterModels(catalog.models, "chat");
    const vision = filterModels(catalog.models, "multimodal", "image");

    expect(chat.length).toBeGreaterThan(0);
    // Multimodal stays a strict subset of chat: an image-capable model that is
    // not a chat model has no business in either selector.
    for (const model of vision) {
      expect(chat.some((c) => c.id === model.id)).toBe(true);
      expect(
        model.capabilities.inputModalities.map((m) => m.toLowerCase()),
      ).toContain("image");
    }
    // Fail closed: every entry actually offered here declares image input.
    expect(
      vision.every((m) =>
        m.capabilities.inputModalities.some((x) => x.toLowerCase() === "image"),
      ),
    ).toBe(true);
    // Non-chat specialities never leak into the chat selector.
    for (const model of chat) {
      const types = model.capabilities.supportedEndpointTypes.map((t) =>
        t.toLowerCase(),
      );
      const specialityOnly =
        types.some((t) =>
          ["image-generation", "openai-video", "jina-rerank", "embeddings"].includes(t),
        ) &&
        !types.some((t) =>
          ["openai", "anthropic", "gemini", "openai-response"].includes(t),
        );
      expect(specialityOnly).toBe(false);
    }
  });

  it("runs a real completion through the provider this PR adds", async () => {
    const catalog = await fetchModelCatalog({ origins });
    const chat = filterModels(catalog.models, "chat");
    expect(chat.length).toBeGreaterThan(0);

    const attempts: Array<{ model: string; outcome: string }> = [];
    const deadline = Date.now() + INFERENCE_DEADLINE_MS;
    for (const model of chat) {
      if (Date.now() > deadline) break;
      const provider = createOrcaRouterProvider(model.id, 32);
      expect(provider.name).toBe("orcarouter");
      try {
        const out = await provider.summarize(
          "You are a test harness. Reply with exactly one word.",
          "Reply with the single word: pong",
        );
        expect(out.trim().length).toBeGreaterThan(0);
        attempts.push({ model: model.id, outcome: "ok" });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A key-scoped refusal is not a wiring failure; try the next model.
        if (!/model_access_denied|403/.test(message)) throw err;
        attempts.push({ model: model.id, outcome: "denied by key scope" });
      }
    }
    throw new Error(
      `no chat model in the live catalog was callable with this key ` +
        `(${attempts.length} tried); first attempts: ${JSON.stringify(attempts.slice(0, 5))}`,
    );
  }, 180_000);
});
