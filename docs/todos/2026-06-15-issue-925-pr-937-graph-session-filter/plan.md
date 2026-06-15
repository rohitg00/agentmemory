# Graph Retrieval Session Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Issue 925 by resolving graph retrieval results to the observation session namespace that hybrid search enrichment uses.

**Architecture:** Store an optional `sessionId` hint on graph nodes created from observations, then verify that hint before using it. When the hint is missing or stale, resolve only the top graph results by scanning known sessions for the owning observation and degrade to an empty session only when no owner can be found or KV listing fails.

**Tech Stack:** TypeScript ESM, iii-sdk function registration, StateKV, Vitest.

---

### Task 1: Regression Tests For Retrieval Session Resolution

**Files:**
- Modify: `test/graph-retrieval.test.ts`

- [x] **Step 1: Extend the graph retrieval KV mock**

Add a local helper that can serve graph nodes, graph edges, sessions, and per-session observation rows from in-memory maps.

- [x] **Step 2: Write the failing test**

Add tests showing:
- a node with a verified `sessionId` returns that session;
- a legacy node without `sessionId` resolves by scanning sessions;
- a stale hint is corrected when an observation belongs to an older session;
- session list failures leave `sessionId` empty without rejecting retrieval.

- [x] **Step 3: Run targeted RED**

Run: `pnpm exec vitest run test/graph-retrieval.test.ts`

Expected before implementation: at least the verified-hint or legacy-resolution test fails because results currently carry `sessionId: ""`.

### Task 2: Minimal Production Fix

**Files:**
- Modify: `src/types.ts`
- Modify: `src/functions/graph-retrieval.ts`
- Modify: `src/functions/graph.ts`
- Modify: `src/functions/temporal-graph.ts`

- [x] **Step 1: Add optional graph node session hint**

Add `sessionId?: string` to `GraphNode` for backward-compatible persisted rows.

- [x] **Step 2: Resolve retrieval result sessions**

In `GraphRetrieval`, add a private resolver that:
- verifies a non-empty hint with `KV.observations(sessionId)`;
- lazily lists `KV.sessions` only on misses;
- scans sessions for the observation owner;
- caches per-observation resolution;
- catches KV failures and leaves unresolved results as an empty session.

- [x] **Step 3: Use the resolver only after top-K trimming**

Set initial result `sessionId` from the node hint and call the resolver on sliced top results in `searchByEntities` and `expandFromChunks`.

- [x] **Step 4: Stamp graph extraction nodes**

Map input observation IDs to their `sessionId` values and stamp parsed graph nodes when available. Preserve existing node hints during merges unless the incoming node has a newer hint.

### Task 3: Extraction Test And Verification

**Files:**
- Modify: `test/graph.test.ts`

- [x] **Step 1: Add graph extraction stamp test**

Verify nodes created by `mem::graph-extract` from `testObs` carry `ses_1`.

- [x] **Step 2: Run targeted GREEN**

Run: `pnpm exec vitest run test/graph-retrieval.test.ts test/graph.test.ts`

Expected after implementation: all targeted tests pass.

### Task 4: Review, Security, And Merge Prep

**Files:**
- Modify: task record only for evidence updates.

- [x] **Step 1: Inspect diff**

Run `git diff -- src/types.ts src/functions/graph-retrieval.ts src/functions/graph.ts src/functions/temporal-graph.ts test/graph-retrieval.test.ts test/graph.test.ts docs/todos/2026-06-15-issue-925-pr-937-graph-session-filter`.

- [x] **Step 2: Run focused checks**

Run targeted tests, lint or type checks if needed, and required security gates for code changes.

- [x] **Step 3: Update task record**

Record decision, security findings, verification evidence, and residual risks.

- [x] **Step 4: Run `$prep-merge-to-local-main` preflight**

Follow the skill workflow from the current branch. Preflight found no active Git operation, no staged changes, no configured signing, no active commit/merge hooks or hook-manager files, and a local `main` ref at `bfde73b`. The separate main checkout has unrelated uncommitted work and will not be modified. The commit, local-main merge/no-op, and final verification continue from this preflight.
