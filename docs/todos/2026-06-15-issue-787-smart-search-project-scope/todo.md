# Issue 787 Smart Search Project Scope

Task id: `2026-06-15-issue-787-smart-search-project-scope`

Scope: isolated review branch `review/issue-787-pr-869-smart-search-project-scope` in `/Users/A1538552/.codex/worktrees/999c/agentmemory`.

## Sprint Contract

Goal: ensure project-scoped reads are honored by the smart-search surfaces relevant to Issue 787 without importing unrelated upstream changes.

Non-goals:
- No push, PR creation, remote issue update, label update, or credentialed GitHub API read.
- No MCP tool count, REST endpoint count, version, KV scope, audit operation, hook, dependency, lockfile, CI, or plugin-manifest change unless required by the final minimal patch.
- No broad upstream PR import.

Acceptance criteria:
- Issue 787 disposition is decided from local repo evidence and public unauthenticated PR/issue evidence.
- PR 869 and PR 806 are compared by changed files and diffstat.
- `memory_smart_search` exposes and forwards a `project` filter through the full MCP server path.
- `mem::smart-search` applies project filtering to compact hybrid observation/memory results and expanded observations, while retaining backward compatibility for unscoped legacy hits.
- Existing `memory_recall` project behavior is preserved.
- Local task notes document issue disposition, PR disposition, fork decision, baseline evidence, candidate comparison, security assessment, commands, and residual risk.

Intended verification:
- Regression tests first, with observed red result before production-code edits.
- Targeted smart-search and MCP project tests.
- `npm run build`
- `npm run lint`
- `npm test`
- Security gates appropriate for MCP/API/storage behavior: Semgrep, OSV, Gitleaks before commit.
- `$prep-merge-to-local-main` after implementation or no-op decision.

Known boundaries:
- MCP/REST inputs are security boundary surfaces. REST already whitelists `/agentmemory/smart-search` fields; MCP handlers must continue validating and trimming inputs.
- `mem::smart-search` reads `KV.sessions`, `KV.memories`, and observations. Filtering must not introduce external network calls, filesystem access, raw request-body forwarding, schema migration, or persistence format changes.
- Project identifiers can be opaque `git:<hash>` values and must not be logged raw beyond existing behavior.

Stop conditions:
- Candidate PR evidence is unavailable without credentialed reads.
- Correct behavior requires changing public API beyond adding an optional MCP argument.
- Security scan reports high-impact unresolved findings.
- Verification cannot run and no narrower local substitute exists.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Validate issue and candidate PRs | Public unauthenticated issue page and PR diff files, local source inspection | done | Issue describes unscoped MCP smart search, smart-search memory/observation path, and memory_recall schema gap; local fork already fixed memory_recall schema/forwarding but not smart-search schema/full-server forwarding/core filtering |
| Add regression coverage | `vitest run --root ... --config ... test/smart-search.test.ts test/mcp-project-scope.test.ts test/mcp-surface-default.test.ts` | red | 4 expected failures: smart-search compact project filtering, smart-search expanded project filtering, MCP smart-search project forwarding, and MCP smart-search schema exposure |
| Apply minimal fork fix | Diff review | done | Added cached KV project matching in `mem::smart-search`, MCP forwarding, tool schema, generated MCP tools reference, and focused tests |
| Security assessment | Manual boundary review, Semgrep/OSV/Gitleaks gates | done | Semgrep completed with 0 findings; OSV found no package sources because this repo has no lockfile; staged Gitleaks completed with no leaks |
| Merge prep | `$prep-merge-to-local-main` workflow | pending | Not run yet |

## Candidate Comparison

Issue 787:
- Expected: project-scoped search callers only receive results for the requested project, with legacy unscoped rows remaining backward-compatible where project ownership cannot be resolved.
- Current fork baseline: `memory_recall` schema and MCP handler already forward `project` to `mem::search`; standalone MCP proxy also already forwards `project` for `memory_recall` and `memory_smart_search`.
- Current fork gap: full-server `memory_smart_search` schema lacks `project`, its handler forwards only `query`, `expandIds`, and `limit`, and `mem::smart-search` applies `project` only to lesson recall, not observation/memory results.

PR 869:
- Diffstat: 2 files changed, 135 insertions, 13 deletions.
- Files: `src/functions/smart-search.ts`, `test/smart-search.test.ts`.
- Disposition: candidate source for the core `mem::smart-search` filtering strategy.
- Risk: does not cover MCP schema/handler forwarding required by the issue in this fork.

PR 806:
- Diffstat: 7 files changed, 231 insertions, 8 deletions.
- Files: `src/functions/smart-search.ts`, `src/mcp/server.ts`, `src/mcp/standalone.ts`, `src/mcp/tools-registry.ts`, `test/mcp-standalone-proxy.test.ts`, `test/mcp-surface-default.test.ts`, `test/smart-search.test.ts`.
- Disposition: broader candidate. Some parts are already present in this fork, especially standalone project validation/proxy and `memory_recall` project forwarding.
- Risk: broader than needed if imported wholesale; local adaptation should avoid duplicate or unrelated changes.

Fork decision: adapt minimal fix from both candidates, preferring PR 869-style cached project resolution for core filtering plus only the missing MCP schema/handler tests and implementation from PR 806.

## Security Assessment

Initial review:
- Auth/secret behavior unchanged.
- No new non-loopback HTTP, networking, filesystem, subprocess, dependency, lockfile, CI, Docker, or publishing surface expected.
- REST `/agentmemory/smart-search` already whitelists `project` in its payload; no raw `req.body` forwarding change needed.
- MCP handler must trim and conditionally forward optional `project`, matching existing `memory_recall` pattern.
- Project filtering reads local KV scopes only and should not log raw project identifiers beyond existing query log behavior.

Post-implementation review:
- `src/mcp/server.ts` validates `query`, parses `expandIds`, clamps `limit`, trims optional `project`, and forwards only a whitelisted payload to `mem::smart-search`.
- `src/functions/smart-search.ts` performs local KV reads from `KV.memories` and `KV.sessions`; it adds no network, subprocess, filesystem, schema, migration, or auth behavior.
- Memory rows with an explicit project are matched by their own memory project before falling back to session project, avoiding same-session cross-project leakage for saved memories. Unscoped legacy rows remain visible for backward compatibility.
- Semgrep default registry scan completed with no findings.
- OSV could not evaluate this repository because no package source or lockfile was present; no dependency or lockfile files were changed.

Review notes:
- `$simple-code`: no cleanup changes were useful after the focused comment fix; helper and branch structure match the changed behavior.
- `$requesting-code-review`: independent subagent review was not run because current subagent tooling only permits spawning when the user explicitly asks for subagents. A local focused review covered requirements fit, test coverage, integration risk, maintainability, and task-scope drift.
- `$review-implementation`: local adversarial review found no critical or important findings. Evidence inspected: diff, changed line ranges in `src/functions/smart-search.ts`, `src/mcp/server.ts`, `src/mcp/tools-registry.ts`, generated `REFERENCE.md`, and focused tests.
- Commit path review: no `core.hooksPath` is configured; Git resolves hooks to the shared repository hook directory, where `pre-commit`, `prepare-commit-msg`, `commit-msg`, and `post-commit` are absent. No commit signing config is set in this checkout.

## Commands

- `git status -sb --untracked-files=all`
- `git branch --show-current`
- `git worktree list --porcelain`
- `curl -L --fail --silent --show-error ...PR 869 diff...`
- `curl -L --fail --silent --show-error ...PR 806 diff...`
- `git apply --stat /tmp/agentmemory-pr869.diff`
- `git apply --numstat /tmp/agentmemory-pr869.diff`
- `git apply --stat /tmp/agentmemory-pr806.diff`
- `git apply --numstat /tmp/agentmemory-pr806.diff`
- `npm test -- test/smart-search.test.ts test/mcp-project-scope.test.ts test/mcp-surface-default.test.ts` failed before reaching tests because this isolated worktree has no local `node_modules` and `vitest` was not on PATH.
- `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --root /Users/A1538552/.codex/worktrees/999c/agentmemory --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts --exclude test/integration.test.ts test/smart-search.test.ts test/mcp-project-scope.test.ts test/mcp-surface-default.test.ts` failed as expected with 4 regression failures.
- `npm test -- test/smart-search.test.ts test/mcp-project-scope.test.ts test/mcp-surface-default.test.ts` passed after the fix: 3 files, 22 tests.
- `npm run build` initially failed because this isolated worktree had no local dependency links; after linking ignored local `node_modules` entries to the saved project's installed packages, `npm run build` passed.
- `npm run lint` passed.
- `npm run skills:gen` updated generated MCP tools reference after schema change.
- `npm run skills:check` passed: 15 skills checked.
- `npm test` passed after generated reference update: 157 files, 1977 tests.
- Repeated `npm run build`, `npm run lint`, targeted smart-search/MCP tests, and full `npm test` passed after the final code and reference changes.
- `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings.
- `osv-scanner scan source .` and `osv-scanner scan source package.json` exited with "No package sources found"; no dependency files or lockfiles changed.
- `git diff --check` passed.
- `gitleaks protect --staged --redact` passed with no leaks.

## Progress

- [x] Confirmed branch and clean status.
- [x] Read repo instructions, fork workflow docs, ADR, worklist row, issue evidence, PR diffs, relevant source, and existing tests.
- [x] Write failing regression tests.
- [x] Implement minimal patch.
- [x] Run final verification and security gates.
- [ ] Run `$prep-merge-to-local-main`.

## Residual Risk

Formal independent subagent review was not run because the current subagent tool policy requires explicit user authorization for subagent spawning. Build/test verification created ignored local artifacts: `node_modules/`, `dist/`, generated plugin script maps and declaration outputs, and a pre-existing or test-created `integrations/hermes/__pycache__/`. These remain untracked/ignored and are not task-owned source changes.
