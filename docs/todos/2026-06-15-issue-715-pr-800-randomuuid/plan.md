# Issue 715 / PR 800 RandomUUID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the ID generator's dependency on a bare global `crypto` object while preserving generated ID format.

**Architecture:** The shared schema module already imports from `node:crypto` for deterministic fingerprints. Extend that import with `randomUUID` and call it directly from `generateId()`. Add a regression test that temporarily removes `globalThis.crypto` and verifies `generateId()` still returns the existing ID shape.

**Tech Stack:** TypeScript ESM, Vitest, Node `node:crypto`.

---

### Task 1: Regression Test

**Files:**
- Modify: `test/schema-fingerprint.test.ts`

- [ ] **Step 1: Add a failing test**

Add a `generateId` import and a test that temporarily hides `globalThis.crypto`, calls `generateId("obs")`, and restores the original descriptor in `finally`.

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `npm test -- test/schema-fingerprint.test.ts`

Expected before implementation: FAIL with `ReferenceError: crypto is not defined`.

### Task 2: Minimal Source Fix

**Files:**
- Modify: `src/state/schema.ts`

- [ ] **Step 1: Import `randomUUID`**

Change `import { createHash } from "node:crypto";` to `import { createHash, randomUUID } from "node:crypto";`.

- [ ] **Step 2: Use the imported function**

Change `crypto.randomUUID()` to `randomUUID()` in `generateId()`.

- [ ] **Step 3: Run targeted verification**

Run: `npm test -- test/schema-fingerprint.test.ts`

Expected: PASS.

### Task 3: Review, Security, And Merge Prep

**Files:**
- Modify: `docs/todos/2026-06-15-issue-715-pr-800-randomuuid/todo.md`

- [ ] **Step 1: Inspect final diff**

Run: `git diff -- src/state/schema.ts test/schema-fingerprint.test.ts docs/todos/2026-06-15-issue-715-pr-800-randomuuid/todo.md docs/todos/2026-06-15-issue-715-pr-800-randomuuid/plan.md`.

- [ ] **Step 2: Run required targeted checks and security gates**

Use the smallest repo-native checks that cover the changed surface, plus mandatory gates for code changes as available.

- [ ] **Step 3: Run `$prep-merge-to-local-main`**

Follow the skill preflight, cleanup/commit, local main merge, post-merge verification, and handoff requirements.

## Self-Review

Spec coverage: The plan covers issue-first diagnosis already captured in `todo.md`, the minimal PR 800 source change, regression coverage, verification, security, and merge prep.

Placeholder scan: No placeholders intentionally left.

Type consistency: Existing `generateId(prefix: string): string` signature and output shape are preserved.
