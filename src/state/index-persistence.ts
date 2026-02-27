import { SearchIndex } from "./search-index.js";
import { VectorIndex } from "./vector-index.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";

const DEBOUNCE_MS = 5000;

export class IndexPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private kv: StateKV,
    private bm25: SearchIndex,
    private vector: VectorIndex | null,
  ) {}

  scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), DEBOUNCE_MS);
  }

  async save(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.kv.set(KV.bm25Index, "data", this.bm25.serialize());
    if (this.vector && this.vector.size > 0) {
      await this.kv.set(KV.bm25Index, "vectors", this.vector.serialize());
    }
  }

  async load(): Promise<{
    bm25: SearchIndex | null;
    vector: VectorIndex | null;
  }> {
    let bm25: SearchIndex | null = null;
    let vector: VectorIndex | null = null;

    const bm25Data = await this.kv
      .get<string>(KV.bm25Index, "data")
      .catch(() => null);
    if (bm25Data && typeof bm25Data === "string") {
      bm25 = SearchIndex.deserialize(bm25Data);
    }

    const vecData = await this.kv
      .get<string>(KV.bm25Index, "vectors")
      .catch(() => null);
    if (vecData && typeof vecData === "string") {
      vector = VectorIndex.deserialize(vecData);
    }

    return { bm25, vector };
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
