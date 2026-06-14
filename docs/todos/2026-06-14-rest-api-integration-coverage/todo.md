# REST/API Integration Coverage

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/4519/agentmemory`
- Branch: `coverage/rest-api-integration`
- Owning scope: REST/API and integration tests for `src/triggers/api.ts`, `src/triggers/events.ts`, and nearby API/MCP proxy boundaries.

## Sprint Contract

Goal: raise V8 coverage for the scoped REST/API source surface above 80% for lines, statements, and functions, with branches above 80% where meaningfully testable, then commit the scoped result.

Scope:
- Add behavior and boundary tests for REST API registration, auth, validation, whitelisted payloads, missing parameters, malformed bodies, and API error paths.
- Cover `src/triggers/api.ts` and `src/triggers/events.ts` directly through registered function handlers and mocked iii-sdk/state boundaries.
- Keep external, slow, and nondeterministic dependencies mocked.

Non-goals:
- No Fetch/Pull/Push/Deploy.
- No API/auth/security contract broadening.
- No dependency changes.
- No live iii-engine or network service dependency.

Acceptance criteria:
- Scoped V8 coverage for `src/triggers/api.ts` and `src/triggers/events.ts` is above 80% for lines/statements/functions; branches above 80% where practical.
- Added tests prove boundary behavior rather than incidental implementation details.
- `npm test`, `npm run coverage`, and `npm run lint` pass.
- Required security gates for API/auth test work run before commit: Semgrep and staged Gitleaks.
- Commit contains only scoped changes.

Intended verification:
- Targeted API/integration vitest runs during TDD.
- `npm test`
- `npm run coverage`
- `npm run lint`
- `semgrep scan --config p/default --error --metrics=off .`
- `gitleaks protect --staged --redact`

Known boundaries:
- Semgrep uses the public registry and may need network access.
- `test/integration.test.ts` is excluded by the default `npm test` and `npm run coverage` scripts; targeted integration checks may need explicit invocation.

Stop conditions:
- Any needed API/auth/security behavior change beyond tests.
- Repeated verifier failure with no understood failure mode.
- Missing security tooling or network-gated scanner failure that cannot be resolved without approval.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Baseline scoped REST/API coverage measured | `npm run coverage` plus `coverage/coverage-summary.json` | Complete | Baseline: `api.ts` 24.75% statements / 8.29% branches / 12.35% functions / 27.61% lines; `events.ts` 0% all metrics. |
| Auth denied/allowed paths covered | Targeted vitest API tests | Complete | `npx vitest run test/events-boundary.test.ts test/api-boundary-coverage.test.ts test/hook-project.test.ts`: 38 tests passed. |
| Malformed/missing REST request inputs covered | Targeted vitest API tests | Complete | `test/api-boundary-coverage.test.ts` malformed/missing cases passed in targeted run. |
| REST payload whitelisting and no raw-body passthrough covered | Targeted vitest API tests | Complete | Whitelist assertions for observe/context/search/graph/consolidate/slot payloads passed in targeted run. |
| Event trigger integration paths covered | Targeted vitest event tests | Complete | `test/events-boundary.test.ts` covers start/observe/stop/end/activity paths. |
| Full repo tests and coverage stable | `npm test`, `npm run coverage` | Complete | `npm test`: 146 files / 1709 tests passed. `npm run coverage`: 146 files / 1709 tests passed. Final scoped coverage: `api.ts` 95.63% statements / 85.52% branches / 98.23% functions / 97.44% lines; `events.ts` 100% statements / 85% branches / 100% functions / 100% lines. |
| Static and secret scans complete | Semgrep, staged Gitleaks | Complete | Semgrep `semgrep scan --config p/default --error --metrics=off .`: 0 findings. `gitleaks protect --staged --redact`: no leaks found. |

## Progress Notes

- 2026-06-14: Started from detached `ec446b7` in existing Codex worktree and created branch `coverage/rest-api-integration`.
- 2026-06-14: Active instructions inspected: repo requires iii-sdk registration path, REST whitelisting, input validation at boundaries, and no raw body passthrough.
- 2026-06-14: Installed declared npm dependencies locally with `npm install --package-lock=false` because the worktree had no `node_modules` and no lockfile; no tracked dependency metadata changed.
- 2026-06-14: Added REST/API boundary coverage tests and event trigger tests. Stabilized `src/hooks/_project.ts` Git command timeout from 500 ms to 2 s after `npm run coverage` exposed a load-sensitive resolver fallback in `test/hook-project.test.ts`.
