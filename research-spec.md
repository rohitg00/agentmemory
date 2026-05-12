# Research Spec: agentmemory bug fixes

> Based on analysis of agentmemory v0.9.9 (commit 03fb42db3).
> Forked to `nik1t7n/agentmemory`.
> Contribution guide: `CONTRIBUTING.md` — requires signed-off commits, branches off `main`, `npm run build` + `npm test`.

---

## Bug 1: `vectorIndex.add()` is never called in remember/observe/compress

### Root cause

`VectorIndex` exists in `src/state/vector-index.ts` with a working `add()` method. It's created in `src/index.ts` (line 177) and persisted via `IndexPersistence`. BUT **no function ever calls `vectorIndex.add()`** — the BM25 `SearchIndex.add()` is called (via `getSearchIndex()`) in all three places, but the vector index stays empty. The vector index only gets populated from persisted data at startup.

### Files to change

#### 1. `src/functions/search.ts` — add `getVectorIndex()` singleton and update `rebuildIndex()`

**Add a global `getVectorIndex()` + `setVectorIndex()` after line 14:**

```typescript
import { VectorIndex } from "../state/vector-index.js";
import type { EmbeddingProvider } from "../types.js";

// ... existing getSearchIndex() ...

let vectorIndex: VectorIndex | null = null;
let currentEmbeddingProvider: EmbeddingProvider | null = null;

export function setVectorIndex(idx: VectorIndex | null): void {
  vectorIndex = idx;
}

export function getVectorIndex(): VectorIndex | null {
  return vectorIndex;
}

export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  currentEmbeddingProvider = provider;
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  return currentEmbeddingProvider;
}
```

**Update `rebuildIndex()` (after line 39, inside the memories loop):** Add vector indexing after the BM25 add:

```typescript
// After idx.add(memoryToObservation(memory)) and count++ (line 32-33):
if (vectorIndex && currentEmbeddingProvider && memory.title) {
  try {
    const embedding = await currentEmbeddingProvider.embed(memory.title + " " + memory.content);
    vectorIndex.add(memory.id, memory.sessionIds[0] ?? "memory", embedding);
  } catch (err) {
    logger.warn("rebuildIndex: failed to embed memory for vector index", {
      memId: memory.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**Update the observations loop (after line 66, inside the observations loop):** Add vector indexing:

```typescript
// After idx.add(obs) and count++ (line 66-67):
if (vectorIndex && currentEmbeddingProvider && obs.title) {
  try {
    const embedding = await currentEmbeddingProvider.embed(obs.title + " " + (obs.narrative || ""));
    vectorIndex.add(obs.id, obs.sessionId, embedding);
  } catch (err) {
    logger.warn("rebuildIndex: failed to embed observation for vector index", {
      obsId: obs.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

#### 2. `src/index.ts` — set vector index and embedding provider references

**After line 177 (`const vectorIndex = embeddingProvider ? new VectorIndex() : null;`):**

```typescript
import { setVectorIndex, setEmbeddingProvider } from "./functions/search.js";

setVectorIndex(vectorIndex);
setEmbeddingProvider(embeddingProvider);
```

This makes the vector index and embedding provider available to the search module.

#### 3. `src/functions/remember.ts` — add vector index call

**Import (add after line 9):**

```typescript
import { getSearchIndex, getVectorIndex, getEmbeddingProvider } from "./search.js";
```

**After the existing BM25 index call (line 108), add:**

```typescript
try {
  const vi = getVectorIndex();
  const ep = getEmbeddingProvider();
  if (vi && ep) {
    const embedding = await ep.embed(memory.title + " " + memory.content);
    vi.add(memory.id, memory.sessionIds[0] ?? "memory", embedding);
  }
} catch (err) {
  logger.warn("Failed to vector-index saved memory", {
    memId: memory.id,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

**Note:** the remember function itself must become `async` (its wrapper lambda is already inside `withKeyedLock`, but the outer function is sync — check that `registerFunction` handlers can return promises).

#### 4. `src/functions/observe.ts` — add vector index call

**Import:**

```typescript
import { getSearchIndex, getVectorIndex, getEmbeddingProvider } from "./search.js";
```

**After the `getSearchIndex().add(synthetic)` call (line 240), add:**

```typescript
try {
  const vi = getVectorIndex();
  const ep = getEmbeddingProvider();
  if (vi && ep) {
    const embedding = await ep.embed(synthetic.title + " " + (synthetic.narrative || ""));
    vi.add(synthetic.id, synthetic.sessionId, embedding);
  }
} catch (err) {
  logger.warn("Failed to vector-index synthetic compression", {
    obsId: synthetic.id,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

#### 5. `src/functions/compress.ts` — add vector index call

**Import:**

```typescript
import { getSearchIndex, getVectorIndex, getEmbeddingProvider } from "./search.js";
```

**After the `getSearchIndex().add(compressed)` call (line 176), add:**

```typescript
try {
  const vi = getVectorIndex();
  const ep = getEmbeddingProvider();
  if (vi && ep) {
    const embedding = await ep.embed(compressed.title + " " + (compressed.narrative || ""));
    vi.add(compressed.id, compressed.sessionId, embedding);
  }
} catch (err) {
  logger.warn("Failed to vector-index compressed observation", {
    obsId: compressed.id,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

### Tests needed

**File: `test/vector-index-populate.test.ts`** (new)

- Test that `remember.ts` triggers `vectorIndex.add()` with the right obsId and sessionId
- Test that `observe.ts` triggers `vectorIndex.add()` on synthetic compression
- Test that `compress.ts` triggers `vectorIndex.add()` on LLM compression
- Test that `rebuildIndex()` with a mock embedding provider populates the vector index

Follow the existing test pattern from `test/search.test.ts` (mock kv + mock sdk).

---

## Bug 2: BM25 tokenizer strips Cyrillic (and any non-ASCII)

### Root cause

`src/state/search-index.ts` line 226:

```typescript
.replace(/[^\w\s/.\\-_]/g, " ")
```

In JavaScript, `\w` is ASCII-only (`[a-zA-Z0-9_]`). Any Unicode letter outside ASCII — Cyrillic (а-я, А-Я), Greek, CJK, Arabic — gets stripped to a space during tokenization. This means BM25 search (and by extension hybrid search) **completely ignores non-English content**.

### File to change

**`src/state/search-index.ts` line 226:**

```typescript
// Before:
.replace(/[^\w\s/.\\-_]/g, " ")

// After:
.replace(/[^\p{L}\p{N}\s/.\\-_]/gu, " ")
```

Changes:
1. `\w` → `[\p{L}\p{N}]` — `\p{L}` matches any Unicode letter (including Cyrillic), `\p{N}` matches any Unicode number
2. Added `u` flag for Unicode-aware mode

**Also check `stemmer.ts`**: The Porter stemmer (`src/state/stemmer.ts`) only handles English suffixes. Non-English text will pass through unchanged (which is fine — stems are a best-effort optimization). No change needed there.

### Tests needed

**File: `test/search-index.test.ts`** — add cases:

```typescript
it("indexes and finds Cyrillic text", () => {
  const idx = new SearchIndex();
  idx.add(makeObs({
    id: "obs_cyrillic",
    title: "Проверка памяти",
    narrative: "Тестируем поиск по кириллице",
    concepts: ["тест", "память"],
  }));
  const results = idx.search("память");
  expect(results.length).toBe(1);
  expect(results[0].obsId).toBe("obs_cyrillic");
});

it("tokenizes mixed ASCII and Cyrillic queries", () => {
  const idx = new SearchIndex();
  idx.add(makeObs({
    id: "obs_mixed",
    title: "JWT middleware настройка",
    narrative: "Configured JWT with русские комментарии",
    concepts: ["auth", "jwt", "настройка"],
  }));
  const results = idx.search("JWT настройка");
  expect(results.length).toBe(1);
});
```

---

## Bug 3: `rebuildIndex()` does not rebuild the vector index

### Root cause

`rebuildIndex()` in `src/functions/search.ts` (lines 17-72) only rebuilds the BM25 `SearchIndex`. The `VectorIndex` is not touched during rebuild — it relies entirely on its persisted state. If the persisted vector index is cleared (e.g. `AGENTMEMORY_DROP_STALE_INDEX=true`), or if the index is rebuilt after a cold start with no persisted vectors, the vector index stays empty forever, making vector search (hybrid search) non-functional.

### File to change

**`src/functions/search.ts`** — the `rebuildIndex()` function already updated in Bug 1 above (the vector-index-add during rebuild). The key changes:

1. After importing embeddings for each memory (inside `rebuildIndex`, memories loop), add the vector
2. After importing embeddings for each observation (inside `rebuildIndex`, observations loop), add the vector

Both changes are specified in Bug 1's `rebuildIndex()` section.

### Additional consideration

`rebuildIndex()` currently does not accept the vector index or embedding provider — they come from the global `getVectorIndex()` / `getEmbeddingProvider()` we added. This is consistent with how `getSearchIndex()` already works as a global singleton.

### Tests needed

**File: `test/search.test.ts`** — add a test:

```typescript
it("rebuildIndex populates the vector index", async () => {
  // Setup mock embedding provider
  const mockEmbedder = {
    name: "test",
    dimensions: 3,
    embed: async (text: string) => new Float32Array([0.1, 0.2, 0.3]),
    embedBatch: async (texts: string[]) => texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
  };
  setEmbeddingProvider(mockEmbedder);
  setVectorIndex(new VectorIndex());

  // Setup test data
  await kv.set(KV.observations("ses_1"), "obs_v1", {
    id: "obs_v1",
    sessionId: "ses_1",
    timestamp: "2026-01-01T00:00:00Z",
    type: "decision",
    title: "Vector test",
    facts: ["test"],
    narrative: "Testing vector index rebuild",
    concepts: ["test"],
    files: [],
    importance: 5,
  });

  await rebuildIndex(kv as never);

  const vi = getVectorIndex();
  expect(vi).not.toBeNull();
  expect(vi!.size).toBeGreaterThan(0);

  // Cleanup
  setVectorIndex(null);
  setEmbeddingProvider(null);
});
```

---

## Bug 4 (optional): `migrateVectorIndex()` — re-embed on dimension change

### Context

When the embedding provider changes (e.g., switching from `Xenova/all-MiniLM-L6-v2` with 384 dimensions to `text-embedding-3-small` with 1536 dimensions), the persisted vector index becomes unusable. Currently, the only option is `AGENTMEMORY_DROP_STALE_INDEX=true` which discards all vectors — losing the investment in embeddings.

A migration utility would re-embed all existing observations against the new provider.

### File to create

**`src/functions/migrate-vector-index.ts`** (new):

```typescript
import type { EmbeddingProvider, CompressedObservation, Memory } from "../types.js";
import { VectorIndex } from "../state/vector-index.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { logger } from "../logger.js";

export interface MigrateVectorIndexResult {
  success: boolean;
  totalProcessed: number;
  failed: number;
  vectorSize: number;
}

export async function migrateVectorIndex(
  kv: StateKV,
  oldIndex: VectorIndex,
  newProvider: EmbeddingProvider,
): Promise<MigrateVectorIndexResult> {
  const newIndex = new VectorIndex();
  let failed = 0;
  let processed = 0;

  // Re-embed memories
  try {
    const memories = await kv.list<Memory>(KV.memories);
    const texts = memories
      .filter((m) => m.isLatest !== false && m.title)
      .map((m) => m.title + " " + m.content);

    if (texts.length > 0) {
      const embeddings = await newProvider.embedBatch(texts);
      let mi = 0;
      for (const memory of memories) {
        if (memory.isLatest === false || !memory.title) continue;
        newIndex.add(memory.id, memory.sessionIds[0] ?? "memory", embeddings[mi]);
        mi++;
        processed++;
      }
    }
  } catch (err) {
    logger.warn("migrateVectorIndex: failed to re-embed memories", {
      error: err instanceof Error ? err.message : String(err),
    });
    failed++;
  }

  // Re-embed observations
  try {
    const sessions = await kv.list<{ id: string }>(KV.sessions);
    for (const session of sessions) {
      const observations = await kv.list<CompressedObservation>(
        KV.observations(session.id),
      );
      const texts = observations
        .filter((o) => o.title)
        .map((o) => o.title + " " + (o.narrative || ""));

      if (texts.length > 0) {
        const embeddings = await newProvider.embedBatch(texts);
        for (let i = 0; i < observations.length; i++) {
          const obs = observations[i];
          if (!obs.title) continue;
          newIndex.add(obs.id, obs.sessionId, embeddings[i]);
          processed++;
        }
      }
    }
  } catch (err) {
    logger.warn("migrateVectorIndex: failed to re-embed observations", {
      error: err instanceof Error ? err.message : String(err),
    });
    failed++;
  }

  return { success: true, totalProcessed: processed, failed, vectorSize: newIndex.size };
}
```

### Tests needed

**File: `test/vector-index-dimensions.test.ts`** — add a migration test:

```typescript
it("migrateVectorIndex re-embeds with new provider dimensions", async () => {
  // Create old index with 3-dim vectors
  const oldIndex = new VectorIndex();
  oldIndex.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));

  // New provider with 4-dim vectors
  const newProvider: EmbeddingProvider = {
    name: "test-4d",
    dimensions: 4,
    embed: async (text: string) => new Float32Array([0.1, 0.2, 0.3, 0.4]),
    embedBatch: async (texts: string[]) =>
      texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])),
  };

  // Setup kv with test data
  const kv = mockKV();
  await kv.set(KV.observations("ses_1"), "obs_1", {
    id: "obs_1",
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "decision",
    title: "migration test",
    facts: ["test"],
    narrative: "Testing migration",
    concepts: ["test"],
    files: [],
    importance: 5,
  });

  const result = await migrateVectorIndex(kv as never, oldIndex, newProvider);
  expect(result.success).toBe(true);
  expect(result.totalProcessed).toBeGreaterThan(0);
});
```

---

## Summary of changed files

| File | Change |
|------|--------|
| `src/state/search-index.ts` (L226) | Fix regex: `\w` → `[\p{L}\p{N}]` with `u` flag |
| `src/functions/search.ts` | Add `getVectorIndex()`, `setVectorIndex()`, `getEmbeddingProvider()`, `setEmbeddingProvider()` + update `rebuildIndex()` |
| `src/index.ts` | Call `setVectorIndex()` and `setEmbeddingProvider()` after creating them |
| `src/functions/remember.ts` | Add vector index add after BM25 add |
| `src/functions/observe.ts` | Add vector index add after BM25 add (synthetic compression path) |
| `src/functions/compress.ts` | Add vector index add after BM25 add (LLM compression path) |
| `src/functions/migrate-vector-index.ts` | NEW — migration utility for dimension changes |

### Test files

| File | What |
|------|------|
| `test/search-index.test.ts` | Add Cyrillic tokenization test cases |
| `test/search.test.ts` | Add `rebuildIndex` vector index population test |
| `test/vector-index-populate.test.ts` | NEW — test all 3 functions call vectorIndex.add() |
| `test/vector-index-dimensions.test.ts` | Add migration test case |

### PR branch naming

Per CONTRIBUTING.md: `fix/bm25-cyrillic-vector-index`
