# Embedding Provider Alias Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the useful embedding provider alias behavior from upstream-pr-412 while preserving the current explicit opt-in security boundary.

**Architecture:** Keep provider selection centralized in `src/config.ts` so status paths and provider construction agree. Normalize only explicit provider variables, map local-package aliases to `local`, and do not revive key-only remote provider detection.

**Tech Stack:** TypeScript, ESM, Vitest.

---

### Task 1: Add Alias Regression Coverage

**Files:**
- Modify: `test/embedding-provider.test.ts`

- [ ] **Step 1: Extend environment cleanup**

Add `AGENTMEMORY_EMBEDDING_PROVIDER` to the `ENV_KEYS` list so tests do not leak alias state between cases.

- [ ] **Step 2: Add local alias tests**

Add focused cases proving `AGENTMEMORY_EMBEDDING_PROVIDER=local`, `AGENTMEMORY_EMBEDDING_PROVIDER=xenova`, `AGENTMEMORY_EMBEDDING_PROVIDER=transformers`, `EMBEDDING_PROVIDER=xenova`, and `EMBEDDING_PROVIDER=transformers` all resolve to the local provider.

- [ ] **Step 3: Add precedence and safety tests**

Add cases proving canonical `EMBEDDING_PROVIDER` wins over the alias variable, unknown alias values return no provider, and remote provider keys alone still return no provider.

- [ ] **Step 4: Run focused test to confirm failure before implementation**

Run: `npx vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts`

Expected before implementation: alias tests fail because only `EMBEDDING_PROVIDER` canonical values are recognized.

### Task 2: Implement Alias Normalization

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add a local alias set**

Define a small set containing `xenova` and `transformers`.

- [ ] **Step 2: Normalize explicit provider values**

Update `detectEmbeddingProvider()` to read `EMBEDDING_PROVIDER` first, then `AGENTMEMORY_EMBEDDING_PROVIDER`, trim and lowercase the chosen value, map local aliases to `local`, return supported provider names, and return `null` otherwise.

- [ ] **Step 3: Preserve key-only remote opt-in behavior**

Do not add fallback checks for provider API keys. Provider keys alone must still return `null`.

- [ ] **Step 4: Run focused test**

Run: `npx vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts`

Expected after implementation: all tests in the file pass.

### Task 3: Update Review Worklist

**Files:**
- Create or modify: `docs/todos/2026-06-15-pr-issue-fix-review/pr-issue-fix-review-list.md`
- Modify: `docs/todos/2026-06-15-pr-issue-fix-review/todo.md`

- [ ] **Step 1: Record the decision row**

Write one neutral row for upstream-pr-412 with decision `adapt`, the evidence summary, verification status, and remaining risks. Avoid external reference syntax.

- [ ] **Step 2: Update matrix evidence**

Mark completed review, implementation, verification, and worklist items in `todo.md`.

### Task 4: Review, Security, and Prep Merge

**Files:**
- Inspect branch diff only.

- [ ] **Step 1: Inspect final diff**

Run: `git diff -- src/config.ts test/embedding-provider.test.ts docs/todos/2026-06-15-pr-issue-fix-review`

- [ ] **Step 2: Run required security review**

Run the applicable diff-scoped security review for provider configuration and fallback behavior.

- [ ] **Step 3: Run final targeted verification**

Run the focused embedding provider tests and any additional repo-native checks needed for the touched surface.

- [ ] **Step 4: Run prep-merge-to-local-main**

Execute the required prep workflow, including its review chain, local main merge check, commit discipline, and post-merge verification.
