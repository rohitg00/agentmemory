# CLI Connect Timeout Investigation

Task id: `2026-06-16-cli-connect-timeout`

## Scope

Investigate and resolve the intermittent `pnpm test` timeout in
`test/cli-connect.test.ts` observed on branch
`review/issue-478-pr-488-hermes-hook-manifest`.

## Sprint Contract

Goal: identify the root cause of the `agentmemory connect -- opencode adapter`
timeout and either fix the local harness or record a verified blocker.

Scope:
- Inspect `test/cli-connect.test.ts` and the `src/cli/connect/*` adapter code
  involved in OpenCode, home-directory resolution, and test isolation.
- Build a narrow reproduction loop for the timeout or its underlying isolation
  failure.
- Keep any code change minimal and specific to the test/adapter surface that
  causes the timeout.

Non-goals:
- Do not fetch, pull, push, deploy, or write to remote services.
- Do not alter Hermes manifest behavior or the prior Hermes review decision.
- Do not clean or mutate user home configuration outside the repo without
  explicit current-turn approval.

Acceptance criteria:
- The failing timeout is classified with repo evidence, not only a green retry.
- If a local fix is needed, the changed behavior has a failing test first and a
  passing targeted verification after the fix.
- `pnpm test` is rerun after the fix or the unresolved blocker is recorded.
- The worktree status and residual risks are recorded before handoff.

Intended verification:
- Targeted repro commands for `test/cli-connect.test.ts`.
- `pnpm exec vitest run test/cli-connect.test.ts --exclude test/integration.test.ts`
- `pnpm test`
- `git diff --check`

Known boundaries:
- `node_modules` exists from local verification setup; no dependency or lockfile
  change is intended.
- A prior diagnostic run outside this task reported writing
  `/Users/A1538552/.config/opencode/opencode.json`; this task will not clean
  that path without approval.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Timeout root-cause investigation | Inspect test/adapter isolation and run narrow repro loops | Done | The original `cli-connect` timeout hid a real isolation bug: a dispatcher-loaded OpenCode adapter captured the real home at module load. A subsequent full-suite run exposed an existing `worktree-project-scope` timeout from real Git subprocesses in a memory-search test. |
| Minimal fix if needed | Red/green targeted Vitest command | Done | New dispatcher/OpenCode regression failed red with `already-wired` from the real home, then passed after resolving OpenCode paths at method call time. |
| Full test confidence | `pnpm test` | Done | Final post-cleanup `pnpm test` passed 158 files / 1979 tests in 7.44s. |

## Progress Notes

- 2026-06-16: Created task record after `pnpm test` timed out once in
  `test/cli-connect.test.ts > agentmemory connect -- opencode adapter (#872) >
  dry-run does not mutate the file`.
- 2026-06-16: Added a no-op `@clack/prompts` mock to `test/cli-connect.test.ts`
  so filesystem adapter unit tests no longer emit real terminal UI output.
- 2026-06-16: Added a dispatcher-loaded OpenCode regression test. Red command:
  `pnpm exec vitest run test/cli-connect.test.ts --exclude test/integration.test.ts -t "uses the current home" --reporter verbose`
  failed with `expected 'already-wired' to be 'installed'`, proving the adapter
  was reading the real home config instead of the test home.
- 2026-06-16: Fixed `src/cli/connect/opencode.ts` to resolve the OpenCode
  config and detect paths inside `detect()` / `install()` instead of at module
  import time.
- 2026-06-16: A full-suite rerun then timed out in
  `test/worktree-project-scope.test.ts`; the same file passed standalone. The
  test was simplified to use canonical project ids directly because
  `test/hook-project.test.ts` already covers real Git worktree resolution.
- 2026-06-16: Final post-cleanup verification passed:
  `pnpm exec vitest run test/cli-connect.test.ts --exclude test/integration.test.ts --reporter verbose`
  (26/26),
  `pnpm exec vitest run test/worktree-project-scope.test.ts --exclude test/integration.test.ts --reporter verbose`
  (3/3),
  `pnpm exec vitest run test/hook-project.test.ts --exclude test/integration.test.ts --reporter verbose`
  (14/14),
  combined targeted run (43/43), `pnpm test` (158 files / 1979 tests),
  `git diff --check`, `pnpm run lint`, and
  `semgrep scan --config p/default --error --metrics=off .` with 0 findings.
- 2026-06-16: Two read-only review subagents inspected the scoped diff. One
  returned `ACCEPT`; the other returned `NO FINDINGS`. Both noted the remaining
  timeout risk lives in existing real-Git resolver coverage if future full-suite
  Git timeouts recur, not in the timeout fix itself.

## Final Review Notes

- Root cause fixed for the original OpenCode timeout surface: module-load
  `homedir()` capture allowed dispatcher-loaded adapters to use stale real-home
  paths in tests.
- Full-suite timeout risk reduced for `worktree-project-scope` by removing
  redundant real Git subprocess setup from memory-search tests while preserving
  real Git resolver coverage in `test/hook-project.test.ts`.
- No dependency, lockfile, remote, auth, persistence, or runtime boundary change
  was made.
- Review gates completed: two read-only reviewers found no Critical or Important
  issues; `git diff --check`, lint, full tests, and Semgrep passed locally.
- Residual risk: other historical full-suite timeout flakes are documented in
  prior task notes, but this task's reproduced timeout surfaces passed in the
  final standard `pnpm test`.
