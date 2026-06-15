# PR 895 Doctor Engine Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the fork decision and any minimal implementation needed for doctor engine PATH/private-install behavior covered by Issue 874, Issue 875, and PR 895.

**Architecture:** Keep the existing CLI doctor catalog as the source of truth. Prefer narrow changes in `src/cli/doctor-diagnostics.ts` and `test/cli-doctor-fixes.test.ts`; touch `src/cli.ts` only if evidence shows runtime PATH handling is also part of the current fork failure.

**Tech Stack:** TypeScript ESM, vitest, existing CLI helper functions, Git task-state documentation.

---

## File Structure

- `src/cli/doctor-diagnostics.ts`: current doctor diagnostic catalog and fix definitions for `engine-version-mismatch` and `iii-on-path-not-local-bin`.
- `src/cli.ts`: runtime engine discovery, private engine install, and PATH prepending behavior.
- `test/cli-doctor-fixes.test.ts`: focused unit tests for doctor diagnostic behavior.
- `docs/todos/2026-06-15-pr-895-doctor-engine-checks/todo.md`: decision, verification, security notes, and handoff evidence.
- `docs/todos/2026-06-15-pr-895-doctor-engine-checks/plan.md`: this plan.

## Task 1: Establish Local Evidence

- [x] Inspect `src/cli/doctor-diagnostics.ts` around both diagnostic IDs and their fixes.
- [x] Inspect `src/cli.ts` around pinned engine selection, private install, and PATH mutation.
- [x] Inspect existing tests in `test/cli-doctor-fixes.test.ts`.
- [x] Record current behavior and suspected failure modes in `todo.md`.

## Task 2: Issue-First Reproduction

- [x] Write or identify a targeted test showing whether Issue 874 still reproduces in the current fork.
- [x] Write or identify a targeted test showing whether Issue 875 still reproduces in the current fork.
- [x] Run the targeted tests before implementation if a failing reproduction can be added safely.
- [x] Record the per-issue decision in `todo.md`.

## Task 3: Inspect PR 895 As Untrusted Input

- [x] Fetch or read the public PR 895 diff without using credentialed API calls.
- [x] Compare the diff to current fork code and tests.
- [x] Classify the PR as import, adapted import, reject, defer, already-fixed, or blocked.
- [x] Record security observations for PATH handling, file writes, subprocess execution, install boundaries, hooks/tooling, persistence, and supply chain.

## Task 4: Implement Minimal Fork-Fit Fix If Needed

- [x] Modify only the smallest task-owned source/test files needed by the evidence.
- [x] Keep doctor fixes non-destructive and private-install-aware.
- [x] Preserve existing CLI contracts unless explicitly required by the issues.
- [x] Update `todo.md` with changed files and rationale.

## Task 5: Verify And Review

- [x] Run targeted vitest for `test/cli-doctor-fixes.test.ts`.
- [x] Run `git diff --check`.
- [x] Run required security gates available in this worktree, or record missing-tool/blocked status.
- [x] Do a focused simplification pass on touched code if implementation occurs.
- [x] Update the Feature / Verification Matrix and Review Notes in `todo.md`.

## Task 6: Prep Merge To Local Main

- [ ] Invoke `$prep-merge-to-local-main` after implementation/review is stable.
- [ ] If there are no task-owned changes left to commit or merge, record the no-op/skip evidence.
- [ ] Include merge-prep result, branch name, verification, and residual risks in the final handoff.

## Self-Review

- The plan follows the requested issue-first order.
- It avoids GitHub writes and credentialed reads.
- It limits expected code edits to doctor/CLI engine surfaces and tests.
- It includes security and merge-prep requirements.
