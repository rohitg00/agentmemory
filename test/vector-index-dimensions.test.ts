import { describe, it, expect } from "vitest";
import { VectorIndex } from "../src/state/vector-index.js";

describe("VectorIndex.firstDimensions", () => {
  it("returns 0 when empty", () => {
    expect(new VectorIndex().firstDimensions()).toBe(0);
  });
  it("returns the dimension of the first stored vector", () => {
    const idx = new VectorIndex();
    idx.add("o1", "s1", new Float32Array([1, 2, 3, 4]));
    expect(idx.firstDimensions()).toBe(4);
  });
  it("works for high-dim providers", () => {
    const idx = new VectorIndex();
    idx.add("o1", "s1", new Float32Array(1536));
    expect(idx.firstDimensions()).toBe(1536);
  });
});
