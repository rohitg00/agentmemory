# Issue 201 Concurrent Sessions Unresponsive

## Scope And Evidence

- Repository: `/Users/A1538552/.codex/worktrees/fbd3/agentmemory`
- Working branch: `github-pr/issue-201-concurrent-sessions-ce60bba`
- Issue: fork issue #201, imported from upstream issue #499, both open as of 2026-06-17.
- Reported symptom: three concurrent Claude Code sessions with AgentMemory v0.9.18 can make the AgentMemory server stop responding or hang instead of failing fast.
- Local version: package version 0.9.27.
- Current repo evidence:
  - `src/hooks/session-start.ts` default path posts session registration telemetry without awaiting the response, but does not force process exit.
  - `test/hook-source-smoke.test.ts` currently asserts default `session-start` does not call `setTimeout`.
  - Repo-local hook rules require telemetry-only hooks to use fire-and-forget `fetch(...).catch(() => {})` with an unref'd forced exit, because unawaited fetch keeps Node alive until completion or timeout.
  - Other telemetry hooks such as `post-tool-use`, `subagent-start`, and `session-end` already schedule an unref'd forced exit.

## Sprint Contract

**Goal:** Prevent default Claude Code `session-start` telemetry from keeping hook processes alive behind slow or unresponsive AgentMemory server requests, so concurrent sessions shed hook pressure promptly.

**Scope:**
- Change only the default non-context-injecting `session-start` hook behavior.
- Add/adjust a focused hook-source regression test.
- Keep task state under this directory.

**Non-goals:**
- No REST, MCP, auth, schema, storage, iii-engine, endpoint, plugin count, or protocol changes.
- No new dependencies or package-manager changes.
- No fetch, pull, push, PR creation, issue comments, labels, publish, deploy, migrations, or destructive cleanup.
- No broad concurrency scheduler or queue redesign.

**Acceptance Criteria:**
- A red/green regression proves default `session-start` schedules a short forced exit after dispatching session registration telemetry.
- Context-injecting `session-start` still awaits `/agentmemory/session/start` and writes returned context when opted in.
- Existing telemetry hook fire-and-forget expectations remain intact.
- Targeted repo-native tests for hook source behavior pass, or blockers are recorded.
- The task record and plan document verification evidence and residual risks.

**Intended Verification:**
- `corepack pnpm exec vitest run test/hook-source-smoke.test.ts --no-file-parallelism`
- If pnpm hardening blocks execution, follow repo instruction: `corepack pnpm install --frozen-lockfile --ignore-scripts`, then rerun.
- Final local PR-prep gates as far as allowed without fetch/push/PR creation.

**Known Boundaries:**
- The change intentionally preserves endpoint shape and response semantics.
- The fix reduces client hook pressure; it does not prove iii-engine can sustain arbitrary concurrent long-running memory workloads.
- `origin/main` freshness is not approved; use existing local remote-tracking state if needed for local PR-prep reporting.

**Stop Conditions:**
- Any fix requires API/auth/storage/protocol or iii-engine boundary changes.
- Test reproduction points to a different subsystem that cannot be fixed surgically.
- Dependency installation requires private registry access or credential exposure.
- Required security or verification gates produce findings outside this task's approved scope.

## Feature / Verification Matrix

| Change | Verification Method | Status | Evidence |
| --- | --- | --- | --- |
| Issue still needs local evaluation | Public issue API + repo inspection | done | Fork #201 and upstream #499 are open; local hook code still has a telemetry path without forced exit. |
| Default `session-start` telemetry exits independently of server response | Red/green `test/hook-source-smoke.test.ts` | done | Red: targeted test failed with `expected "setTimeout" to be called 1 times, but got 0 times`; Green: targeted test passed 16/16 after adding forced exit and a pending-fetch regression proving timer registration does not await server response. |
| Context injection remains awaited | Existing and updated hook-source test | done | Green test asserts injected mode writes `remembered context` and does not schedule `setTimeout`. |
| GitHub feature-loop local prep | `github-push-prepare` local branch-prep phase | in progress | No remote reads or writes approved. Local `origin/main` is `ce60bba0682e7e8fdfcc62250a2491d1e6a20e5c`; freshness unverified. |

## Subagent Ledger

| Workstream | Scope | Edits Allowed | Expected Output | Result | Residual Risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation review | Plan and identified hook/test scope | no | High/Medium findings on scope, verification, and boundary risk | done | Valid Medium findings addressed in plan: dependency setup guard, `process.exit(0)` assertion, injection no-timer assertion, mandatory Semgrep wording. |
| Implementation | `src/hooks/session-start.ts`, `test/hook-source-smoke.test.ts`, task record | yes | Red/green fix with targeted verification | done | Main agent verified red/green, pending-fetch regression, adjacent hook tests, lint, Semgrep, and staged diff. |
| Final review | Stable task diff | no | Security/test/maintainability findings or ACCEPT | done | Security and maintainability accepted; test coverage reviewer found one Important gap, fixed by adding a pending-fetch regression. |

## Progress

- 2026-06-17: Loaded `github-feature-loop`, `writing-plans`, `review-and-implement`, `github-push-prepare`, `systematic-debugging`, `test-driven-development`, `subagent-driven-development`, `simple-code`, and `verification-before-completion`.
- 2026-06-17: Inspected `AGENTS.md`, README, package scripts, git status, worktree list, issue #201, upstream issue #499, and relevant hook/observe/API files.
- 2026-06-17: Created local branch `github-pr/issue-201-concurrent-sessions-ce60bba` from detached `ce60bba0682e7e8fdfcc62250a2491d1e6a20e5c`.
- 2026-06-17: Pre-implementation review completed by two read-only subagents. Accepted findings: guard dependency setup before `pnpm exec`, prove the timeout callback calls `process.exit(0)`, assert injection mode does not schedule forced exit, and treat Semgrep missing/runtime errors as blocking unless explicitly accepted.
- 2026-06-17: Verification dependency setup completed with `HOME=/tmp/agentmemory-issue201-home XDG_CONFIG_HOME=/tmp/agentmemory-issue201-xdg NPM_CONFIG_USERCONFIG=/tmp/agentmemory-issue201-npmrc PNPM_HOME=/tmp/agentmemory-issue201-pnpm-home corepack pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/agentmemory-issue201-pnpm-store`. Install passed; it warned about a missing generated bin target `dist/cli.mjs` for the workspace package, but `git diff -- package.json pnpm-lock.yaml pnpm-workspace.yaml` was empty.
- 2026-06-17: Initial planned command `corepack pnpm exec vitest run test/hook-source-smoke.test.ts --runInBand` failed before tests because Vitest 4.1.8 does not support `--runInBand`. `corepack pnpm exec vitest run --help` shows `--no-file-parallelism`; plan updated to use that command.
- 2026-06-17: Red test: `corepack pnpm exec vitest run test/hook-source-smoke.test.ts --no-file-parallelism` failed 1/16 with `expected "setTimeout" to be called 1 times, but got 0 times` before source edit.
- 2026-06-17: Implemented minimal fix in `src/hooks/session-start.ts`: default non-injection telemetry path now schedules `setTimeout(() => process.exit(0), 500).unref()` after dispatching session registration.
- 2026-06-17: First green attempt exposed test harness leakage between two `importHook` calls; isolated mocks/stubs inside `importHook` so injected mode verifies its own `setTimeout` calls. Final targeted run passed 1 file / 16 tests.
- 2026-06-17: Adjacent targeted verification passed: `corepack pnpm exec vitest run test/hook-source-smoke.test.ts test/context-injection.test.ts test/claude-code-with-hooks.test.ts --no-file-parallelism` reported 3 files / 26 tests passed.
- 2026-06-17: `corepack pnpm run lint` passed.
- 2026-06-17: Full `corepack pnpm test` failed with the known independent generated skill-reference drift: `plugin/skills/agentmemory-config/REFERENCE.md (AUTOGEN:env out of date — run corepack pnpm run skills:gen)`. Result: 169 files passed / 1 failed; 2,194 tests passed / 1 failed. This task did not touch generated skill references.
- 2026-06-17: Final review round: security/privacy reviewer ACCEPT; maintainability/integration reviewer ACCEPT; test-coverage reviewer reported an Important gap that the default telemetry test did not prove detachment from a pending fetch. Added `fetchMode: "pending"` harness option and a pending-fetch `session-start` assertion. Rerun passed `test/hook-source-smoke.test.ts` 1 file / 16 tests; adjacent hook/context suite passed 3 files / 26 tests; lint passed.
- 2026-06-17: Passive security-best-practices review found no new secret, auth, remote-host, input-validation, API, storage, or protocol surface; the existing plaintext bearer guard remains in use and the change only bounds local hook process lifetime.
- 2026-06-17: Semgrep passed: `semgrep scan --config p/default --error --metrics=off .` scanned 670 tracked files with 507 rules and reported 0 findings.
- 2026-06-17: OSV skipped because this task changed no dependencies, lockfiles, package-manager config, container files, vendored code, or third-party package surfaces.
- 2026-06-17: `git diff --check` passed.
- 2026-06-17: Local PR base capture used existing `refs/remotes/origin/main` only, because fetch was not approved. Base SHA and merge-base both `ce60bba0682e7e8fdfcc62250a2491d1e6a20e5c`; `git log --oneline --decorate --left-right --max-count=20 HEAD...refs/remotes/origin/main` produced no output, so captured base is already the branch ancestor.

## Final Review Notes

- Sprint Contract status: goal met locally for the Claude Code `session-start` default telemetry path; no API/auth/storage/protocol boundary changed.
- Acceptance criteria:
  - Red/green regression: met.
  - Context injection preservation: met.
  - Existing telemetry expectations: adjacent hook/context tests passed.
  - Targeted repo-native checks: met.
  - Full test suite: blocked by independent generated skill-reference drift in `plugin/skills/agentmemory-config/REFERENCE.md`; not task-owned.
- Residual risk: this fix reduces client-side hook/process pressure when session registration hangs. It does not prove arbitrary iii-engine/server workloads cannot become saturated under all concurrent memory operations.
