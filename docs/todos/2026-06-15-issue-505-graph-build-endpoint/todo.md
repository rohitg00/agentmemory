# Issue 505 Graph Build Endpoint Review

## Scope

Root agentmemory TypeScript/Vitest project on branch `review/issue-505-pr-538-graph-build-endpoint`.

Primary review unit:

- Issue 505: Viewer Rebuild Graph button calls missing `/agentmemory/graph/build` endpoint.
- Candidate PRs: PR 538 and PR 533.

Potential source and test surface:

- `src/triggers/api.ts`
- `src/viewer/index.html`
- `test/session-end-triggers-graph.test.ts`
- Graph-related tests under `test/graph.test.ts` and API boundary tests if the endpoint behavior needs changes.

## Assumptions

- Work is isolated in this Codex worktree.
- The branch was created from local `main` at `bfde73b`; no fetch, pull, push, PR creation, remote issue update, credentialed API read, or logged-in browser/API action is approved.
- Public unauthenticated reads may be used to inspect upstream issue and PR metadata or patches.
- Existing npm-based scripts are the project-native checks for this repo despite the broader pnpm default.
- No external API contract broadening is approved beyond verifying or minimally fixing the existing `/agentmemory/graph/build` endpoint.

## Sprint Contract

- **Goal:** Determine whether Issue 505 still needs a fork change, compare PR 538 and PR 533, and either keep the branch as already-fixed/superseded or apply the smallest safe regression-backed fix.
- **Scope:** Validate expected versus actual behavior for the viewer rebuild graph call and REST endpoint registration/handler behavior. Compare candidate PR diffs for minimality, correctness, security posture, and fork fit. Record a neutral local decision.
- **Non-goals:** Import broad upstream feature work, change graph storage architecture, add/remove MCP tools, change auth behavior, publish/push/update remote issues, or change dependency/package surfaces.
- **Acceptance criteria:** Issue disposition and candidate PR decisions are recorded; if code changes are needed, a regression test fails first and then passes after a minimal patch; endpoint/auth/raw-body/security concerns are reviewed; targeted tests and relevant repo checks are run or limitations recorded; prep-merge-to-local-main is executed or records a no-op.
- **Intended verification:** Targeted Vitest for graph-build endpoint behavior, `npm run build`, `npm run lint`, and `npm test` when shared code is changed. Semgrep/Gitleaks/OSV decisions follow scope; OSV is only required if dependency or package surfaces change.
- **Known boundaries:** Do not use credentialed GitHub reads or remote writes without explicit current-turn approval. Do not broaden REST auth or pass raw request bodies through new endpoints. Do not let unrelated candidate PR changes ride along.
- **Stop conditions:** Candidate PR correctness requires changing auth/security/system boundaries; endpoint semantics conflict with fork-local architecture; required scanner findings cannot be resolved; local main merge conflicts require unsafe or unclear resolution.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Establish fork baseline for Issue 505 | Inspect current viewer call, REST registration, and existing regression tests | In progress | Initial search found `api::graph-build`, `/agentmemory/graph/build`, viewer `apiPost('graph/build', {})`, and `test/session-end-triggers-graph.test.ts` coverage |
| Compare PR 538 and PR 533 | Public unauthenticated PR patch/diffstat/file inspection | Complete | PR 533 is the smaller endpoint-focused fix. PR 538 is a 9-commit multi-issue bundle with CLI, hooks, build-script, viewer preview/resume, docs/report, and graph function behavior changes. |
| Decide fork action | Baseline plus candidate comparison | Complete | Adapt minimal behavior only: current fork already fixed the missing route, but latest saved memories were not included as graph-build inputs. Reject broad PR 538 import; do not import PR 533 wholesale. |
| Apply minimal patch if required | TDD red/green targeted Vitest | Complete | Added failing API-boundary test for `mem_1` in `mem::graph-extract` payload. It failed with only `obs_1`; after patch it passed. |
| Final verification and prep merge | Targeted checks, required security gates, prep-merge-to-local-main | In progress | Targeted graph/API tests passed 3 files / 51 tests. `npm run build`, `npm run lint`, `npm test`, `git diff --check`, and Semgrep passed. prep-merge pending. |

## Progress

- [x] Branch `review/issue-505-pr-538-graph-build-endpoint` created from local `main`.
- [x] Local instructions and `AGENTS.md` read.
- [x] Worklist row for Issue 505 read from the coordinator worktree.
- [x] Relevant fork workflow recipes read.
- [x] No repo-local lessons were found under `docs/lessons/`.
- [x] Issue behavior validated against current fork.
- [x] Candidate PRs compared.
- [x] Fork decision recorded.
- [x] Verification complete.
- [ ] prep-merge-to-local-main complete.

## Review Notes

- Issue disposition: `adapt`. The original 404 behavior is already fixed in the fork by the existing `/agentmemory/graph/build` endpoint and viewer call. The remaining fork-fit gap was that graph-build did not include latest saved memories even though the viewer message and both candidate PRs treat memories as graph backfill inputs.
- PR 533 disposition: `adapt`. It is the smaller endpoint-focused candidate and includes the relevant idea of converting latest saved memories into observation-shaped graph inputs. The fork did not need the full PR because it already had the route, count updates, REST reference, and existing endpoint tests.
- PR 538 disposition: `reject for this issue`. It is a broad multi-issue bundle with config, hooks, MCP, CLI, build, viewer workflow, graph function, docs/report, and metadata changes. Importing it would carry unrelated behavior and larger security/review surface for Issue 505.
- Security review: The patch keeps the existing auth check, does not add routes or dependencies, does not pass raw request bodies to a new sdk trigger, and preserves loopback REST exposure. To avoid unnecessary cross-project memory inclusion, saved memories are included only when unscoped or when their project matches a scanned session project.
- Repo consistency: No MCP tool, REST endpoint, version, KV scope, audit operation, plugin exposure, or endpoint count changed. Existing `/agentmemory/graph/build` documentation and count remain valid.
- Baseline evidence: The new regression test failed before implementation with graph-build payload IDs `obs_1` only; after implementation it passed with `obs_1` and `mem_1`.

## Verification Evidence

- `npm test -- test/api-boundary-coverage.test.ts` failed before implementation: expected graph-build payload IDs `obs_1`, `mem_1`; received only `obs_1`.
- `npm test -- test/api-boundary-coverage.test.ts` passed after implementation: 14 tests.
- `npm test -- test/api-boundary-coverage.test.ts test/session-end-triggers-graph.test.ts test/graph.test.ts` passed: 3 files / 51 tests.
- `npm run build` passed. Existing build warnings remained: deprecated tsdown `external`/`inlineOnly`, plugin timing, and ineffective dynamic import chunking.
- `npm run lint` passed.
- `git diff --check` passed.
- `semgrep scan --config p/default --error --metrics=off .` completed with 0 findings.
- `npm test` passed after the final production-code guard: 157 files / 1974 tests.
- OSV was not run because no dependency files, lockfiles, container images, vendored code, or package surfaces changed.

## Delegation Boundaries

No subagents are used initially. The immediate work is a bounded issue/PR comparison plus local endpoint verification.
