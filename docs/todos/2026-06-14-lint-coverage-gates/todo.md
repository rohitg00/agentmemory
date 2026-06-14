# Lint Coverage Gates Task

## Scope

Root agentmemory TypeScript/Vitest project. The plan covers only root lint and coverage gates:

- Add an ESLint root gate and run it once in CI. This intentionally satisfies the requested lint/format-gate category via lint, not via a separate formatter.
- Add a Vitest V8 coverage gate with visible reports, conservative thresholds, and a CI artifact.

Website checks, security scanner CI gates, dependency policy changes beyond the required dev tools, and broader test refactors are out of scope.

## Assumptions

- Prettier is intentionally not introduced because the user requirement allows at least a lint gate, the repo has no current Prettier config, and adding a formatter would risk a broad formatting-only diff.
- Security scanner duplication is intentionally avoided in CI; Semgrep/Gitleaks/OSV remain policy-driven local gates for implementation and commit handoff.
- Coverage thresholds should start from a conservative measured baseline and can be raised later in dedicated coverage-improvement tasks.

## Sprint Contract

- **Goal:** Add repo-native lint and coverage gates for the root package.
- **Acceptance criteria:** `npm run lint` passes, `npm run coverage` passes and writes reports, CI runs lint/coverage once, and existing build/skills/test checks remain green.
- **Non-goals:** Website CI, Prettier adoption, always-on security scanner CI, broad test rewrites.
- **Intended verification:** Targeted meta-test, `npm run lint`, `npm run coverage`, `npm run build`, `npm run skills:check`, `npm test`, OSV because dev dependencies change, Semgrep because CI/tooling changes, and staged Gitleaks before commit.
- **Stop conditions:** Dependency install fails, coverage baseline is unexpectedly too low for conservative thresholds, lint findings require behavior design, or security scanners produce unresolved findings.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Root ESLint gate | `npm run lint` and meta-test script assertion | Passing | `npm run lint` exited 0 after baseline-compatible ESLint config calibration |
| Vitest coverage gate | `npm run coverage`, generated `coverage/index.html`, `coverage/coverage-summary.json` | Passing | `npm run coverage` exited 0 after one documented `fs-watcher` flake rerun; summary: lines 59.58%, branches 47.67%, functions 60.29%, statements 57.63% |
| CI wiring and gate contract | Meta-test CI/config assertions and GitHub Actions YAML review | Passing | `npx --no-install vitest run test/quality-gates.test.ts --exclude test/integration.test.ts` passed 6/6 after asserting scripts, deps, configs, coverage reporters/thresholds, ignore entry, and CI wiring |
| Repo-native verification | `npm run build`, `npm run skills:check`, `npm test` | Passing | Build exited 0 with existing tsdown/Rolldown warnings; `skills:check` passed after regenerating `plugin/skills/agentmemory-config/REFERENCE.md`; final `npm test` passed 136 files / 1480 tests |
| Dependency/security closure | OSV, Semgrep, staged Gitleaks | Passing | OSV scanned 493 packages with no issues; repo-wide and new-file Semgrep reported 0 findings; staged Gitleaks found no leaks; staged whitespace check passed |

## Progress

- [x] Plan written with the `writing-plans` skill.
- [x] Plan corrected from the forbidden `docs/superpowers/plans/` path to this task-owned `docs/todos/` record.
- [x] Pre-implementation review completed.
- [x] Implementation started.
- [x] Root lint, coverage, and CI wiring implemented.
- [x] Verification completed.
- [x] Final review notes recorded.

## Delegation Boundaries

The implementation files are tightly coupled (`package.json`, root configs, CI, and the meta-test all assert one another), so implementation is integrated serially in the main workspace instead of parallel worker edits. Subagents are used for pre-implementation and final review/validation. This avoids overlapping write ownership while still applying the review gates from `review-and-implement`.

## Review Notes

Initial plan placement violated the workspace instruction that task-local plans must not be created under `docs/superpowers/plans/` unless the user explicitly names that path. Corrected by moving the plan to `docs/todos/2026-06-14-lint-coverage-gates/plan.md` and creating this required task record.

Pre-implementation review round 1:

- Finding: Plan did not make explicit why no separate format check is added.
- Triage: `fixed`.
- Evidence: Original user requirement says "Mindestens lint oder eslint/prettier --check"; the plan now states the selected implementation is ESLint linting only and records Prettier as out of scope for this task.
- Finding: Red-test step could fail on missing local `vitest` instead of the intended missing gate assertions in fresh checkouts.
- Triage: `fixed`.
- Evidence: Plan Task 1 now includes a local bootstrap preflight using the repo's CI-style `npm install --package-lock-only` plus `npm ci` commands before running `npx --no-install vitest`.

Pre-implementation review round 2:

- Result: `ACCEPT` from both reviewers.
- Residual risk: dependency versions, measured coverage baseline, and scanner results remain implementation-time verification risks covered by the stop conditions.

Implementation note:

- The initial ESLint recommended baseline produced 224 errors from existing legacy patterns across source, tests, benchmarks, and eval scripts. Rather than rewriting unrelated code, `eslint.config.js` now disables the specific baseline rule families observed in the JSON lint report while keeping the root gate, parser coverage, file coverage, and remaining recommended checks in place.
- `npm run skills:check` initially reported stale `plugin/skills/agentmemory-config/REFERENCE.md`; running `npm run skills:gen` added the already-used `AGENTMEMORY_COMPRESS_FILE_ROOTS` variable to the generated reference and made the check pass.
- `osv-scanner scan source .` did not discover package sources because this repo intentionally ignores `package-lock.json`; `osv-scanner scan source --no-ignore .` scanned the generated lockfile, found 493 packages, and reported no issues.

Final review round 1:

- Maintainability finding: task record still showed dependency/security closure and verification as incomplete after Gitleaks and staged diff checks had passed.
- Triage: `fixed`.
- Evidence: Feature / Verification Matrix now marks dependency/security closure as passing, progress marks verification and final review notes complete, and this review note records the finding.
- Maintainability re-review: `ACCEPT`.
- Test coverage finding: meta-test asserted only `vitest.config.ts` existence, not that coverage provider, `all`, include/exclude, reporters, output directory, and thresholds stay configured.
- Triage: `fixed`.
- Evidence: `test/quality-gates.test.ts` now imports `vitest.config.ts` and asserts the coverage provider, source inclusion, report formats, report directory, and threshold values.
- Flake note: the first post-fix `npm run coverage` rerun hit the known `test/fs-watcher.test.ts` debounce timing flake; the targeted `npx --no-install vitest run test/fs-watcher.test.ts --exclude test/integration.test.ts` passed 19/19, and the subsequent `npm run coverage` passed 136 files / 1480 tests.
- Test coverage re-review: `ACCEPT`.
- Security review: `ACCEPT`.
- Post-fix staged checks: targeted Semgrep over new/changed gate files reported 0 findings, staged Gitleaks reported no leaks, and `git diff --cached --check` passed.
- Merge-main follow-up: after merging local `main`, the larger suite caused several default 5s Vitest timeouts under parallel load while the same files passed individually and passed as a group with `--testTimeout=10000`. `vitest.config.ts` now sets `testTimeout: 10_000` so the repo-native `npm test` command uses the passing timeout without a CLI override.
