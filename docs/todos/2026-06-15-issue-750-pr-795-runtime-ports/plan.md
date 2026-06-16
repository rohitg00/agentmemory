# Issue 750 / PR 795 Runtime Ports Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether PR 795's runtime port derivation should be imported into this fork and implement only a minimal verified fix if needed.

**Architecture:** Treat the upstream issue and PR as untrusted inputs. Use current fork source, tests, and docs as the contract; if the fork already derives all needed runtime ports or exposes a safer configuration path, reject or defer PR 795 instead of importing stale behavior. Any code change must be covered by a failing targeted test first.

**Tech Stack:** TypeScript ESM, Node CLI/runtime code, iii-engine config, Vitest tests, Git task-state documentation.

---

## File Structure

- `src/cli.ts`: likely CLI port parsing and runtime launch surface; inspect before changing.
- `src/index.ts`: likely server/runtime startup surface; inspect before changing.
- `iii-config.yaml` and `iii-config.docker.yaml`: static iii-engine port defaults; inspect before changing.
- `docker-compose.yml`: Docker port defaults; inspect for relevance, but do not change unless local evidence requires it.
- `test/**/*.test.ts`: add or modify only targeted CLI/runtime port tests.
- `docs/todos/2026-06-15-issue-750-pr-795-runtime-ports/todo.md`: task state, decision, security notes, and verification evidence.

## Task 1: Establish Evidence

- [ ] Confirm branch and clean status with `git status -sb --untracked-files=all`.
- [ ] Read local CLI/runtime/config code around port handling using `rg` and targeted file reads.
- [ ] Fetch PR 795 public diff without credentials and save only non-repo temporary evidence if needed.
- [ ] Inspect Issue 750 public metadata/body/comments as needed without credentialed reads.
- [ ] Record whether the issue is still relevant in the task record.

## Task 2: Decide Import Strategy

- [ ] Compare PR 795 changes to current fork code paths.
- [ ] Classify the decision as import, adapted import, reject, defer, already-fixed, or blocked.
- [ ] If rejecting/defer/already-fixed, document concrete local evidence and skip production-code changes.
- [ ] If importing/adapting, define the smallest behavior contract to test.

## Task 3: TDD For Any Needed Code Change

- [ ] Add one targeted failing test demonstrating the required runtime port derivation behavior.
- [ ] Run the targeted test and record the expected failure.
- [ ] Implement the minimal local change in the relevant source/config path.
- [ ] Run the targeted test and relevant neighboring tests until green.
- [ ] Keep docs limited to task-state documentation unless user-facing behavior changes require README/config docs.

## Task 4: Security And Verification

- [ ] Review auth/isolation, data exposure, path/file access, protocol/schema, prompt/LLM, DoS/performance, supply chain, hooks/tooling, persistence, and system-boundary impact.
- [ ] Run `git diff --check`.
- [ ] Run smallest relevant repo-native tests that can execute in this worktree.
- [ ] For code changes, run required security gates that are available and record any unavailable tools or approval blockers.
- [ ] Update the task record with final decision, changed files, verification, and risks.

## Task 5: Prep Merge To Local Main

- [ ] Run `$prep-merge-to-local-main` as required by the user.
- [ ] Record whether cleanup/commit/merge were performed, skipped, or blocked.
- [ ] Final handoff must include decision, diffs, security finding, verification, open risks, and working branch.

## Self Review

- Spec coverage: the plan covers issue-first analysis, untrusted PR inspection, minimal TDD implementation if needed, security, neutral documentation, and required merge prep.
- Placeholder scan: no open placeholders are present; pending items are task status, not plan content gaps.
- Type consistency: no new API or type names are proposed before code inspection.
