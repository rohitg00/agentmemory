# PR 895 Doctor Engine Checks Review

Task id: `2026-06-15-pr-895-doctor-engine-checks`

## Scope

Review Issue 874, Issue 875, and PR 895 against the current fork. Decide whether to import, adapt, reject, defer, mark already-fixed, or block the proposed doctor/engine-check change. If a change is warranted, implement only the minimal fork-fit fix with targeted tests.

## Sprint Contract

Goal: resolve the local fork decision for the doctor engine PATH/private-install behavior claimed by Issue 874, Issue 875, and PR 895.

Scope:
- Inspect the current doctor and engine-start code paths related to pinned iii engine discovery, private install paths, PATH precedence, `manualOnly`, and doctor fix application.
- Inspect PR 895 as untrusted input using public read-only sources only unless current-turn approval is granted for credentialed reads.
- Add or adjust focused tests for the relevant doctor diagnostics and fix behavior if the issues still reproduce.
- Document the neutral local review result without external URLs, hash-style issue references, or mentions.
- Run `$prep-merge-to-local-main` at the end, recording no-op/skip reasons if applicable.

Non-goals:
- No GitHub writes, tracker comments, labels, PR creation, pushes, publishing, deployment, or remote state changes.
- No broad CLI refactor, engine install redesign, dependency changes, or version bump.
- No auth, persistence, schema, MCP surface, or REST endpoint changes unless repo evidence proves they are required for these issues.

Acceptance criteria:
- Issue 874 and Issue 875 each have an evidence-backed decision.
- PR 895 has an evidence-backed import/adapt/reject/defer/already-fixed/blocked decision.
- Any code change is minimal, task-owned, and covered by targeted tests.
- Security-sensitive aspects are assessed for PATH/file/subprocess handling, installation boundaries, data exposure, DoS/performance, hooks/tooling, persistence, and supply chain.
- Verification results and limitations are recorded before handoff.
- `$prep-merge-to-local-main` is run or its no-op/skip state is recorded according to the skill.

Intended verification:
- `git status -sb --untracked-files=all`
- Targeted vitest command for doctor diagnostics/fixes
- `git diff --check`
- Required security gates when code or tooling surfaces change, using available local scanner commands
- `$prep-merge-to-local-main` preflight and post-merge checks

Known boundaries:
- Credentialed GitHub API reads require explicit current-turn approval.
- Remote writes are out of scope.
- Dependency installation, scanner installation, or repair requires approval.
- Any change that alters externally consumed CLI contracts beyond the doctor fix behavior must stop for approval.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue 874 relevance decision | Current code inspection plus targeted reproduction/test | Done | Current fork still offered/executed a `manualOnly` diagnostic fix and could not satisfy `iii-on-path-not-local-bin` when another PATH binary stayed first. |
| Issue 875 relevance decision | Current code inspection plus targeted reproduction/test | Done | Current fork still checked only PATH for `engine-version-mismatch`; a pinned private install could be present but ignored by a fresh doctor run. |
| PR 895 fork-fit decision | Public diff inspection plus local comparison | Done | Adapted import: kept the private-install-aware checks and `manualOnly` auto-fix guard; also adjusted dry-run wording for manual-only diagnostics. |
| Minimal implementation, if warranted | Focused vitest, diff review, security review | Done | Changed `src/cli.ts`, `src/cli/doctor-diagnostics.ts`, and `test/cli-doctor-fixes.test.ts`; focused Vitest passed 24 tests. |
| Neutral local documentation | Review this task record for banned URL/hash/mention forms | Done | This record uses neutral IDs and omits external URLs and mention syntax. |
| Merge prep | `$prep-merge-to-local-main` workflow | Done | Local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was merged into this branch with merge commit `6fb4a04a855f0e536dcd7421fafbf8cbe3d7c71d`; no conflicts. |

## Subagent Ledger

No delegated workstreams yet. If conflict resolution or independent security validation becomes necessary, record the allowed scope, write permission, expected output, result, and residual risk here.

## Progress Notes

- 2026-06-16: Reopened this task record for delegated merge-prep verification in `/Users/A1538552/.codex/worktrees/9e13/agentmemory`.
- 2026-06-16: Started detached at `d0d4eee0fe9674044d62436543ac5ec2c909fa0e` with clean status. `git worktree list --porcelain` showed `review/issues-874-875-pr-895-doctor-engine-checks` was not checked out in another worktree, so this worktree was attached to that existing branch without `--ignore-other-worktrees`.
- 2026-06-16: Fixed local main target for this run is `d4393d1ab5dd284edee3a17bfbf45825f239c07e`; no fetch, pull, or push is in scope. Initial ancestry check showed that commit is not yet an ancestor of the branch, so it must be integrated locally before dependency setup and tests.
- 2026-06-16: Intended verification for this run is the user-specified deterministic `corepack pnpm install --frozen-lockfile --ignore-scripts` command with isolated home/config/store paths, followed by exactly `corepack pnpm test` unless `verify-deps-before-run` blocks test startup and requires the allowed one-time config workaround.
- 2026-06-16: Merged pinned local main commit `d4393d1ab5dd284edee3a17bfbf45825f239c07e` into the branch, producing merge commit `64fb1ff636e6fa7e09586eaa2c5c7d8ddafa745a`. No conflicts occurred. The first sandboxed merge attempt was blocked by worktree Git metadata permissions on `ORIG_HEAD`; the same local merge command succeeded after filesystem escalation.
- 2026-06-16: Deterministic dependency setup completed with `pnpm v11.6.0` using the requested isolated HOME/XDG/NPM/PNPM/store paths and `--frozen-lockfile --ignore-scripts`. Lockfile supply-chain policy verification passed for 540 entries. The install reported a pre-build bin-link warning for missing `dist/cli.mjs` under `packages/mcp`, but completed successfully.
- 2026-06-16: Required test command `corepack pnpm test` passed without the `verify-deps-before-run` workaround: 158 test files passed, 1,990 tests passed, duration 24.42s.
- 2026-06-16: No test failure occurred, so the requested read-only subagent diagnosis step was not used. No post-merge code changes were needed.
- 2026-06-16: `$prep-merge-to-local-main` was read after the successful merge/test run because this task record had task-owned cleanup updates. For the docs-only cleanup surface, security-best-practices, simple-code, focused review, and implementation review found no code/security issue and no simplification opportunity beyond keeping the record as direct evidence.
- 2026-06-15: Started in `/Users/A1538552/.codex/worktrees/9361/agentmemory`; repo-local instructions and global workspace instructions are active.
- 2026-06-15: Initial `git status -sb --untracked-files=all` showed detached HEAD with no dirty paths. Created branch `review/issues-874-875-pr-895-doctor-engine-checks` in this worktree.
- 2026-06-15: Coordinator worklist row for PR 895, Issue 874, Issue 875, and Fork issue 398 is present with pending/candidate status.
- 2026-06-15: README, package scripts, CI config, and local instructions inspected. Relevant surface appears to be CLI doctor diagnostics and pinned iii engine runtime handling.
- 2026-06-15: Public read-only inputs were copied to temporary files under `/tmp` for Issue 874, Issue 875, and PR 895. They were treated as untrusted data and compared against local source before implementation.
- 2026-06-15: Local Issue 874 evidence: `iii-on-path-not-local-bin` was marked `manualOnly`, but `runDoctor` still offered and executed its fix in both interactive and `--all` paths. Its check compared the first PATH `iii` against the private install path, so installing to the private path could not satisfy the diagnostic when another `iii` stayed first on PATH.
- 2026-06-15: Local Issue 875 evidence: `engine-version-mismatch` checked only the first PATH `iii`. A pinned private install under the agentmemory state directory could be present and used by runtime startup while doctor still reported a mismatch in a fresh run.
- 2026-06-15: PR 895 changed `src/cli.ts`, `src/cli/doctor-diagnostics.ts`, and `test/cli-doctor-fixes.test.ts`. Its core approach fits this fork: make engine checks private-install-aware and skip auto-fix for `manualOnly` diagnostics. Local implementation is an adapted import because dry-run wording was also adjusted to avoid saying a manual-only diagnostic "would fix".
- 2026-06-15: Added focused tests for private-install precedence, fix convergence after installer writes the private binary, `manualOnly` auto-fix classification, and dry-run manual-only wording.
- 2026-06-15: Implemented `canAutoFix`, updated both engine checks to accept a pinned private install, changed the Doctor loop to skip `manualOnly` diagnostics instead of applying fixes, and made `dryRunPlan` label manual-only fixes separately.
- 2026-06-15: Verification: `npm test -- test/cli-doctor-fixes.test.ts` failed before running tests because this worktree has no `node_modules` and `vitest` was not found. Non-installing fallback using the primary checkout's Vitest binary with this worktree as root passed: 1 test file, 24 tests. `git diff --check` passed.
- 2026-06-15: Security verification: targeted Semgrep over `src/cli.ts` and `src/cli/doctor-diagnostics.ts` passed with 0 findings; repo-wide Semgrep passed with 0 findings across tracked files; full-tree Gitleaks detect passed with no leaks.
- 2026-06-15: Codex Security diff scan completed for local patch with 2/2 runtime files reviewed, no candidate findings, and final reports at `/tmp/codex-security-scans/agentmemory/bfde73b_20260615T180308Z_local-patch/report.md` and `.html`. Goal usage: 31,825 tokens and 153 seconds.
- 2026-06-15: Full non-installing Vitest attempt using primary checkout dependencies and this worktree as root failed due environment/module-resolution limitations: many failures were `Cannot find package 'iii-sdk'` or `Cannot find package '@clack/prompts'` from this worktree lacking local dependencies. This is not used as a regression signal for the task-owned change. The attempt created ignored cache `node_modules/.vite/vitest`, classified as a verification artifact and not staged.
- 2026-06-15: `$prep-merge-to-local-main` preflight found no active Git operation, no staged or unstaged tracked changes, local `main` at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`, and only the pre-existing ignored Vitest cache under `node_modules/`. The local `main` worktree was clean and matched the captured commit.
- 2026-06-15: Merged captured local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` into `review/issues-874-875-pr-895-doctor-engine-checks`, producing merge commit `6fb4a04a855f0e536dcd7421fafbf8cbe3d7c71d`. There were no conflicts. The first sandboxed merge attempt was blocked by Git metadata write permissions on `ORIG_HEAD`; the same local merge command succeeded after filesystem escalation.

## Review Notes

Decisions:
- Issue 874: adapted import. The current fork still had the no-op diagnostic/fix-loop behavior.
- Issue 875: adapted import. The current fork still reported mismatch from PATH even when a pinned private install could be the runtime winner.
- PR 895: adapted import. The public diff's main design matched the local failure mode; the local version also updates dry-run wording for manual-only diagnostics.
- Fork issue 398: local work performed; no remote tracker write.

Security notes:
- Auth/tenancy: no auth, tenancy, REST, MCP, or persisted memory access changed.
- Filesystem: checks continue to probe only injected binary paths in doctor tests and the established private iii path in production effects. No deletion or broad file write was added.
- Subprocess/PATH: the change reduces PATH trust for doctor checks by accepting the pinned private install before a mismatched PATH binary. Existing `iiiBinaryVersion` timeout remains the bound for version probes.
- Data exposure: diagnostic details can still display a local binary path, matching existing behavior. No secrets, environment values, request bodies, or memory content are logged.
- DoS/performance: each affected diagnostic can probe both the private and PATH binary versions, bounded by the existing 3000 ms version command timeout per probe.
- Supply chain: no dependency, lockfile, installer URL, package-manager, or CI change.
- Hooks/tooling/persistence: no hook, MCP, REST, schema, or persistent state format change. Doctor runtime behavior changes only whether a diagnostic is considered auto-fixable and how private install presence is interpreted.

Verification summary:
- `npm test -- test/cli-doctor-fixes.test.ts`: blocked before tests because `vitest` was not installed in this worktree.
- `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --root /Users/A1538552/.codex/worktrees/9361/agentmemory --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts test/cli-doctor-fixes.test.ts`: passed, 1 file / 24 tests.
- `git diff --check`: passed.
- `semgrep scan --config p/default --error --metrics=off src/cli.ts src/cli/doctor-diagnostics.ts`: passed, 0 findings.
- `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings.
- `gitleaks detect --source . --redact --no-color`: passed, no leaks.
- Post-merge `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --root /Users/A1538552/.codex/worktrees/9361/agentmemory --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts test/cli-doctor-fixes.test.ts test/github-cross-reference-neutralizer.test.ts test/issue-mirror.test.ts test/upstream-pr-issue-tracker.test.ts`: passed, 4 files / 105 tests.
- Post-merge `git diff --check`: passed.
- Post-merge `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings.
- Post-merge `gitleaks detect --source . --redact --no-color`: passed, no leaks.
- Post-merge `gitleaks protect --staged --redact --no-color`: passed, no leaks with no staged content.
- Full non-installing Vitest suite attempt: failed due missing package resolution in this worktree when using external dependencies; focused test remains the task-owned verification.

Review chain notes:
- Passive security-best-practices orientation: no critical or major issue identified for this TypeScript CLI patch. No matching dedicated TypeScript CLI reference file exists in the skill references; review used general secure-default principles for subprocess/PATH/file boundaries.
- Simple-code pass: kept the existing diagnostic catalog shape; moved manual-only handling before `why` output to avoid duplicate/confusing text; no further simplification was justified without changing behavior.
- Focused requesting-code-review gate: subagent dispatch was not permitted by the available tool policy without an explicit user request for subagents, so the main agent performed the focused requirements/test/security/integration review locally. Result: ACCEPT, no critical or important findings.
- Review Implementation gate: local adversarial pass inspected the task-owned diff, line-numbered hunks, tests, verification output, and security scan artifacts. Result: NO FINDINGS. Residual risk: full suite could not be used as a regression signal without local dependencies; targeted task-owned tests passed.
- Codex Security diff scan: completed with no findings; reports are under `/tmp/codex-security-scans/agentmemory/bfde73b_20260615T180308Z_local-patch/`.
