# CLI Connect Timeout Investigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `test/cli-connect.test.ts` OpenCode timeout diagnosable and remove any local harness fragility that can cause intermittent full-suite failures.

**Architecture:** Treat this as a test-harness isolation issue until evidence proves a product bug. The connect adapters compute home-relative config paths at module load, so tests that mutate `HOME` must import adapters only after the test home is set and must avoid stale module-cache entries.

**Tech Stack:** TypeScript, Vitest, Node ESM dynamic imports, filesystem-backed temp homes.

---

### Task 1: Prove the Isolation Failure

**Files:**
- Read: `test/cli-connect.test.ts`
- Read: `src/cli/connect/index.ts`
- Read: `src/cli/connect/opencode.ts`

- [x] **Step 1: Run the narrow OpenCode test block repeatedly**

Run:
`pnpm exec vitest run test/cli-connect.test.ts --exclude test/integration.test.ts -t "opencode adapter"`

Expected: either a timeout reproduces or the run stays green with the current process pool.

- [x] **Step 2: Check module-cache and home resolution evidence**

Inspect whether `src/cli/connect/index.ts` top-level imports `opencode.ts` before tests set `HOME`, and whether dynamic imports in `test/cli-connect.test.ts` use unique cache keys.

Expected: identify a concrete stale-module or test-isolation mechanism before editing.

### Task 2: Add a Failing Harness Test If Needed

**Files:**
- Modify: `test/cli-connect.test.ts`

- [x] **Step 1: Add a test that detects stale OpenCode home capture**

Add a focused test in the OpenCode describe block that imports the adapter after changing `HOME` twice and asserts each install targets the current temp home.

- [x] **Step 2: Verify the test fails before the fix**

Run:
`pnpm exec vitest run test/cli-connect.test.ts --exclude test/integration.test.ts -t "uses the current home"`

Expected: fails if the adapter captures stale home state.

### Task 3: Implement the Minimal Fix

**Files:**
- Modify: `src/cli/connect/opencode.ts` if production path resolution is stale.
- Otherwise modify only `test/cli-connect.test.ts` if the root cause is a test harness cache-key issue.

- [x] **Step 1: Apply the smallest root-cause fix**

Prefer resolving `homedir()` inside adapter methods if module-load capture is the cause. Prefer unique dynamic import keys if cache collisions are the cause.

- [x] **Step 2: Run targeted verification**

Run:
`pnpm exec vitest run test/cli-connect.test.ts --exclude test/integration.test.ts`

Expected: all `cli-connect` tests pass.

### Task 4: Verify and Close

**Files:**
- Modify: `docs/todos/2026-06-16-cli-connect-timeout/todo.md`

- [x] **Step 1: Run full verification**

Run:
`pnpm test`

Expected: all non-integration tests pass.

- [x] **Step 2: Run static diff verification**

Run:
`git diff --check`

Expected: no whitespace errors.

- [x] **Step 3: Update task record**

Record root cause, commands, results, remaining risk, and whether any files were changed.
