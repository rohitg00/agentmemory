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

type IndexShardManifest = {
  v: 1;
  generation?: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
  chars: number;
};

// Suffix for the reclaim ledger that sits beside each manifest.
const GC_LEDGER_SUFFIX = ":gc";

// Stands in for a manifest written before generations were recorded, whose
// `generation` field is absent. Cannot collide with createIndexGeneration().
const PRE_LEDGER_GENERATION = "pre-ledger";

// Every generation whose shards may still be on disk, live one included. The
// manifest alone cannot answer that: it names only the generation that is
// current, so a generation stranded by a failed read, a throw after commit, or
// a kill mid-cleanup becomes unreachable the moment the next manifest replaces
// it. Nothing else enumerates shard scopes — StateKV lists keys within a scope,
// not scopes by prefix — so what is not recorded here can never be found again.
type IndexGcLedger = {
  v: 1;
  generations: Array<{
    generation: string;
    shards: Array<{ scope: string; key: string }>;
  }>;
};

type IndexPersistenceOptions = {
  shardChars?: number;
  createGeneration?: () => string;
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
    Number.isInteger(candidate.chars) &&
    candidate.chars >= 0
  );
}

export class IndexPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFailureLogAt = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private unstartedSave: Promise<void> | null = null;

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
      this.save().catch((err) => this.logFailure("index", err));
    }, DEBOUNCE_MS);
  }

  async save(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.unstartedSave) return this.unstartedSave;

    const pending = this.enqueue(() => {
      if (this.unstartedSave === pending) this.unstartedSave = null;
      return this.runSave();
    });
    this.unstartedSave = pending;
    return pending;
  }

  /**
   * Serialise everything that read-modify-writes the gc ledger.
   *
   * Two saves genuinely overlap here: scheduleSave fires save() unawaited from
   * a timer, flushIndexSave awaits save() on every delete path
   * (src/functions/search.ts), and stop() clears the timer without awaiting a
   * save already running. Overlapping saves drop each other's ledger entries,
   * and worse, a save that publishes second reclaims the shards the first is
   * still writing — leaving the first to publish a manifest naming data that
   * is already gone, which fails the next load closed.
   *
   * Queue, never coalesce. flushIndexSave awaits this to make a delete
   * durable, so handing back an in-flight promise that started before the
   * delete would report success for a snapshot that does not contain it. The
   * cost is real: a delete-path flush waits out the save ahead of it.
   */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    // runSave never rejects and the tail below always fulfils, so the queue
    // cannot be left rejected and needs no rejection handler here.
    const run = this.queue.then(work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runSave(): Promise<void> {
    // Each index fails on its own. One try around both would let a BM25
    // failure stop the vector index persisting at all, and a lost vector index
    // is never rebuilt: both rebuild triggers key on the BM25 size
    // (src/index.ts, src/functions/search.ts).
    try {
      await this.saveBm25Index(this.bm25.serialize());
    } catch (err) {
      this.logFailure("BM25", err);
    }
    if (this.vector) {
      try {
        await this.saveVectorIndex(this.vector.serialize());
      } catch (err) {
        this.logFailure("vector", err);
      }
    }
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
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private logFailure(index: string, err: unknown): void {
    const now = Date.now();
    // Throttle: persistence failures under load arrive in bursts
    // (iii-engine queue pressure). Logging every debounce flush adds
    // noise without information. Throttled PER INDEX, so a vector failure
    // right after a BM25 one is not swallowed — the two fail independently
    // now, and at 3am you need to know which one stopped persisting.
    const lastAt = this.lastFailureLogAt.get(index) ?? 0;
    if (now - lastAt < FAILURE_LOG_THROTTLE_MS) return;
    this.lastFailureLogAt.set(index, now);
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`index persistence: failed to save ${index} index`, {
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

    // Record the generation BEFORE the first shard write. A kill anywhere from
    // here to the manifest publish would otherwise leave shards on disk that
    // nothing references and nothing can enumerate.
    const tracked = await this.trackGeneration(
      manifestKey,
      generation,
      shards,
      previous,
    );

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
      const allGone = await this.deleteShards(shards, "shard_write_rollback");
      // Drop the entry only if every shard actually went. A shard that survived
      // its delete is unnameable once its entry is gone, which is the contract
      // this file states for reclaim: a delete failure costs a retry, never a
      // stranded generation.
      if (tracked && allGone) {
        await this.untrackGeneration(manifestKey, generation);
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
        const allGone = await this.deleteShards(
          shards,
          "manifest_publish_rollback",
        );
        if (tracked && allGone) {
          await this.untrackGeneration(manifestKey, generation);
        }
      }
      throw err;
    }

    await this.deleteKey(KV.bm25Index, legacyKey, "legacy_cleanup");
    // Only reclaim when this generation is actually in the ledger. Reclaiming
    // against a ledger that does not list us would treat live shards as dead.
    if (tracked) {
      await this.reclaimGenerations(manifestKey, generation);
    } else if (previous?.v === 1 && Array.isArray(previous.shards)) {
      // The ledger was unusable this cycle, so nothing above will ever revisit
      // `previous`. Fall back to the pre-ledger cleanup: the manifest just
      // published supersedes it, and saves are serialised, so its shards are
      // dead. Without this, a run of unusable cycles orphans one generation
      // each — strictly worse than the code this replaced, which always had
      // this path.
      const liveIds = new Set(
        shards.map((shard) => `${shard.scope}\u0000${shard.key}`),
      );
      await this.deleteShards(
        previous.shards.filter(
          (shard) =>
            isValidShardDescriptor(shard) &&
            !liveIds.has(`${shard.scope}\u0000${shard.key}`),
        ),
        "previous_generation_cleanup",
      );
    }
  }

  /** Drop a generation's entry after its shards have been rolled back. */
  private async untrackGeneration(
    manifestKey: string,
    generation: string,
  ): Promise<void> {
    try {
      const ledger = await this.readLedger(manifestKey);
      const generations = ledger.generations.filter(
        (entry) => entry?.generation !== generation,
      );
      if (generations.length === ledger.generations.length) return;
      await this.kv.set<IndexGcLedger>(KV.bm25Index, this.gcKey(manifestKey), {
        v: 1,
        generations,
      });
    } catch {
      // Best effort. A surviving entry costs a retry on the next reclaim, and
      // this runs while a save is already failing — never make that worse.
    }
  }

  private gcKey(manifestKey: string): string {
    return `${manifestKey}${GC_LEDGER_SUFFIX}`;
  }

  private async readLedger(manifestKey: string): Promise<IndexGcLedger> {
    // Throws rather than returning a blank ledger, because a blank one would
    // be written straight back over whatever is stored. Callers catch it and
    // skip tracking for that cycle; they must never treat it as "no ledger".
    const stored = await this.kv.get<IndexGcLedger>(
      KV.bm25Index,
      this.gcKey(manifestKey),
    );
    if (stored == null) return { v: 1, generations: [] };
    // Present but unrecognised: a newer version, or a rollback to this build
    // after one that wrote a different shape. Overwriting drops every
    // generation it tracked, so leave it exactly where it is.
    if (stored.v !== 1 || !Array.isArray(stored.generations)) {
      throw new Error(
        `index gc ledger ${this.gcKey(manifestKey)} has an unrecognised shape ` +
          `(v=${String((stored as { v?: unknown }).v)}); refusing to overwrite it`,
      );
    }
    return stored;
  }

  private async trackGeneration(
    manifestKey: string,
    generation: string,
    shards: IndexShardManifest["shards"],
    previous: IndexShardManifest | null,
  ): Promise<boolean> {
    try {
      // The WHOLE body runs under this guard, not just the ledger read. A
      // malformed ledger entry or manifest shard would otherwise throw a
      // TypeError out of saveShardedIndex before any shard write, leaving one
      // throttled log line per 60s as the only trace while BM25 stopped
      // persisting for good. isValidShardDescriptor exists in this file
      // because a per-shard-malformed manifest is already its threat model.
      return await this.recordGeneration(
        manifestKey,
        generation,
        shards,
        previous,
      );
    } catch (err) {
      // A state::get brownout is the exact condition this bug appears under,
      // so this path is not rare. Aborting the save here would stop persisting
      // the index at all, which is worse than the leak being fixed. Writing a
      // fresh ledger would drop every generation the stored one lists. Do
      // neither: let the shards and manifest land, skip this cycle's tracking
      // and its reclaim, and leak at most one generation instead of one per
      // brownout.
      //
      // That leak can OUTLIVE the unreadable window. This generation publishes
      // untracked; the next save re-seeds it from `previous`, but that read is
      // itself `.catch(() => null)`, so if it also fails the generation is in
      // no ledger and reclaim only ever looks at what precedes the live entry.
      // With no scope enumeration in StateKV, nothing can find it again.
      // Throttled for the same reason every other failure log here is: an
      // unusable ledger stays unusable, so this fires on every debounce.
      const throttleKey = `gc:${manifestKey}`;
      const now = Date.now();
      if (now - (this.lastFailureLogAt.get(throttleKey) ?? 0) >= FAILURE_LOG_THROTTLE_MS) {
        this.lastFailureLogAt.set(throttleKey, now);
        logger.warn(
          "index persistence: gc ledger unavailable, skipping reclaim",
          { manifestKey, message: errorMessage(err) },
        );
      }
      return false;
    }
  }

  private async recordGeneration(
    manifestKey: string,
    generation: string,
    shards: IndexShardManifest["shards"],
    previous: IndexShardManifest | null,
  ): Promise<boolean> {
    const ledger = await this.readLedger(manifestKey);
    // Optional-chained so one malformed entry costs that entry, not the whole
    // cycle's tracking. reclaimGenerations tolerates them the same way.
    const known = new Set(ledger.generations.map((entry) => entry?.generation));

    // Seed the generation the pre-ledger code left live, so upgrading does not
    // strand it. Only reachable while `previous` is readable, which is exactly
    // the case the old cleanup already handled.
    //
    // `generation` is optional on the manifest and older stores really do omit
    // it, so fall back to a sentinel rather than skipping the seed. The
    // sentinel cannot collide with createIndexGeneration()'s `idx_` ids, and
    // since every manifest written from here on carries a generation, the
    // seeded entry always ends up preceding a live one and gets reclaimed.
    if (previous?.v === 1 && Array.isArray(previous.shards)) {
      const previousGeneration = previous.generation ?? PRE_LEDGER_GENERATION;
      if (!known.has(previousGeneration)) {
        ledger.generations.push({
          generation: previousGeneration,
          shards: previous.shards
            .filter(isValidShardDescriptor)
            .map(({ scope, key }) => ({ scope, key })),
        });
        known.add(previousGeneration);
      }
    }

    if (!known.has(generation)) {
      ledger.generations.push({
        generation,
        shards: shards.map(({ scope, key }) => ({ scope, key })),
      });
    }

    await this.kv.set<IndexGcLedger>(
      KV.bm25Index,
      this.gcKey(manifestKey),
      ledger,
    );
    return true;
  }

  /**
   * Delete every tracked generation except the live one, then rewrite the
   * ledger with whatever survived. A shard whose delete failed stays listed and
   * is retried on the next save or load, so a delete failure costs a retry
   * instead of stranding the generation for good.
   */
  private async reclaimGenerations(
    manifestKey: string,
    liveGeneration: string | undefined,
  ): Promise<void> {
    if (!liveGeneration) return;
    const ledger = await this.readLedger(manifestKey).catch(() => null);
    if (!ledger) return;

    // Reclaim strictly what precedes the live generation in the ledger, which
    // trackGeneration appends to in creation order. Anything at or after the
    // live entry is either live or a save still in flight: setIndexPersistence
    // runs before load() in src/index.ts, so a request arriving during boot can
    // have a save writing shards while this reclaim runs, and deleting those
    // would publish a manifest whose shards are already half gone. A generation
    // stranded after the live one is not lost, only deferred — it becomes
    // reclaimable as soon as a newer generation is published.
    const liveIndex = ledger.generations.findIndex(
      (entry) => entry?.generation === liveGeneration,
    );
    // Live generation untracked (a pre-ledger store, or a manifest written
    // before this shipped). Nothing can be classified as superseded, so leave
    // every entry alone rather than guess.
    if (liveIndex < 0) return;

    const reclaimedPaths: string[] = [];
    let failed = 0;
    const survivors: IndexGcLedger["generations"] = [];
    for (const [index, entry] of ledger.generations.entries()) {
      // A malformed entry is kept, never iterated. This also runs on the load
      // path, where a throw would null the loaded index and trigger the
      // full-corpus rebuild. A GC step must not be able to fail a load.
      if (index >= liveIndex || !entry || !Array.isArray(entry.shards)) {
        survivors.push(entry);
        continue;
      }
      const stranded: IndexGcLedger["generations"][number]["shards"] = [];
      for (const shard of entry.shards) {
        try {
          await this.kv.delete(shard.scope, shard.key);
          reclaimedPaths.push(statePath(shard.scope, shard.key));
        } catch {
          failed += 1;
          stranded.push(shard);
        }
      }
      if (stranded.length > 0) {
        survivors.push({ generation: entry.generation, shards: stranded });
      }
    }

    // One audit row for the sweep, not one per shard. src/functions/audit.ts
    // sets the policy: automatic bulk sweeps emit a single row listing every
    // removed id, because per-item rows flood the log. A reclaim on a badly
    // leaked store is well over a thousand shards, and this runs during boot.
    if (reclaimedPaths.length > 0) {
      await this.auditIndexPersistence("delete", reclaimedPaths, {
        manifestKey,
        reason: "generation_reclaim",
        liveGeneration,
        // `evicted` is the field name src/functions/audit.ts specifies for a
        // sweep; retention.ts is the reference shape. `failed` surfaces deletes
        // that will be retried, which would otherwise vanish silently.
        evicted: reclaimedPaths.length,
        failed,
      });
    }

    // A successful delete is the only thing that shrinks the ledger, so with
    // none there is nothing to rewrite. Without this, every boot writes the
    // ledger back unchanged.
    if (reclaimedPaths.length === 0) return;
    await this.kv
      .set<IndexGcLedger>(KV.bm25Index, this.gcKey(manifestKey), {
        v: 1,
        generations: survivors,
      })
      .catch(() => undefined);
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

  /** Reports whether the delete landed, so the reclaim path can retry the rest. */
  private async deleteKey(
    scope: string,
    key: string,
    reason: string,
  ): Promise<boolean> {
    let ok = true;
    let error: string | undefined;
    try {
      await this.kv.delete(scope, key);
    } catch (err) {
      ok = false;
      error = errorMessage(err);
    }
    await this.auditIndexPersistence("delete", [statePath(scope, key)], {
      scope,
      key,
      reason,
      result: ok ? "deleted" : "failed",
      error,
    });
    return ok;
  }

  private async deleteShards(
    shards: IndexShardManifest["shards"],
    reason: string,
  ): Promise<boolean> {
    let allGone = true;
    for (const shard of shards) {
      if (!(await this.deleteKey(shard.scope, shard.key, reason))) {
        allGone = false;
      }
    }
    return allGone;
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
      const data = await this.loadManifestData(manifest.value, label);
      // Boot is the only point that sees a generation stranded by a kill: the
      // save path only ever inspects its own predecessor. Reclaim once the live
      // generation has actually loaded — a failed load must not authorise
      // deleting anything.
      if (data !== null) {
        // Through the same queue as save(), or this sweep's ledger rewrite
        // clobbers a concurrent save's entry. Never allowed to fail the load.
        const live = manifest.value.generation;
        await this
          .enqueue(() => this.reclaimGenerations(manifestKey, live))
          .catch(() => undefined);
      }
      return data;
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
