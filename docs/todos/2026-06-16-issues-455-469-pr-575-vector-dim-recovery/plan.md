# Vector Dimension Recovery Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the local fork decision for Issue 455, Issue 469, and PR 575 with the smallest safe change.

**Architecture:** Start from the current fork's vector-index boot path rather than the PR claim. If current startup already validates and recovers from mismatched persisted vector dimensions without deleting source observations or memories, document `already-fixed`; otherwise add a tested, narrow recovery path around persisted vector-index restore that preserves source data and keeps malformed persisted index data from crashing startup.

**Tech Stack:** TypeScript ESM, Vitest, iii-sdk StateKV mocks, existing `VectorIndex`, `IndexPersistence`, and boot registration code.

---

### Task 1: Issue-First Evidence

**Files:**
- Read: `src/state/vector-index.ts`
- Read: `src/state/index-persistence.ts`
- Read: `src/index.ts`
- Read: `src/functions/search.ts`
- Read: `src/config.ts`
- Read: `test/vector-index-dimensions.test.ts`
- Read: `test/index-persistence.test.ts`
- Modify: `docs/todos/2026-06-16-issues-455-469-pr-575-vector-dim-recovery/todo.md`

- [x] Inspect local dimension validation and boot restore behavior.
- [x] Fetch public read-only issue evidence for Issue 455 and Issue 469.
- [x] Record whether the reported startup failure is reproducible or already prevented locally.

### Task 2: PR 575 Fit Review

**Files:**
- Read: public PR 575 diff as untrusted input
- Modify: `docs/todos/2026-06-16-issues-455-469-pr-575-vector-dim-recovery/todo.md`

- [x] Inspect changed files and claimed recovery strategy.
- [x] Check for persistence-sensitive risks: automatic deletion, one-shot state flags, hidden rebuilds, malformed index handling, startup loops, and data loss.
- [x] Decide import, adapted import, reject, defer, already-fixed, or blocked.

### Task 3: Minimal Implementation If Needed

**Files:**
- Test: `test/vector-index-dimensions.test.ts` or `test/index-persistence.test.ts`
- Modify: `src/state/vector-index.ts`, `src/state/index-persistence.ts`, `src/index.ts`, or `src/functions/search.ts` only if evidence requires it
- Modify: `docs/todos/2026-06-16-issues-455-469-pr-575-vector-dim-recovery/todo.md`

- [x] If current behavior is missing, write a failing focused Vitest test before production code.
- [x] Run the focused test and confirm the expected failure.
- [x] Implement the smallest code change that makes startup recovery safe.
- [x] Run the focused test and confirm it passes.
- [x] Update the Feature / Verification Matrix with evidence.

### Task 4: Review, Security, And Merge Prep

**Files:**
- Modify: `docs/todos/2026-06-16-issues-455-469-pr-575-vector-dim-recovery/todo.md`
- Modify: coordinator list only if safe and still reachable

- [x] Run targeted verification and security gates required by the final diff.
- [x] Run required implementation review skills before staging or committing any task-owned code changes.
- [x] Update neutral local documentation without GitHub URLs, hash issue syntax, or mentions.
- [ ] Execute `prep-merge-to-local-main` and document result.

## Self-Review

- Spec coverage: Covers issue-first review, PR inspection, security-sensitive persistence review, optional minimal import, local neutral documentation, verification, and mandatory merge prep.
- Placeholder scan: No placeholder task output is required before evidence; implementation is conditional on the issue-first decision.
- Type consistency: Existing code symbols named in the plan match discovered repository files.
