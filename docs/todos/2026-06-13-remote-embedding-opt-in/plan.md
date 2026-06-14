# Remote Embedding Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make remote text embeddings explicit opt-in via `EMBEDDING_PROVIDER` so generic LLM/API keys do not silently send memory or query text to remote providers.

**Architecture:** Keep the embedding boundary in `src/config.ts::detectEmbeddingProvider()`. With no explicit `EMBEDDING_PROVIDER`, return `null` so the existing startup path remains BM25+Graph only. With explicit `local`, keep the existing local provider; with explicit remote names, create the same remote providers as before.

**Tech Stack:** TypeScript, ESM, Vitest, Markdown docs.

---

## File Structure

- Modify `test/embedding-provider.test.ts`: encode the security invariant first, then explicit local/remote positive cases.
- Modify `src/config.ts`: make `detectEmbeddingProvider()` return only explicit `EMBEDDING_PROVIDER` values.
- Modify `README.md`, `.env.example`, `deploy/README.md`, and plugin skill docs that describe embedding defaults.
- Update `docs/todos/2026-06-13-remote-embedding-opt-in/todo.md` with verification evidence and final notes.

## Task 1: Provider Detection Tests

**Files:**
- Modify: `test/embedding-provider.test.ts`

- [x] **Step 1: Write the failing security regression tests**

Change the `createEmbeddingProvider` tests so key-only env values return `null`, and add explicit opt-in cases:

```ts
it("does not auto-enable remote embeddings from general provider keys", () => {
  for (const key of [
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "VOYAGE_API_KEY",
    "COHERE_API_KEY",
    "OPENROUTER_API_KEY",
  ]) {
    process.env[key] = "test-key";
    expect(createEmbeddingProvider()).toBeNull();
    delete process.env[key];
  }
});

it("returns LocalEmbeddingProvider when EMBEDDING_PROVIDER=local", () => {
  process.env["OPENAI_API_KEY"] = "test-key-456";
  process.env["EMBEDDING_PROVIDER"] = "local";
  const provider = createEmbeddingProvider();
  expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  expect(provider!.name).toBe("local");
});

it("requires EMBEDDING_PROVIDER to select remote embeddings", () => {
  process.env["OPENAI_API_KEY"] = "test-key-456";
  process.env["EMBEDDING_PROVIDER"] = "openai";
  const provider = createEmbeddingProvider();
  expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  expect(provider!.name).toBe("openai");
});
```

- [x] **Step 2: Run focused tests to verify RED**

Run: `npm test -- test/embedding-provider.test.ts`

Expected: FAIL because key-only remote providers are currently selected.

## Task 2: Provider Detection Fix

**Files:**
- Modify: `src/config.ts`

- [x] **Step 1: Implement minimal detection change**

Change `detectEmbeddingProvider()` to return only a real explicit `EMBEDDING_PROVIDER` value:

```ts
export function detectEmbeddingProvider(
  env?: Record<string, string>,
): string | null {
  const source = env ?? getMergedEnv();
  const forced = source["EMBEDDING_PROVIDER"];
  return hasRealValue(forced) ? forced : null;
}
```

- [x] **Step 2: Run focused tests to verify GREEN**

Run: `npm test -- test/embedding-provider.test.ts`

Expected: PASS.

## Task 3: Documentation Cleanup

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `deploy/README.md`
- Modify: `plugin/skills/agentmemory-config/SKILL.md`
- Modify: `plugin/skills/agentmemory-architecture/SKILL.md`

- [x] **Step 1: Update main docs**

Make the docs say:
- no embedding provider is active by default; BM25+Graph remains local.
- local embeddings are enabled with `EMBEDDING_PROVIDER=local`.
- remote embeddings require `EMBEDDING_PROVIDER=<remote>` plus that provider's key.
- OpenAI embeddings-only config uses `OPENAI_API_KEY_FOR_LLM=false` plus `EMBEDDING_PROVIDER=openai`.

- [x] **Step 2: Search for stale auto-detection claims**

Run the stale-reference search for old embedding auto-detection and local-default phrases against `README.md .env.example INSTALL_FOR_AGENTS.md deploy plugin src test READMEs`.

Expected: no stale claims remain in active docs/code.

## Task 4: Verification And Cleanup

**Files:**
- Inspect active diff and touched files only.
- Update: `docs/todos/2026-06-13-remote-embedding-opt-in/todo.md`

- [x] **Step 1: Run focused verification**

Run: `npm test -- test/embedding-provider.test.ts`

Expected: PASS.

- [x] **Step 2: Run relevant broader verification**

Run: `npm test -- --runInBand` only if supported; otherwise use `npm test`.

Expected: PASS or record the exact blocker.

- [x] **Step 3: Run focused simplification pass**

Review the diff for unnecessary helpers, comments, or scope creep. Preserve the explicit provider-selection contract.

- [x] **Step 4: Security checks if staging/committing**

If a commit is created, stage only task-owned files and run:

```bash
gitleaks protect --staged --redact
```

Expected: PASS.

## Self-Review

- Spec coverage: the plan covers provider detection, no-key/key-only/local/remote cases, and affected docs.
- Placeholder scan: no placeholders; every task has files and commands.
- Type consistency: `detectEmbeddingProvider()` keeps the same signature and return type.
