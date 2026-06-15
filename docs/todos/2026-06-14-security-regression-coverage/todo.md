# Security Regression Coverage Task State

Task id: `2026-06-14-security-regression-coverage`
Scope: current agentmemory worktree on branch `coverage/security-regressions`
Status: implemented; final security gates and commit in progress

## Sprint Contract

Goal: raise security and secret-handling regression coverage for the scoped agentmemory source surface above 80% for lines, statements, functions, and branches where meaningfully testable, then commit the result.

Scope:
- `src/security/**`.
- Secret redaction and plaintext bearer behavior in integration surfaces.
- Deploy entrypoint secret handling.
- Filesystem watcher redaction.
- Replay-sensitive paths.
- Viewer security tests.
- Security-related API/MCP tests only when needed for scoped coverage.

Non-goals:
- No fetch, pull, push, deploy, publishing, dependency install, dependency changes, schema migration, auth weakening, or remote state change.
- No broad generated rewrites or endpoint/tool count changes.
- No real secrets read or printed.

Acceptance criteria:
- Scoped Security/Secret-Surface coverage is above 80% for lines, statements, and functions; branch coverage is above 80% where practical for the scoped surface.
- New tests cover negative/security boundary behavior: plaintext bearer allow/deny, redaction edge cases, `.env`/JSON/YAML/log-line secret previews, safe error messages, no token leakage, and no unsafe default for remote HTTP where coverage gaps exist.
- Any production change is driven by a failing regression test first.
- Global coverage thresholds are raised only if `npm run coverage` remains stable green and the change is merge-compatible.
- Only task-owned files are committed with a factual commit message.

Intended verification:
- Baseline and final scoped coverage with `vitest run --coverage` over scoped source and security tests.
- Focused security tests touching the changed surface.
- `npm test`.
- `npm run coverage`.
- `npm run lint`.
- `gitleaks protect --staged --redact`.
- Semgrep over the repo or narrowed diff/source scope.
- OSV only if dependency, package, vendored, container, or package-manager surfaces change.

Known boundaries:
- Existing security behavior must not be weakened without explicit approval.
- Remote plaintext HTTP with `AGENTMEMORY_SECRET` must remain fail-closed before request transmission.
- Viewer non-loopback bind behavior must continue to require explicit inbound bearer and Host allowlist configuration.
- Filesystem watcher previews may include file metadata and non-sensitive values, but must not leak secret values.

Stop conditions:
- A required verification gate reports findings or runtime errors that cannot be fixed within the scoped change.
- The task requires network dependency installation, fetch/pull/push/deploy, API/auth redesign, migration, or external system state.
- Coverage cannot be measured locally without dependency installation and no existing local dependency install can be reused safely.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Baseline scoped coverage | Scoped Vitest coverage command | Done | Broad security/viewer/watcher baseline before edits: statements 77.86%, branches 73.46%, functions 76.81%, lines 79.14%. Including replay internals as whole files produced 73.06% statements, 63.76% branches, 67.69% functions, 75.55% lines, so replay-sensitive path matching was extracted into `src/security/sensitive-path.ts` instead of counting the full replay import subsystem as security surface. |
| Add missing security regression tests | Red/green focused Vitest runs | Done | Initial edited-test run failed on three incorrect/edge expectations, then `./node_modules/.bin/vitest run --exclude test/integration.test.ts test/plaintext-bearer-auth.test.ts test/fs-watcher.test.ts test/viewer-host.test.ts` passed 3 files / 65 tests. |
| Raise scoped coverage above 80% | Final scoped Vitest coverage command | Done | Final scoped surface (`src/security/**/*.ts`, `src/viewer/**/*.ts`, `integrations/filesystem-watcher/watcher.mjs`) passed: statements 90.12%, branches 83.67%, functions 92.95%, lines 90.95%. |
| Full project checks | `npm test`, `npm run coverage`, `npm run lint` | Done | Focused `npm test -- ...security files...` passed 11 files / 122 tests. First full `npm test` had one `test/cli-connect.test.ts` timeout; isolated rerun passed 25 tests and full rerun passed 145 files / 1698 tests. `npm run coverage` passed project thresholds. `npm run lint` passed after wiring existing local lint packages into the reused local dependency tree. |
| Security gates | staged Gitleaks and Semgrep | Done | `gitleaks protect --staged --redact` scanned ~22.01 KB and found no leaks. `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings over 515 tracked files. `semgrep scan --config p/default --error --metrics=off <task files>` passed with 0 findings over 7 task files, including new staged files. A `--no-git-ignore` exploratory Semgrep pass was not used as a gate because it scanned generated `coverage/` HTML/JS from `npm run coverage` and reported findings only in that generated output. |

## Progress Notes

- Initial worktree state: detached `HEAD` at `ec446b7`, clean.
- Created branch `coverage/security-regressions`.
- No repo-local `docs/lessons/` files were present.
- `node_modules` is missing in this worktree; a dependency install exists in `/Users/A1538552/_projects/_tools/agentmemory/node_modules`.
- Added a local ignored `node_modules` symlink to reuse the existing dependency install without network installation.
- Added direct regression coverage for the shared plaintext bearer guard.
- Moved replay sensitive-path matching into `src/security/sensitive-path.ts` and re-exported it from `src/functions/replay.ts` for compatibility.
- Added filesystem watcher redaction regressions for YAML-style sensitive keys, token-looking log lines, local emit errors, and non-text previews.
- Added viewer security regressions for CORS preflight, local REST proxy bearer forwarding, safe non-loopback 401 responses, and bound-port state.

## Review Notes

- No subagents delegated.
- No dependencies, lockfiles, package metadata, deploy files, schemas, endpoint/tool counts, or auth semantics changed.
- Local tooling caveat: this worktree had no `node_modules`; tests used a symlink to the existing local install. The reused install was missing `@vitest/coverage-v8` and ESLint packages, so matching/local packages already present under `/Users/A1538552/_projects` were symlinked into that ignored dependency tree to run repo-native commands without network installation.
- OSV was not run because no dependency files, lockfiles, container files, vendored code, package-manager config, or third-party package surfaces changed.
