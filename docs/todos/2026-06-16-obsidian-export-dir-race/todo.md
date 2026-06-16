# Obsidian Export Directory Race Task State

Task id: `2026-06-16-obsidian-export-dir-race`
Scope: current `agentmemory` worktree
Branch: `review/issue-244-pr-318-opencode-session-metadata`
Status: implemented; prep-merge gates in progress

## Sprint Contract

Goal: diagnose and fix the `pnpm test` failure in `test/obsidian-export-symlink.test.ts` without unrelated changes.

Scope:
- `src/functions/obsidian-export.ts` directory preparation for Obsidian export.
- `test/obsidian-export-symlink.test.ts` regression coverage for symlinked export subdirectories.
- This task record.

Non-goals:
- No fetch, pull, push, deploy, remote merge, dependency changes, API/schema/auth changes, or broad filesystem redesign.
- No changes outside the Obsidian export failure surface unless prep-merge gates prove they are required.

Acceptance criteria:
- A symlinked export subdirectory is rejected.
- Rejection leaves no asynchronous sibling directory preparation racing test cleanup.
- The outside symlink target remains untouched.
- The focused symlink test fails before the production fix and passes after it.
- `pnpm test` passes after the fix, or any limitation is recorded.
- If code changes are made, `/Users/A1538552/.agents/skills/prep-merge-to-local-main/SKILL.md` is executed as far as local tools allow.

Intended verification:
- RED: targeted Vitest run for the new/strengthened symlink regression.
- GREEN: targeted symlink test run.
- Full: `pnpm test`.
- Prep-merge gates and security checks required by the prep skill for the touched filesystem/security surface.

Known boundaries:
- The worktree was initially detached at `41243f6`, which is contained by `review/issue-244-pr-318-opencode-session-metadata`; it has been switched to that branch before edits.
- The repository has no tracked `pnpm-lock.yaml`; `node_modules` was materialized with `pnpm install --no-lockfile --ignore-scripts` for verification only.
- Local `main` has no diff from this branch for `src/functions/obsidian-export.ts` or `test/obsidian-export-symlink.test.ts`.
- This task fixes the internal fail-fast directory-preparation race and static symlink side effect. It does not claim complete defense against a concurrent local actor swapping parent directories between validation and file open; that broader TOCTOU class needs an OS-specific directory-fd/openat style design or a separately approved private-owned-tree policy.

Stop conditions:
- Any required fix crosses API, auth, schema, migration, dependency, service, remote, push, or destructive-action boundaries.
- Required review or security tooling is missing or reports a blocking finding that cannot be resolved in scope.
- Git hooks/signing, private registry, or merge state blocks local commit/merge prep.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Diagnose `pnpm test` failure | Full test output and two read-only subagents | Done | Initial `pnpm test` failed on cleanup `ENOTEMPTY`; Newton classified cleanup/environment flake; Tesla identified `Promise.all` fail-fast race and sibling mkdir side effects. |
| Prove regression before production fix | Targeted symlink test | Done | RED: `pnpm vitest run test/obsidian-export-symlink.test.ts --testNamePattern "rejects a symlinked export subdirectory"` failed because `vault` contained `crystals`, `lessons`, `memories`, and `sessions` instead of only the pre-existing `memories` symlink. |
| Remove fail-fast async directory race | Focused test plus code inspection | Done | `src/functions/obsidian-export.ts` now prepares category directories sequentially with `for...of` and `await`, so symlink rejection stops before sibling directory creation starts. |
| Full suite | `pnpm test` | Done | Passed after fix: 159 test files / 1986 tests. |
| Prep-merge gates | Prep skill workflow | In progress | Prep skill, review skills, and security diff scan skill loaded; focused reviewers and security scans are running. |

## Subagent Ledger

| Workstream | Agent | Allowed scope | Edits allowed | Result | Residual risk |
|---|---|---|---:|---|---|
| Product-path diagnosis | `019ece72-c441-7d90-b10b-a32d52d01764` | Obsidian export implementation and symlink test | No | Classified as product bug with test gap. Evidence: concurrent `Promise.all` starts sibling `mkdir` operations, fails fast on symlink, and can leave directory work racing cleanup. | Exact `ENOTEMPTY` remained timing-dependent. |
| Test/environment diagnosis | `019ece72-c538-7843-b0eb-bedb5a7f5ff0` | Symlink test, neighboring tests, local main comparison | No | Classified as intermittent cleanup/environment failure, not merge drift. Evidence: targeted file and full suite passed in that agent; relevant files match local `main`. | Did not reproduce the sibling directory side effect as a blocking product bug. |
| Prep focused code review | `019ece77-b914-7d31-a5da-238f0a734c3e` | Current task-owned diff | No | Found stale task-state status and verification matrix. Fixed in this task-state update. | Did not rerun tests. |
| Prep breaker review | `019ece77-bb93-74e2-b817-03a49b2febc4` | Current task-owned diff | No | NO FINDINGS. | Did not rerun tests. |
| Prep filesystem/security boundary review | `019ece77-bcb5-7be3-8a9a-186f0053d39b` | Current task-owned diff | No | Medium residual risk: current code still has validate-then-open TOCTOU exposure if a concurrent actor can swap parent directories after validation. Accepted as out of scope for this cleanup-race fix and documented as residual risk. | Did not run a race PoC. |

## Progress Notes

- Active repo instructions read from `AGENTS.md`; package scripts inspected from `package.json`.
- `git status -sb --untracked-files=all` initially reported `## HEAD (no branch)`.
- `git branch --all --contains HEAD` showed `review/issue-244-pr-318-opencode-session-metadata` contains the current commit.
- `pnpm test` first failed before test execution because `node_modules` was missing and `vitest` was not found.
- Dependencies were materialized for verification with `pnpm install --no-lockfile --ignore-scripts`; no lockfile was created intentionally.
- Re-run `pnpm test` executed 159 test files / 1986 tests and failed one test: `test/obsidian-export-symlink.test.ts > rejects a symlinked export subdirectory that points outside the export root`, with `ENOTEMPTY` during `rm(sandbox, { recursive: true, force: true })`.
- Targeted `pnpm vitest run test/obsidian-export-symlink.test.ts --testNamePattern "rejects a symlinked export subdirectory"` passed in isolation.
- Targeted `pnpm vitest run test/obsidian-export-symlink.test.ts` passed 4/4.
- Branch switched to `review/issue-244-pr-318-opencode-session-metadata` before edits.
- Test was strengthened to assert `readdir(vaultDir)` returns only `["memories"]` for the symlinked `vault/memories` rejection case.
- RED verification captured the product side effect: the existing implementation created `crystals`, `lessons`, and `sessions` before/while rejecting the symlinked `memories` directory.
- Production fix replaced `Promise.all(Object.values(dirs).map(...))` with sequential `for...of await` directory preparation.
- GREEN verification: targeted symlink test passed; `test/obsidian-export-symlink.test.ts` passed 4/4; `test/obsidian-export.test.ts` plus symlink test passed 20/20; full `pnpm test` passed 159 files / 1986 tests.
- Prep focused code review found no code/test issue but reported this task-state record was stale. This update records the completed verification and current prep status.

## Review Notes

- Current diagnosis: product bug with cleanup-flake symptom. The implemented minimal fix avoids fail-fast concurrent directory preparation for export category directories, and the strengthened test proves a symlinked `memories` directory rejection does not create sibling export directories.
- Prep review status: focused code review reported one important task-state documentation issue, fixed here. Breaker reviewer reported `NO FINDINGS`. Boundary reviewer reported a medium residual TOCTOU risk in the existing validate-then-open filesystem pattern.
- The boundary reviewer risk is accepted as outside this task's scope: this task does not claim to solve the broader concurrent-parent-swap class. The broader hardening option remains a separate design task.

## Verification Evidence

- Initial `pnpm test` before dependency setup: failed before tests because `vitest` was not found and `node_modules` was missing.
- Verification setup: `pnpm install --no-lockfile --ignore-scripts` completed; this was local materialization only, with no intended manifest or lockfile changes.
- Initial real `pnpm test`: failed 1 of 1986 tests with `ENOTEMPTY` cleanup error in `test/obsidian-export-symlink.test.ts`.
- Focused isolation before fix: `pnpm vitest run test/obsidian-export-symlink.test.ts --testNamePattern "rejects a symlinked export subdirectory"` passed before test strengthening, proving the old assertion did not expose the sibling-directory side effect.
- RED after test strengthening: `pnpm vitest run test/obsidian-export-symlink.test.ts --testNamePattern "rejects a symlinked export subdirectory"` failed with received `["crystals","lessons","memories","sessions"]` for `readdir(vaultDir)`.
- GREEN after production fix: same targeted command passed, 1 test passed / 3 skipped.
- Focused file verification: `pnpm vitest run test/obsidian-export-symlink.test.ts` passed, 4 tests.
- Neighboring Obsidian verification: `pnpm vitest run test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` passed, 2 files / 20 tests.
- Full verification: `pnpm test` passed, 159 files / 1986 tests.
- Prep local checks so far: `git diff --check` passed; `semgrep scan --config p/default --error --metrics=off src/functions/obsidian-export.ts test/obsidian-export-symlink.test.ts` passed, 0 findings; `gitleaks detect --source . --redact` passed, no leaks.

## Residual Risks

- `writeExportFile()` still validates a parent directory path before opening the final file path. `O_NOFOLLOW` protects the final Markdown path component, but it does not make parent-directory traversal immune to a concurrent local actor who can mutate the vault tree between validation and open. Full mitigation would require a broader OS-specific directory-fd/openat design or a private-owned export tree policy outside this task.
- The repository has no tracked lockfile, so the local `pnpm install --no-lockfile --ignore-scripts` verification setup may resolve newer dependency versions over time. The task did not intentionally add or change dependency metadata.
