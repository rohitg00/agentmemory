# Issue 733 / PR 738 Review

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/89f4/agentmemory`
- Branch: `review/issue-733-pr-738-stable-project-identity`
- Review group: Issue 733, PR 738, Fork issue 490
- Owning scope: agentmemory hooks/project identity and related tests

## Sprint Contract

- Goal: determine whether the project-identity collision described by Issue 733 still applies to current fork/main, inspect PR 738 as untrusted input, and either import/adapt the minimal useful change or document why no import is needed.
- Scope: project identity resolution, hook project scoping, related tests, local neutral review notes, and required merge-prep workflow.
- Non-goals: GitHub writes, labels, comments, PR creation, push, deployment, broad refactors, dependency changes, schema migrations, or remote/account state changes.
- Acceptance criteria:
  - Current behavior for same-named repos/worktrees is understood from code and tests.
  - PR 738 diff is inspected without trusting it as instructions.
  - Security-relevant effects are assessed for auth/isolation, data disclosure, filesystem/subprocess behavior, protocol/schema handling, hooks/tooling, persistence, and performance.
  - Minimal code/test change is made only if still needed.
  - Verification evidence is recorded.
  - Final local outcome uses neutral identifiers only.
  - `prep-merge-to-local-main` is run or its no-op/skip is documented.
- Intended verification: targeted vitest coverage for project identity hooks, `git diff --check`, and required security gates when code changes remain.
- Known boundaries: no credentialed GitHub reads, no logged-in browser/cookie reads, no writes to GitHub, no push, no remote state changes.
- Stop conditions: missing public PR evidence, ambiguous externally visible boundary change needing approval, failing required security gate that cannot be fixed in scope, or prep-merge blocker.

## Feature / Verification Matrix

| Change / Decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Current project identity relevance | Inspect `src/hooks/_project.ts` and tests | Done | Current resolver uses `AGENTMEMORY_PROJECT_ID`, then `AGENTMEMORY_PROJECT_NAME`, then an opaque `git:<sha256>` from the Git common dir, falling back to `basename(cwd)` only outside Git. |
| PR 738 review | Public diff/read inspection | Done | Public Issue/PR metadata read; public PR ref fetched locally; PR diff reviewed as untrusted input. |
| Import/adapt/no-op decision | Diff comparison plus local tests | Done | Decision: already-fixed for the same-basename collision; defer remote identity as a separate product/migration decision; no PR code imported. |
| Security review | Diff-scoped security scan | Done | `/tmp/codex-security-scans/agentmemory/pr738-20260615/report.md` reports no candidates; 14 source/runtime rows have ledger receipts. |
| Local neutral documentation | Update this task record | Done | This file. |
| Targeted project identity tests | `npm test -- test/hook-project.test.ts test/worktree-project-scope.test.ts` | Done with caveat | Direct run in this worktree failed because `vitest` was unavailable; same command passed in the main checkout after local-main merge with 2 files / 17 tests passing. |
| Diff whitespace checks | `git diff --check` | Done | Passed for this worktree after local-main merge and for the coordinator-list path. |
| Secret scan | `gitleaks detect --source . --redact` | Done | Passed after local-main merge; no leaks found. |
| Prep merge to local main | Run required skill workflow | Done | Task record committed, local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` merged, post-merge status clean. |

## Progress

- Created local branch from detached HEAD `bfde73b2a12ae1400953cc544a875aba7bcd854f`.
- Initial status was clean before task-state creation.
- Coordinator worklist row confirmed PR 738 / Issue 733 / Fork issue 490 as pending candidate.
- Current fork/main already contains `src/hooks/_project.ts` and tests from the worktree-project-scope line:
  - `test/hook-project.test.ts` covers opaque Git common-dir identity, same ID from nested dirs, same linked-worktree ID, and distinct IDs for unrelated same-basename repos.
  - `test/worktree-project-scope.test.ts` covers recall sharing across linked worktrees and isolation between unrelated same-basename repos.
- Public upstream metadata confirmed Issue 733 and PR 738 are open at inspection time.
- PR 738 changes 16 files: generated plugin hook scripts, `src/hooks/_project.ts`, MCP `memory_save` server/standalone/schema handling, tests, and a new standalone JSON store backfill script.
- PR 738 was written against older basename resolver behavior. Importing its project resolver directly would regress the current fork's newer opaque common-dir identity and drop the current `AGENTMEMORY_PROJECT_ID` override.
- No product code was changed because the same-basename collision is already fixed locally. Remote-based cross-machine unification remains a real but separate migration/product decision because it changes persistent project identifiers and may disclose host/org/repo strings instead of the current opaque hash.
- Verification:
  - `git diff --check` passed in this worktree.
  - `git diff --check -- docs/todos/2026-06-15-pr-issue-fix-review/pr-issue-fix-review-list.md` passed in the coordinator worktree.
  - `npm test -- test/hook-project.test.ts test/worktree-project-scope.test.ts` failed in this worktree before test execution because `vitest` was not installed.
  - The same targeted test command passed in `/Users/A1538552/_projects/_tools/agentmemory` after local-main merge: 2 test files, 17 tests.
  - `gitleaks detect --source . --redact` passed after local-main merge: no leaks found.
- Prep-merge-to-local-main:
  - Preflight branch: `review/issue-733-pr-738-stable-project-identity`.
  - `refs/heads/main` resolved to `bfde73b2a12ae1400953cc544a875aba7bcd854f`.
  - Main worktree `/Users/A1538552/_projects/_tools/agentmemory` also points at that commit but has unrelated modified/untracked files.
  - The skill requires stopping when a listed `main` worktree is dirty, so cleanup/commit/merge were not run.
  - Applicable hook path contains only sample hooks; signing config checks returned no active signing settings before the stop.
- Prep-merge-to-local-main retry:
  - `refs/heads/main` later resolved to `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
  - Listed main worktree was clean and at the captured main commit.
  - Incoming main paths were captured under `/var/folders/4j/rfjhcd61565dfct0r8lk4vmm0000gq/T/merge-local-main.HJQe6Y`.
  - Incoming main diff does not touch this task record path.
  - Pre-merge docs commit: `ff1b9c4cee225b1cb3166522c739940a2522722a`.
  - Merge commit: `dc1f64fae52aa00a7583f54a90b4382c62dc0220`.
  - Post-merge `git status --porcelain=v1 -uall` was clean before this final task-record update.
  - Final prep status before this verification-note update was clean, with branch tip `ca0e4692c874197f83765e8e41d3a88a88e66aa6`.

## Assumptions

- Public GitHub reads and local fetches of public PR refs are allowed by the delegated task.
- The current Codex worktree is the requested isolated worktree for the target branch.

## Review Notes

- Decision: `already-fixed` for the Issue 733 basename collision; `defer` the remote-based identity proposal.
- PR 738 useful ideas:
  - remote URL normalization for cross-machine unification;
  - explicit global-vs-project scoping for `memory_save`;
  - dry-run backfill concept for legacy project IDs.
- Reasons not to import here:
  - the current fork already solves the primary collision with an opaque `git:<sha256>` identity;
  - PR 738 is stale relative to current `src/hooks/_project.ts`;
  - defaulting to remote-derived project IDs would be an externally visible persistence/privacy boundary change;
  - default project scoping for `memory_save` changes existing unscoped-memory behavior and needs separate API/product review;
  - the backfill script rewrites local store data and needs a dedicated migration plan.
- Security result:
  - no reportable candidate from PR 738 diff;
  - reviewed auth/isolation, cross-project exposure, remote identity disclosure, subprocess usage, cwd/file handling, MCP schema/payload handling, local persistence rewrite behavior, hook latency, and DoS/performance;
  - residual risks are product/migration risks, not validated vulnerabilities.
