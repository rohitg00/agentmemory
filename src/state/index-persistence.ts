import { SearchIndex } from "./search-index.js";
import {
  LocalVectorStore,
  type PersistableLocalVectorStore,
} from "./vector-store.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import {
  BM25_LEGACY_KEY,
  BM25_MANIFEST_KEY,
  BM25_SHARD_SCOPE_PREFIX,
  INDEX_SHARD_KEY,
  REBUILD_BARRIER_KEY,
  VECTOR_FALLBACK_MANIFEST_KEY,
  VECTOR_LEGACY_KEY,
  VECTOR_MANIFEST_KEY,
  VECTOR_SHARD_SCOPE_PREFIX,
} from "./index-persistence-layout.js";
import { logger } from "../logger.js";
import { safeAudit } from "../functions/audit.js";

const DEFAULT_DEBOUNCE_MS = 60_000;
const FAILURE_LOG_THROTTLE_MS = 60_000;
const INDEX_PERSISTENCE_FUNCTION_ID = "mem::index-persistence";
const DEFAULT_INDEX_SHARD_CHARS = 2_000_000;
const DEFAULT_SHARD_IO_CONCURRENCY = 4;
const INDEX_GENERATION_BANKS = ["bank-a", "bank-b"] as const;

type IndexShardManifest = {
  v: 1;
  generation?: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
  chars: number;
  retired?: Array<IndexShardGenerationRef>;
};

type IndexShardGenerationRef = {
  generation: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
};

type RebuildBarrier = {
  v: 1;
  startedAt: string;
};

type IndexPersistenceOptions = {
  shardChars?: number;
  shardIoConcurrency?: number;
  createGeneration?: () => string;
  debounceMs?: number;
};

function debounceMs(options: IndexPersistenceOptions): number {
  const configured = options.debounceMs;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return DEFAULT_DEBOUNCE_MS;
  }
  const wholeMilliseconds = Math.floor(configured);
  return wholeMilliseconds >= 1 ? wholeMilliseconds : DEFAULT_DEBOUNCE_MS;
}

function shardChars(options: IndexPersistenceOptions): number {
  const configured = options.shardChars;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return DEFAULT_INDEX_SHARD_CHARS;
  }
  const wholeChars = Math.floor(configured);
  return wholeChars >= 1 ? wholeChars : DEFAULT_INDEX_SHARD_CHARS;
}

function shardIoConcurrency(options: IndexPersistenceOptions): number {
  const configured = options.shardIoConcurrency;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return DEFAULT_SHARD_IO_CONCURRENCY;
  }
  const wholeConcurrency = Math.floor(configured);
  return wholeConcurrency >= 1 ? wholeConcurrency : DEFAULT_SHARD_IO_CONCURRENCY;
}

function isBoundedGeneration(generation: string | undefined): boolean {
  return INDEX_GENERATION_BANKS.some((bank) => bank === generation);
}

function nextBoundedGeneration(
  previous: IndexShardManifest | null,
): (typeof INDEX_GENERATION_BANKS)[number] {
  return previous?.generation === INDEX_GENERATION_BANKS[0]
    ? INDEX_GENERATION_BANKS[1]
    : INDEX_GENERATION_BANKS[0];
}

function statePath(scope: string, key: string): string {
  return `${scope}/${key}`;
}

export function shouldRebuildPersistedIndexes(options: {
  bm25Size: number;
  vectorConfigured: boolean;
  vectorLoaded: boolean;
  vectorFallbackUsed: boolean;
}): boolean {
  return (
    options.bm25Size === 0 ||
    (options.vectorConfigured &&
      (!options.vectorLoaded || options.vectorFallbackUsed))
  );
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
    typeof candidate.chars === "number" &&
    Number.isInteger(candidate.chars) &&
    candidate.chars >= 0
  );
}

function isValidShardManifest(value: unknown): value is IndexShardManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<IndexShardManifest>;
  return (
    manifest.v === 1 &&
    Array.isArray(manifest.shards) &&
    manifest.shards.length > 0 &&
    manifest.shards.every(isValidShardDescriptor) &&
    Number.isInteger(manifest.chars) &&
    (manifest.chars ?? -1) >= 0
  );
}

export class IndexPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight: Promise<boolean> | null = null;
  private saveRequested = false;
  private rebuilding = false;
  private vectorFallbackUsed = false;
  private lastFailureLogAt = 0;

  constructor(
    private kv: StateKV,
    private bm25: SearchIndex,
    private vector: PersistableLocalVectorStore | null,
    private options: IndexPersistenceOptions = {},
  ) {}

  scheduleSave(): void {
    this.saveRequested = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // A write that arrives while a snapshot is already being persisted is
    // intentionally coalesced. The active generation owns the state adapter
    // until it settles; a new quiet-period debounce window is armed afterwards
    // for the latest in-memory index. Large indexes can take minutes to
    // serialize, so immediately repeating the full snapshot for every live
    // observation would turn sustained agent activity into a permanent save
    // loop. Raw observations are already durable, and explicit save() still
    // flushes the latest index during graceful shutdown.
    if (this.rebuilding || this.saveInFlight) {
      this.timer = null;
      return;
    }
    this.armScheduledSave();
  }

  private armScheduledSave(): void {
    if (
      this.timer ||
      this.rebuilding ||
      this.saveInFlight ||
      !this.saveRequested
    ) return;
    // setTimeout discards the returned promise, so any rejection inside
    // save() would surface as unhandledRejection and crash the process
    // under sustained iii-engine write timeouts (issue #204). Funnel
    // rejections through logFailure() instead.
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.runScheduledSave();
      } catch (err) {
        this.logFailure(err);
      }
    }, debounceMs(this.options));
  }

  async save(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Explicit flushes (delete durability and graceful shutdown) must include
    // the state visible at the call boundary. If another snapshot is active,
    // join it and then persist at most one coalesced follow-up generation.
    this.saveRequested = true;
    // Raw observations/memories are already durable. Publishing a derived
    // snapshot while a full rebuild is still walking those rows would make a
    // partial index look authoritative after the next restart. Keep the
    // request coalesced and let completeRebuild() flush the rebuilt index.
    if (this.rebuilding) return;
    const activeAtCallBoundary = this.saveInFlight;
    if (activeAtCallBoundary) await activeAtCallBoundary;
    if (this.saveRequested) await this.runOneSave();
    if (this.saveRequested) this.armScheduledSave();
  }

  private async runScheduledSave(): Promise<void> {
    if (this.rebuilding) return;
    if (this.saveInFlight) {
      await this.saveInFlight;
    }
    if (this.saveRequested) {
      await this.runOneSave();
    }
    if (this.saveRequested) this.armScheduledSave();
  }

  private async runOneSave(force = false): Promise<boolean> {
    if (this.saveInFlight) {
      return this.saveInFlight;
    }
    if (!force && !this.saveRequested) return true;
    this.saveRequested = false;
    const operation = this.persistCurrentIndexes();
    this.saveInFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.saveInFlight === operation) this.saveInFlight = null;
    }
  }

  private async persistCurrentIndexes(): Promise<boolean> {
    try {
      await this.saveBm25Index(this.bm25.serialize());
      if (this.vector) {
        await this.saveVectorIndex(this.vector.serialize());
      }
      return true;
    } catch (err) {
      this.logFailure(err);
      return false;
    }
  }

  /**
   * Mark a full index rebuild before callers clear or mutate either index.
   * The durable marker makes a crash, failed source read, or failed snapshot
   * fail closed on the next boot: load() ignores all snapshots until a full
   * rebuild has committed both BM25 and vector generations.
   */
  async beginRebuild(): Promise<void> {
    if (this.rebuilding) return;
    this.rebuilding = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      if (this.saveInFlight) await this.saveInFlight;
      const barrier: RebuildBarrier = {
        v: 1,
        startedAt: new Date().toISOString(),
      };
      await this.kv.set(KV.bm25Index, REBUILD_BARRIER_KEY, barrier);
      await this.auditIndexPersistence(
        "rebuild_begin",
        [statePath(KV.bm25Index, REBUILD_BARRIER_KEY)],
        barrier,
      );
    } catch (err) {
      this.rebuilding = false;
      if (this.saveRequested) this.armScheduledSave();
      throw err;
    }
  }

  /**
   * Publish the rebuilt indexes as one fail-closed logical operation. The
   * BM25 and vector manifests may commit separately, but the rebuild barrier
   * remains authoritative until both succeed. A save request arriving during
   * the snapshot is retained for the normal quiet-period follow-up.
   */
  async completeRebuild(): Promise<boolean> {
    if (!this.rebuilding) {
      throw new Error("index persistence: rebuild has not been started");
    }
    const persisted = await this.runOneSave(true);
    if (!persisted) return false;

    try {
      let deleteError: unknown;
      try {
        await this.kv.delete(KV.bm25Index, REBUILD_BARRIER_KEY);
      } catch (err) {
        // Like manifest publication, state deletion can commit and then time
        // out at the transport boundary. Verify the authoritative row before
        // deciding that the barrier is still active.
        deleteError = err;
      }
      const remaining = await this.kv.get<RebuildBarrier>(
        KV.bm25Index,
        REBUILD_BARRIER_KEY,
      );
      if (remaining != null) {
        throw new Error(
          "rebuild barrier remained after delete" +
            (deleteError ? `: ${errorMessage(deleteError)}` : ""),
        );
      }
      await this.auditIndexPersistence(
        "rebuild_complete",
        [statePath(KV.bm25Index, REBUILD_BARRIER_KEY)],
        { result: "committed" },
      );
    } catch (err) {
      this.logFailure(err);
      return false;
    }

    this.rebuilding = false;
    if (this.saveRequested) this.armScheduledSave();
    return true;
  }

  async load(): Promise<{
    bm25: SearchIndex | null;
    vector: LocalVectorStore | null;
  }> {
    this.vectorFallbackUsed = false;
    let bm25: SearchIndex | null = null;
    let vector: LocalVectorStore | null = null;

    const barrier = await this.readIndexValue<RebuildBarrier>(
      KV.bm25Index,
      REBUILD_BARRIER_KEY,
      "rebuild barrier",
      "manifest",
    );
    // A failed barrier read is indistinguishable from an in-progress rebuild.
    // Likewise, any present value (including a legacy/malformed marker) must
    // suppress snapshots: accepting them could silently restore partial data.
    if (!barrier.ok || barrier.value != null) {
      if (barrier.ok) {
        logger.warn(
          "index persistence: rebuild barrier present; ignoring persisted indexes",
        );
      }
      return { bm25: null, vector: null };
    }

    const bm25Data = await this.loadBm25Data();
    if (bm25Data && typeof bm25Data === "string") {
      bm25 = SearchIndex.deserialize(bm25Data);
    }

    const vecData = await this.loadVectorData();
    if (vecData && typeof vecData === "string") {
      vector = LocalVectorStore.deserialize(vecData);
    }

    await this.reclaimOrphanedShardScopes();
    return { bm25, vector };
  }

  get usedVectorFallback(): boolean {
    return this.vectorFallbackUsed;
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async reclaimOrphanedShardScopes(): Promise<void> {
    const manifestSpecs = [
      { key: BM25_MANIFEST_KEY, label: "BM25" },
      { key: VECTOR_MANIFEST_KEY, label: "vector" },
      { key: VECTOR_FALLBACK_MANIFEST_KEY, label: "vector fallback" },
    ] as const;

    try {
      const manifestReads = await Promise.all(
        manifestSpecs.map(async (spec) => ({
          spec,
          result: await this.readIndexValue<IndexShardManifest>(
            KV.bm25Index,
            spec.key,
            spec.label,
            "manifest",
          ),
        })),
      );
      if (manifestReads.some(({ result }) => !result.ok)) {
        logger.warn(
          "index persistence: orphan shard reclamation skipped after manifest read failure",
        );
        return;
      }

      const referencedScopes = new Set<string>();
      for (const { spec, result } of manifestReads) {
        if (!result.ok || result.value == null) continue;
        if (!isValidShardManifest(result.value)) {
          logger.warn(
            "index persistence: orphan shard reclamation skipped for invalid manifest",
            { manifestKey: spec.key },
          );
          return;
        }
        for (const shard of result.value.shards) {
          referencedScopes.add(shard.scope);
        }
      }

      if (typeof this.kv.listGroups !== "function") return;
      const groups = await this.kv.listGroups();
      const orphanScopes = groups.filter(
        (scope) =>
          (scope.startsWith(BM25_SHARD_SCOPE_PREFIX) ||
            scope.startsWith(VECTOR_SHARD_SCOPE_PREFIX)) &&
          !referencedScopes.has(scope),
      );
      if (orphanScopes.length === 0) return;

      const failures: Array<{ scope: string; error: string }> = [];
      let acknowledged = 0;
      const concurrency = shardIoConcurrency(this.options);
      for (let offset = 0; offset < orphanScopes.length; offset += concurrency) {
        const scopes = orphanScopes.slice(offset, offset + concurrency);
        const results = await Promise.allSettled(
          scopes.map((scope) => this.kv.delete(scope, INDEX_SHARD_KEY)),
        );
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            acknowledged++;
          } else {
            failures.push({
              scope: scopes[index] ?? "unknown",
              error: errorMessage(result.reason),
            });
          }
        });
      }

      logger.info("index persistence: reclaimed orphaned shard scopes", {
        attempted: orphanScopes.length,
        acknowledged,
        failed: failures.length,
      });
      await this.auditIndexPersistence(
        "orphan_shard_cleanup",
        [statePath(KV.bm25Index, "orphan-shards")],
        {
          attempted: orphanScopes.length,
          acknowledged,
          failed: failures.length,
          failures: failures.slice(0, 5),
        },
      );
    } catch (err) {
      logger.warn("index persistence: orphan shard reclamation failed", {
        message: errorMessage(err),
      });
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
      BM25_LEGACY_KEY,
      BM25_SHARD_SCOPE_PREFIX,
    );
  }

  private async saveVectorIndex(serialized: string): Promise<void> {
    await this.saveShardedIndex(
      serialized,
      VECTOR_MANIFEST_KEY,
      VECTOR_LEGACY_KEY,
      VECTOR_SHARD_SCOPE_PREFIX,
      VECTOR_FALLBACK_MANIFEST_KEY,
    );
  }

  private async saveShardedIndex(
    serialized: string,
    manifestKey: string,
    legacyKey: string,
    scopePrefix: string,
    fallbackManifestKey?: string,
  ): Promise<void> {
    const previous = await this.kv
      .get<IndexShardManifest>(KV.bm25Index, manifestKey)
      .catch(() => null);
    const oldFallback = fallbackManifestKey
      ? await this.kv
          .get<IndexShardManifest>(KV.bm25Index, fallbackManifestKey)
          .catch(() => null)
      : null;
    const boundedGenerations = this.options.createGeneration === undefined;
    // Retired-generation tracking applies only to the primary (BM25) snapshot:
    // the vector path deliberately retains its prior generation as a fallback.
    const retiredTracking = boundedGenerations && !fallbackManifestKey;
    const generation = boundedGenerations
      ? nextBoundedGeneration(previous)
      : this.options.createGeneration!();
    // Generations retired one full publish cycle ago. Their shard files had
    // to survive an entire inter-save interval, so deleting them now cannot
    // race the async file-adapter durability the way deleting the
    // immediately-previous generation would. Overlapping scopes (same bank
    // rewritten by the incoming generation) are skipped, not deleted.
    const carriedRetired = (Array.isArray(previous?.retired)
      ? previous!.retired!
      : []
    ).filter((ref) => isBoundedGeneration(ref.generation));
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

    let failedWrite: PromiseRejectedResult | undefined;
    const concurrency = shardIoConcurrency(this.options);

    // Retire generations that have survived one full publish cycle. Scopes
    // the incoming generation just overwrote are skipped (already gone);
    // everything else is deleted here, one full cycle after it was
    // superseded, so async file durability cannot race the delete.
    const carriedDeleteFailures = new Set<string>();
    if (retiredTracking && carriedRetired.length > 0) {
      const currentScopes = new Set(shards.map((shard) => shard.scope));
      for (const ref of carriedRetired) {
        const staleShards = ref.shards.filter(
          (shard) => !currentScopes.has(shard.scope),
        );
        if (staleShards.length === 0) continue;
        const writeResults = await Promise.allSettled(
          staleShards.map((shard) =>
            this.kv.delete(shard.scope, shard.key),
          ),
        );
        writeResults.forEach((result, index) => {
          if (result.status === "rejected") {
            const shard = staleShards[index];
            carriedDeleteFailures.add(`${ref.generation}\0${shard!.scope}`);
          }
        });
      }
    }
    for (let offset = 0; offset < shards.length; offset += concurrency) {
      const writeResults = await Promise.allSettled(
        shards.slice(offset, offset + concurrency).map(async (shard, index) => {
          const chunk = chunks[offset + index] ?? "";
          await this.kv.set(shard.scope, shard.key, chunk);
        }),
      );
      failedWrite = writeResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failedWrite) break;
    }
    if (failedWrite) {
      await this.deleteShards(shards, "shard_write_rollback");
      throw failedWrite.reason;
    }
    await this.auditIndexPersistence(
      "generation_write",
      [this.generationTarget(shards)],
      {
        manifestKey,
        generation,
        chars: serialized.length,
        shards: shards.length,
        result: "written",
      },
    );

    const newlyRetired: IndexShardGenerationRef[] =
      retiredTracking &&
      previous?.v === 1 &&
      Array.isArray(previous.shards) &&
      isBoundedGeneration(previous.generation)
        ? [{ generation: previous.generation!, shards: previous.shards }]
        : [];

    const nextManifest: IndexShardManifest = {
      v: 1,
      generation,
      shards,
      chars: serialized.length,
    };
    const carriedStillMissing = (() => {
      if (!retiredTracking || carriedRetired.length === 0) return [];
      // Overwritten scopes are gone; acknowledged deletes are done. Only
      // shards whose delete was REJECTED stay listed so a later save retries.
      const writtenScopes = new Set(shards.map((shard) => shard.scope));
      return carriedRetired
        .map((ref) => ({
          generation: ref.generation,
          shards: ref.shards.filter(
            (shard) =>
              !writtenScopes.has(shard.scope) &&
              carriedDeleteFailures.has(
                `${ref.generation}\0${shard.scope}`,
              ),
          ),
        }))
        .filter((ref) => ref.shards.length > 0);
    })();
    if (newlyRetired.length + carriedStillMissing.length > 0) {
      nextManifest.retired = [...newlyRetired, ...carriedStillMissing];
    }

    // iii-state's file adapter can acknowledge a new scope before its file is
    // durable. Retain the prior vector generation for one complete publish
    // cycle so a fast shutdown cannot leave a manifest whose shards vanished
    // while the engine was exiting. BM25 generations are much larger, so this
    // two-generation policy is intentionally limited to the vector snapshot.
    // Under bounded bank alternation the incoming generation always targets
    // the bank the current fallback manifest references, so a crash mid
    // shard-write can tear the fallback copy while the primary manifest stays
    // intact. That failure mode is safe by construction: shard reads fail
    // closed on length mismatch and fall back to a full rebuild from durable
    // raw observations.
    let retainedPrevious: IndexShardManifest | null = null;
    if (
      fallbackManifestKey &&
      previous?.v === 1 &&
      Array.isArray(previous.shards) &&
      (await this.loadManifestData(previous, "vector previous")) !== null
    ) {
      try {
        await this.publishManifest(fallbackManifestKey, previous);
        retainedPrevious = previous;
      } catch (err) {
        await this.deleteShards(shards, "fallback_publish_rollback");
        throw err;
      }
    }

    try {
      await this.publishManifest(manifestKey, nextManifest);
    } catch (err) {
      await this.deleteShards(shards, "manifest_publish_rollback");
      throw err;
    }

    await this.deleteKey(KV.bm25Index, legacyKey, "legacy_cleanup");
    if (fallbackManifestKey) {
      if (
        retainedPrevious !== null &&
        oldFallback?.v === 1 &&
        Array.isArray(oldFallback.shards)
      ) {
        const retainedShardIds = new Set(
          [...shards, ...(retainedPrevious?.shards ?? [])].map(
            (shard) => `${shard.scope}\0${shard.key}`,
          ),
        );
        await this.deleteShards(
          oldFallback.shards.filter(
            (shard) =>
              !retainedShardIds.has(`${shard.scope}\0${shard.key}`),
          ),
          "fallback_generation_cleanup",
        );
      }
    } else if (
      previous?.v === 1 &&
      Array.isArray(previous.shards) &&
      (!boundedGenerations || !isBoundedGeneration(previous.generation))
    ) {
      const currentShardIds = new Set(
        shards.map((shard) => `${shard.scope}\0${shard.key}`),
      );
      await this.deleteShards(
        previous.shards.filter(
          (shard) => !currentShardIds.has(`${shard.scope}\0${shard.key}`),
        ),
        "previous_generation_cleanup",
      );
    }
  }

  private async publishManifest(
    manifestKey: string,
    manifest: IndexShardManifest,
  ): Promise<void> {
    try {
      await this.kv.set<IndexShardManifest>(
        KV.bm25Index,
        manifestKey,
        manifest,
      );
    } catch (err) {
      if (!(await this.isManifestPublished(manifestKey, manifest))) throw err;
      await this.auditIndexPersistence(
        "manifest_publish",
        [statePath(KV.bm25Index, manifestKey)],
        {
          manifestKey,
          generation: manifest.generation,
          chars: manifest.chars,
          shards: manifest.shards.length,
          result: "committed_after_error",
          error: errorMessage(err),
        },
      );
      return;
    }

    await this.auditIndexPersistence(
      "manifest_publish",
      [statePath(KV.bm25Index, manifestKey)],
      {
        manifestKey,
        generation: manifest.generation,
        chars: manifest.chars,
        shards: manifest.shards.length,
        result: "committed",
      },
    );
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

  private async deleteKey(
    scope: string,
    key: string,
    reason: string,
  ): Promise<void> {
    let result = "delete_acknowledged";
    let error: string | undefined;
    try {
      await this.kv.delete(scope, key);
    } catch (err) {
      result = "delete_failed";
      error = errorMessage(err);
    }
    await this.auditIndexPersistence("delete", [statePath(scope, key)], {
      scope,
      key,
      reason,
      result,
      error,
    });
  }

  private async deleteShards(
    shards: IndexShardManifest["shards"],
    reason: string,
  ): Promise<void> {
    if (shards.length === 0) return;
    const failures: Array<{ scope: string; key: string; error: string }> = [];
    let acknowledged = 0;
    for (const shard of shards) {
      try {
        await this.kv.delete(shard.scope, shard.key);
        acknowledged++;
      } catch (err) {
        failures.push({
          scope: shard.scope,
          key: shard.key,
          error: errorMessage(err),
        });
      }
    }
    await this.auditIndexPersistence(
      "generation_cleanup",
      [this.generationTarget(shards)],
      {
        reason,
        attempted: shards.length,
        acknowledged,
        failed: failures.length,
        failures: failures.slice(0, 5),
        durability: "iii_file_adapter_async",
      },
    );
  }

  private generationTarget(shards: IndexShardManifest["shards"]): string {
    const first = shards[0];
    if (!first) return KV.bm25Index;
    const separator = first.scope.lastIndexOf(":");
    return separator > 0 ? first.scope.slice(0, separator) : first.scope;
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
    return this.loadShardedData(
      BM25_LEGACY_KEY,
      BM25_MANIFEST_KEY,
      "BM25",
    );
  }

  private async loadVectorData(): Promise<string | null> {
    const current = await this.loadShardedData(
      VECTOR_LEGACY_KEY,
      VECTOR_MANIFEST_KEY,
      "vector",
    );
    if (current !== null) return current;

    const fallback = await this.readIndexValue<IndexShardManifest>(
      KV.bm25Index,
      VECTOR_FALLBACK_MANIFEST_KEY,
      "vector fallback",
      "manifest",
    );
    if (
      !fallback.ok ||
      fallback.value == null ||
      typeof fallback.value !== "object"
    ) {
      return null;
    }
    const restored = await this.loadManifestData(
      fallback.value,
      "vector fallback",
    );
    if (restored !== null) {
      this.vectorFallbackUsed = true;
      logger.warn("index persistence: restored previous vector generation", {
        generation: fallback.value.generation,
      });
    }
    return restored;
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
    const loadedShards: Array<{
      shard: IndexShardManifest["shards"][number];
      chunk: string | null;
    }> = [];
    const concurrency = shardIoConcurrency(this.options);
    for (let offset = 0; offset < manifest.shards.length; offset += concurrency) {
      const batch = manifest.shards.slice(offset, offset + concurrency);
      loadedShards.push(
        ...(await Promise.all(
          batch.map(async (shard) => ({
            shard,
            chunk: await this.kv
              .get<string>(shard.scope, shard.key)
              .catch(() => null),
          })),
        )),
      );
    }
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
