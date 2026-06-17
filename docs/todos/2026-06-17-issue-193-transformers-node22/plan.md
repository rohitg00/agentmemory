# Issue 193 Transformers Node 22 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Node.js 22+ local Xenova embedding/reranker paths from entering the ONNX WASM threaded worker fallback that can fail with `blob:nodedata:` URLs.

**Architecture:** Add one shared `src/providers/transformers.ts` loader that imports `@xenova/transformers`, configures the ONNX WASM backend for Node by forcing `numThreads = 1`, and returns the module to existing providers. Route local text embeddings, CLIP image embeddings, and reranker pipeline creation through this loader without changing provider selection, dependency versions, or model defaults.

**Tech Stack:** TypeScript ESM, Vitest, `@xenova/transformers@2.17.2`, ONNX Runtime Web/Node, pnpm 11.

---

## Sprint Contract

Goal: Fix or clearly bound issue #193 with a code-only compatibility change.

Scope:
- Create a shared Xenova import/configuration helper.
- Update the three current `@xenova/transformers` runtime import call sites.
- Add focused tests for local embeddings, CLIP embeddings, and reranking.

Non-goals:
- No dependency or lockfile change.
- No migration to `@huggingface/transformers`.
- No health endpoint or viewer status change.
- No remote fetch, push, PR creation, or issue update.

Acceptance criteria:
- The shared helper sets `env.backends.onnx.wasm.numThreads` to `1` on Node before any `pipeline` call.
- Local, CLIP, and reranker code paths use the helper.
- Existing missing-package behavior remains user-oriented.
- Targeted tests and static checks pass or blockers are recorded.

## Feature / Verification Matrix

| Change | Verification method | Expected outcome |
| --- | --- | --- |
| Shared Node compatibility helper | New unit tests with mocked `@xenova/transformers.env.backends.onnx.wasm` | Test observes `numThreads === 1` before mocked `pipeline` runs |
| Local text embeddings use helper | `test/embedding-provider.test.ts` | Existing model test passes and new compatibility assertion passes |
| CLIP image embeddings use helper | `test/embedding-provider.test.ts` | New CLIP text embedding test observes compatibility before `pipeline` |
| Reranker uses helper | `test/reranker.test.ts` | Reranker test observes compatibility before `pipeline` |
| No dependency boundary crossed | `git diff --name-status package.json pnpm-lock.yaml` | No dependency manifest or lockfile diff |

## File Structure

- Create: `src/providers/transformers.ts`
  - Owns dynamic import of `@xenova/transformers`.
  - Owns Node-only ONNX WASM compatibility configuration.
  - Exposes `loadTransformers()` and a minimal `TransformersModule` type.
- Modify: `src/providers/embedding/local.ts`
  - Replace direct dynamic import with `loadTransformers()`.
  - Keep current error text for missing optional dependency.
- Modify: `src/providers/embedding/clip.ts`
  - Reuse shared `TransformersModule` type and loader.
  - Keep current error text for missing optional dependency.
- Modify: `src/state/reranker.ts`
  - Replace direct dynamic import with `loadTransformers()`.
  - Keep current unavailable fallback behavior.
- Modify: `test/embedding-provider.test.ts`
  - Add failing tests for local and CLIP compatibility configuration.
- Modify: `test/reranker.test.ts`
  - Add failing test for reranker compatibility configuration.
- Update: `docs/todos/2026-06-17-issue-193-transformers-node22/todo.md`
  - Record verification evidence and matrix status.

### Task 1: Write Failing Compatibility Tests

**Files:**
- Modify: `test/embedding-provider.test.ts`
- Modify: `test/reranker.test.ts`

- [ ] **Step 1: Add a helper mock that exposes ONNX WASM flags**

Add this helper near `localPipelineMock` in `test/embedding-provider.test.ts`:

```ts
function mockTransformersWithWasmFlags() {
  const wasm = { numThreads: 4 };
  const pipelineThreadCounts: number[] = [];
  const pipeline = vi.fn(async (task: string) => {
    pipelineThreadCounts.push(wasm.numThreads);
    if (task === "image-feature-extraction") {
      return async () => ({
        data: new Float32Array(Array.from({ length: 512 }, () => 0.1)),
        tolist: () => [Array.from({ length: 512 }, () => 0.1)],
      });
    }
    return async (texts: string[]) => ({
    tolist: () => texts.map(() => Array.from({ length: 384 }, () => 0.1)),
    });
  });
  const fromBlob = vi.fn(async () => ({ image: true }));
  vi.doMock("@xenova/transformers", () => ({
    env: { backends: { onnx: { wasm } } },
    pipeline,
    RawImage: {
      fromBlob,
    },
  }));
  return { wasm, pipeline, pipelineThreadCounts, fromBlob };
}
```

- [ ] **Step 2: Add failing LocalEmbeddingProvider compatibility test**

Add this test inside `describe("LocalEmbeddingProvider", ...)`:

```ts
it("disables threaded ONNX WASM before loading the local extractor on Node", async () => {
  const { wasm, pipeline, pipelineThreadCounts } =
    mockTransformersWithWasmFlags();
  const {
    LocalEmbeddingProvider,
  } = await freshEmbeddingModule();

  const provider = new LocalEmbeddingProvider();

  await provider.embed("hello");

  expect(wasm.numThreads).toBe(1);
  expect(pipelineThreadCounts).toEqual([1]);
  expect(pipeline).toHaveBeenCalledWith(
    "feature-extraction",
    "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  );
});
```

- [ ] **Step 3: Add failing ClipEmbeddingProvider compatibility test**

Add this test in `test/embedding-provider.test.ts` after the `LocalEmbeddingProvider` block:

```ts
describe("ClipEmbeddingProvider", () => {
  it("disables threaded ONNX WASM before loading the CLIP text extractor on Node", async () => {
    const { wasm, pipeline, pipelineThreadCounts } =
      mockTransformersWithWasmFlags();
    const {
      ClipEmbeddingProvider,
    } = await freshEmbeddingModule();

    const provider = new ClipEmbeddingProvider();

    await provider.embed("screenshot");

    expect(wasm.numThreads).toBe(1);
    expect(pipelineThreadCounts).toEqual([1]);
    expect(pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/clip-vit-base-patch32",
    );
  });

  it("disables threaded ONNX WASM before loading the CLIP image extractor on Node", async () => {
    const { wasm, pipeline, pipelineThreadCounts, fromBlob } =
      mockTransformersWithWasmFlags();
    const {
      ClipEmbeddingProvider,
    } = await freshEmbeddingModule();

    const provider = new ClipEmbeddingProvider();

    await provider.embedImage("data:image/png;base64,AA==");

    expect(wasm.numThreads).toBe(1);
    expect(pipelineThreadCounts).toEqual([1]);
    expect(fromBlob).toHaveBeenCalledOnce();
    expect(pipeline).toHaveBeenCalledWith(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32",
    );
  });
});
```

- [ ] **Step 4: Add failing reranker compatibility test**

In `test/reranker.test.ts`, add a mock helper:

```ts
function importRerankerWithWasmFlags() {
  vi.resetModules();
  const wasm = { numThreads: 4 };
  const reranker = vi.fn(async () => [{ score: 0.7 }]);
  const pipelineThreadCounts: number[] = [];
  const pipeline = vi.fn(async () => {
    pipelineThreadCounts.push(wasm.numThreads);
    return reranker;
  });
  vi.doMock("@xenova/transformers", () => ({
    env: { backends: { onnx: { wasm } } },
    pipeline,
  }));
  return {
    wasm,
    pipeline,
    pipelineThreadCounts,
    load: () => import("../src/state/reranker.js"),
  };
}
```

Then add this test inside `describe("reranker", ...)`:

```ts
it("disables threaded ONNX WASM before loading the reranker pipeline on Node", async () => {
  const { wasm, pipeline, pipelineThreadCounts, load } =
    importRerankerWithWasmFlags();
  const { rerank } = await load();
  const localResults = [
    makeResult("o1", "first result", 0.8),
    makeResult("o2", "second result", 0.5),
  ];

  await rerank("test query", localResults);

  expect(wasm.numThreads).toBe(1);
  expect(pipelineThreadCounts).toEqual([1]);
  expect(pipeline).toHaveBeenCalledWith(
    "text-classification",
    "Xenova/ms-marco-MiniLM-L-6-v2",
    { quantized: true },
  );
});
```

- [ ] **Step 5: Run tests and verify RED**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts
```

Expected: FAIL because `wasm.numThreads` remains `4`.

### Task 2: Implement Shared Transformers Compatibility Loader

**Files:**
- Create: `src/providers/transformers.ts`
- Modify: `src/providers/embedding/local.ts`
- Modify: `src/providers/embedding/clip.ts`
- Modify: `src/state/reranker.ts`

- [ ] **Step 1: Create the shared loader**

Create `src/providers/transformers.ts`:

```ts
export type TransformersModule = {
  env?: {
    backends?: {
      onnx?: {
        wasm?: {
          numThreads?: number;
        };
      };
    };
  };
  pipeline: (...args: unknown[]) => Promise<unknown>;
  RawImage?: {
    fromBlob: (blob: Blob) => Promise<unknown>;
  };
};

export async function loadTransformers<T extends TransformersModule = TransformersModule>(): Promise<T> {
  const transformers = await import("@xenova/transformers") as TransformersModule;
  configureTransformersForNode(transformers);
  return transformers as T;
}

function configureTransformersForNode(transformers: TransformersModule): void {
  if (typeof process === "undefined" || process.release?.name !== "node") {
    return;
  }

  const wasm = transformers.env?.backends?.onnx?.wasm;
  if (!wasm) return;

  wasm.numThreads = 1;
}
```

- [ ] **Step 2: Update local text embeddings**

In `src/providers/embedding/local.ts`, replace the direct dynamic import with:

```ts
import { getEnvVar } from "../../config.js";
import { loadTransformers } from "../transformers.js";
```

Then replace `let transformers: { pipeline: Pipeline };` and `await import("@xenova/transformers")` with:

```ts
let transformers: { pipeline: Pipeline };
try {
  transformers = await loadTransformers() as { pipeline: Pipeline };
} catch {
  throw new Error(
    "Install @xenova/transformers for local embeddings: npm install @xenova/transformers",
  );
}
```

- [ ] **Step 3: Update CLIP embeddings**

In `src/providers/embedding/clip.ts`, import the shared loader and base type:

```ts
import { loadTransformers, type TransformersModule } from "../transformers.js";
```

Keep a CLIP-local narrowed module type so strict TypeScript still knows `pipeline()` returns `ClipPipeline` and `RawImage` exists:

```ts
type ClipTransformersModule = TransformersModule & {
  pipeline: (
    task: string,
    model: string,
  ) => Promise<ClipPipeline>;
  RawImage: {
    fromBlob: (blob: Blob) => Promise<RawImageInstance>;
  };
};
```

Change the class cache and `getTransformers()` to use `ClipTransformersModule`:

```ts
private transformers: ClipTransformersModule | null = null;

private async getTransformers(): Promise<ClipTransformersModule> {
  if (this.transformers) return this.transformers;
  try {
    this.transformers = await loadTransformers<ClipTransformersModule>();
  } catch {
    throw new Error(
      "Install @xenova/transformers for CLIP image embeddings: npm install @xenova/transformers",
    );
  }
  return this.transformers;
}
```

- [ ] **Step 4: Update reranker**

In `src/state/reranker.ts`, add:

```ts
import { loadTransformers } from "../providers/transformers.js";
```

Replace the direct dynamic import block with:

```ts
const { pipeline: createPipeline } = await loadTransformers();
pipeline = await createPipeline(
  "text-classification",
  "Xenova/ms-marco-MiniLM-L-6-v2",
  { quantized: true },
);
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts
```

Expected: PASS.

### Task 3: Simplify, Verify, And Prepare Local Commit

**Files:**
- Modify only task-owned files listed above and task-state files.

- [ ] **Step 1: Inspect diff**

Run:

```bash
git diff -- src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts docs/todos/2026-06-17-issue-193-transformers-node22
```

Expected: only task-owned files changed.

- [ ] **Step 2: Run targeted verification**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts
corepack pnpm exec eslint src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts
corepack pnpm exec tsc --noEmit
semgrep scan --config p/default --error --metrics=off .
```

Expected: the focused Vitest and ESLint commands exit `0`. `corepack pnpm exec tsc --noEmit` is a known baseline comparison check rather than an expected-pass gate on this branch; record its exit code and whether task-owned files introduce new diagnostics. A pre-implementation reviewer reported baseline exit `2` with unrelated errors outside this task plus an existing `src/state/reranker.ts` third-argument diagnostic. `semgrep scan --config p/default --error --metrics=off .` is required for this non-trivial TypeScript change; if the public registry/network or missing local tool blocks it, record the blocker explicitly rather than treating it as pass.

- [ ] **Step 3: Confirm no dependency or lockfile change**

Run:

```bash
git diff --name-status package.json pnpm-lock.yaml
```

Expected: no output.

- [ ] **Step 4: Update task record**

Update `docs/todos/2026-06-17-issue-193-transformers-node22/todo.md` with:

```md
## Review Notes

- Tests:
  - `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts`: PASS
  - `corepack pnpm exec eslint src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts`: PASS
  - `corepack pnpm exec tsc --noEmit`: BASELINE BLOCKED or PASS, with exit code and task-owned diagnostic comparison recorded.
- Dependency boundary: no `package.json` or `pnpm-lock.yaml` changes.
- Runtime caveat: this code-only fix disables ONNX WASM threading only for the Xenova fallback path under Node to avoid worker URL creation.
```

- [ ] **Step 5: Commit task-owned changes**

Run only after review gates, verification, staging inspection, and the mandatory staged secret scan:

```bash
git add src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts docs/todos/2026-06-17-issue-193-transformers-node22/todo.md docs/todos/2026-06-17-issue-193-transformers-node22/plan.md
git diff --cached --name-status
git diff --cached
gitleaks protect --staged --redact
git commit -m "fix: disable xenova wasm threading on node"
```

Expected: only task-owned files are staged, `gitleaks protect --staged --redact` exits `0`, and one local task-owned commit is created.

## Plan Self-Review

- Spec coverage: Covers the requested #193 scope, avoids #96 and #171, and records dependency/runtime boundary limits.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: The plan uses `loadTransformers()` consistently across local, CLIP, and reranker paths.
- Approval check: No fetch, push, PR creation, dependency change, lockfile change, or runtime provider replacement is included.
