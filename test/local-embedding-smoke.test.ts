import { describe, it, expect } from "vitest";
import { LocalEmbeddingProvider } from "../src/providers/embedding/local.js";

const run = process.env.RUN_HF_SMOKE === "1";

describe.runIf(run)("LocalEmbeddingProvider v4 smoke (real model)", () => {
  it("embeds via Xenova/all-MiniLM-L6-v2 -> 384 finite dims", async () => {
    const vec = await new LocalEmbeddingProvider().embed("hello world");
    expect(vec.length).toBe(384);
    for (const v of vec) expect(Number.isFinite(v)).toBe(true);
  }, 60_000);
});
