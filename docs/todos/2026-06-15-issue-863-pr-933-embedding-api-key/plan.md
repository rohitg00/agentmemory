# Issue 863 PR 933 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the documented `OpenAIEmbeddingProvider` API-key precedence when the OpenAI embedding provider is created through `createEmbeddingProvider()`.

**Architecture:** `OpenAIEmbeddingProvider` already resolves constructor override, then `OPENAI_EMBEDDING_API_KEY`, then `OPENAI_API_KEY`. The factory should stop passing the general OpenAI key so that provider-local precedence controls outbound embedding auth. Detection remains explicit via `EMBEDDING_PROVIDER`; PR 933's auto-detection hunk is not imported because this fork intentionally avoids auto-enabling remote embeddings from general provider keys.

**Tech Stack:** TypeScript ESM, Vitest, existing embedding provider factory and provider tests.

---

### Task 1: Add Regression Coverage

**Files:**
- Modify: `test/embedding-provider.test.ts`

- [x] Add a test under `describe("createEmbeddingProvider")` that sets `EMBEDDING_PROVIDER=openai`, `OPENAI_API_KEY=hosted-chat-key`, `OPENAI_EMBEDDING_API_KEY=local-embedding-key`, `OPENAI_EMBEDDING_DIMENSIONS=3`, then calls `createEmbeddingProvider()` and `embed("hello")`.
- [x] Mock `globalThis.fetch` and assert the outbound `Authorization` header is `Bearer local-embedding-key`.
- [x] Run the targeted suite and confirm the new test fails because the factory passes `OPENAI_API_KEY`.

### Task 2: Apply Minimal Factory Fix

**Files:**
- Modify: `src/providers/embedding/index.ts`

- [x] Change only the `openai` case to construct `new OpenAIEmbeddingProvider()` without a constructor key.
- [x] Run the targeted suite and confirm the focused suite passes.

### Task 3: Review And Security Gates

**Files:**
- Modify: `docs/todos/2026-06-15-issue-863-pr-933-embedding-api-key/todo.md`
- Modify: `docs/todos/2026-06-15-issue-863-pr-933-embedding-api-key/plan.md`

- [x] Inspect the final diff for secret-handling, config, outbound-network, schema/API, persistence, hooks/tooling, and supply-chain impact.
- [x] Run `git diff --check`.
- [x] Run required security gates if available and document unavailable tools or accepted limitations.
- [x] Update task-state evidence and final decision.

### Task 4: Prep Merge To Local Main

**Files:**
- Existing task-owned changed files only.

- [x] Run `$prep-merge-to-local-main`.
- [x] Task-owned commit was created after retry: `f7bf9e6`.
- [x] If it is a no-op or blocked, document the reason and evidence.

## Self-Review

- No placeholders remain.
- The plan intentionally excludes PR 933's `detectEmbeddingProvider` hunk because current fork behavior requires explicit `EMBEDDING_PROVIDER`.
- Verification covers the concrete issue path and the task-owned docs.
