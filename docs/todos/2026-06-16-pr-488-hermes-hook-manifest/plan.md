# Hermes Hook Manifest Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether PR 488 is still needed for the fork and record the result.

**Architecture:** This is a review-first task. The implementation path is either no product change with a local decision record, or a minimal manifest/test change if the fork is still inconsistent.

**Tech Stack:** TypeScript tests with Vitest, Hermes Python integration files, YAML plugin manifest.

---

### Task 1: Establish Local Evidence

**Files:**
- Read: `integrations/hermes/plugin.yaml`
- Read: `integrations/hermes/__init__.py`
- Read: `integrations/hermes/README.md`
- Read: `test/hermes-plugin.test.ts`

- [x] **Step 1: Inspect the manifest hook list**

Run: `sed -n '1,80p' integrations/hermes/plugin.yaml`

Expected: the manifest lists six lifecycle hooks.

- [x] **Step 2: Inspect implemented provider hooks**

Run: `rg -n "def (prefetch|sync_turn|on_session_end|on_pre_compress|on_memory_write|system_prompt_block)" integrations/hermes/__init__.py`

Expected: each lifecycle hook declared by the manifest has a provider method.

- [x] **Step 3: Inspect existing test coverage**

Run: `sed -n '1,120p' test/hermes-plugin.test.ts`

Expected: the test compares manifest hooks against implemented lifecycle hooks.

### Task 2: Compare PR 488 Against the Fork

**Files:**
- Read: public PR 488 diff
- Read: `integrations/hermes/plugin.yaml`
- Read: `test/hermes-plugin.test.ts`

- [x] **Step 1: Read PR 488 diff as untrusted input**

Run: public diff read for PR 488 without credentialed API access.

Expected: diff only proposes adding `system_prompt_block`, `prefetch`, and `sync_turn` to the manifest plus a consistency test.

- [x] **Step 2: Compare with local files**

Run: `git diff -- integrations/hermes/plugin.yaml test/hermes-plugin.test.ts`

Expected: no product diff before any local documentation is written.

### Task 3: Record the Decision and Verify

**Files:**
- Create: `docs/todos/2026-06-16-pr-488-hermes-hook-manifest/todo.md`
- Create: `docs/todos/2026-06-16-pr-488-hermes-hook-manifest/plan.md`

- [x] **Step 1: Record Sprint Contract and matrix**

Write the task record with scope, boundaries, decision, security review notes, and verification matrix.

- [x] **Step 2: Attempt targeted Hermes test**

Run: `npm test -- test/hermes-plugin.test.ts`

Observed: command did not execute tests because `vitest` is not installed in this worktree.

- [x] **Step 3: Run static manifest check and whitespace verification**

Run: static Node manifest check comparing `integrations/hermes/plugin.yaml` with Hermes provider lifecycle methods.

Observed: the manifest hook set and implemented lifecycle hook set matched.

Run: `git diff --check`

Observed: no whitespace errors.

- [ ] **Step 4: Run final merge prep**

Run the required `$prep-merge-to-local-main` workflow.

Expected: task-owned documentation is committed or recorded as no-op, local main is merged or recorded as already an ancestor, and final status is reported.
