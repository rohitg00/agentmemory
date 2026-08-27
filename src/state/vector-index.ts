// Pass byteOffset + byteLength explicitly so the round-trip survives
// Node's Buffer pool. Buffer.from(b64, "base64") returns a slice of a
// shared 8KB pool (poolSize), and `new Float32Array(buf.buffer)` ignores
// the slice metadata — it would mint a 2048-element view over the whole
// pool. Same risk on the encode side if the input Float32Array is itself
// a sliced view. Reported as a phantom "2048 dimensions on disk" crash
// in #455 / #469 / #584 / #587.
function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString(
    "base64",
  );
}

function base64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}

// FNV-1a. Only needs to spread obsIds evenly across buckets and be stable
// across processes — it is never a content check, so a non-cryptographic
// 32-bit hash is the right size. Math.imul keeps the multiply in int32.
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Deterministic and stable across processes: bucket keys are reused in place,
// so nothing can be stranded. Changing this is an addressing change — bump
// VECTOR_LAYOUT in index-persistence.ts if you do.
function vectorBucketOf(obsId: string, bucketCount: number): number {
  return fnv1a32(obsId) % bucketCount;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class VectorIndex {
  private vectors: Map<string, { embedding: Float32Array; sessionId: string }> =
    new Map();

  add(obsId: string, sessionId: string, embedding: Float32Array): void {
    this.vectors.set(obsId, { embedding, sessionId });
  }

  remove(obsId: string): void {
    this.vectors.delete(obsId);
  }

  search(
    query: Float32Array,
    limit = 20,
  ): Array<{ obsId: string; sessionId: string; score: number }> {
    const results: Array<{
      obsId: string;
      sessionId: string;
      score: number;
    }> = [];
    let minScore = -Infinity;

    for (const [obsId, entry] of this.vectors) {
      const score = cosineSimilarity(query, entry.embedding);
      if (results.length < limit) {
        results.push({ obsId, sessionId: entry.sessionId, score });
        if (results.length === limit) {
          results.sort((a, b) => a.score - b.score);
          minScore = results[0].score;
        }
      } else if (score > minScore) {
        results[0] = { obsId, sessionId: entry.sessionId, score };
        results.sort((a, b) => a.score - b.score);
        minScore = results[0].score;
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  get size(): number {
    return this.vectors.size;
  }

  // Walks every stored vector and returns the obsIds whose dimension
  // doesn't match `expected`, plus the set of distinct dimensions seen.
  // Used by the persistence-restore guard in src/index.ts to refuse
  // loading any index containing wrong-dimension vectors — including
  // legacy on-disk indexes written before the live-API dimension guard
  // existed (where a mid-session provider swap could mix dimensions
  // inside a single index). Empty `mismatches` plus a single-entry
  // `seenDimensions` matching `expected` is the only clean state.
  validateDimensions(
    expected: number,
  ): { mismatches: Array<{ obsId: string; dim: number }>; seenDimensions: Set<number> } {
    const mismatches: Array<{ obsId: string; dim: number }> = [];
    const seenDimensions = new Set<number>();
    for (const [obsId, entry] of this.vectors) {
      const dim = entry.embedding.length;
      seenDimensions.add(dim);
      if (dim !== expected) {
        mismatches.push({ obsId, dim });
      }
    }
    return { mismatches, seenDimensions };
  }

  clear(): void {
    this.vectors.clear();
  }

  restoreFrom(other: VectorIndex): void {
    const src = (other as any).vectors as Map<
      string,
      { embedding: Float32Array; sessionId: string }
    >;
    this.vectors = new Map();
    for (const [obsId, entry] of src) {
      this.vectors.set(obsId, {
        embedding: new Float32Array(entry.embedding),
        sessionId: entry.sessionId,
      });
    }
  }

  serialize(): string {
    const data: Array<[string, { embedding: string; sessionId: string }]> = [];
    for (const [obsId, entry] of this.vectors) {
      data.push([
        obsId,
        {
          embedding: float32ToBase64(entry.embedding),
          sessionId: entry.sessionId,
        },
      ]);
    }
    return JSON.stringify(data);
  }

  /**
   * Serialise one bucket at a time, in the same row shape `serialize()` emits
   * so both formats deserialise through one code path.
   *
   * A generator rather than a `Map<number, string>` on purpose: materialising
   * every bucket would hold the whole index as strings at once (~266 MB in
   * production) inside an already memory-constrained process. Yielding lets the
   * caller write and drop each bucket, so the peak is a single bucket.
   *
   * Grouping first costs one pass and holds ids only, not embeddings.
   * Empty buckets are not yielded — the caller reconciles those against the
   * previous manifest and deletes them.
   */
  *serializeBuckets(bucketCount: number): Generator<[number, string]> {
    // Snapshot entry references up front rather than reading the live Map as
    // each bucket is yielded.
    //
    // The caller awaits a KV write between yields, and rebuildIndex() calls
    // vectorIndex.clear() synchronously before its first await
    // (src/functions/search.ts). A search that triggers a rebuild mid-save
    // would therefore empty the Map underneath this loop, every remaining
    // bucket would serialise to "[]", and those empty buckets would be hashed,
    // written, and published as the bucket's true content — with the manifest
    // and disk in perfect agreement, so the load-time hash check cannot see it.
    //
    // Holding references costs nothing: the Float32Arrays already exist and are
    // not copied. Only one bucket's base64 is materialised at a time, which is
    // the memory property that matters.
    const groups = new Map<
      number,
      Array<[string, { embedding: Float32Array; sessionId: string }]>
    >();
    for (const [obsId, entry] of this.vectors) {
      const bucket = vectorBucketOf(obsId, bucketCount);
      const rows = groups.get(bucket);
      if (rows) rows.push([obsId, entry]);
      else groups.set(bucket, [[obsId, entry]]);
    }
    for (const [bucket, rows] of groups) {
      const serialised = rows.map(
        ([obsId, entry]) =>
          [
            obsId,
            {
              embedding: float32ToBase64(entry.embedding),
              sessionId: entry.sessionId,
            },
          ] as [string, { embedding: string; sessionId: string }],
      );
      yield [bucket, JSON.stringify(serialised)];
    }
  }

  /** Merge serialised rows into this index. Malformed rows are skipped. */
  mergeSerialized(json: string): void {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;
    for (const row of data) {
      try {
        if (!Array.isArray(row) || row.length < 2) continue;
        const [obsId, entry] = row;
        if (
          typeof obsId !== "string" ||
          typeof entry?.embedding !== "string" ||
          typeof entry?.sessionId !== "string"
        )
          continue;
        this.vectors.set(obsId, {
          embedding: base64ToFloat32(entry.embedding),
          sessionId: entry.sessionId,
        });
      } catch {
        continue;
      }
    }
  }

  static deserialize(json: string): VectorIndex {
    const idx = new VectorIndex();
    idx.mergeSerialized(json);
    return idx;
  }
}
