import { SearchIndex } from "./search-index.js";
import { VectorIndex } from "./vector-index.js";
import type { StateKV } from "./kv.js";
import { KV, generateId } from "./schema.js";
import { logger } from "../logger.js";
import { safeAudit } from "../functions/audit.js";
import { getIndexSaveIntervalMs } from "../config.js";

export const V8_MAX_STRING_CHARS = 536_870_888;
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

// mem:audit exists to record structural deletions of user data — that is
// the policy stated at the top of src/functions/audit.ts. Index shard
// writes and manifest publishes remove no user rows, so they fall outside
// it, yet a single save() emits three of them: on a real store they
// reached 59876 of 84028 entries (71%), which is what makes the audit log
// slow to query and bloats startup. Off by default; set
// AGENTMEMORY_AUDIT_INDEX_PERSIST=1 when debugging index persistence.
function auditIndexPersistEnabled(): boolean {
  const raw = process.env.AGENTMEMORY_AUDIT_INDEX_PERSIST;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

type IndexShardManifest = {
  v: 1;
  generation?: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
  chars: number;
};

type IndexPersistenceOptions = {
  shardChars?: number;
  createGeneration?: () => string;
  saveIntervalMs?: number;
  now?: () => number;
};

export type IndexLeg = "bm25" | "vector";

export interface IndexLegStatus {
  lastSavedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  dirtySince: string | null;
  serializedChars: number | null;
}

export interface IndexPersistenceStatus {
  saveIntervalMs: number;
  saving: boolean;
  bm25: IndexLegStatus;
  vector: IndexLegStatus | null;
}

function emptyLegStatus(): IndexLegStatus {
  return { lastSavedAt: null, lastError: null, lastErrorAt: null, dirtySince: null, serializedChars: null };
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
  private lastFailureLogAt = new Map<IndexLeg, number>();
  private running: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private stopped = false;
  private lastSaveAt: number;
  private dirtyEpoch = 0;
  private markedDuringRunAt: number | null = null;
  private legs: Record<IndexLeg, IndexLegStatus> = {
    bm25: emptyLegStatus(),
    vector: emptyLegStatus(),
  };
  private readonly saveIntervalMs: number;
  private readonly now: () => number;

  constructor(
    private kv: StateKV,
    private bm25: SearchIndex,
    private vector: VectorIndex | null,
    private options: IndexPersistenceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    const interval = options.saveIntervalMs;
    this.saveIntervalMs =
      typeof interval === "number" && Number.isFinite(interval) && interval > 0
        ? interval
        : getIndexSaveIntervalMs();
    this.lastSaveAt = this.now();
  }

  scheduleSave(): void {
    if (this.stopped) return;
    const now = this.now();
    this.dirtyEpoch++;
    if (this.running && this.markedDuringRunAt === null) this.markedDuringRunAt = now;
    for (const leg of this.activeLegs()) {
      if (this.legs[leg].dirtySince === null) this.legs[leg].dirtySince = new Date(now).toISOString();
    }
    if (this.timer) return;
    const delay = Math.max(0, this.lastSaveAt + this.saveIntervalMs - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save().catch((err) => this.logFailure("bm25", err));
    }, delay);
  }

  save(): Promise<void> {
    this.clearTimer();
    if (this.queued) return this.queued;
    if (this.running) {
      const queued = this.running.then(() => {
        this.queued = null;
        return this.startRun();
      });
      this.queued = queued;
      return queued;
    }
    return this.startRun();
  }

  status(): IndexPersistenceStatus {
    return {
      saveIntervalMs: this.saveIntervalMs,
      saving: this.running !== null,
      bm25: { ...this.legs.bm25 },
      vector: this.vector ? { ...this.legs.vector } : null,
    };
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

    return { bm25, vector };
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private activeLegs(): IndexLeg[] {
    return this.vector ? ["bm25", "vector"] : ["bm25"];
  }

  private startRun(): Promise<void> {
    const run = this.runSave().finally(() => {
      if (this.running === run) this.running = null;
    });
    this.running = run;
    return run;
  }

  private async runSave(): Promise<void> {
    this.markedDuringRunAt = null;
    this.lastSaveAt = this.now();
    await this.saveLeg("bm25", async () => {
      const serialized = this.bm25.serialize();
      this.legs.bm25.serializedChars = serialized.length;
      await this.saveBm25Index(serialized);
    });
    const vector = this.vector;
    if (vector) {
      await this.saveLeg("vector", async () => {
        const serialized = vector.serialize();
        this.legs.vector.serializedChars = serialized.length;
        await this.saveVectorIndex(serialized);
      });
    }
  }

  private async saveLeg(leg: IndexLeg, run: () => Promise<void>): Promise<void> {
    const status = this.legs[leg];
    const epoch = this.dirtyEpoch;
    try {
      await run();
      status.lastSavedAt = new Date(this.now()).toISOString();
      status.lastError = null;
      status.lastErrorAt = null;
      if (this.dirtyEpoch === epoch) {
        status.dirtySince = null;
      } else if (this.markedDuringRunAt !== null) {
        status.dirtySince = new Date(this.markedDuringRunAt).toISOString();
      }
    } catch (err) {
      status.lastError = errorMessage(err);
      status.lastErrorAt = new Date(this.now()).toISOString();
      if (status.dirtySince === null) status.dirtySince = status.lastErrorAt;
      this.logFailure(leg, err);
    }
  }

  private logFailure(leg: IndexLeg, err: unknown): void {
    const now = this.now();
    if (now - (this.lastFailureLogAt.get(leg) ?? 0) < FAILURE_LOG_THROTTLE_MS) return;
    this.lastFailureLogAt.set(leg, now);
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`index persistence: failed to save the ${leg === "bm25" ? "BM25" : "vector"} index`, {
      code,
      message,
      hint:
        code === "TIMEOUT"
          ? "iii-engine state::set timed out; recent index updates remain in memory and will retry on the next save"
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

  private async saveVectorIndex(serialized: string): Promise<void> {
    await this.saveShardedIndex(
      serialized,
      VECTOR_MANIFEST_KEY,
      VECTOR_KEY,
      VECTOR_SHARD_SCOPE_PREFIX,
    );
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
    if (!auditIndexPersistEnabled()) return;
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
