import { SearchIndex } from "./search-index.js";
import { VectorIndex } from "./vector-index.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { logger } from "../logger.js";

const DEBOUNCE_MS = 5000;
const FAILURE_LOG_THROTTLE_MS = 60_000;

export class IndexPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFailureLogAt = 0;

  constructor(
    private kv: StateKV,
    private bm25: SearchIndex,
    private vector: VectorIndex | null,
  ) {}

  scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    // setTimeout discards the returned promise, so any rejection inside
    // save() would surface as unhandledRejection and crash the process
    // under sustained iii-engine write timeouts (issue #204). Funnel
    // rejections through logFailure() instead.
    this.timer = setTimeout(() => {
      this.save().catch((err) => this.logFailure(err));
    }, DEBOUNCE_MS);
  }

  async save(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await this.kv.set(KV.bm25Index, "data", this.bm25.serialize());
      if (this.vector && this.vector.size > 0) {
        await this.kv.set(KV.bm25Index, "vectors", this.vector.serialize());
      }
    } catch (err) {
      this.logFailure(err);
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

  private logFailure(err: unknown): void {
    const now = Date.now();
    // Throttle: persistence failures under load arrive in bursts
    // (iii-engine queue pressure). Logging every debounce flush adds
    // noise without information.
    if (now - this.lastFailureLogAt < FAILURE_LOG_THROTTLE_MS) return;
    this.lastFailureLogAt = now;
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("index persistence: failed to save BM25/vector index", {
      code,
      message,
      hint:
        code === "TIMEOUT"
          ? "iii-engine state::set timed out; recent index updates remain in memory and will retry on the next debounce flush"
          : undefined,
    });
  }
}
