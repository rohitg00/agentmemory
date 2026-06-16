# Issue 691 Retry Merge/Test Closeout

Scope: repository worktree `/Users/A1538552/.codex/worktrees/e87f/agentmemory`, branch `review/issue-691-pr-803-viewer-graph-layout`.

## Sprint Contract

Goal: complete the replacement local-main integration and test run for the already-unmerged Issue 691 / PR 803 review branch.

Scope:
- Confirm branch/worktree state and local `main` integration against `d4393d1ab5dd284edee3a17bfbf45825f239c07e`.
- Run the requested sanitized pnpm install and `corepack pnpm test`.
- Diagnose and fix only test failures needed to close this branch.
- Record verification evidence and residual risks.

Non-goals:
- No fetch, pull, push, deploy, remote/account mutation, or dependency update.
- No broad Retention refactor or unrelated viewer behavior changes.
- No dependency changes, including the known OSV medium from the main lockfile.

Acceptance criteria:
- Branch is attached to `review/issue-691-pr-803-viewer-graph-layout`.
- Local `main` commit `d4393d1ab5dd284edee3a17bfbf45825f239c07e` is confirmed integrated or merged.
- Sanitized `pnpm install --frozen-lockfile --ignore-scripts` completes without lockfile changes.
- `corepack pnpm test` completes or any blocker is diagnosed with evidence.
- Any post-merge fix is covered by a regression test and committed separately.

Intended verification:
- `HOME=/tmp/agentmemory-merge-test-issue691-retry-home XDG_CONFIG_HOME=/tmp/agentmemory-merge-test-issue691-retry-xdg NPM_CONFIG_USERCONFIG=/tmp/agentmemory-merge-test-issue691-retry-npmrc PNPM_HOME=/tmp/agentmemory-merge-test-issue691-retry-pnpm-home corepack pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/agentmemory-merge-test-pnpm-store`
- `corepack pnpm test`
- Targeted Retention regression checks if the full test failure is real.
- `git diff --check`
- Semgrep/Gitleaks gates as required before commit.

Known boundaries:
- Public/local inspection only; no remote mutation.
- `pnpm-lock.yaml` must remain present and unchanged.
- Retention changes are allowed only as a narrow post-merge test unblocker.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Attach requested branch | `git worktree list --porcelain`, `git switch review/issue-691-pr-803-viewer-graph-layout` | Done | Branch ref was free and matched detached HEAD `dad9bd5d32f9b263c4f0a4fbe1a0e9e1fbaa772c`; switched without `--ignore-other-worktrees`. |
| Local-main integration check | `git merge-base --is-ancestor d4393d1ab5dd284edee3a17bfbf45825f239c07e HEAD` | Done | Local main is already ancestor of `HEAD`; integration is a no-op. |
| Sanitized dependency materialization | Requested `corepack pnpm install` command | Done | Exit 0; lockfile passed supply-chain policy; warning only for missing `dist/cli.mjs` bin target. |
| Full test retry before fix | `corepack pnpm test` | Failed | 1 timeout: `test/retention.test.ts > dry-run eviction shows candidates without deleting`; 157 files passed, 1989/1990 tests passed. |
| Diagnose timeout before edit | Two read-only subagents plus targeted local test | Done | One diagnosed branch-unrelated flake risk; one identified cold `image-refs` import before dry-run return. Targeted original test passed standalone in 2.25s. |
| Post-merge Retention fix | Regression test plus lazy import | Done | New test failed before production change, then passed after moving `image-refs` import into the actual `mem.imageRef` branch. |
| Targeted Retention verification | `corepack pnpm exec vitest run test/retention.test.ts` | Done | 1 file / 16 tests passed in 691ms. |
| Full post-fix verification | `corepack pnpm test` | Done | 158 files / 1991 tests passed in 29.98s. |
| Post-commit full verification | `corepack pnpm test` plus targeted rerun for timeout set | Done | First post-commit full run hit 8 unrelated timeouts; the 8 affected files passed targeted with 65/65 tests in 5.09s; a second full run passed 158 files / 1991 tests in 28.89s. |
| Diff hygiene | `git diff --check` | Done | Passed with no whitespace errors. |
| Security scan | `semgrep scan --config p/default --error --metrics=off src/functions/retention.ts test/retention.test.ts docs/todos/2026-06-16-issue-691-retry-merge-test/todo.md` | Done | 3 tracked files scanned, 210 rules, 0 findings. |
| Independent review | Read-only reviewer on current working-tree diff | Done | ACCEPT; no Critical/Important actionable issue. Residual note: real image-ref eviction lacks a dedicated positive assertion, but the call path is unchanged. |

## Notes

- The Retention change is not part of the original viewer feature diff; it is a narrow closeout fix for the replacement full-test run.
- The branch diff against local `main` originally touched only viewer files and task docs; Retention was unchanged before this retry.
- The fix preserves eviction behavior and only avoids loading image cleanup code for dry-run and non-image paths.
- The suite still exhibits the known changing timeout behavior under parallel full-suite load; final evidence includes both a targeted pass for the transient timeout set and a later full-suite pass on the same committed code.
- `corepack pnpm exec tsc --noEmit` was attempted as an additional gate but is not a usable completion signal in this checkout: it fails on pre-existing repo-wide TypeScript errors outside the touched surface, including existing unused imports and missing `@opentelemetry/api` types.
