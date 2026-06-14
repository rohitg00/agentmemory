# Viewer Surface Coverage Task

Task id: `2026-06-14-viewer-surface-coverage`

## Scope

Root agentmemory TypeScript/Vitest project, scoped to Viewer tests and server/document helper coverage:

- Primary source surface: `src/viewer/document.ts`, `src/viewer/server.ts`, and static behavior in `src/viewer/index.html` covered through existing VM/text harnesses.
- Test surface: `test/viewer-*.test.ts` and only nearby server/API tests if needed.
- No browser/UI redesign, no real browser or remote network dependency, no fetch/pull/push/deploy.

## Assumptions

- V8 coverage cannot parse `src/viewer/index.html`; scoped numeric coverage is measured for `src/viewer/**/*.ts`.
- Static Viewer HTML behavior remains covered by existing regex/VM tests rather than browser automation.
- Dependency bootstrap is local only; generated `node_modules/` and ignored `package-lock.json` are not task-owned commit content.

## Sprint Contract

- **Goal:** Raise scoped Viewer TypeScript V8 coverage above 80% for lines, statements, functions, and branches where the existing harness can test the behavior deterministically.
- **Acceptance criteria:** Add behavior and boundary tests for host allow/deny, routing/proxy behavior, malformed inputs, missing upstream/assets, sorting/session/cooldown behavior; scoped Viewer TypeScript coverage exceeds 80%; required repo checks pass or limitations are recorded; task-owned changes are committed.
- **Non-goals:** UI redesign, dependency changes, browser automation, real daemon/network dependencies, global threshold increases unless full `npm run coverage` remains stable.
- **Intended verification:** Targeted red/green Viewer tests, scoped Viewer coverage before/after, `npm test`, `npm run coverage`, `npm run build`, `npm run lint`, Semgrep for viewer server/security/network surface, staged Gitleaks before commit.
- **Known boundaries:** No fetch/pull/push/deploy; no API/schema/auth boundary changes beyond tests unless a failing test exposes a real bug that can be fixed surgically.
- **Stop conditions:** Required security scanners unavailable/failing with unresolved findings, full suite repeatedly fails for task-owned reasons, coverage cannot exceed 80% without production behavior changes outside the Viewer scope.

## Baseline

Command:

```bash
npx vitest run --coverage --coverage.include='src/viewer/**' --exclude test/integration.test.ts test/viewer-host.test.ts test/viewer-security.test.ts test/viewer-memories-sort.test.ts test/viewer-graph-cooldown.test.ts test/viewer-session-id.test.ts
```

Result before edits:

| Metric | Baseline |
| --- | ---: |
| Statements | 74.61% |
| Branches | 75.63% |
| Functions | 74.07% |
| Lines | 74.60% |

Note: V8 reported `src/viewer/index.html` as unparseable and excluded it from coverage.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Viewer host and non-loopback auth boundaries | Targeted `test/viewer-host.test.ts` | passing | Final Viewer group passed 6 files / 64 tests |
| Viewer routing/proxy malformed and upstream error behavior | Targeted `test/viewer-server-routing.test.ts` | passing | Red run failed on `/agentmemory?ping=1` double-prefix; after fix, `npx vitest run --exclude test/integration.test.ts test/viewer-server-routing.test.ts` passed 6/6 |
| Viewer document/static missing asset behavior | Existing `test/viewer-security.test.ts` plus routing test favicon/HTML coverage | passing | Final Viewer group passed; existing security tests continue covering CSP/favicon/static HTML behavior |
| Static sort/session/cooldown behavior remains covered | Existing `test/viewer-memories-sort.test.ts`, `test/viewer-session-id.test.ts`, `test/viewer-graph-cooldown.test.ts` | passing | Final Viewer group passed 6 files / 64 tests |
| Scoped Viewer coverage above 80% | Scoped V8 coverage command | passing | Final after: statements 89.84%, branches 87.60%, functions 96.29%, lines 89.94%; 6 files / 64 tests passed |
| Repo verification and security gates | Requested commands and scans | passing | `npm test`, `npm run coverage`, `npm run build`, `npm run lint`, Semgrep, `git diff --check`, `git diff --cached --check`, and staged Gitleaks passed |

## Delegation Boundaries

Subagent tooling exists, but this delegated task did not explicitly authorize spawning subagents. Implementation is inline in the current worktree. No overlapping write scopes.

## Progress

- [x] Goal created.
- [x] Branch `coverage/viewer-surface` created from detached `ec446b7`.
- [x] Local instructions, package scripts, Vitest config, current coverage-gate task, and Viewer source/tests inspected.
- [x] Local dependencies bootstrapped with `npm install --legacy-peer-deps --no-audit --no-fund`; generated install artifacts are ignored and not task-owned.
- [x] Baseline scoped Viewer TypeScript coverage captured.
- [x] Red tests written and observed failing.
- [x] Minimal code/test harness changes made to pass.
- [x] Targeted and full verification completed.
- [x] Staged secret scan completed.
- [x] Ready for scoped commit.

## Review Notes

- Initial task-state creation follows repo instruction for non-trivial tasks under `docs/todos/<task-id>/`.
- TDD evidence: `test/viewer-server-routing.test.ts` initially failed 1/6 on `does not double-prefix the /agentmemory boundary path`, receiving `/agentmemory/agentmemory?ping=1` instead of `/agentmemory?ping=1`. The production fix changes only the upstream path prefix check in `src/viewer/server.ts`.
- Scoped coverage after the routing tests exceeds the objective on the TypeScript Viewer surface. V8 still logs that `src/viewer/index.html` is not parseable and excludes it; existing static VM/text Viewer tests continue covering the HTML behavior outside numeric V8 source coverage.
- Verification evidence:
  - `npx vitest run --exclude test/integration.test.ts test/viewer-server-routing.test.ts` -> passed, 1 file / 6 tests.
  - `npx vitest run --coverage --coverage.include='src/viewer/**' --exclude test/integration.test.ts test/viewer-host.test.ts test/viewer-security.test.ts test/viewer-memories-sort.test.ts test/viewer-graph-cooldown.test.ts test/viewer-session-id.test.ts test/viewer-server-routing.test.ts` -> passed, 6 files / 64 tests; Viewer TypeScript coverage statements 89.84%, branches 87.60%, functions 96.29%, lines 89.94%.
  - `npm test` -> passed, 145 files / 1691 tests.
  - `npm run coverage` -> final rerun passed, 145 files / 1691 tests; global coverage statements 59.01%, branches 49.24%, functions 62.25%, lines 60.88%; `src/viewer` coverage statements 89.84%, branches 87.60%, functions 96.29%, lines 89.94%.
  - `npm run build` -> passed with existing tsdown/Rolldown deprecation, plugin timing, and ineffective dynamic import warnings.
  - `npm run lint` -> passed.
  - `semgrep scan --config p/default --error --metrics=off --no-git-ignore src/viewer test/viewer-host.test.ts test/viewer-security.test.ts test/viewer-memories-sort.test.ts test/viewer-graph-cooldown.test.ts test/viewer-session-id.test.ts test/viewer-server-routing.test.ts docs/todos/2026-06-14-viewer-surface-coverage` -> passed, 12 targets, 0 findings.
  - `git diff --check` -> passed.
  - `git diff --cached --check` -> passed.
  - `gitleaks protect --staged --redact` -> passed on final staged content, scanned about 19.75 KB, no leaks found.
- Full coverage note: one `npm run coverage` attempt failed once in unrelated `test/worktree-project-scope.test.ts`; isolated `npx vitest run --coverage --exclude test/integration.test.ts test/worktree-project-scope.test.ts` passed 3/3 tests, and the subsequent full `npm run coverage` passed. The isolated run's coverage threshold failure was expected because it ran only one file with global thresholds enabled.
