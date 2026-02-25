import type { CompressedObservation } from "../types.js";

interface IndexEntry {
  obsId: string;
  sessionId: string;
  terms: Set<string>;
}

export class SearchIndex {
  private entries: Map<string, IndexEntry> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();

  add(obs: CompressedObservation): void {
    const terms = this.extractTerms(obs);
    const entry: IndexEntry = {
      obsId: obs.id,
      sessionId: obs.sessionId,
      terms,
    };
    this.entries.set(obs.id, entry);

    for (const term of terms) {
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

    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const matches = this.invertedIndex.get(term);
      if (!matches) continue;
      for (const obsId of matches) {
        scores.set(obsId, (scores.get(obsId) || 0) + 1);
      }

      for (const [indexTerm, obsIds] of this.invertedIndex) {
        if (indexTerm !== term && indexTerm.startsWith(term)) {
          for (const obsId of obsIds) {
            scores.set(obsId, (scores.get(obsId) || 0) + 0.5);
          }
        }
      }
    }

    return Array.from(scores.entries())
      .map(([obsId, score]) => {
        const entry = this.entries.get(obsId)!;
        return {
          obsId,
          sessionId: entry.sessionId,
          score: score / queryTerms.length,
        };
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
  }

  private extractTerms(obs: CompressedObservation): Set<string> {
    const parts = [
      obs.title,
      obs.subtitle || "",
      obs.narrative,
      ...obs.facts,
      ...obs.concepts,
      ...obs.files,
      obs.type,
    ];
    return new Set(this.tokenize(parts.join(" ").toLowerCase()));
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s/.\-_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
