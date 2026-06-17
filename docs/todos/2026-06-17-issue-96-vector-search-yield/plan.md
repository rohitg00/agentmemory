# Issue #96 Vector Search Yield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-blocking async vector search path so large vector indexes yield to the Node event loop while preserving existing ranking behavior.

**Architecture:** Keep `VectorIndex.search()` synchronous and behavior-compatible for existing callers. Add `VectorIndex.searchAsync()` that scans a stable per-call view in chunks and awaits `setImmediate` between chunks. Update `HybridSearch` to await the async path after embedding the query, leaving BM25 and graph behavior unchanged.

**Tech Stack:** TypeScript ESM, Vitest, Node `setImmediate`, existing in-memory `VectorIndex`.

---

## Sources And Boundaries

- Spec path: none. The delegated request, task record, issue title, subagent validation, and local commit `fb650881` are the source of truth.
- Existing local evidence: `fb650881` already implements and tests this fix on branch `issue-96-vector-search-yield`; use it read-only as implementation evidence and avoid duplicating design work.
- Current branch/worktree: `/Users/A1538552/.codex/worktrees/ac31/agentmemory` on `github-pr/issue-96-vector-search-yield-fe927dc2`.
- Unrelated dirty paths at planning time: none.
- GitHub PR target context: `origin/main`, but fetch/push/PR creation are not approved. Use existing local `origin/main` only during push-prep unless the user separately approves fetch.
- GitHub PR prep is mandatory after implementation. It may do local branch-prep work only; no remote writes or fetch without separate approval.

## Files

- Modify: `src/state/vector-index.ts`
  - Add `searchAsync(query, limit = 20, options?)`.
  - Add cooperative yielding and snapshot-safe handling for mutations during async scans.
  - Preserve `search()` and serialization/deserialization compatibility.
- Modify: `src/state/hybrid-search.ts`
  - Replace the synchronous vector call with `await this.vector.searchAsync(queryEmbedding, limit * 2)`.
- Modify: `test/vector-index.test.ts`
  - Add regression tests for async/sync parity, explicit and default yielding, mutation snapshots, tie order, and restore safety.
- Modify: `test/hybrid-search.test.ts`
  - Add direct coverage proving `HybridSearch` uses the async vector path.
- Modify: `docs/todos/2026-06-17-issue-96-vector-search-yield/todo.md`
  - Keep matrix, subagent ledger, progress, verification evidence, and residual risks current.

## Task 1: Pre-Implementation Review

**Files:**
- Review: `docs/todos/2026-06-17-issue-96-vector-search-yield/plan.md`
- Review: `docs/todos/2026-06-17-issue-96-vector-search-yield/todo.md`

- [ ] **Step 1: Dispatch a read-only reviewer**

Ask a reviewer to inspect this plan, the current code, and `fb650881` for missing High/Medium requirements, architecture, verification, or scope issues. The reviewer must not edit files.

- [ ] **Step 2: Triage reviewer findings**

Classify each finding as `fixed`, `false_positive`, `duplicate`, `out_of_scope`, `accepted_risk`, `test_gap_addressed`, or `needs_user_decision`.

- [ ] **Step 3: Update plan only for valid in-scope findings**

Do not broaden into dependencies, worker threads, persistence changes, public APIs, or remote actions.

## Task 2: Add Async Vector Search And Tests

**Files:**
- Modify: `src/state/vector-index.ts`
- Modify: `test/vector-index.test.ts`

- [ ] **Step 1: Add vector-index tests**

Add tests equivalent to the `fb650881` coverage:
- nonpositive limit parity between `search()` and `searchAsync()`
- top-result id, session, and score parity
- repeated yielding before the async search resolves
- default-options yielding with more than 1,000 vectors and no explicit `yieldEvery`
- snapshot behavior when `clear()` plus `add()` runs during a yielded scan
- tie-order behavior when an entry is removed before it is scanned
- future snapshot correctness after `restoreFrom()` during an active search

- [ ] **Step 2: Run the vector test red check**

Run:

```bash
corepack pnpm test test/vector-index.test.ts
```

Expected before production changes: fail because `searchAsync` does not exist.

- [ ] **Step 3: Implement async search**

Use the `fb650881` design:
- add `immediate()` using `setImmediate`
- add `VectorSearchResult`, `VectorSearchOptions`, candidate, and entry types
- store vector entries with stable `obsId`, insertion `order`, `addedVersion`, and optional `removedVersion`
- keep retired entries only while async searches are active
- scan active entries and retired entries visible at the snapshot version
- call optional `onYield(scanned)` and `await immediate()` every `yieldEvery` scanned entries
- preserve synchronous `search()` as a non-yielding path with matching ordering

- [ ] **Step 4: Run vector tests green**

Run:

```bash
corepack pnpm test test/vector-index.test.ts
```

Expected: pass.

## Task 3: Route Hybrid Search Through Async Vector Search

**Files:**
- Modify: `src/state/hybrid-search.ts`
- Modify: `test/hybrid-search.test.ts`

- [ ] **Step 1: Add the hybrid regression test**

Import `vi` and `VectorIndex`, create a vector-backed `HybridSearch`, spy on `searchAsync`, make synchronous `search()` throw, and assert hybrid search still returns the vector result.

- [ ] **Step 2: Run the hybrid test red check**

Run:

```bash
corepack pnpm test test/hybrid-search.test.ts
```

Expected before production change: fail because `HybridSearch` still calls synchronous `search()`.

- [ ] **Step 3: Update hybrid vector call**

Change:

```typescript
vectorResults = this.vector.search(queryEmbedding, limit * 2);
```

to:

```typescript
vectorResults = await this.vector.searchAsync(queryEmbedding, limit * 2);
```

- [ ] **Step 4: Run targeted search tests**

Run:

```bash
corepack pnpm test test/vector-index.test.ts test/hybrid-search.test.ts test/search.test.ts test/smart-search.test.ts
```

Expected: pass.

## Task 4: Cleanup, Review, And Verification

**Files:**
- Review: `src/state/vector-index.ts`
- Review: `src/state/hybrid-search.ts`
- Review: `test/vector-index.test.ts`
- Review: `test/hybrid-search.test.ts`
- Update: `docs/todos/2026-06-17-issue-96-vector-search-yield/todo.md`

- [ ] **Step 1: Run a focused simplification pass**

Use `simple-code` on only the task-owned diff. Preserve behavior, APIs, schemas, persistence, auth, routing, and external boundaries.

- [ ] **Step 2: Run final implementation reviewers**

Dispatch read-only reviewers for security, test coverage, and maintainability. Triage High/Medium findings and fix only valid in-scope findings.

- [ ] **Step 3: Run final targeted checks**

Run:

```bash
corepack pnpm test test/vector-index.test.ts test/hybrid-search.test.ts test/search.test.ts test/smart-search.test.ts
corepack pnpm run build
corepack pnpm run lint
corepack pnpm run skills:check
git diff --check
```

Expected: pass, or record exact pre-existing blocker.

- [ ] **Step 4: Run broad test check**

Run:

```bash
corepack pnpm test
```

Expected: pass. If the known generated plugin reference drift blocks `skills:check` or full-suite success, record the failed file/assertion and whether it is pre-existing, then run the closest broad substitute.

- [ ] **Step 5: Update task record**

Update the matrix, progress, review notes, verification evidence, residual risks, and unmet criteria in `todo.md`.

## Task 5: GitHub Push Prepare Local Branch Prep

**Files:**
- Review and stage only task-owned files.

- [ ] **Step 1: Run `github-push-prepare` preflight**

Record:

```bash
git status -sb --untracked-files=all
git branch --show-current
git worktree list --porcelain
git diff --cached --name-status
git remote -v
```

- [ ] **Step 2: Capture PR base without fetch unless approved**

Use existing `refs/remotes/origin/main` if present. Record that freshness is unverified because fetch is not approved.

- [ ] **Step 3: Run required local branch-prep review/security gates**

Run the required review chain on the stable task-owned diff. For this non-trivial code change, run:

```bash
semgrep scan --config p/default --error --metrics=off .
```

If Semgrep is missing, errors, needs network escalation, or reports findings, stop before commit unless the user explicitly accepts the blocker in the current turn. Do not push or create a PR.

- [ ] **Step 4: Commit only task-owned files if verification supports it**

Inspect hooks/signing config first. Stage explicit pathspecs only, inspect staged diff, then run:

```bash
gitleaks protect --staged --redact
```

Any staged Gitleaks failure blocks commit unless explicitly accepted by the user in the current turn. After Gitleaks passes, run `verification-before-completion` and commit with:

```bash
git commit -m "fix: yield during large vector searches"
```

- [ ] **Step 5: Stop before remote writes**

Report exact next commands instead of running them:

```bash
git push -u origin github-pr/issue-96-vector-search-yield-fe927dc2
gh pr create --base main --head github-pr/issue-96-vector-search-yield-fe927dc2
```

## Plan Self-Review

- Spec coverage: The plan covers the issue's local root cause by adding a cooperative-yield async path, explicit and default yield coverage, snapshot-safe mutation handling, and hybrid integration.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: `VectorSearchResult` is the return shape for both sync and async vector search; `HybridSearch` already expects that shape.
- Safety: No dependencies, persistence format changes, REST/MCP surface changes, auth changes, or remote-state changes are planned.
