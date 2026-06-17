# Issue 917 Local Embedding Model Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the actionable local embedding model/dimension behavior from upstream PR 943 while preserving this fork's existing `LOCAL_EMBEDDING_MODEL` contract.

**Architecture:** Keep the change inside the local embedding provider boundary and its existing provider tests. Resolve the local model once in the provider constructor, use a local known-dimensions table with `OPENAI_EMBEDDING_DIMENSIONS` as an explicit override, and pass the transformer load options when creating the local feature-extraction pipeline. Update docs to describe `LOCAL_EMBEDDING_MODEL` as primary and `EMBEDDING_MODEL` as fallback compatibility.

**Tech Stack:** TypeScript ESM, Vitest, `@xenova/transformers` optional runtime, existing embedding provider factory and dimension guard.

---

## Sprint Contract

Goal: Decide and implement the locally actionable parts of upstream PR 943 for the fork's local embedding provider.

Scope:
- `src/providers/embedding/local.ts`
- `test/embedding-provider.test.ts`
- `README.md`
- `.env.example`
- `docs/todos/2026-06-17-issue-917-local-embedding-model/todo.md`
- `docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md`

Non-goals:
- No direct import of stale upstream patch text.
- No dependency, schema, API, REST, MCP, auth, hook, export/import, or vector-index migration changes.
- No remote GitHub writes or PR targeting `rohitg00/agentmemory`.

Acceptance criteria:
- `LOCAL_EMBEDDING_MODEL` remains the preferred local model override and wins over `EMBEDDING_MODEL`.
- `EMBEDDING_MODEL` is accepted as a local-provider fallback when `LOCAL_EMBEDDING_MODEL` is unset.
- Known local model dimensions include the current default, `Xenova/all-MiniLM-L6-v2`, BGE zh variants, BGE-M3, and multilingual E5 variants.
- `OPENAI_EMBEDDING_DIMENSIONS` overrides local provider dimensions and rejects invalid values.
- Local `pipeline()` receives `{ local_files_only: true, quantized: false }`.
- Docs accurately state the behavior and cache/offline implication.
- Verification evidence and final review notes are recorded in the task state.
- `$github-push-prepare` local branch-prep phase runs before handoff or reports a blocker.

Intended verification:
- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts`
- `corepack pnpm run build`
- `corepack pnpm test`
- `git diff --check`
- `semgrep scan --config p/default --error --metrics=off src/providers/embedding/local.ts test/embedding-provider.test.ts README.md .env.example docs/todos/2026-06-17-issue-917-local-embedding-model/todo.md docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md`
- `gitleaks protect --staged --redact` before commit

Known boundaries:
- Supporting non-384 local model dimensions changes only the provider's declared dimensions; it does not migrate existing stored vectors.
- The existing dimension guard remains the protection against mixed vector dimensions.
- `local_files_only: true` means the selected local model must already be available to transformers.js.

Stop conditions:
- Need for vector-index migration or persistence rewrite.
- Need to remove `LOCAL_EMBEDDING_MODEL` or change provider selection semantics.
- Need for dependency changes or remote writes.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Env precedence | Targeted Vitest | pending | `LOCAL_EMBEDDING_MODEL` wins; `EMBEDDING_MODEL` fallback works. |
| Dimensions | Targeted Vitest | pending | Known BGE model reports 1024; override reports 512; invalid override throws. |
| Pipeline options | Targeted Vitest | pending | `pipeline` called with model and `{ local_files_only: true, quantized: false }`. |
| Docs | Diff inspection | pending | README and `.env.example` describe local model and dimension behavior. |
| Push prep | GitHub push-prepare local phase | pending | Commit/base/review/security/next commands recorded. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Verification responsibility |
| --- | --- | --- | --- | --- |
| Validity investigation | Read-only local provider/config/tests/docs plus issue/PR metadata | no | Validity decision with evidence | Lead agent reviews and records decision. |
| Pre-code plan review | Plan and task record | no | High/Medium findings or `ACCEPT` | Lead agent triages and updates plan if needed. |
| Final review | Task-owned diff | no | Security/test/maintainability findings or `ACCEPT` | Lead agent verifies fixes and reruns checks. |

## Spec

No separate spec exists. Source of truth is the delegated Issue 917 request, this task record, and the current repo behavior discovered in `src/providers/embedding/local.ts`, `src/providers/embedding/openai.ts`, README, and `test/embedding-provider.test.ts`.

---

### Task 1: Add Local Provider Regression Tests

**Files:**
- Modify: `test/embedding-provider.test.ts`

- [ ] **Step 1: Add `EMBEDDING_MODEL` to the environment cleanup list**

Update the `ENV_KEYS` array near the top of `test/embedding-provider.test.ts` so each test starts clean:

```ts
  "EMBEDDING_PROVIDER",
  "AGENTMEMORY_EMBEDDING_PROVIDER",
  "LOCAL_EMBEDDING_MODEL",
  "EMBEDDING_MODEL",
```

- [ ] **Step 2: Update the existing default pipeline assertions for options**

Update local pipeline expectations so the default model still loads but with transformer options:

```ts
    expect(localPipelineMock).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
      { local_files_only: true, quantized: false },
    );
```

Apply the same options argument to the ONNX WASM local extractor expectation that currently checks the same default local model.

- [ ] **Step 3: Add fallback and precedence tests**

Add these tests inside `describe("LocalEmbeddingProvider", ...)` after the `LOCAL_EMBEDDING_MODEL` test:

```ts
  it("uses EMBEDDING_MODEL as a compatibility fallback for local embeddings", async () => {
    mockLoadTransformersWithPipeline();
    process.env["EMBEDDING_MODEL"] = "Xenova/bge-large-zh-v1.5";
    const {
      LocalEmbeddingProvider,
    } = await freshEmbeddingModule();

    const provider = new LocalEmbeddingProvider();

    await provider.embed("hello");

    expect(provider.dimensions).toBe(1024);
    expect(localPipelineMock).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/bge-large-zh-v1.5",
      { local_files_only: true, quantized: false },
    );
  });

  it("prefers LOCAL_EMBEDDING_MODEL over EMBEDDING_MODEL", async () => {
    mockLoadTransformersWithPipeline();
    process.env["LOCAL_EMBEDDING_MODEL"] = "Xenova/multilingual-e5-base";
    process.env["EMBEDDING_MODEL"] = "Xenova/bge-large-zh-v1.5";
    const {
      LocalEmbeddingProvider,
    } = await freshEmbeddingModule();

    const provider = new LocalEmbeddingProvider();

    await provider.embed("hello");

    expect(provider.dimensions).toBe(768);
    expect(localPipelineMock).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/multilingual-e5-base",
      { local_files_only: true, quantized: false },
    );
  });
```

- [ ] **Step 4: Add dimension override validation tests**

Add these tests inside the same describe block:

```ts
  it("uses OPENAI_EMBEDDING_DIMENSIONS as an explicit local dimension override", async () => {
    process.env["LOCAL_EMBEDDING_MODEL"] = "Xenova/custom-local-model";
    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "512";
    const {
      LocalEmbeddingProvider,
    } = await freshEmbeddingModule();

    const provider = new LocalEmbeddingProvider();

    expect(provider.dimensions).toBe(512);
  });

  it("rejects invalid OPENAI_EMBEDDING_DIMENSIONS values for local embeddings", async () => {
    const { LocalEmbeddingProvider } = await freshEmbeddingModule();

    for (const value of ["not-a-number", "-5", "0", "1.5", "1e3"]) {
      process.env["OPENAI_EMBEDDING_DIMENSIONS"] = value;
      expect(() => new LocalEmbeddingProvider()).toThrow(
        /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
      );
      delete process.env["OPENAI_EMBEDDING_DIMENSIONS"];
    }
  });
```

- [ ] **Step 5: Run RED targeted test**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts
```

Expected before implementation: FAIL because `EMBEDDING_MODEL` is ignored, `dimensions` remains `384`, invalid local dimensions are accepted, and local pipeline calls lack the third options argument.

### Task 2: Implement Local Provider Model Resolution

**Files:**
- Modify: `src/providers/embedding/local.ts`

- [ ] **Step 1: Add a known local model dimension table and strict positive integer parser**

Add these constants and helper above `type Pipeline` or above the class:

```ts
const KNOWN_LOCAL_MODEL_DIMENSIONS: Record<string, number> = {
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2": 384,
  "Xenova/all-MiniLM-L6-v2": 384,
  "Xenova/bge-large-zh-v1.5": 1024,
  "Xenova/bge-base-zh-v1.5": 768,
  "Xenova/bge-small-zh-v1.5": 512,
  "Xenova/bge-m3": 1024,
  "Xenova/multilingual-e5-large": 1024,
  "Xenova/multilingual-e5-base": 768,
  "Xenova/multilingual-e5-small": 384,
};

const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS =
  KNOWN_LOCAL_MODEL_DIMENSIONS[DEFAULT_LOCAL_EMBEDDING_MODEL] ?? 384;
const LOCAL_DIMENSIONS_ERROR =
  "OPENAI_EMBEDDING_DIMENSIONS must be a positive integer";

function getConfiguredLocalModel(): string {
  return (
    getEnvVar("LOCAL_EMBEDDING_MODEL")?.trim() ||
    getEnvVar("EMBEDDING_MODEL")?.trim() ||
    DEFAULT_LOCAL_EMBEDDING_MODEL
  );
}

function resolveLocalDimensions(
  model: string,
  rawOverride: string | undefined,
): number {
  const trimmed = rawOverride?.trim();
  if (trimmed) {
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`${LOCAL_DIMENSIONS_ERROR}, got: ${rawOverride}`);
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${LOCAL_DIMENSIONS_ERROR}, got: ${rawOverride}`);
    }
    return parsed;
  }
  return (
    KNOWN_LOCAL_MODEL_DIMENSIONS[model] ?? DEFAULT_LOCAL_EMBEDDING_DIMENSIONS
  );
}
```

- [ ] **Step 2: Store the resolved model and dimensions on the provider**

Change the class fields and add a constructor:

```ts
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions: number;
  private readonly model: string;
  private extractor: Awaited<ReturnType<Pipeline>> | null = null;

  constructor() {
    this.model = getConfiguredLocalModel();
    this.dimensions = resolveLocalDimensions(
      this.model,
      getEnvVar("OPENAI_EMBEDDING_DIMENSIONS"),
    );
  }
```

- [ ] **Step 3: Pass the selected model and transformer options to `pipeline`**

Replace the current model resolution inside `getExtractor()` with:

```ts
    this.extractor = await transformers.pipeline(
      "feature-extraction",
      this.model,
      { local_files_only: true, quantized: false },
    );
```

- [ ] **Step 4: Run GREEN targeted test**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts
```

Expected: PASS for the focused embedding provider suite.

### Task 3: Update User-Facing Configuration Docs

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Update README embedding provider notes**

In the local provider table row, keep `LOCAL_EMBEDDING_MODEL` as the primary override and mention `EMBEDDING_MODEL` as a compatibility fallback:

```md
| **Local (recommended)** | `paraphrase-multilingual-MiniLM-L12-v2` | Free | `EMBEDDING_PROVIDER=local`; override with `LOCAL_EMBEDDING_MODEL` or fallback `EMBEDDING_MODEL`; offline, +8pp recall over BM25-only |
```

Replace the current one-sentence local dimension note with:

```md
`LOCAL_EMBEDDING_MODEL` should name a Xenova feature-extraction model. agentmemory derives dimensions for common 384/512/768/1024-dimensional Xenova models and otherwise falls back to 384 unless `OPENAI_EMBEDDING_DIMENSIONS` is set. The dimension guard rejects mismatched vectors instead of silently corrupting the vector index. Local model loading uses transformers.js offline/local-file mode, so selected models must already be available in the transformers.js model cache.
```

- [ ] **Step 2: Update README environment example**

Add commented local model lines below `# EMBEDDING_PROVIDER=local`:

```md
# LOCAL_EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
# EMBEDDING_MODEL=Xenova/bge-large-zh-v1.5 # Fallback alias for local embeddings when LOCAL_EMBEDDING_MODEL is unset
```

Keep the existing OpenAI dimension comment, but make sure it remains clear that `OPENAI_EMBEDDING_DIMENSIONS` is also the explicit override for local/custom embedding dimensions.

- [ ] **Step 3: Search for stale local embedding docs and update the later README mention**

Run:

```bash
rg -n "384-dimensional|LOCAL_EMBEDDING_MODEL|local embeddings|OPENAI_EMBEDDING_DIMENSIONS" README.md .env.example
```

Update the later README local-embedding sentence that currently restricts `LOCAL_EMBEDDING_MODEL` to 384-dimensional models so it matches the new known-dimension and explicit override behavior:

```md
Local embeddings are available via `@xenova/transformers` — set `EMBEDDING_PROVIDER=local` to use `paraphrase-multilingual-MiniLM-L12-v2` entirely on-device, or set `LOCAL_EMBEDDING_MODEL` to another Xenova feature-extraction model. Common 384/512/768/1024-dimensional local models are recognized automatically; set `OPENAI_EMBEDDING_DIMENSIONS` for custom local models.
```

- [ ] **Step 4: Update `.env.example`**

Add the same local comments in `.env.example` near the embedding provider section:

```env
# LOCAL_EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
# EMBEDDING_MODEL=Xenova/bge-large-zh-v1.5 # Local fallback alias when LOCAL_EMBEDDING_MODEL is unset
# OPENAI_EMBEDDING_DIMENSIONS=1024        # Also overrides custom local embedding dimensions
```

- [ ] **Step 5: Inspect docs diff**

Run:

```bash
git diff -- README.md .env.example
```

Expected: docs mention the new local fallback and dimension behavior without removing existing explicit opt-in guidance.

### Task 4: Verification, Review, Commit, And GitHub Push Prep

**Files:**
- Modify: `docs/todos/2026-06-17-issue-917-local-embedding-model/todo.md`
- Modify: `docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
git diff --check
corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts
corepack pnpm run build
```

Expected: both pass.

- [ ] **Step 2: Run broader verification**

Run:

```bash
corepack pnpm test
```

Expected: pass, or record exact failure and closest targeted substitute if environment/tooling blocks it.

- [ ] **Step 3: Run required security checks for the changed surface**

Run Semgrep:

```bash
semgrep scan --config p/default --error --metrics=off src/providers/embedding/local.ts test/embedding-provider.test.ts README.md .env.example docs/todos/2026-06-17-issue-917-local-embedding-model/todo.md docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md
```

Expected: 0 findings. OSV is not required unless dependency/package surfaces changed.

- [ ] **Step 4: Run final focused review**

Dispatch read-only reviewers for test coverage / maintainability / boundary risk over the task-owned diff. Fix any valid High/Medium findings, then rerun affected verification.

- [ ] **Step 5: Update task state evidence**

Update `todo.md` Feature / Verification Matrix statuses, progress, review notes, and residual risks with concrete command results.

- [ ] **Step 6: Stage and run staged secret scan**

Stage only task-owned files:

```bash
git add src/providers/embedding/local.ts test/embedding-provider.test.ts README.md .env.example docs/todos/2026-06-17-issue-917-local-embedding-model/todo.md docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md
gitleaks protect --staged --redact
git diff --cached --name-status
```

Expected: staged files match task scope and Gitleaks reports no leaks.

- [ ] **Step 7: Commit**

Run:

```bash
git commit -m "fix: configure local embedding dimensions"
```

Expected: commit succeeds with only task-owned files.

- [ ] **Step 8: Run mandatory GitHub push-prep local phase**

Run `$github-push-prepare` local branch-prep phase. Because fetch/push/PR creation are not approved, use existing local `origin/main` if available and stop with next commands instead of remote writes.

Expected: report working branch, PR base SHA, whether remote freshness was verified, review/security gate results, base integration result, and exact next commands.

## Self-Review

- Spec coverage: All actionable Issue 917 / PR 943 behaviors are covered except direct default reversion, which is intentionally rejected to preserve this fork's PR 793 behavior.
- Placeholder scan: No placeholder steps remain.
- Type consistency: Local provider keeps the `EmbeddingProvider` interface and existing test helpers; the `Pipeline` type must be expanded to accept the third options argument.
- GitHub flow: Plan uses GitHub push-prep local mode and does not authorize fetch, push, or PR creation.
