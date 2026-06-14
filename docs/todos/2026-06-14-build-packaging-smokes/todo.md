# Build Packaging Smokes Task

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/0ed5/agentmemory`
- Branch: `coverage/build-packaging-smokes`
- Base: detached worktree at `ec446b7`, then branched in place.
- Owning scope: agentmemory build and package smoke tests.

## Sprint Contract

Goal: raise build and packaging smoke coverage above 80% on the scoped build/package surface and commit the result.

Scope:
- Build entrypoints and package outputs: `tsdown.config.ts`, `src/index.ts`, `src/cli.ts`, `package.json`, copied runtime assets, `plugin/scripts/**`, and durable `dist` contract expectations in tests.
- Existing smoke-style tests under `test/`, especially package/plugin manifest and CLI/build tests.

Non-goals:
- No package publishing, release configuration, distribution boundary, hook behavior, dependency, fetch, pull, push, or deploy changes.
- Do not commit generated `dist` unless existing repo policy requires it.

Acceptance criteria:
- Build/package contract tests verify build-critical entrypoints, copied assets, executable hook script expectations, package/plugin manifest consistency, and build-facing failure paths.
- Numeric V8 coverage improves for touched source files that own build/package behavior.
- Non-`src` package/config behavior is covered by durable contract/meta-tests.
- Required verification passes or any limitation is recorded before commit.

Intended verification:
- Targeted build/package tests.
- `npm run build`
- `npm test`
- `npm run coverage`
- `npm run lint`
- `npm run skills:check` if plugin/script outputs are touched.
- `gitleaks protect --staged --redact`
- Semgrep for build/tooling/package changes.
- OSV only if dependency or package surfaces change.

Known boundaries:
- No fetch, pull, push, deploy, package publishing, release config changes, distribution boundary changes, or external service changes.
- Preserve unrelated work; initial `git status -sb --untracked-files=all` showed no dirty paths.

Stop conditions:
- A required security check has findings or cannot run.
- A change would alter externally consumed APIs, package publishing, release config, hooks behavior, dependencies, or distribution boundaries.
- The same approach fails twice.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Add contract tests for tsdown/package build outputs and copied runtime assets | Targeted Vitest test; `npm run build` | Done | `npm test -- test/build-runtime.test.ts test/build-package-contract.test.ts test/cli-server-log.test.ts test/engine-supervisor.test.ts test/codex-plugin.test.ts test/mcp-surface-default.test.ts`: 6 files, 42 tests passed. `npm run build`: exit 0. |
| Add contract tests for executable plugin hook script outputs | Targeted Vitest test; `npm run skills:check` | Done | `test/build-package-contract.test.ts` verifies manifest-referenced hook scripts exist, are executable, have source hooks, and build to `dist/hooks` plus `plugin/scripts`. `npm run skills:check`: 15 skills checked. |
| Add coverage for build-facing helper failure paths in `src/cli.ts` / related helpers | Targeted Vitest test; coverage report | Done | Extracted `src/cli/build-runtime.ts` covers iii release asset/url mapping and iii config path failure/precedence paths. Coverage JSON: 100% statements, branches, functions, and lines for `src/cli/build-runtime.ts`; `src/cli` directory statements improved from 57.47% to 59.73%. |
| Preserve manifest/package consistency across package/plugin metadata | Targeted Vitest test | Done | Contract tests verify package bin/export entries map to tsdown entries and package file allowlist includes copied runtime assets. |

## Progress

- 2026-06-14: Goal created.
- 2026-06-14: Confirmed current worktree is isolated and detached at `ec446b7`; created branch `coverage/build-packaging-smokes`.
- 2026-06-14: Read active repo instructions, README/package scripts, existing build/package tests, `tsdown.config.ts`, `vitest.config.ts`, and relevant source entrypoints.
- 2026-06-14: Baseline targeted suite passed: 4 files, 31 tests. Baseline coverage passed: 144 files, 1685 tests; global lines 60.67%, statements 58.82%; `src/cli.ts` and `src/index.ts` were 0%, `src/cli` helper directory statements were 57.47%.
- 2026-06-14: Red phase: new build/package tests initially failed on missing `src/cli/build-runtime.js`; fixed manifest-shape test helper so only the missing module remained red.
- 2026-06-14: Green phase: extracted `src/cli/build-runtime.ts` and wired `src/cli.ts` to it; targeted suite passed: 6 files, 42 tests.
- 2026-06-14: Full verification in progress. `npm run build`, `npm test`, `npm run coverage`, `npm run lint`, `npm run skills:check`, and Semgrep have passed so far.

## Review Notes

- Result matches Sprint Contract without changing package publishing, release config, hook behavior, dependencies, or distribution boundaries.
- No generated `dist` artifacts are staged or intended for commit.
- OSV was not run because no dependency files, lockfiles, container files, vendored code, or package-manager metadata changed.
