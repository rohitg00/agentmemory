# Issue 512 / PR 536 Viewer CJK Memory Search

Scope: `src/viewer/index.html`, `src/triggers/api.ts`, focused tests for the Memories viewer/API search path.

## Sprint Contract

Goal: decide and, if warranted, minimally adapt PR 536 so the Viewer Memories tab can search Chinese/Japanese memory content through backend search behavior.

Non-goals:
- Do not import PR 536 verbatim.
- Do not add dependencies, new endpoints, migrations, or external services.
- Do not change memory language preservation or LLM prompting.
- Do not write to GitHub or update tracker state.

Acceptance criteria:
- Issue-first assessment records whether the problem remains relevant locally.
- Viewer Memories search uses backend memory search for non-empty queries while preserving local type filtering and IME-safe input handling.
- Backend search remains authenticated, scoped, bounded, and memory-only.
- Targeted tests cover Chinese/Japanese memory query behavior and viewer wiring.
- Required verification and security checks are run or limitations are recorded.
- Prep merge to local main is attempted after implementation/review.

Intended verification:
- `npm test -- test/api-memories-project.test.ts test/memories-pagination.test.ts`
- Targeted viewer source tests if added.
- `git diff --check`
- Required security gates as available for API/viewer protocol handling changes.

Known boundaries:
- Public issue/PR reads only; no credentialed GitHub API, browser cookie reads, writes, labels, comments, pushes, or PR creation.
- `/agentmemory/memories` remains an existing authenticated GET endpoint; no endpoint count changes.
- Query handling must not expose observations on the Memories page and must preserve project/agent filters.

Stop conditions:
- Stop before changes that alter auth, tenancy, schema, migrations, persistence boundaries, external services, or dependency versions beyond the minimal search adaptation.
- Stop if verification or security gates surface unresolved high-impact findings.

## Issue-First Notes

- Issue 512 remains relevant in the current fork: the backend BM25 search path already has CJK tokenization support, but `src/viewer/index.html` currently loads up to 2000 memories and filters the Memories tab locally with normalized substring checks.
- The current Viewer already has an IME-safe search helper, so PR 536's duplicated input composition handling is stale.
- PR 536's `/search` mapping is not safe to import as-is because `/search` returns observations and memory-shaped observations, not guaranteed `Memory` rows, so it can mix non-memory observations into the Memories table.

## Decision

Fork decision: adapted import.

Planned adaptation: add bounded `q` support to the existing authenticated `/agentmemory/memories` list endpoint using the existing backend `SearchIndex` and `memoryToObservation` transformation over already scope-filtered Memory rows, then wire the Viewer Memories tab to request `memories?latest=true&limit=2000&q=...` for non-empty searches.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Backend memory-only CJK search query | Targeted API tests | passed | Temporary dependency symlink to existing local install; `vitest run --exclude test/integration.test.ts test/api-memories-project.test.ts test/memories-pagination.test.ts`: 2 files, 14 tests passed. |
| Viewer Memories query uses backend route | Source-level viewer test | passed | `test/memories-pagination.test.ts` checks backend `q=` path construction and IME-safe binding. |
| Auth/scope/DoS posture | Security review and scanner gates | passed | Auth remains first in `api::memories`; project/agent filters run before search; `q` capped at 500 chars; viewer URL-encodes query. Security diff scan report: `/tmp/codex-security-scans/agentmemory/6c387b4_20260616T020931Z/report.md`; `semgrep scan --config p/default --error --metrics=off .`: 0 findings. |
| Prep merge to local main | Prep skill workflow | passed | Local `main` worktree was clean; `main` was the merge base; fast-forward merge completed. |

## Verification Evidence

- `npm test -- test/api-memories-project.test.ts test/memories-pagination.test.ts`: blocked initially because this worktree has no `node_modules` and no lockfile; `vitest` was not on PATH.
- `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --exclude test/integration.test.ts test/api-memories-project.test.ts test/memories-pagination.test.ts` with a temporary top-level `node_modules` symlink to the existing local install: passed, 2 files, 14 tests.
- `git diff --check`: passed.
- `npm run lint` with the same temporary dependency symlink: passed.
- `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings.
- `gitleaks protect --staged --redact`: passed, no leaks found.
- OSV not run: dependency files, lockfiles, vendored code, container images, and third-party package surfaces were not changed.
- Codex Security diff scan completed for `src/triggers/api.ts` and `src/viewer/index.html`: no reportable findings. Report validator passed and HTML was rendered at `/tmp/codex-security-scans/agentmemory/6c387b4_20260616T020931Z/report.html`.

## Security Notes

- PR 536 was not imported as-is because it would route the Viewer Memories table through general `/search` results and could display non-memory observations.
- Adapted implementation keeps the existing authenticated `/agentmemory/memories` boundary and adds only a bounded `q` query parameter.
- Search indexing runs over already filtered Memory rows, preserving project and agent isolation semantics.
- Viewer query text is encoded in the URL and escaped before DOM insertion in the empty-result state.

## Review Chain Notes

- `security-best-practices`: reviewed JavaScript frontend and server boundary references; no critical or major issue found in the adapted diff.
- `simple-code`: focused simplification pass over changed API/viewer/tests found the current minimal shape preferable; no follow-up edit made.
- `requesting-code-review`: external subagent review was not invoked because the available subagent tool is limited to explicit user requests for subagents. A local review pass checked auth-before-read, project/agent filter order, memory-only result mapping, query length bound, URL encoding, DOM escaping, and stale response handling.
- `review-implementation`: local adversarial review found no blocking correctness or security issue. Residual risk is limited to runtime viewer behavior depending on a live Agentmemory daemon; source-level tests cover route construction and handler binding.

## Prep Merge Notes

- Current worktree branch: `review/issue-512-pr-536-viewer-cjk-search`.
- Commit prepared for local main: `4663a11350f30baa103b516f8cf4ff4c4e0bb9ed`.
- Main checkout: `/Users/A1538552/_projects/_tools/agentmemory`, branch `main`, clean before merge.
- Merge basis: local `main` at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
- Merge result: fast-forward to `4663a11350f30baa103b516f8cf4ff4c4e0bb9ed`.
- No push, PR creation, GitHub tracker update, label change, or public write was performed.
