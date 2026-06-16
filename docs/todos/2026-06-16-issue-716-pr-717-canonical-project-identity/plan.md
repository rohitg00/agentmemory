# Canonical Project Identity Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review Issue 716 and PR 717 against the current fork and record a safe fork decision.

**Architecture:** Treat PR 717 as untrusted input, compare it with the current hook project resolver, and avoid changing persisted project identity unless repo evidence shows the current fork is unsafe. The current fork already routes hook project scoping through `src/hooks/_project.ts`, so the review focuses on that resolver and its project-scope tests.

**Tech Stack:** TypeScript ESM, hook scripts, Vitest-compatible resolver tests, Git public-read patch inspection.

---

## Sprint Contract

Goal: decide whether to import, adapt, reject, defer, mark already-fixed, or block PR 717 for Issue 716.

Scope:
- Inspect local instructions, branch state, issue claim, current resolver, related local project-identity work, and PR 717 patch.
- Add only local neutral task documentation unless a minimal safe code change is clearly required.
- Run targeted verification that demonstrates the current resolver behavior relevant to the issue.
- Run merge-prep workflow at the end.

Non-goals:
- Do not push, publish, comment, label, open pull requests, or write remote state.
- Do not change persisted project identity semantics without explicit approval.
- Do not edit other worktrees.
- Do not install dependencies.

Acceptance criteria:
- Issue 716 is evaluated issue-first against current fork behavior.
- PR 717 is inspected as untrusted input.
- Security impact is assessed for project isolation, privacy, persistence, hooks/tooling, and migration/backfill.
- Local neutral documentation records the decision and evidence.
- Targeted verification is run or limitations are recorded.
- `$prep-merge-to-local-main` is executed and its result is recorded.

Intended verification:
- `git status -sb --untracked-files=all`
- Public-read Issue 716 and PR 717 patch inspection.
- Resolver harness against current `src/hooks/_project.ts` for same-basename repos, linked worktrees, and legacy override.
- `git diff --check`
- Targeted test attempt with repo-native Vitest, with toolchain limitation recorded if unavailable in this worktree.

Known boundaries:
- Project identity is a persistence and privacy boundary because project keys scope memory, search, profiles, export/import, mesh filtering, and diagnostics.
- Remote URL-derived project keys can disclose host, owner, and repository names into stored memory rows and exported payloads.
- Existing basename-scoped rows are not automatically migrated by PR 717.

Stop conditions:
- Stop before remote writes, dependency installation, schema or migration behavior changes, or any auth/security boundary change without current-turn approval.
- Stop if verification requires modifying local dependency state in the worktree.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Branch and instructions | `git status -sb`, local `AGENTS.md`, coordinator worklist read | Done | Branch `review/issue-716-pr-717-canonical-project-identity`; worktree started clean. |
| Issue relevance | Current resolver inspection and resolver harness | Done | Same-basename collision is already avoided by opaque Git project IDs; cross-machine canonical remote identity remains intentionally deferred to explicit `AGENTMEMORY_PROJECT_ID`. |
| PR 717 inspection | Public patch read | Done | PR 717 adds remote URL canonicalization and generated script changes; it changes default persisted project keys to `host/owner/repo`. |
| Security review | Manual source-to-sink review of project key use | Done | Remote-derived keys increase repo metadata disclosure and need migration/backfill policy before default adoption. |
| Code import | Diff review | Done | No code imported; direct PR shape rejected as-is. |
| Local documentation | `git diff --check` and diff review | Done | Task record documents decision neutrally; no URL, active issue-reference, or mention matches found. |
| Merge prep | `$prep-merge-to-local-main` | Done | Documentation commit created, local `main` commit `60099a31029575412ba6fc27f4ab986196922e56` merged without conflicts, post-merge checks passed within noted dependency limits. |

## Tasks

### Task 1: Baseline and Evidence

**Files:**
- Read: `AGENTS.md`
- Read: `src/hooks/_project.ts`
- Read: `test/hook-project.test.ts`
- Read: `test/worktree-project-scope.test.ts`
- Read: coordinator worklist when available

- [x] Confirm branch and clean status.
- [x] Inspect local resolver and project-scope tests.
- [x] Inspect related local work through branch/history evidence only.
- [x] Inspect Issue 716 and PR 717 through public reads.

### Task 2: Decision and Documentation

**Files:**
- Create: `docs/todos/2026-06-16-issue-716-pr-717-canonical-project-identity/todo.md`
- Create: `docs/todos/2026-06-16-issue-716-pr-717-canonical-project-identity/plan.md`

- [x] Decide fork treatment: already-fixed for local basename collision, defer remote URL identity, reject PR 717 as-is.
- [x] Record security and migration reasoning without external URLs or active issue references.
- [x] Verify docs diff.

### Task 3: Merge Prep

**Files:**
- Modify: task record final notes if needed

- [x] Run required prep-merge preflight.
- [x] Commit task-owned documentation if review gates allow it.
- [x] Merge captured local `main` if not already an ancestor.
- [x] Run post-merge verification or record no-op.
