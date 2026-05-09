import { describe, it, expect } from "vitest";
import { VectorIndex } from "../src/state/vector-index.js";

describe("VectorIndex.validateDimensions", () => {
  it("reports no mismatches and an empty dim set on an empty index", () => {
    const result = new VectorIndex().validateDimensions(384);
    expect(result.mismatches).toEqual([]);
    expect(Array.from(result.seenDimensions)).toEqual([]);
  });

  it("reports no mismatches when every vector matches the expected dimension", () => {
    const idx = new VectorIndex();
    idx.add("o1", "s1", new Float32Array(384));
    idx.add("o2", "s1", new Float32Array(384));
    const result = idx.validateDimensions(384);
    expect(result.mismatches).toEqual([]);
    expect(Array.from(result.seenDimensions)).toEqual([384]);
  });

  it("reports every wrong-dimension vector, not just the first", () => {
    const idx = new VectorIndex();
    idx.add("good1", "s1", new Float32Array(384));
    idx.add("bad1", "s1", new Float32Array(1536));
    idx.add("good2", "s1", new Float32Array(384));
    idx.add("bad2", "s1", new Float32Array(768));
    const result = idx.validateDimensions(384);
    expect(result.mismatches).toHaveLength(2);
    expect(result.mismatches.map((m) => m.obsId).sort()).toEqual(["bad1", "bad2"]);
    expect(Array.from(result.seenDimensions).sort((a, b) => a - b)).toEqual([
      384, 768, 1536,
    ]);
  });

  it("flags every entry when the entire index has the wrong dimension", () => {
    const idx = new VectorIndex();
    idx.add("o1", "s1", new Float32Array(384));
    idx.add("o2", "s1", new Float32Array(384));
    const result = idx.validateDimensions(1536);
    expect(result.mismatches).toHaveLength(2);
    expect(Array.from(result.seenDimensions)).toEqual([384]);
  });
});
