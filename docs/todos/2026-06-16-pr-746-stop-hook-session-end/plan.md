# PR 746 Stop Hook Session End Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide and, if needed, minimally implement the fork-appropriate fix for premature `Stop` hook session closure while preserving real session-end closure.

**Architecture:** `src/hooks/stop.ts` is a telemetry-only hook that currently summarizes and closes the session. `src/hooks/session-end.ts` is the lifecycle hook that closes sessions and fans out optional consolidation and bridge work. The expected architecture is to keep session persistence closure in `SessionEnd`, not in `Stop`, unless upstream evidence shows Codex lacks a real `SessionEnd` lifecycle event.

**Tech Stack:** TypeScript ESM hook scripts, Vitest hook-source tests, repo-local task records, public GitHub read-only evidence.

---

### Task 1: Issue-First Evidence

**Files:**
- Read: `src/hooks/stop.ts`
- Read: `src/hooks/session-end.ts`
- Read: `test/hook-source-smoke.test.ts`
- Modify: `docs/todos/2026-06-16-pr-746-stop-hook-session-end/todo.md`

- [ ] **Step 1: Fetch public issue and PR evidence without credentials**

Run public read-only HTTP requests for Issue 493, Issue 745, PR 746 metadata, and PR 746 diff. Save any downloaded evidence outside the repo under `/tmp` if needed.

Expected: issue states, issue bodies/comments sufficient to understand claimed lifecycle behavior, and PR 746 diff available for inspection.

- [ ] **Step 2: Compare local hook architecture to the issue claims**

Inspect `src/hooks/stop.ts` and `src/hooks/session-end.ts`. Record whether `Stop` currently closes sessions early, whether `SessionEnd` still closes sessions, and whether removing `Stop`'s close call would regress Issue 493.

Expected: a clear Issue 493 and Issue 745 relevance decision.

### Task 2: Targeted TDD Fix If Relevant

**Files:**
- Modify: `test/hook-source-smoke.test.ts`
- Modify: `src/hooks/stop.ts`
- Modify: `docs/todos/2026-06-16-pr-746-stop-hook-session-end/todo.md`

- [ ] **Step 1: Write the failing test**

Change the stop hook smoke test so it expects `Stop` to call only `/agentmemory/summarize`, while `SessionEnd` remains responsible for `/agentmemory/session/end`.

Run: `npx vitest run --config vitest.cli-hooks.config.ts test/hook-source-smoke.test.ts -t "stop sends summarize telemetry without ending the session"`

Expected before production change: FAIL because the local stop hook still calls `/agentmemory/session/end`.

- [ ] **Step 2: Implement the minimal hook change**

Remove only the `guardedFetch(REST_URL, "/agentmemory/session/end", ...)` block from `src/hooks/stop.ts`. Leave summarization, SDK-child guard, auth guard, timeout, and fire-and-forget exit timing intact.

- [ ] **Step 3: Verify green**

Run: `npx vitest run --config vitest.cli-hooks.config.ts test/hook-source-smoke.test.ts -t "stop sends summarize telemetry without ending the session"`

Expected: PASS.

- [ ] **Step 4: Run the targeted hook suite**

Run: `npx vitest run --config vitest.cli-hooks.config.ts test/hook-source-smoke.test.ts`

Expected: PASS for the source hook smoke tests.

### Task 3: Review, Security, And Merge Prep

**Files:**
- Modify: `docs/todos/2026-06-16-pr-746-stop-hook-session-end/todo.md`
- Possible modify: coordinator worklist only if this worktree owns that file locally; otherwise leave coordinator list unchanged and report local task record.

- [ ] **Step 1: Run required local checks and security gates**

Run `git diff --check`, targeted hook tests, and available security checks required for hook/session lifecycle changes. If a required tool is missing or needs network/escalation, record the exact blocker and closest check run.

- [ ] **Step 2: Update the task record**

Record final decisions for Issue 493, Issue 745, PR 746, Fork issue 485; relevant diffs; security findings; verification evidence; open risks; and merge-prep status. Keep wording neutral and avoid GitHub URLs, hash issue syntax, and mentions.

- [ ] **Step 3: Run `$prep-merge-to-local-main`**

Follow the skill preflight, review chain, commit discipline, local-main merge, and post-merge verification. If no task-owned changes remain, record the no-op/skip according to the skill.

Expected: branch prepared against captured local `main`, or a concrete blocker reported with evidence.

## Self-Review

- Spec coverage: covers both issues, PR 746, security review, tests, neutral local documentation, and required merge prep.
- Placeholder scan: no placeholder tasks; unresolved outcomes are marked as pending in the task record because they depend on inspection evidence.
- Type consistency: hook names and file paths match local source/test paths inspected before writing.
