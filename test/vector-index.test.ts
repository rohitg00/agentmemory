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

  it("preserves nonpositive limit behavior when comparing async and sync search", async () => {
    index.add("obs_1", "ses_1", new Float32Array([1, 0, 0]));
    index.add("obs_2", "ses_2", new Float32Array([0.5, 0.5, 0]));

    for (const limit of [0, -1]) {
      const syncResults = index.search(new Float32Array([1, 0, 0]), limit);
      expect(syncResults).toHaveLength(1);
      expect(syncResults[0].obsId).toBe("obs_1");

      const asyncResults = await index.searchAsync(
        new Float32Array([1, 0, 0]),
        limit,
      );
      expect(asyncResults).toEqual(syncResults);
    }
  });

  it("returns the same top results from async search", async () => {
    for (let i = 0; i < 30; i++) {
      index.add(
        `obs_${i}`,
        `ses_${i % 3}`,
        new Float32Array([i / 30, 1 - i / 30, 0.25]),
      );
    }

    const query = new Float32Array([0.9, 0.1, 0.25]);
    const syncResults = index.search(query, 7);
    const asyncResults = await index.searchAsync(query, 7);

    expect(asyncResults.map((r) => r.obsId)).toEqual(
      syncResults.map((r) => r.obsId),
    );
    expect(asyncResults.map((r) => r.sessionId)).toEqual(
      syncResults.map((r) => r.sessionId),
    );
    asyncResults.forEach((result, i) => {
      expect(result.score).toBeCloseTo(syncResults[i].score, 6);
    });
  });

  it("yields between chunks during large async search", async () => {
    const dimensions = 64;
    const vectorCount = 2_000;
    for (let n = 0; n < vectorCount; n++) {
      const embedding = new Float32Array(dimensions);
      for (let i = 0; i < dimensions; i++) {
        embedding[i] = ((n + i) % 17) / 17;
      }
      index.add(`obs_${n}`, `ses_${n % 5}`, embedding);
    }

    const yieldedScans: number[] = [];
    let immediateFired = false;
    let immediateFiredBeforeSecondChunk = false;

    const results = await index.searchAsync(
      new Float32Array(dimensions).fill(0.5),
      10,
      {
        yieldEvery: 25,
        onYield: (scanned) => {
          yieldedScans.push(scanned);
          if (scanned === 25) {
            setImmediate(() => {
              immediateFired = true;
            });
          }
          if (scanned === 50) {
            immediateFiredBeforeSecondChunk = immediateFired;
          }
        },
      },
    );

    expect(results).toHaveLength(10);
    expect(yieldedScans).toContain(25);
    expect(yieldedScans).toContain(50);
    expect(immediateFiredBeforeSecondChunk).toBe(true);
  });

  it("yields with default chunking during large async search", async () => {
    const dimensions = 32;
    const vectorCount = 1_250;
    for (let n = 0; n < vectorCount; n++) {
      const embedding = new Float32Array(dimensions);
      for (let i = 0; i < dimensions; i++) {
        embedding[i] = ((n * 3 + i) % 19) / 19;
      }
      index.add(`obs_${n}`, `ses_${n % 7}`, embedding);
    }

    let immediateFired = false;
    let searchResolved = false;
    setImmediate(() => {
      if (!searchResolved) {
        immediateFired = true;
      }
    });

    const results = await index.searchAsync(
      new Float32Array(dimensions).fill(0.4),
      10,
    );
    searchResolved = true;

    expect(results).toHaveLength(10);
    expect(immediateFired).toBe(true);
  });

  it("uses a snapshot when the index mutates during async search", async () => {
    for (let i = 0; i < 50; i++) {
      index.add(`obs_${i}`, "ses_original", new Float32Array([1, 0, 0]));
    }

    let mutated = false;

    const results = await index.searchAsync(new Float32Array([1, 0, 0]), 5, {
      yieldEvery: 1,
      onYield: () => {
        if (!mutated) {
          mutated = true;
          index.clear();
          index.add("obs_new", "ses_new", new Float32Array([1, 0, 0]));
        }
      },
    });

    expect(mutated).toBe(true);
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.sessionId === "ses_original")).toBe(
      true,
    );
    expect(results.some((result) => result.obsId === "obs_new")).toBe(false);
  });

  it("preserves snapshot tie order when an entry is removed before it is scanned", async () => {
    index.add("obs_a", "ses_1", new Float32Array([1, 0, 0]));
    index.add("obs_b", "ses_1", new Float32Array([1, 0, 0]));
    index.add("obs_c", "ses_1", new Float32Array([1, 0, 0]));
    const baseline = index
      .search(new Float32Array([1, 0, 0]), 2)
      .map((result) => result.obsId);

    let removed = false;
    const results = await index.searchAsync(new Float32Array([1, 0, 0]), 2, {
      yieldEvery: 1,
      onYield: () => {
        if (!removed) {
          removed = true;
          index.remove("obs_b");
        }
      },
    });

    expect(removed).toBe(true);
    expect(results.map((result) => result.obsId)).toEqual(baseline);
  });

  it("preserves future async snapshots after restoreFrom runs during active search", async () => {
    index.add("old_a", "ses_old", new Float32Array([1, 0, 0]));
    index.add("old_b", "ses_old", new Float32Array([1, 0, 0]));
    const replacement = new VectorIndex();
    replacement.add("restored", "ses_restored", new Float32Array([1, 0, 0]));

    let restored = false;
    const restoreTimeResults = await index.searchAsync(new Float32Array([1, 0, 0]), 3, {
      yieldEvery: 1,
      onYield: () => {
        if (!restored) {
          restored = true;
          index.restoreFrom(replacement);
        }
      },
    });
    expect(restored).toBe(true);
    expect(restoreTimeResults.map((result) => result.obsId)).toEqual([
      "old_a",
      "old_b",
    ]);
    expect(restoreTimeResults.some((result) => result.obsId === "restored")).toBe(
      false,
    );

    index.clear();
    index.add("obs_a", "ses_1", new Float32Array([1, 0, 0]));
    index.add("obs_b", "ses_1", new Float32Array([1, 0, 0]));
    index.add("obs_c", "ses_1", new Float32Array([1, 0, 0]));
    const baseline = index
      .search(new Float32Array([1, 0, 0]), 2)
      .map((result) => result.obsId);

    let removed = false;
    const results = await index.searchAsync(new Float32Array([1, 0, 0]), 2, {
      yieldEvery: 1,
      onYield: () => {
        if (!removed) {
          removed = true;
          index.remove("obs_b");
        }
      },
    });

    expect(removed).toBe(true);
    expect(results.map((result) => result.obsId)).toEqual(baseline);
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
