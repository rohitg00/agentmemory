# Quality Gate Coverage Task

## Scope

Root agentmemory quality infrastructure for lint, coverage, and CI gate drift. This task extends the existing lint/coverage gate meta-tests without changing externally consumed APIs, runtime behavior, dependency versions, or CI execution shape unless a test exposes a real contract gap.

Primary files:

- `test/quality-gates.test.ts`
- `vitest.config.ts`
- `eslint.config.js`
- `.github/workflows/ci.yml`
- `package.json`

## Assumptions

- Numeric V8 source coverage intentionally measures `src/**/*.ts`; root config files stay covered by meta-test assertions rather than being folded into source coverage.
- The existing lint gate is ESLint-only; no formatter gate is introduced in this task.
- Dependency/package surfaces are unchanged unless verification proves a dependency issue.
- No fetch, pull, push, deploy, migrations, or remote state changes are permitted.

## Sprint Contract

- **Goal:** Raise the quality-gate meta-test coverage of lint, coverage, and CI drift cases above 80% on the scoped quality infrastructure surface and commit the result.
- **Acceptance criteria:** Meta-tests catch lint/coverage script removal, wrong coverage provider, missing report formats, missing thresholds, wrong coverage exclusions, missing ESLint ignore/rule/test globals coverage, and CI artifact drift.
- **Non-goals:** Broad CI restructuring, dependency upgrades, formatter adoption, source coverage inflation by including config files, website/package subproject gates, and changes to runtime memory behavior.
- **Intended verification:** Targeted red/green quality-gate test, `npm run lint`, `npm run coverage`, `npm test`, Semgrep for config/CI/test changes, staged Gitleaks before commit.
- **Known boundaries:** Use local project evidence only; no fetch/pull/push/deploy. OSV is required only if dependency/package surfaces change.
- **Stop conditions:** Required scanners produce unresolved findings, coverage cannot stay green with the changed assertions, or a required fix would change auth, persistence, runtime APIs, dependencies, or CI system boundaries.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Script gate drift coverage | Red/green targeted quality-gates test | Passing | RED: targeted test failed on missing root config files in `npm run lint`; GREEN: `npm test -- test/quality-gates.test.ts` passed 9/9 |
| Vitest coverage config drift coverage | Red/green targeted quality-gates test and `npm run coverage` | Passing | Meta-test asserts V8 provider, `all`, `src/**/*.ts` include, config-file exclusion from numeric coverage, report formats, report dir, and thresholds; `npm run coverage` passed with lines 60.67%, branches 49.1%, functions 61.98%, statements 58.82% |
| ESLint config drift coverage | Red/green targeted quality-gates test and `npm run lint` | Passing | Meta-test imports `eslint.config.js` and asserts generated/runtime ignores, baseline rule disables, and Vitest globals; `npm run lint` passed with `eslint.config.js` and `vitest.config.ts` in the lint script |
| CI artifact and matrix drift coverage | Red/green targeted quality-gates test | Passing | RED: targeted test failed on missing `retention-days: 7`; GREEN: CI assertions cover one lint run, one coverage run, `actions/upload-artifact@v4`, `coverage-report`, `coverage/`, `if-no-files-found: error`, and retention |
| Full repo verification | `npm test`, required scans | Passing | `npm test` passed 144 files / 1688 tests; Semgrep passed 0 findings after replacing a dynamic RegExp helper; staged Gitleaks found no leaks |

## Delegation Boundaries

No subagents are used initially. The scope is a tightly coupled meta-test/config surface, and deterministic repo-native checks are the primary verifier.

## Progress

- [x] Working directory confirmed: `/Users/A1538552/.codex/worktrees/7aea/agentmemory`
- [x] Branch created: `coverage/quality-gates`
- [x] Existing task docs and quality-gate tests inspected
- [x] Local dependencies available for Vitest/lint verification
- [x] Red tests written and observed failing for missing new assertions
- [x] Green implementation complete
- [x] Focused simplification pass complete
- [x] Required project verification complete
- [x] Staged Gitleaks complete
- [ ] Scoped commit created

## Review Notes

- Baseline targeted test could not run before dependency setup because `vitest` was not installed locally.
- Task 1 dependency setup used the existing npm package surface only. `package-lock.json` and `node_modules` are ignored and not task-owned commit content.
- Red/Green evidence: after adding the new meta-tests, `npm test -- test/quality-gates.test.ts` failed 2/9 on the missing root-config lint script coverage and missing CI artifact `retention-days: 7`. After the minimal `package.json` and `.github/workflows/ci.yml` changes, the same command passed 9/9.
- Quality-gate category coverage is measured as meta-test contract coverage, not V8 line coverage of root config files. The requested drift classes are covered: lint gate removal/script drift, coverage gate removal/script drift, wrong V8 provider, missing coverage report formats, missing thresholds, wrong exclusions/source boundary, ESLint ignore/rule/test-globals drift, and CI artifact drift. That is 8/8 scoped drift classes covered.
- Numeric V8 coverage intentionally remains scoped to `src/**/*.ts`; `vitest.config.ts` and `eslint.config.js` are asserted by meta-tests instead of being included in source coverage.
- Semgrep initially found `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp` in the CI run-count helper. The helper now uses `split(...).length - 1`, and Semgrep passed with 0 findings over `test/quality-gates.test.ts`, `.github/workflows/ci.yml`, and `package.json`.
- Staged checks: `gitleaks protect --staged --redact` scanned about 14.57 KB and found no leaks; `git diff --cached --check` exited 0.
- OSV was not run because dependency versions, lockfiles, container files, vendored code, and third-party package surfaces were not changed; the only `package.json` change is the existing `lint` script scope.
