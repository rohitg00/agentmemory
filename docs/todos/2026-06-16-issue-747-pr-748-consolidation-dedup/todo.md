# PR 748 / Issue 747 Consolidation Dedup Review

Task id: `2026-06-16-issue-747-pr-748-consolidation-dedup`

Branch: `review/issue-747-pr-748-consolidation-dedup`

## Scope

- Owning scope: `agentmemory` repository under `/Users/A1538552/.codex/worktrees/5883/agentmemory`.
- Work item: review Issue 747 and PR 748, decide fork fit, and implement only the minimal needed local change if still relevant.
- Candidate surface: consolidation persistence and targeted tests.
- Delegation: none yet.

## Sprint Contract

Goal: determine whether same-title consolidation can still create duplicate or orphaned memories locally, and either import/adapt the minimal fix or document a rejection/defer/already-fixed decision.

Non-goals:
- No GitHub writes, pushes, PR creation, tracker comments, labels, or public issue body edits.
- No broad consolidation refactor, schema migration, route migration, or external-service change.
- No dependency changes.

Acceptance criteria:
- Issue-first assessment records whether the failure is relevant in current fork/main.
- PR 748 is inspected as untrusted input and compared to local code.
- If relevant, a regression test covers the duplicate/orphan behavior and the fix is minimal.
- Security review covers persistence dedupe, scope isolation, race/idempotency, data loss, API/schema handling, DoS/performance, hooks/tooling, and supply chain as applicable.
- Required verification evidence and prep-merge-to-local-main result are recorded.

Intended verification:
- Targeted Vitest for consolidation tests.
- `git diff --check`.
- Diff-scoped security review and required security gates if code changes remain.
- Final prep-merge-to-local-main workflow.

Known boundaries:
- Credentialed GitHub/API reads require current-turn approval and are not planned.
- Public issue/PR metadata may be read without writing remote state.
- Local main merge is authorized only by the explicit prep instruction at the end of the task.

Stop conditions:
- Required fix would change persisted schema, externally consumed API, auth/security boundaries, or data migration behavior.
- Correct behavior cannot be determined from issue, PR diff, local code, and tests.
- Required security scanner reports block completion and cannot be fixed within scope.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance assessment | Inspect local consolidation path and reproduce or disprove with tests | Done | Local `src/functions/consolidate.ts` had stale `existingMemories` snapshot and unused `existingTitles`; red regression produced duplicate latest memories. |
| PR 748 fork-fit decision | Compare public PR diff to local code and tests | Done | Adapted import: live in-run memory snapshot from PR 748 plus local latest-only guard for existing version chains. |
| Minimal implementation if needed | Focused code diff and targeted tests | Done | `src/functions/consolidate.ts` updates snapshot after create/evolve and matches only latest memories; `test/consolidate-project-scope.test.ts` adds same-title and latest-version coverage. |
| Security review | Manual security pass plus required gates when applicable | Done | Passive security review, Codex Security diff scan, and Semgrep found no reportable finding. |
| Prep merge to local main | Run requested prep-merge-to-local-main workflow | Done | Pre-merge task commit `b27527fcfb50e89753ada38c7563a08a08231253`; local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was already an ancestor, so merge was a no-op. |

## Progress

- Started from detached clean worktree at local main commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
- Created branch `review/issue-747-pr-748-consolidation-dedup`.
- Read repo-local `AGENTS.md`, README excerpt, package scripts, ADRs 0002-0004, and coordinator worklist row.
- Public unauthenticated reads showed Issue 747 and PR 748 still open; PR 748 is unmerged.
- Baseline targeted Vitest using temporary config passed existing 5 tests; after adding regression tests, the two new same-title cases failed with duplicate latest memories.
- Implemented adapted import:
  - Removed unused title set.
  - Added `reflectMemoryInSnapshot` so same-run concept groups deduplicate against freshly written memories.
  - Restricted existing title matches to `isLatest` memories to avoid evolving older roots when a persisted version chain already exists.
  - Added tests for two-group collision, three-group linear chain, and persisted latest-version selection.
- Targeted verification: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --config /tmp/agentmemory-vitest.config.mjs test/consolidate-project-scope.test.ts` passed, 8 tests.
- `git diff --check` passed.
- Codex Security diff scan completed with no reportable findings:
  - Markdown report: `/tmp/codex-security-scans/agentmemory/20260616_consolidation_dedup/report.md`
  - HTML report: `/tmp/codex-security-scans/agentmemory/20260616_consolidation_dedup/report.html`
  - Deep-review ledger: `/tmp/codex-security-scans/agentmemory/20260616_consolidation_dedup/artifacts/02_discovery/work_ledger.jsonl`
- Semgrep: `semgrep scan --config p/default --error --metrics=off src/functions/consolidate.ts test/consolidate-project-scope.test.ts docs/todos/2026-06-16-issue-747-pr-748-consolidation-dedup/todo.md` passed with 0 findings.
- Gitleaks staged scan before commit: `gitleaks protect --staged --redact` passed with no leaks.
- Commit created: `b27527fcfb50e89753ada38c7563a08a08231253`.
- Prep merge to local main:
  - Local main commit: `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
  - Branch diff reviewed against local main: task record, consolidation function, and consolidation test.
  - Local main was already an ancestor of branch HEAD, so no merge commit was created.
  - No conflicts.
  - Ignored verification artifact present after Vitest: `node_modules/.vite/vitest`; classified as local test cache and left in place.
- Final post-merge verification:
  - `git diff --check HEAD` passed.
  - `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --config /tmp/agentmemory-vitest.config.mjs test/consolidate-project-scope.test.ts` passed, 8 tests.
  - `semgrep scan --config p/default --error --metrics=off src/functions/consolidate.ts test/consolidate-project-scope.test.ts docs/todos/2026-06-16-issue-747-pr-748-consolidation-dedup/todo.md` passed with 0 findings.
- Review chain:
  - Security-best-practices passive pass: no critical or major issue in touched TypeScript persistence code.
  - Simple-code pass: no cleanup changes; helper kept because it centralizes the create/evolve snapshot update rule.
  - Focused code review: ACCEPT; no Critical or Important findings.
  - Review Implementation: ACCEPT; no blocking findings. Subagent adversarial review was not used because the available spawn tool requires explicit user approval for subagents.

## Security Notes

- Auth/authorization/API surface: no REST, MCP, auth, or request payload boundary change.
- Scope isolation: existing project guard is preserved; tests still cover scoped and unscoped behavior.
- Data loss/orphaning: fix reduces duplicate latest memories and prevents same-run orphan roots; latest-only matching avoids extending obsolete roots.
- Race conditions: no new cross-process locking is introduced; concurrent consolidation runs can still race on the memory store and remain a residual risk outside this scoped import.
- Performance/DoS: same O(n) title scan remains; helper updates an in-memory array only, with no extra provider calls or storage enumeration.
- Supply chain/hooks/tooling: no dependency, hook, CI, package-manager, or external-service changes.
