import { describe, it, expect } from "vitest";
import { embeddingStatusLabel } from "../src/cli/embedding-status.js";

describe("agentmemory status embeddings line", () => {
  it("shows the provider the server reports", () => {
    expect(embeddingStatusLabel("openrouter (1536 dims)")).toBe("openrouter (1536 dims)");
  });

  it.each([["none"], [""], [undefined], [null], [42]])("falls back to bm25-only for %j", (value) => {
    expect(embeddingStatusLabel(value)).toBeNull();
  });
});
