function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer).toString("base64");
}

function base64ToFloat32(b64: string): Float32Array {
  return new Float32Array(Buffer.from(b64, "base64").buffer);
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

    for (const [obsId, entry] of this.vectors) {
      const score = cosineSimilarity(query, entry.embedding);
      results.push({ obsId, sessionId: entry.sessionId, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  get size(): number {
    return this.vectors.size;
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
          embedding: base64ToFloat32(entry.embedding),
          sessionId: entry.sessionId,
        });
      } catch {
        continue;
      }
    }
    return idx;
  }
}
