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

function immediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
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

type VectorSearchResult = {
  obsId: string;
  sessionId: string;
  score: number;
};

type VectorSearchOptions = {
  yieldEvery?: number;
  onYield?: (scanned: number) => void;
};

type VectorSearchCandidate = VectorSearchResult & { order: number };

type VectorEntry = {
  obsId: string;
  embedding: Float32Array;
  sessionId: string;
  order: number;
  addedVersion: number;
  removedVersion?: number;
};

export class VectorIndex {
  private vectors: Map<string, VectorEntry> = new Map();
  private retiredVectors: VectorEntry[] = [];
  private version = 0;
  private nextOrder = 0;
  private activeAsyncSearches = 0;

  add(obsId: string, sessionId: string, embedding: Float32Array): void {
    const version = this.nextVersion();
    const existing = this.vectors.get(obsId);
    const order = existing?.order ?? this.nextOrder++;
    if (existing) {
      this.retireEntry(existing, version);
    }
    this.vectors.set(obsId, {
      obsId,
      embedding,
      sessionId,
      order,
      addedVersion: version,
    });
  }

  remove(obsId: string): void {
    const existing = this.vectors.get(obsId);
    if (!existing) return;
    this.retireEntry(existing, this.nextVersion());
    this.vectors.delete(obsId);
    this.compactRetiredVectors();
  }

  search(
    query: Float32Array,
    limit = 20,
  ): VectorSearchResult[] {
    const results: VectorSearchCandidate[] = [];
    const resultIds = new Set<string>();
    let minScore = -Infinity;

    for (const entry of this.vectors.values()) {
      const score = cosineSimilarity(query, entry.embedding);
      minScore = this.considerResult(results, resultIds, limit, minScore, {
        obsId: entry.obsId,
        sessionId: entry.sessionId,
        score,
        order: entry.order,
      });
    }

    return this.finalizeResults(results);
  }

  async searchAsync(
    query: Float32Array,
    limit = 20,
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchCandidate[] = [];
    const resultIds = new Set<string>();
    const yieldEvery = Math.max(1, options.yieldEvery ?? 1_000);
    const snapshotVersion = this.version;
    let minScore = -Infinity;
    let scanned = 0;

    this.activeAsyncSearches++;
    try {
      for (const entry of this.vectors.values()) {
        if (this.isVisibleAt(entry, snapshotVersion)) {
          const score = cosineSimilarity(query, entry.embedding);
          minScore = this.considerResult(results, resultIds, limit, minScore, {
            obsId: entry.obsId,
            sessionId: entry.sessionId,
            score,
            order: entry.order,
          });
        }
        scanned++;
        if (scanned % yieldEvery === 0) {
          options.onYield?.(scanned);
          await immediate();
        }
      }

      for (let i = 0; i < this.retiredVectors.length; i++) {
        const entry = this.retiredVectors[i];
        if (this.isVisibleAt(entry, snapshotVersion)) {
          const score = cosineSimilarity(query, entry.embedding);
          minScore = this.considerResult(results, resultIds, limit, minScore, {
            obsId: entry.obsId,
            sessionId: entry.sessionId,
            score,
            order: entry.order,
          });
        }
        scanned++;
        if (scanned % yieldEvery === 0) {
          options.onYield?.(scanned);
          await immediate();
        }
      }

      return this.finalizeResults(results);
    } finally {
      this.activeAsyncSearches--;
      this.compactRetiredVectors();
    }
  }

  private considerResult(
    results: VectorSearchCandidate[],
    resultIds: Set<string>,
    limit: number,
    minScore: number,
    result: VectorSearchCandidate,
  ): number {
    if (resultIds.has(result.obsId)) return minScore;
    if (results.length < limit) {
      results.push(result);
      resultIds.add(result.obsId);
      if (results.length === limit) {
        this.sortWorstFirst(results);
        return results[0].score;
      }
      return minScore;
    }
    if (
      result.score > minScore ||
      this.isEarlierTie(result, results[0], minScore)
    ) {
      if (results[0]) {
        resultIds.delete(results[0].obsId);
      }
      results[0] = result;
      resultIds.add(result.obsId);
      this.sortWorstFirst(results);
      return results[0].score;
    }
    return minScore;
  }

  private sortWorstFirst(results: VectorSearchCandidate[]): void {
    results.sort((a, b) => a.score - b.score || b.order - a.order);
  }

  private isEarlierTie(
    result: VectorSearchCandidate,
    worst: VectorSearchCandidate | undefined,
    minScore: number,
  ): boolean {
    return Boolean(
      worst && result.score === minScore && result.order < worst.order,
    );
  }

  private finalizeResults(results: VectorSearchCandidate[]): VectorSearchResult[] {
    return results
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map(({ obsId, sessionId, score }) => ({ obsId, sessionId, score }));
  }

  private nextVersion(): number {
    this.version++;
    return this.version;
  }

  private retireEntry(entry: VectorEntry, removedVersion: number): void {
    entry.removedVersion = removedVersion;
    if (this.activeAsyncSearches > 0) {
      this.retiredVectors.push(entry);
    }
  }

  private compactRetiredVectors(): void {
    if (this.activeAsyncSearches === 0) {
      this.retiredVectors = [];
    }
  }

  private isVisibleAt(entry: VectorEntry, version: number): boolean {
    return (
      entry.addedVersion <= version &&
      (entry.removedVersion === undefined || entry.removedVersion > version)
    );
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
    if (this.vectors.size > 0) {
      const removedVersion = this.nextVersion();
      for (const entry of this.vectors.values()) {
        this.retireEntry(entry, removedVersion);
      }
    }
    this.vectors.clear();
    this.compactRetiredVectors();
  }

  restoreFrom(other: VectorIndex): void {
    const src = (other as any).vectors as Map<
      string,
      { embedding: Float32Array; sessionId: string; order?: number }
    >;
    const version = this.nextVersion();
    if (this.vectors.size > 0) {
      for (const entry of this.vectors.values()) {
        this.retireEntry(entry, version);
      }
    }
    this.vectors = new Map();
    for (const [obsId, entry] of src) {
      this.vectors.set(obsId, {
        obsId,
        embedding: new Float32Array(entry.embedding),
        sessionId: entry.sessionId,
        order: this.nextOrder++,
        addedVersion: version,
      });
    }
    this.compactRetiredVectors();
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

  static deserialize(json: string): VectorIndex {
    const idx = new VectorIndex();
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return idx;
    }
    if (!Array.isArray(data)) return idx;
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
        idx.vectors.set(obsId, {
          obsId,
          embedding: base64ToFloat32(entry.embedding),
          sessionId: entry.sessionId,
          order: idx.nextOrder++,
          addedVersion: idx.nextVersion(),
        });
      } catch {
        continue;
      }
    }
    return idx;
  }
}
