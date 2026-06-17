# Issue 914 Viewer Port Follow-Up

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/4040/agentmemory`
- Branch: `github-pr/issue-914-viewer-port-0cd8711`
- Issue: GitHub issue #914, upstream PR 1 tracker
- Source of truth: user request, repo instructions, current source, and `docs/todos/2026-06-14-track-upstream-prs-as-issues/apply-create-missing-neutral-prs.json`

## Sprint Contract

- Goal: decide whether upstream PR 1 has any missing current residuals and, if valid, fix the confirmed viewer-port configuration residual.
- Scope: `src/config.ts`, `src/types.ts`, `src/index.ts`, focused tests, and this task record.
- Non-goals: no PR to `rohitg00/agentmemory`, no fetch, pull, push, PR creation, publishing, migrations, dependency changes, auth changes, or unrelated runtime-port redesign.
- Acceptance criteria:
  - Historical PR 1 claims are classified from current repo evidence.
  - `loadConfig()` exposes a viewer port that honors `AGENTMEMORY_VIEWER_PORT`, then `III_VIEWER_PORT`, then `restPort + 2`.
  - Main startup passes the configured viewer port to `startViewerServer()`.
  - Invalid viewer-port env values fall back to `restPort + 2`.
  - Targeted tests prove the behavior with a red/green cycle.
- Intended verification:
  - `corepack pnpm exec vitest run test/multi-instance-port.test.ts test/runtime-ports-render.test.ts test/viewer-host.test.ts test/viewer-server-routing.test.ts`
  - Broader targeted audit suite used during validation when relevant.
- Known boundaries:
  - This touches runtime networking configuration but does not change auth, CORS, host binding, REST path behavior, persistence, schemas, or public API endpoints.
  - Fetch, push, and PR creation require separate explicit current-turn approval and are not approved.
- Stop conditions:
  - Evidence shows the viewer-port residual is false.
  - A fix would require changing auth, host binding, remote state, migrations, package dependencies, or unrelated runtime semantics.
  - Verification fails twice for the same unexplained reason.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| PR 1 historical validity audit | Read-only source/test inspection plus subagent investigation | Complete | Main and subagent found auth/hooks/compress/context/viewer-WS claims covered in current source. |
| Viewer-port config residual | TDD test in `test/multi-instance-port.test.ts` | Complete | Red run failed because `cfg.viewerPort` was undefined; green run passed 13 tests after config/type/startup implementation. |
| Startup uses configured viewer port | Source inspection and targeted tests | Complete | `src/index.ts` now passes `config.viewerPort`; targeted runtime/viewer suite passed 4 files/65 tests. |
| Local PR preparation | GitHub push-prep local mode | In progress | No fetch/push/PR creation approved; using existing local `origin/main`; final local staging/commit checks pending. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| PR 1 validity investigation | Current repo code/tests/docs for claimed historical fixes | No | Validity decision, evidence, commands, uncertainty | Complete: all historical claims covered; found viewer-port config residual | Did not fetch live GitHub state. |
| Plan review | `docs/todos/2026-06-17-issue-914-viewer-port/plan.md` and relevant runtime-port files | No | High/Medium findings only | Complete: one Medium finding about partially numeric invalid viewer ports | Plan updated to require partially numeric invalid override tests and scoped strict viewer-port parsing. |

## Progress

- 2026-06-17: Inspected repo instructions, git state, README/package scripts/docs, hooks/triggers/core/viewer/tests.
- 2026-06-17: Spawned read-only subagent for independent validity investigation.
- 2026-06-17: Ran targeted audit verification after dependency setup with scripts disabled: 8 test files, 108 tests passed.
- 2026-06-17: Classified current actionable residual as viewer-port config plumbing, not a missing historical auth/hook/compress/context fix.
- 2026-06-17: Created local branch `github-pr/issue-914-viewer-port-0cd8711` from detached `origin/main` commit `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`.
- 2026-06-17: Plan review found `parsePort()` would accept partially numeric invalid viewer-port values. Accepted finding and updated plan/tests to require fallback for values such as `4400abc` and `4500abc` without changing unrelated REST/engine parsing semantics.
- 2026-06-17: TDD red `corepack pnpm exec vitest run test/multi-instance-port.test.ts` failed as expected because `cfg.viewerPort` was undefined.
- 2026-06-17: Implemented `viewerPort` config plumbing and strict viewer-port env parsing. Green `test/multi-instance-port.test.ts` passed 13 tests.
- 2026-06-17: Targeted runtime/viewer verification passed: `corepack pnpm exec vitest run test/multi-instance-port.test.ts test/runtime-ports-render.test.ts test/viewer-host.test.ts test/viewer-server-routing.test.ts` passed 4 files / 65 tests.
- 2026-06-17: Final review lanes: security/privacy accepted; test coverage accepted with non-blocking startup-test residual; maintainability found stale task-state status, fixed in this update.
- 2026-06-17: Final broader targeted verification passed: `corepack pnpm exec vitest run test/multi-instance-port.test.ts test/runtime-ports-render.test.ts test/viewer-host.test.ts test/viewer-server-routing.test.ts test/api-boundary-coverage.test.ts test/hook-source-smoke.test.ts test/hooks-plaintext-http.test.ts test/events-boundary.test.ts test/context-injection.test.ts test/multimodal.test.ts` passed 10 files / 133 tests.
- 2026-06-17: Semgrep security gate passed: `semgrep scan --config p/default --error --metrics=off .` scanned tracked repo files with 0 findings. OSV was not run because this task did not change dependency, lockfile, package-manager, container, vendored, or third-party package surfaces.

## GitHub Feature Loop Notes

- Full GitHub feature-loop invocation authorizes local PR-prep mode only for task-owned surfaces.
- Fetch, pull, push, PR creation, PR merge, publishing, deployments, migrations, destructive cleanup, credentialed/session actions, history rewrite, and unrelated changes remain unapproved.
- `origin/main` freshness is unverified unless the user explicitly approves `git fetch origin main`.
