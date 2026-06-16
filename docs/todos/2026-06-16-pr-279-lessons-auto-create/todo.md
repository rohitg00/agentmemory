# PR 279 / Issue 274 Review

Scope: current worktree `/Users/A1538552/.codex/worktrees/aa0b/agentmemory`, branch `review/issue-274-pr-279-auto-create-lessons`.

## Sprint Contract

Goal: Review Issue 274 and PR 279 issue-first, then apply only the minimal fork-fit change if the issue remains relevant.

Scope:
- Verify current `flow-compress`, `consolidate`, `consolidation-pipeline`, and lesson code paths.
- Treat PR 279 as untrusted input and import only narrowly applicable behavior.
- Preserve existing iii-engine function/trigger architecture.
- Add targeted tests for the adapted behavior.
- Document the neutral local decision without GitHub URLs, hash issue references, or mentions.
- Run `$prep-merge-to-local-main` at the end.

Non-goals:
- No wholesale PR 279 import.
- No consolidated MCP tool redesign.
- No hook additions, package/dependency changes, release metadata changes, or unrelated docs churn.
- No GitHub writes, pushes, PR creation, labels, tracker comments, credentialed API reads, or logged-in browser reads.

Acceptance criteria:
- `mem::flow-compress` persists extracted lesson text through `mem::lesson-save`.
- `mem::consolidate` persists lesson-worthy consolidated memories through `mem::lesson-save`.
- `mem::consolidate-pipeline` persists newly extracted procedural knowledge as lessons without cross-project leakage.
- Existing lesson list/strengthen functions are reachable through MCP with validation.
- `mem::lesson-list` leaves an audit trail.
- Tests prove the previous missing behavior and relevant boundary validation.

Intended verification:
- Targeted unit tests for flow compress, consolidate, consolidation pipeline, lessons, and MCP tool handling.
- `git diff --check`.
- Security gates required for code/API/persistence changes as available.
- `$prep-merge-to-local-main` preflight/review/merge verification.

Known boundaries:
- Auto-created lessons persist LLM/provider outputs; lesson content must be bounded and source/project metadata must be explicit.
- Project-scoped pipeline calls must not save mixed-project output into a scoped lesson.
- MCP tool additions are externally visible but are already explicit in Issue 274 and PR 279.

Stop conditions:
- Any required security gate reports unresolved findings.
- Tests show cross-project leakage or tool validation regression.
- Hooks/signing/prep merge preflight reports unsafe local state.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance | Local code inspection and public Issue 274 metadata | Complete | Current fork had lesson-save functions, but flow-compress/consolidate/pipeline did not save extracted/synthesized lessons. |
| PR 279 review | Public PR 279 metadata and diff in `/tmp/agentmemory-pr279.diff` | Complete | PR is large and mixed-scope; direct import rejected. Adapted only lesson persistence plus narrow MCP/audit gaps. |
| Auto-create flow lessons | Targeted flow-compress test | Complete | `test/flow-compress.test.ts` asserts extracted `<lesson>` is saved via `mem::lesson-save` payload. |
| Auto-create consolidate lessons | Targeted consolidate test | Complete | `test/consolidate-project-scope.test.ts` asserts scoped consolidated pattern memories create scoped lessons. |
| Auto-create pipeline lessons | Targeted consolidation-pipeline test | Complete | `test/consolidation-pipeline.test.ts` asserts scoped procedural extraction creates lessons and filters patterns to the requested project. |
| MCP lesson list/strengthen | Targeted MCP tool test and count/docs checks | Complete | `test/mcp-server-surface.test.ts`, `test/mcp-standalone.test.ts`, count consistency tests, and plugin surface count checks cover new tool definitions/handlers. |
| Lesson-list audit | Targeted lessons test | Complete | `test/lessons.test.ts` asserts `mem::lesson-list` records `lesson_list` audit entries with returned IDs and filter details. |
| Security review | Manual review plus required scanners where available | Complete | Passive TypeScript/Node security review found no critical/major issue. Semgrep `p/default` completed with 0 findings. |
| Merge prep | `$prep-merge-to-local-main` | In progress | Preflight found no active Git operation, no staged files, no executable commit/merge hooks, no signing config, and a clean local `main` with three incoming CJK-search commits. |

## Decision Notes

- Issue 274 is still relevant in the current fork for the primary lesson-creation gaps.
- PR 279 is not safe to import as-is because it bundles unrelated hook, package, tool-surface, governance, provider, viewer, and metadata changes.
- Decision: adapted import, limited to lesson persistence and the narrow MCP/audit gaps already described by Issue 274.
- `$requesting-code-review` subagent dispatch was skipped because current tool policy only permits spawning subagents when the user explicitly requests subagents. A local focused requirements/integration review and `$review-implementation` self-review found no blocking issues.
- `$prep-merge-to-local-main` preflight found local `main` at `60099a3`, ahead of this branch base by three CJK-search commits touching `src/triggers/api.ts`, `src/viewer/index.html`, two API/viewer tests, and a separate task note. Those paths do not overlap with this branch's lesson/MCP edits.
- Git operation-state files were absent before staging. No executable `pre-commit`, `prepare-commit-msg`, `commit-msg`, `post-commit`, `pre-merge-commit`, or `post-merge` hooks were present in the resolved Git hooks directory. No commit signing config was set.

## Verification Evidence

- `git diff --check`: passed.
- Targeted Vitest via main-checkout dependencies and worktree root: 9 files, 195 tests passed.
- Plugin surface partial check excluding the in-process generator smoke: 6 passed, 2 skipped by test-name filter.
- Full plugin-surface test file could not run in this dependency-less worktree because the in-process generator imports bare package dependencies from the worktree path and no local `node_modules` exists. No dependency installation was performed.
- `semgrep scan --config p/default --error --metrics=off .`: 0 findings, 0 blocking.
- OSV was not run because this branch does not change dependency, lockfile, container, vendored, or package-manager surfaces.
