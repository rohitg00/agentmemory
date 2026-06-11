import { describe, it, expect, beforeEach } from "vitest";
import { VectorIndex } from "../src/state/vector-index.js";

describe("VectorIndex", () => {
  let index: VectorIndex;

  beforeEach(() => {
    index = new VectorIndex();
  });

  it("starts empty", () => {
    expect(index.size).toBe(0);
  });

  it("adds and retrieves vectors", () => {
    index.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    expect(index.size).toBe(1);
  });

  it("removes a vector", () => {
    index.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    index.remove("obs_1");
    expect(index.size).toBe(0);
  });

  it("returns empty array when searching empty index", () => {
    const results = index.search(new Float32Array([0.1, 0.2, 0.3]));
    expect(results).toEqual([]);
  });

  it("returns results sorted by cosine similarity", () => {
    index.add("obs_close", "ses_1", new Float32Array([1, 0, 0]));
    index.add("obs_far", "ses_1", new Float32Array([0, 1, 0]));
    index.add("obs_medium", "ses_1", new Float32Array([0.7, 0.7, 0]));

    const results = index.search(new Float32Array([1, 0, 0]));
    expect(results[0].obsId).toBe("obs_close");
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[1].obsId).toBe("obs_medium");
    expect(results[2].obsId).toBe("obs_far");
    expect(results[2].score).toBeCloseTo(0.0, 5);
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      index.add(`obs_${i}`, "ses_1", new Float32Array([i * 0.1, 0.5, 0.5]));
    }
    const results = index.search(new Float32Array([0.9, 0.5, 0.5]), 3);
    expect(results.length).toBe(3);
  });

  it("clears all vectors", () => {
    index.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    index.add("obs_2", "ses_1", new Float32Array([0.4, 0.5, 0.6]));
    index.clear();
    expect(index.size).toBe(0);
    expect(index.search(new Float32Array([0.1, 0.2, 0.3]))).toEqual([]);
  });

  it("serialize and deserialize round-trip preserves data", () => {
    index.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    index.add("obs_2", "ses_2", new Float32Array([0.4, 0.5, 0.6]));

    const json = index.serialize();
    const restored = VectorIndex.deserialize(json);

    expect(restored.size).toBe(2);
    const results = restored.search(new Float32Array([0.1, 0.2, 0.3]), 2);
    expect(results.length).toBe(2);
    expect(results[0].obsId).toBe("obs_1");
    expect(results[0].sessionId).toBe("ses_1");
  });

  it("handles zero vectors without error", () => {
    index.add("obs_zero", "ses_1", new Float32Array([0, 0, 0]));
    const results = index.search(new Float32Array([1, 0, 0]));
    expect(results[0].score).toBe(0);
  });

  it("round-trip preserves dim + identity for pooled-Buffer sizes (#587)", () => {
    // 384-dim floats = 1536 bytes, comfortably inside Node's 8KB Buffer
    // pool. Without explicit byteOffset/byteLength in the base64 round-trip,
    // deserialise reads pool offset 0 and reports the entire pool as a
    // 2048-element view, which the live index then rejects with
    // "dimensions seen on disk: 2048".
    const DIM = 384;
    const vecs = Array.from({ length: 5 }, (_, n) => {
      const v = new Float32Array(DIM);
      for (let i = 0; i < DIM; i++) v[i] = n * 1000 + i;
      return v;
    });
    vecs.forEach((v, n) => index.add(`obs_${n}`, "ses_1", v));

    const restored = VectorIndex.deserialize(index.serialize());
    expect(restored.size).toBe(5);
    const { mismatches } = restored.validateDimensions(DIM);
    expect(mismatches).toEqual([]);
    for (let n = 0; n < 5; n++) {
      const results = restored.search(vecs[n], 1);
      expect(results[0].obsId).toBe(`obs_${n}`);
      expect(results[0].score).toBeCloseTo(1.0, 4);
    }
  });

  it("preserves bytes when source Float32Array is itself a sliced view (#587)", () => {
    // The encode side has the same risk: passing arr.buffer drops the
    // slice metadata if arr is a sub-view (subarray / typedArray.set).
    const backing = new Float32Array(8);
    for (let i = 0; i < 8; i++) backing[i] = i;
    const slice = backing.subarray(2, 6); // values 2, 3, 4, 5

    index.add("obs_slice", "ses_1", slice);
    const restored = VectorIndex.deserialize(index.serialize());
    const results = restored.search(new Float32Array([2, 3, 4, 5]), 1);
    expect(results[0].obsId).toBe("obs_slice");
    expect(results[0].score).toBeCloseTo(1.0, 4);
  });
});
