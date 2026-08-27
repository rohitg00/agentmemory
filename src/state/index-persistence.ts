import { createHash } from "node:crypto";
import { SearchIndex } from "./search-index.js";
import { VectorIndex } from "./vector-index.js";
import type { StateKV } from "./kv.js";
import { KV, generateId } from "./schema.js";
import { logger } from "../logger.js";
import { safeAudit } from "../functions/audit.js";

const DEBOUNCE_MS = 5000;
const FAILURE_LOG_THROTTLE_MS = 60_000;
const INDEX_PERSISTENCE_FUNCTION_ID = "mem::index-persistence";
const BM25_KEY = "data";
const BM25_MANIFEST_KEY = "data:manifest";
const BM25_SHARD_SCOPE_PREFIX = `${KV.bm25Index}:bm25:`;
const VECTOR_KEY = "vectors";
const VECTOR_MANIFEST_KEY = "vectors:manifest";
const INDEX_SHARD_KEY = "data";
const DEFAULT_INDEX_SHARD_CHARS = 2_000_000;

// Fixed scope for bucketed vector shards. No generation component: bucket keys
// are deterministic and overwritten in place, so nothing can be stranded.
const VECTOR_BUCKET_SCOPE = `${KV.bm25Index}:vectors:v2`;
const DEFAULT_VECTOR_BUCKETS = 256;
const MAX_BUCKET_CHUNKS = 10_000;

type IndexShardManifest = {
  v: 1;
  generation?: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
  chars: number;
};

/**
 * Bucketed vector manifest.
 *
 * `shards` maps bucket key -> content hash and chunk count, non-empty buckets
 * only.
 *
 * Hashes live in the manifest, not process memory: restarts must not force a
 * full rewrite. Buckets bound how much is rewritten; chunks bound the payload
 * size, since a bucket grows with the corpus and the engine rejects an
 * oversized `state::set`.
 */
// No `chars`: the content hash already proves both content and length. v1
// needed a length check only because it had no hash to check against.
type VectorBucketEntry = { hash: string; chunks: number };

/**
 * Version of the *addressing scheme* — which bucket an obsId lands in and which
 * keys that bucket occupies. Bump it whenever that mapping changes, including a
 * change to the bucket hash function or the key format.
 *
 * This exists because a content hash cannot see an addressing change: the bytes
 * are identical, they just belong somewhere else now. Without this, such a
 * change silently skips every write while the manifest claims new locations,
 * and the vectors are lost on the next load.
 *
 * It is deliberately separate from `v`. `v` describes the manifest's shape, and
 * keeping it stable is what lets a newer build still parse an older manifest
 * well enough to reclaim the keys it named. Bumping `v` instead would make the
 * old manifest unreadable and strand every key in it.
 */
// 3: bucket hashes are sha256. 2: chunk keys carry the bucket's content hash.
// 1 addressed them by index alone. A bucket written under an earlier layout is
// unreachable under a later one, which is precisely why the mismatch has to
// force a full rewrite instead of a skip.
const VECTOR_LAYOUT = 3;

type VectorBucketManifest = {
  v: 2;
  layout: number;
  buckets: number;
  chunkChars: number;
  shards: Record<string, VectorBucketEntry>;
  // Keys superseded by this manifest but not yet deleted. Published *with* the
  // manifest so the work survives a crash: deletes run after the publish, and
  // dying partway would otherwise strand the remainder with nothing able to
  // name them. The next save drains whatever is left.
  reclaim?: Array<{ scope: string; key: string }>;
};

// `layout` and `chunkChars` are not required here on purpose. A manifest
// missing them simply fails the layout comparison, which triggers a full
// rewrite and a full reclaim — the correct, self-healing response — whereas
// rejecting the manifest outright would strand the keys it names.
function isVectorBucketManifest(value: unknown): value is VectorBucketManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VectorBucketManifest>;
  return (
    candidate.v === 2 &&
    Number.isInteger(candidate.buckets) &&
    (candidate.buckets as number) >= 1 &&
    !!candidate.shards &&
    typeof candidate.shards === "object"
  );
}

function isValidBucketEntry(value: unknown): value is VectorBucketEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VectorBucketEntry>;
  // chunks is the loop bound for both reclaim walks, so it needs a ceiling and
  // not just an integer check. Number.isInteger(1e9) is true, and a single
  // poisoned manifest field would otherwise queue a billion deletes. The cap is
  // deliberately far above any real bucket: at the default 2M chunkChars this
  // still allows a 20 GB bucket.
  return (
    typeof candidate.hash === "string" &&
    candidate.hash.length > 0 &&
    Number.isInteger(candidate.chunks) &&
    (candidate.chunks as number) >= 1 &&
    (candidate.chunks as number) <= MAX_BUCKET_CHUNKS
  );
}

function vectorBucketKey(bucket: number): string {
  return `b${String(bucket).padStart(4, "0")}`;
}

/**
 * Chunk keys carry the bucket's content hash, so a bucket's bytes are never
 * overwritten in place.
 *
 * This is what makes a torn write survivable. Writing in place looks safe
 * because the manifest is published last, but it is not: the half-written
 * bucket no longer matches the hash the *old* manifest recorded, load drops it,
 * and nothing restores it — rebuild is gated on the BM25 index being empty
 * (src/index.ts, src/functions/search.ts), never on the vector index. The next
 * save then serialises the index without those vectors and persists the loss.
 *
 * Addressing by content instead means the old bucket stays readable until the
 * new manifest names the new one, so a save that dies partway loses nothing.
 *
 * The 12 characters must be raw hex. A prefixed identifier would spend some of
 * them on a constant and leave fewer distinguishing bits than the key needs.
 */
function vectorChunkKey(
  bucketKey: string,
  hash: string,
  chunk: number,
): string {
  return `${bucketKey}:${hash.slice(0, 12)}:${String(chunk).padStart(5, "0")}`;
}

function isReclaimTarget(
  value: unknown,
): value is { scope: string; key: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { scope?: unknown; key?: unknown };
  return (
    typeof candidate.scope === "string" &&
    candidate.scope.length > 0 &&
    typeof candidate.key === "string" &&
    candidate.key.length > 0
  );
}

function bucketChunkKeys(bucketKey: string, entry: VectorBucketEntry): string[] {
  const keys: string[] = [];
  for (let i = 0; i < entry.chunks; i++) {
    keys.push(vectorChunkKey(bucketKey, entry.hash, i));
  }
  return keys;
}

// The hash of a bucket body. This one IS a content check — a collision means a
// changed bucket is silently never persisted — so it must not be the 32-bit
// hash used for bucket assignment.
const PUBLISHED_BUCKET_HASH = "sha256";

/**
 * Every hash a stored bucket may legitimately carry, published one first.
 *
 * The set a load accepts is deliberately wider than the one a save publishes.
 * A bucket's chunk keys are derived from the hash the manifest records, so a
 * build that only accepts its own hash finds every chunk and then rejects every
 * one of them — and a rejected bucket cannot be rewritten, because its contents
 * never reach memory to be re-serialised. Widening the accepted set is what
 * turns a change of published hash into an ordinary rewrite, and it is also
 * what lets a rollback read a store the newer build wrote.
 */
const ACCEPTED_BUCKET_HASHES = [PUBLISHED_BUCKET_HASH, "sha1"];

function contentHash(value: string): string {
  return createHash(PUBLISHED_BUCKET_HASH).update(value).digest("hex");
}

function bucketBodyMatches(body: string, expected: string): boolean {
  return ACCEPTED_BUCKET_HASHES.some(
    (algorithm) => createHash(algorithm).update(body).digest("hex") === expected,
  );
}

type IndexPersistenceOptions = {
  shardChars?: number;
  createGeneration?: () => string;
  vectorBuckets?: number;
};

function vectorBucketCount(options: IndexPersistenceOptions): number {
  const configured = options.vectorBuckets;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return DEFAULT_VECTOR_BUCKETS;
  }
  const whole = Math.floor(configured);
  return whole >= 1 ? whole : DEFAULT_VECTOR_BUCKETS;
}

function shardChars(options: IndexPersistenceOptions): number {
  const configured = options.shardChars;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return DEFAULT_INDEX_SHARD_CHARS;
  }
  const wholeChars = Math.floor(configured);
  return wholeChars >= 1 ? wholeChars : DEFAULT_INDEX_SHARD_CHARS;
}

function createIndexGeneration(): string {
  return generateId("idx");
}

function statePath(scope: string, key: string): string {
  return `${scope}/${key}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isValidShardDescriptor(
  shard: unknown,
): shard is IndexShardManifest["shards"][number] {
  if (!shard || typeof shard !== "object") return false;
  const candidate = shard as { scope?: unknown; key?: unknown; chars?: unknown };
  return (
    typeof candidate.scope === "string" &&
    candidate.scope.length > 0 &&
    typeof candidate.key === "string" &&
    candidate.key.length > 0 &&
    Number.isInteger(candidate.chars) &&
    candidate.chars >= 0
  );
}

export class IndexPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFailureLogAt = 0;
  /**
   * Set when a vector load could not read everything the manifest named.
   *
   * `.catch(() => null)` on a read makes "I could not read this" look identical
   * to "this does not exist", and reclaim treats absence as authority to
   * delete. One timed-out read at boot would otherwise leave the in-memory
   * index short, and the next save would serialise that gap and permanently
   * delete the buckets behind it. While this is set, save preserves every
   * unread bucket instead of reclaiming it.
   */
  private vectorLoadIncomplete = false;
  /**
   * Set when every bucket the manifest named failed its content check.
   *
   * Unlike a failed read, this does not heal on its own: the bytes are intact
   * and the keys are reachable, but no later load can verify them either. The
   * in-memory index stays empty, so save has nothing to publish and preserves
   * the manifest untouched — bytes and manifest in perfect agreement, vectors
   * unreadable forever. Nothing else notices, because rebuild is gated on the
   * BM25 index being empty and BM25 loaded fine. Reported so the caller can
   * rebuild, which is the only thing that ends this state.
   */
  private vectorLoadRejected = false;

  constructor(
    private kv: StateKV,
    private bm25: SearchIndex,
    private vector: VectorIndex | null,
    private options: IndexPersistenceOptions = {},
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
    // Vectors first. This is the save that has been failing in production — it
    // is the larger of the two and it runs second, so a BM25 save that consumes
    // the engine's budget starves it. Going first also makes a vector delete
    // durable before anything else can get in the way, which is what
    // flushIndexSave is awaited for on the delete paths.
    //
    // Each index gets its own try. One try around both would let a failure in
    // whichever runs first stop the other from persisting at all — harmless
    // when BM25 led and vectors trailed, but reversing the order without this
    // would make a vector failure silently block BM25 too.
    if (this.vector) {
      try {
        await this.saveVectorBuckets(this.vector);
      } catch (err) {
        this.logFailure(err);
      }
    }
    try {
      await this.saveBm25Index(this.bm25.serialize());
    } catch (err) {
      this.logFailure(err);
    }
  }

  async load(): Promise<{
    bm25: SearchIndex | null;
    vector: VectorIndex | null;
    vectorRejected: boolean;
  }> {
    let bm25: SearchIndex | null = null;
    let vector: VectorIndex | null = null;

    const bm25Data = await this.loadBm25Data();
    if (bm25Data && typeof bm25Data === "string") {
      bm25 = SearchIndex.deserialize(bm25Data);
    }

    // v2 (bucketed) is read directly into an index; the v1 offset-chunked
    // path still exists so an upgrade loses nothing and a downgrade is only a
    // rebuild, not data loss.
    vector = await this.loadVectorBuckets();
    if (!vector) {
      const vecData = await this.loadVectorData();
      if (vecData && typeof vecData === "string") {
        vector = VectorIndex.deserialize(vecData);
      }
    }

    return { bm25, vector, vectorRejected: this.vectorLoadRejected };
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

  private async saveBm25Index(serialized: string): Promise<void> {
    await this.saveShardedIndex(
      serialized,
      BM25_MANIFEST_KEY,
      BM25_KEY,
      BM25_SHARD_SCOPE_PREFIX,
    );
  }

  /**
   * Persist the vector index as fixed, independently-addressed buckets,
   * writing only the buckets whose contents actually changed.
   *
   * Replaces an offset-chunked format that was O(entire corpus) per change;
   * see the commit message for the production measurements.
   *
   * Cross-bucket atomicity is deliberately given up here. It buys nothing
   * today, because the atomic save never completes. Recovery is convergent
   * instead: a bucket written before a crash disagrees with the manifest that
   * was never published, so the next save sees the hash mismatch and rewrites
   * it. Vectors are immutable per obsId, so a surviving older bucket is still
   * correct rather than stale.
   */
  private async saveVectorBuckets(vector: VectorIndex): Promise<void> {
    // Deliberately unguarded. Swallowing a read failure here would report "no
    // previous manifest", which is indistinguishable from a genuinely absent
    // one — and that mistake strands the entire previous generation, because
    // the manifest is the only thing that can name it. One transient engine
    // timeout would be enough. Let it throw; runSave logs and the debounce
    // retries in seconds.
    const previous = await this.kv.get<unknown>(
      KV.bm25Index,
      VECTOR_MANIFEST_KEY,
    );
    const buckets = vectorBucketCount(this.options);
    const chunkChars = shardChars(this.options);

    const previousV2 = isVectorBucketManifest(previous) ? previous : null;

    // Every input that decides *where* a vector's bytes live. If any of them
    // moved, a matching content hash proves nothing — the bytes are the same
    // but their home is not — so nothing on disk may be skipped.
    const layoutMatches =
      !!previousV2 &&
      previousV2.layout === VECTOR_LAYOUT &&
      previousV2.buckets === buckets &&
      previousV2.chunkChars === chunkChars;

    // One map, used for two things: comparison (only when the layout matches)
    // and reclaim (always). Reclaim must see the previous manifest even on a
    // layout change, because those keys are exactly the ones about to become
    // unreachable, and nothing can enumerate them afterwards.
    const prior = previousV2?.shards ?? {};

    const nextShards: Record<string, VectorBucketEntry> = {};
    // Nothing is deleted until the manifest naming its replacement is live.
    // Deleting first is how a failed publish destroys data the still-current
    // manifest points at — the old manifest survives the failure, so anything
    // it names has to survive with it.
    const pendingDeletes: Array<{ scope: string; key: string }> = [];

    // Deletes a previous save published but died before finishing. Carrying
    // them forward is the whole reason the list is in the manifest.
    for (const target of previousV2?.reclaim ?? []) {
      if (isReclaimTarget(target)) pendingDeletes.push(target);
    }
    let written = 0;

    for (const [bucket, body] of vector.serializeBuckets(buckets)) {
      const bucketKey = vectorBucketKey(bucket);
      const hash = contentHash(body);
      const chunks = Math.max(1, Math.ceil(body.length / chunkChars));
      // The loader rejects anything above this cap, so publishing it would
      // hand the next boot a bucket it drops as corrupt while its bytes sit
      // on disk intact. Fail the save instead and keep the previous manifest
      // live: a small configured chunkChars is a misconfiguration, not data
      // loss, and the next save with a sane one succeeds.
      if (chunks > MAX_BUCKET_CHUNKS) {
        throw new Error(
          `vector bucket ${bucketKey} needs ${chunks} chunks, above MAX_BUCKET_CHUNKS`,
        );
      }
      const priorEntry = isValidBucketEntry(prior[bucketKey])
        ? prior[bucketKey]
        : undefined;
      nextShards[bucketKey] = { hash, chunks };
      if (layoutMatches && priorEntry?.hash === hash) continue;

      for (let i = 0; i < chunks; i++) {
        await this.kv.set(
          VECTOR_BUCKET_SCOPE,
          vectorChunkKey(bucketKey, hash, i),
          body.slice(i * chunkChars, (i + 1) * chunkChars),
        );
      }
      written++;
      // The bucket's old content lives under different keys entirely, so it is
      // still intact right now and is reclaimed only after the publish.
      if (priorEntry) {
        for (const key of bucketChunkKeys(bucketKey, priorEntry)) {
          pendingDeletes.push({ scope: VECTOR_BUCKET_SCOPE, key });
        }
      }
    }

    // Buckets the new manifest does not name: emptied since the last save, or
    // left behind by a layout change that remapped them elsewhere. Either way
    // this is the last moment anything can still name them.
    for (const [bucketKey, priorEntry] of Object.entries(prior)) {
      if (bucketKey in nextShards) continue;
      if (!isValidBucketEntry(priorEntry)) continue;
      if (this.vectorLoadIncomplete) {
        // This bucket is missing from memory because we could not read it, not
        // because anything was deleted. Keep naming it so it stays reachable
        // and a later clean load can recover it.
        nextShards[bucketKey] = priorEntry;
        continue;
      }
      for (const key of bucketChunkKeys(bucketKey, priorEntry)) {
        pendingDeletes.push({ scope: VECTOR_BUCKET_SCOPE, key });
      }
    }

    // One-time migration off the offset-chunked format. A v1 manifest names its
    // own shards, so this needs no enumeration — which matters, because
    // StateKV.list returns values, not keys, and cannot be used here.
    const legacy = previous as IndexShardManifest | null;
    if (legacy?.v === 1 && Array.isArray(legacy.shards)) {
      for (const shard of legacy.shards) {
        if (isValidShardDescriptor(shard)) {
          pendingDeletes.push({ scope: shard.scope, key: shard.key });
        }
      }
    }

    // Never delete a key the new manifest still names. Old and new keys can
    // collide legitimately: identical content re-chunked keeps the same bucket
    // and hash, so chunk 0's key is unchanged even though the old entry listed
    // more chunks. Reclaiming that entry blind would delete a bucket the
    // manifest is actively pointing at.
    const liveKeys = new Set<string>();
    for (const [bucketKey, entry] of Object.entries(nextShards)) {
      for (const key of bucketChunkKeys(bucketKey, entry)) liveKeys.add(key);
    }
    const reclaimTargets = pendingDeletes.filter(
      (target) =>
        !(target.scope === VECTOR_BUCKET_SCOPE && liveKeys.has(target.key)),
    );

    // Genuinely nothing to do. Republishing an identical manifest every
    // debounce costs a write and two audit rows for no change.
    if (written === 0 && reclaimTargets.length === 0 && previousV2) return;

    const nextManifest: VectorBucketManifest = {
      v: 2,
      layout: VECTOR_LAYOUT,
      buckets,
      chunkChars,
      shards: nextShards,
      ...(reclaimTargets.length > 0 ? { reclaim: reclaimTargets } : {}),
    };
    await this.kv.set<VectorBucketManifest>(
      KV.bm25Index,
      VECTOR_MANIFEST_KEY,
      nextManifest,
    );

    // Safe from here: the new manifest is live and names none of these.
    const undeleted: Array<{ scope: string; key: string }> = [];
    for (const target of reclaimTargets) {
      const gone = await this.deleteKey(
        target.scope,
        target.key,
        "vector_bucket_reclaim",
      );
      if (!gone) undeleted.push(target);
    }
    if (reclaimTargets.length > 0) {
      // Record the drain, keeping anything that did not actually go. Clearing
      // the list on a failed delete would strand those keys permanently, and
      // not clearing it at all would let the list grow without bound.
      const { reclaim: _drained, ...rest } = nextManifest;
      await this.kv.set<VectorBucketManifest>(KV.bm25Index, VECTOR_MANIFEST_KEY, {
        ...rest,
        ...(undeleted.length > 0 ? { reclaim: undeleted } : {}),
      });
    }

    await this.auditIndexPersistence(
      "vector_bucket_publish",
      [statePath(KV.bm25Index, VECTOR_MANIFEST_KEY)],
      {
        manifestKey: VECTOR_MANIFEST_KEY,
        buckets,
        written,
        unchanged: Object.keys(nextShards).length - written,
        reclaimed: reclaimTargets.length,
      },
    );

    await this.deleteKey(KV.bm25Index, VECTOR_KEY, "legacy_cleanup");
  }

  private async saveShardedIndex(
    serialized: string,
    manifestKey: string,
    legacyKey: string,
    scopePrefix: string,
  ): Promise<void> {
    const previous = await this.kv
      .get<IndexShardManifest>(KV.bm25Index, manifestKey)
      .catch(() => null);
    const generation =
      this.options.createGeneration?.() ?? createIndexGeneration();
    const chunkChars = shardChars(this.options);
    const shards: IndexShardManifest["shards"] = [];
    const chunks: string[] = [];

    for (let offset = 0; offset < serialized.length; offset += chunkChars) {
      const shardIndex = shards.length;
      const scope = `${scopePrefix}${generation}:${String(shardIndex).padStart(
        5,
        "0",
      )}`;
      const chunk = serialized.slice(offset, offset + chunkChars);
      shards.push({ scope, key: INDEX_SHARD_KEY, chars: chunk.length });
      chunks.push(chunk);
    }

    const writeResults = await Promise.allSettled(
      shards.map(async (shard, index) => {
        const chunk = chunks[index] ?? "";
        await this.kv.set(shard.scope, shard.key, chunk);
        await this.auditIndexPersistence("shard_write", [
          statePath(shard.scope, shard.key),
        ], {
          scope: shard.scope,
          key: shard.key,
          manifestKey,
          generation,
          chars: chunk.length,
        });
      }),
    );
    const failedWrite = writeResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failedWrite) {
      await this.deleteShards(shards, "shard_write_rollback");
      throw failedWrite.reason;
    }

    const nextManifest: IndexShardManifest = {
      v: 1,
      generation,
      shards,
      chars: serialized.length,
    };
    try {
      await this.kv.set<IndexShardManifest>(
        KV.bm25Index,
        manifestKey,
        nextManifest,
      );
      await this.auditIndexPersistence("manifest_publish", [
        statePath(KV.bm25Index, manifestKey),
      ], {
        manifestKey,
        generation,
        chars: serialized.length,
        shards: shards.length,
        result: "committed",
      });
    } catch (err) {
      if (await this.isManifestPublished(manifestKey, nextManifest)) {
        await this.auditIndexPersistence("manifest_publish", [
          statePath(KV.bm25Index, manifestKey),
        ], {
          manifestKey,
          generation,
          chars: serialized.length,
          shards: shards.length,
          result: "committed_after_error",
          error: errorMessage(err),
        });
      } else {
        await this.deleteShards(shards, "manifest_publish_rollback");
      }
      throw err;
    }

    await this.deleteKey(KV.bm25Index, legacyKey, "legacy_cleanup");
    if (previous?.v === 1 && Array.isArray(previous.shards)) {
      const currentShardIds = new Set(
        shards.map((shard) => `${shard.scope}\0${shard.key}`),
      );
      for (const shard of previous.shards) {
        if (currentShardIds.has(`${shard.scope}\0${shard.key}`)) continue;
        await this.deleteShards([shard], "previous_generation_cleanup");
      }
    }
  }

  private async auditIndexPersistence(
    action: string,
    targetIds: string[],
    details: Record<string, unknown>,
  ): Promise<void> {
    await safeAudit(
      this.kv,
      "index_persist",
      INDEX_PERSISTENCE_FUNCTION_ID,
      targetIds,
      { action, ...details },
    );
  }

  /** Returns whether the key is actually gone. Callers that track reclaim work
   * must keep a failed delete queued rather than reporting it done. */
  private async deleteKey(
    scope: string,
    key: string,
    reason: string,
  ): Promise<boolean> {
    let result = "deleted";
    let error: string | undefined;
    try {
      await this.kv.delete(scope, key);
    } catch (err) {
      result = "failed";
      error = errorMessage(err);
    }
    await this.auditIndexPersistence("delete", [statePath(scope, key)], {
      scope,
      key,
      reason,
      result,
      error,
    });
    return result === "deleted";
  }

  private async deleteShards(
    shards: IndexShardManifest["shards"],
    reason: string,
  ): Promise<void> {
    for (const shard of shards) {
      await this.deleteKey(shard.scope, shard.key, reason);
    }
  }

  private async isManifestPublished(
    manifestKey: string,
    expected: IndexShardManifest,
  ): Promise<boolean> {
    const published = await this.kv
      .get<IndexShardManifest>(KV.bm25Index, manifestKey)
      .catch(() => null);
    if (
      published?.v !== 1 ||
      published.generation !== expected.generation ||
      published.chars !== expected.chars ||
      !Array.isArray(published.shards) ||
      published.shards.length !== expected.shards.length
    ) {
      return false;
    }
    return published.shards.every((shard, index) => {
      const expectedShard = expected.shards[index];
      if (!expectedShard) return false;
      return (
        shard.scope === expectedShard.scope &&
        shard.key === expectedShard.key &&
        shard.chars === expectedShard.chars
      );
    });
  }

  private async loadBm25Data(): Promise<string | null> {
    return this.loadShardedData(BM25_KEY, BM25_MANIFEST_KEY, "BM25");
  }

  private async loadVectorData(): Promise<string | null> {
    return this.loadShardedData(VECTOR_KEY, VECTOR_MANIFEST_KEY, "vector");
  }

  /**
   * Read the bucketed vector index, or null when the store is still on the v1
   * format so the caller can fall back.
   *
   * A missing or unreadable bucket is skipped rather than failing the whole
   * load. Unlike an offset-chunked shard — where a hole corrupts the single
   * JSON document and the index must be rejected wholesale — each bucket is an
   * independent document, so losing one costs exactly the vectors it held and
   * the next save rewrites it.
   */
  private async loadVectorBuckets(): Promise<VectorIndex | null> {
    this.vectorLoadRejected = false;
    let manifest: unknown;
    try {
      manifest = await this.kv.get<unknown>(KV.bm25Index, VECTOR_MANIFEST_KEY);
    } catch (err) {
      // A read that failed is not a store that is empty. Falling through to the
      // v1 path here finds nothing (v1 was migrated away), load returns a null
      // vector index, and the next save reclaims every bucket the manifest
      // still names. One transient timeout, whole index gone.
      logger.warn("index persistence: vector manifest read failed", {
        message: errorMessage(err),
      });
      this.vectorLoadIncomplete = true;
      return new VectorIndex();
    }
    if (!isVectorBucketManifest(manifest)) return null;

    const entries = Object.entries(manifest.shards);
    const index = new VectorIndex();
    let missing = 0;
    let corrupt = 0;
    for (const [bucketKey, entry] of entries) {
      if (!isValidBucketEntry(entry)) {
        corrupt++;
        continue;
      }
      const parts: string[] = [];
      let complete = true;
      for (let i = 0; i < entry.chunks; i++) {
        const chunk = await this.kv
          .get<string>(
            VECTOR_BUCKET_SCOPE,
            vectorChunkKey(bucketKey, entry.hash, i),
          )
          .catch(() => null);
        if (typeof chunk !== "string") {
          complete = false;
          break;
        }
        parts.push(chunk);
      }
      if (!complete) {
        missing++;
        continue;
      }
      const body = parts.join("");
      // Verifying the hash is what makes a torn write safe. A bucket half
      // rewritten before a crash reassembles into invalid JSON; without this
      // check it would be silently parsed as empty and its vectors lost with
      // no signal. Skipping it instead costs only that bucket, and the next
      // save rewrites it because the hash still disagrees.
      if (!bucketBodyMatches(body, entry.hash)) {
        corrupt++;
        continue;
      }
      index.mergeSerialized(body);
    }
    // Deliberately narrower than `missing`. A read that failed may succeed on
    // the next boot, and the existing preserve-and-wait policy covers it. A
    // content check that failed will fail identically every time.
    this.vectorLoadRejected = entries.length > 0 && corrupt === entries.length;
    if (missing > 0 || corrupt > 0) {
      // Anything not read is still on disk and still referenced. Mark the load
      // incomplete so the next save preserves those buckets rather than
      // treating their absence from memory as a deletion.
      this.vectorLoadIncomplete = true;
      logger.warn("index persistence: vector buckets skipped", {
        missing,
        corrupt,
        total: entries.length,
      });
    }
    return index;
  }

  private async loadShardedData(
    legacyKey: string,
    manifestKey: string,
    label: string,
  ): Promise<string | null> {
    const manifest = await this.readIndexValue<IndexShardManifest>(
      KV.bm25Index,
      manifestKey,
      label,
      "manifest",
    );
    if (!manifest.ok) return null;
    // #797: some iii-state adapters return `undefined` (not `null`) for
    // a missing key. The previous `value !== null` check passed
    // undefined through to loadManifestData, which then crashed on
    // `manifest.v` with TypeError. Treat both null and undefined as
    // "no manifest" and fall through to the legacy path. The shape
    // check stays so a malformed-but-present row still fails closed.
    // A bucketed manifest is handled by loadVectorBuckets, not here. Without
    // this, a transient manifest-read failure that sends the vector load down
    // the v1 path would report a perfectly valid manifest as invalid — the
    // wrong signal to hand an operator during exactly the incident this format
    // exists to fix.
    if (isVectorBucketManifest(manifest.value)) return null;
    if (
      manifest.value != null &&
      typeof manifest.value === "object"
    ) {
      return this.loadManifestData(manifest.value, label);
    }

    const legacy = await this.readIndexValue<string>(
      KV.bm25Index,
      legacyKey,
      label,
      "legacy",
    );
    if (!legacy.ok) return null;
    if (legacy.value && typeof legacy.value === "string") return legacy.value;
    return null;
  }

  private async readIndexValue<T>(
    scope: string,
    key: string,
    label: string,
    source: "manifest" | "legacy",
  ): Promise<{ ok: true; value: T | null } | { ok: false }> {
    try {
      return { ok: true, value: await this.kv.get<T>(scope, key) };
    } catch (err) {
      logger.warn(`index persistence: ${label} ${source} read failed`, {
        scope,
        key,
        message: errorMessage(err),
      });
      return { ok: false };
    }
  }

  private async loadManifestData(
    manifest: IndexShardManifest,
    label: string,
  ): Promise<string | null> {
    if (
      manifest.v !== 1 ||
      !Array.isArray(manifest.shards) ||
      manifest.shards.length === 0 ||
      !Number.isInteger(manifest.chars) ||
      manifest.chars < 0
    ) {
      logger.warn(`index persistence: ${label} shard manifest invalid`);
      return null;
    }
    for (const shard of manifest.shards) {
      if (!isValidShardDescriptor(shard)) {
        logger.warn(`index persistence: ${label} shard manifest invalid`);
        return null;
      }
    }
    const loadedShards = await Promise.all(
      manifest.shards.map(async (shard) => ({
        shard,
        chunk: await this.kv.get<string>(shard.scope, shard.key).catch(() => null),
      })),
    );
    const chunks: string[] = [];
    let chars = 0;
    for (const { shard, chunk } of loadedShards) {
      if (typeof chunk !== "string") {
        logger.warn(`index persistence: ${label} shard missing`, {
          scope: shard.scope,
          key: shard.key,
        });
        return null;
      }
      if (chunk.length !== shard.chars) {
        logger.warn(`index persistence: ${label} shard length mismatch`, {
          scope: shard.scope,
          key: shard.key,
          expected: shard.chars,
          actual: chunk.length,
        });
        return null;
      }
      chunks.push(chunk);
      chars += chunk.length;
    }
    if (chars !== manifest.chars) {
      logger.warn(`index persistence: ${label} total length mismatch`, {
        expected: manifest.chars,
        actual: chars,
      });
      return null;
    }
    return chunks.join("");
  }
}
