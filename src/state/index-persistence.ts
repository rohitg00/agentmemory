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
const VECTOR_SHARD_SCOPE_PREFIX = `${KV.bm25Index}:vectors:`;
const INDEX_SHARD_KEY = "data";
const DEFAULT_INDEX_SHARD_CHARS = 2_000_000;
const GENERATIONS_REGISTRY_KEY = "generations:registry";
const SWEEP_GRACE_PERIOD_MS = 60_000;

type GenerationRegistry = {
  v: 1;
  generations: Record<
    string,
    {
      type: "bm25" | "vector";
      createdAt: string;
      shardScopes: string[];
    }
  >;
};

type IndexShardManifest = {
  v: 1;
  generation?: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
  chars: number;
};

export type IndexPersistenceOptions = {
  shardChars?: number;
  createGeneration?: () => string;
  sweepGracePeriodMs?: number;
};

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
    typeof candidate.chars === "number" &&
    Number.isInteger(candidate.chars) &&
    candidate.chars >= 0
  );
}

export class IndexPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFailureLogAt = 0;
  private saveQueue: Promise<void> = Promise.resolve();

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
    const run = async () => {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      try {
        await this.saveBm25Index(this.bm25.serialize());
        if (this.vector) {
          await this.saveVectorIndex(this.vector.serialize());
        }
      } catch (err) {
        this.logFailure(err);
      }
    };

    const next = this.saveQueue.then(run, run);
    this.saveQueue = next;
    await next;
  }

  async load(): Promise<{
    bm25: SearchIndex | null;
    vector: VectorIndex | null;
  }> {
    let bm25: SearchIndex | null = null;
    let vector: VectorIndex | null = null;

    const bm25Data = await this.loadBm25Data();
    if (bm25Data && typeof bm25Data === "string") {
      bm25 = SearchIndex.deserialize(bm25Data);
    }

    const vecData = await this.loadVectorData();
    if (vecData && typeof vecData === "string") {
      vector = VectorIndex.deserialize(vecData);
    }

    this.sweepOrphanShards().catch((err) => {
      logger.warn("index persistence: orphan shard sweep failed during load", {
        message: errorMessage(err),
      });
    });

    return { bm25, vector };
  }

  async sweepOrphanShards(): Promise<{
    deletedShards: number;
    purgedGenerations: number;
  }> {
    let registry: GenerationRegistry;
    try {
      registry = await this.getRegistry();
    } catch (err) {
      logger.warn(
        "index persistence: failed to read generation registry during orphan sweep, skipping GC",
        { message: errorMessage(err) },
      );
      return { deletedShards: 0, purgedGenerations: 0 };
    }

    let bm25Eligible = false;
    let activeBm25Gen: string | null = null;
    try {
      const m = await this.kv.get<IndexShardManifest>(
        KV.bm25Index,
        BM25_MANIFEST_KEY,
      );
      if (m === null || m === undefined) {
        bm25Eligible = true;
        activeBm25Gen = null;
      } else if (m && m.v === 1 && Array.isArray(m.shards)) {
        bm25Eligible = true;
        activeBm25Gen = typeof m.generation === "string" ? m.generation : null;
      } else {
        logger.warn(
          "index persistence: BM25 manifest corrupt during orphan sweep, skipping BM25 GC",
        );
      }
    } catch (err) {
      logger.warn(
        "index persistence: BM25 manifest read failed during orphan sweep, skipping BM25 GC",
        { message: errorMessage(err) },
      );
    }

    let vectorEligible = false;
    let activeVectorGen: string | null = null;
    try {
      const m = await this.kv.get<IndexShardManifest>(
        KV.bm25Index,
        VECTOR_MANIFEST_KEY,
      );
      if (m === null || m === undefined) {
        vectorEligible = true;
        activeVectorGen = null;
      } else if (m && m.v === 1 && Array.isArray(m.shards)) {
        vectorEligible = true;
        activeVectorGen = typeof m.generation === "string" ? m.generation : null;
      } else {
        logger.warn(
          "index persistence: Vector manifest corrupt during orphan sweep, skipping Vector GC",
        );
      }
    } catch (err) {
      logger.warn(
        "index persistence: Vector manifest read failed during orphan sweep, skipping Vector GC",
        { message: errorMessage(err) },
      );
    }

    const now = Date.now();
    const gracePeriod =
      this.options.sweepGracePeriodMs ?? SWEEP_GRACE_PERIOD_MS;
    const orphanGenerations: string[] = [];
    const orphanShards: IndexShardManifest["shards"] = [];

    for (const [genId, genInfo] of Object.entries(registry.generations)) {
      if (genInfo.type === "bm25") {
        if (!bm25Eligible) continue;
        if (activeBm25Gen && genId === activeBm25Gen) continue;
      } else if (genInfo.type === "vector") {
        if (!vectorEligible) continue;
        if (activeVectorGen && genId === activeVectorGen) continue;
      } else {
        continue;
      }

      const createdAtMs = Date.parse(genInfo.createdAt);
      if (!Number.isNaN(createdAtMs) && now - createdAtMs < gracePeriod) {
        continue;
      }

      orphanGenerations.push(genId);
      if (Array.isArray(genInfo.shardScopes)) {
        for (const scope of genInfo.shardScopes) {
          orphanShards.push({ scope, key: INDEX_SHARD_KEY, chars: 0 });
        }
      }
    }

    if (orphanShards.length > 0) {
      await this.deleteShards(orphanShards, "orphan_shard_gc");
    }

    if (orphanGenerations.length > 0) {
      for (const genId of orphanGenerations) {
        delete registry.generations[genId];
      }
      await this.saveRegistry(registry).catch(() => {});
    }

    const stats = {
      deletedShards: orphanShards.length,
      purgedGenerations: orphanGenerations.length,
    };

    if (stats.purgedGenerations > 0) {
      logger.info("index persistence: orphan shard sweep completed", {
        purgedGenerations: stats.purgedGenerations,
        deletedShards: stats.deletedShards,
      });
      await this.auditIndexPersistence(
        "orphan_shard_gc",
        [statePath(KV.bm25Index, GENERATIONS_REGISTRY_KEY)],
        {
          deletedShards: stats.deletedShards,
          purgedGenerations: stats.purgedGenerations,
        },
      );
    }

    return stats;
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async getRegistry(): Promise<GenerationRegistry> {
    const reg = await this.kv.get<GenerationRegistry>(
      KV.bm25Index,
      GENERATIONS_REGISTRY_KEY,
    );
    if (
      reg &&
      reg.v === 1 &&
      reg.generations &&
      typeof reg.generations === "object" &&
      !Array.isArray(reg.generations)
    ) {
      return reg;
    }
    if (reg === null || reg === undefined) {
      return { v: 1, generations: {} };
    }
    throw new Error("Invalid generations registry format in KV store");
  }

  private async saveRegistry(registry: GenerationRegistry): Promise<void> {
    await this.kv.set<GenerationRegistry>(
      KV.bm25Index,
      GENERATIONS_REGISTRY_KEY,
      registry,
    );
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
      "bm25",
    );
  }

  private async saveVectorIndex(serialized: string): Promise<void> {
    await this.saveShardedIndex(
      serialized,
      VECTOR_MANIFEST_KEY,
      VECTOR_KEY,
      VECTOR_SHARD_SCOPE_PREFIX,
      "vector",
    );
  }

  private async saveShardedIndex(
    serialized: string,
    manifestKey: string,
    legacyKey: string,
    scopePrefix: string,
    type: "bm25" | "vector",
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

    const registry = await this.getRegistry();
    registry.generations[generation] = {
      type,
      createdAt: new Date().toISOString(),
      shardScopes: shards.map((s) => s.scope),
    };
    await this.saveRegistry(registry);

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
      const curReg = await this.getRegistry().catch(() => null);
      if (curReg && curReg.generations[generation]) {
        delete curReg.generations[generation];
        await this.saveRegistry(curReg).catch(() => {});
      }
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
        const curReg = await this.getRegistry().catch(() => null);
        if (curReg && curReg.generations[generation]) {
          delete curReg.generations[generation];
          await this.saveRegistry(curReg).catch(() => {});
        }
        throw err;
      }
    }

    await this.deleteKey(KV.bm25Index, legacyKey, "legacy_cleanup");

    const activeRegistry = await this.getRegistry();
    const obsoleteGenerations: string[] = [];
    const obsoleteShards: IndexShardManifest["shards"] = [];

    for (const [genId, genInfo] of Object.entries(activeRegistry.generations)) {
      if (genInfo.type === type && genId !== generation) {
        obsoleteGenerations.push(genId);
        if (Array.isArray(genInfo.shardScopes)) {
          for (const scope of genInfo.shardScopes) {
            obsoleteShards.push({ scope, key: INDEX_SHARD_KEY, chars: 0 });
          }
        }
      }
    }

    if (obsoleteShards.length > 0) {
      await this.deleteShards(obsoleteShards, "previous_generation_cleanup");
    }

    if (obsoleteGenerations.length > 0) {
      for (const genId of obsoleteGenerations) {
        delete activeRegistry.generations[genId];
      }
      await this.saveRegistry(activeRegistry).catch(() => {});
    }

    if (previous?.v === 1 && Array.isArray(previous.shards)) {
      const currentShardIds = new Set(
        shards.map((shard) => `${shard.scope}\0${shard.key}`),
      );
      const obsoleteShardIds = new Set(
        obsoleteShards.map((shard) => `${shard.scope}\0${shard.key}`),
      );
      for (const shard of previous.shards) {
        const id = `${shard.scope}\0${shard.key}`;
        if (currentShardIds.has(id) || obsoleteShardIds.has(id)) continue;
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

  private async deleteKey(
    scope: string,
    key: string,
    reason: string,
  ): Promise<void> {
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
  }

  private async deleteShards(
    shards: IndexShardManifest["shards"],
    reason: string,
  ): Promise<void> {
    await Promise.allSettled(
      shards.map((shard) => this.deleteKey(shard.scope, shard.key, reason)),
    );
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
