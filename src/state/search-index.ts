import type { CompressedObservation } from "../types.js";

interface IndexEntry {
  obsId: string;
  sessionId: string;
  termCount: number;
}

export class SearchIndex {
  private entries: Map<string, IndexEntry> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private docTermCounts: Map<string, Map<string, number>> = new Map();
  private totalDocLength = 0;

  private readonly k1 = 1.2;
  private readonly b = 0.75;

  add(obs: CompressedObservation): void {
    const terms = this.extractTerms(obs);
    const termFreq = new Map<string, number>();
    let termCount = 0;

    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
      termCount++;
    }

    this.entries.set(obs.id, {
      obsId: obs.id,
      sessionId: obs.sessionId,
      termCount,
    });
    this.docTermCounts.set(obs.id, termFreq);
    this.totalDocLength += termCount;

    for (const term of termFreq.keys()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)!.add(obs.id);
    }
  }

  search(
    query: string,
    limit = 20,
  ): Array<{ obsId: string; sessionId: string; score: number }> {
    const queryTerms = this.tokenize(query.toLowerCase());
    if (queryTerms.length === 0) return [];

    const N = this.entries.size;
    if (N === 0) return [];
    const avgDocLen = this.totalDocLength / N;

    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const matchingDocs = this.invertedIndex.get(term);
      if (!matchingDocs) continue;

      const df = matchingDocs.size;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const obsId of matchingDocs) {
        const entry = this.entries.get(obsId)!;
        const docTerms = this.docTermCounts.get(obsId);
        const tf = docTerms?.get(term) || 0;
        const docLen = entry.termCount;

        const numerator = tf * (this.k1 + 1);
        const denominator =
          tf + this.k1 * (1 - this.b + this.b * (docLen / avgDocLen));
        const bm25Score = idf * (numerator / denominator);

        scores.set(obsId, (scores.get(obsId) || 0) + bm25Score);
      }

      for (const [indexTerm, obsIds] of this.invertedIndex) {
        if (indexTerm !== term && indexTerm.startsWith(term)) {
          const prefixDf = obsIds.size;
          const prefixIdf =
            Math.log((N - prefixDf + 0.5) / (prefixDf + 0.5) + 1) * 0.5;
          for (const obsId of obsIds) {
            const entry = this.entries.get(obsId)!;
            const docTerms = this.docTermCounts.get(obsId);
            const tf = docTerms?.get(indexTerm) || 0;
            const docLen = entry.termCount;
            const numerator = tf * (this.k1 + 1);
            const denominator =
              tf + this.k1 * (1 - this.b + this.b * (docLen / avgDocLen));
            scores.set(
              obsId,
              (scores.get(obsId) || 0) + prefixIdf * (numerator / denominator),
            );
          }
        }
      }
    }

    return Array.from(scores.entries())
      .map(([obsId, score]) => {
        const entry = this.entries.get(obsId)!;
        return { obsId, sessionId: entry.sessionId, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.invertedIndex.clear();
    this.docTermCounts.clear();
    this.totalDocLength = 0;
  }

  serialize(): string {
    const entries = Array.from(this.entries.entries());
    const inverted = Array.from(this.invertedIndex.entries()).map(
      ([term, ids]) => [term, Array.from(ids)] as [string, string[]],
    );
    const docTerms = Array.from(this.docTermCounts.entries()).map(
      ([id, counts]) =>
        [id, Array.from(counts.entries())] as [string, [string, number][]],
    );
    return JSON.stringify({
      entries,
      inverted,
      docTerms,
      totalDocLength: this.totalDocLength,
    });
  }

  static deserialize(json: string): SearchIndex {
    const idx = new SearchIndex();
    const data = JSON.parse(json);
    for (const [key, val] of data.entries) {
      idx.entries.set(key, val);
    }
    for (const [term, ids] of data.inverted) {
      idx.invertedIndex.set(term, new Set(ids));
    }
    for (const [id, counts] of data.docTerms) {
      idx.docTermCounts.set(id, new Map(counts));
    }
    idx.totalDocLength = data.totalDocLength;
    return idx;
  }

  private extractTerms(obs: CompressedObservation): string[] {
    const parts = [
      obs.title,
      obs.subtitle || "",
      obs.narrative,
      ...obs.facts,
      ...obs.concepts,
      ...obs.files,
      obs.type,
    ];
    return this.tokenize(parts.join(" ").toLowerCase());
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s/.\-_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
