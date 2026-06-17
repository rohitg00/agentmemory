# Issue 206 Claude Code MCP Tools Loading

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/ff34/agentmemory`
- Branch: `github-pr/issue-206-claude-code-mcp-tools-loading-ce60bba`
- Issue: fork issue `wbugitlab1/agentmemory#206`, mirrored from upstream issue `rohitg00/agentmemory#510`
- Task-owned files:
  - `docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/todo.md`
  - `docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/plan.md`
  - `src/mcp/standalone.ts`
  - `test/mcp-standalone.test.ts`

## Repo State Before Edits

- `git status -sb --untracked-files=all`: clean detached `HEAD`
- Created branch: `github-pr/issue-206-claude-code-mcp-tools-loading-ce60bba`
- Local `origin/main` ref resolved to `ce60bba0682e7e8fdfcc62250a2491d1e6a20e5c`
- No `git fetch`, `git pull`, `git push`, PR creation, publish, deploy, or destructive cleanup approved.
- `node_modules` is not present in this worktree at task start.

## Evidence

- Fork issue #206 is open and mirrors upstream issue #510.
- Upstream #510 remains open as of public GitHub API read on 2026-06-17.
- The current checkout already contains `resolveEnvOrEmpty()` in `src/mcp/rest-proxy.ts`, so the literal `${AGENTMEMORY_URL}` placeholder root cause is locally fixed.
- `src/mcp/standalone.ts` still returns hard-coded `protocolVersion: "2024-11-05"` during `initialize`.
- Issue comments report Claude Code sends `protocolVersion: "2025-03-26"` and likely drops tools when the shim negotiates down to `2024-11-05`.

## Sprint Contract

**Goal:** Make the standalone MCP shim preserve Claude Code-visible tool loading by negotiating Claude Code's `2025-03-26` MCP protocol version when requested, while retaining the existing default for unsupported inputs.

**Scope:** Add a focused regression test and a minimal standalone MCP initialize change. Document verification and remaining local reproduction limits.

**Non-goals:**

- Do not add or remove MCP tools.
- Do not change REST endpoints, plugin manifests, auth, storage, persistence, migrations, or external service boundaries.
- Do not fetch, push, create a PR, publish, deploy, or close the GitHub issue without explicit current-turn approval.
- Do not attempt a real Claude Code plugin-marketplace session; local Codex cannot prove that UI/client boundary.

**Acceptance Criteria:**

1. A regression test proves that an `initialize` request with `protocolVersion: "2025-03-26"` receives `protocolVersion: "2025-03-26"`.
2. A regression test proves that missing or non-string requested protocol versions still fall back to the shim default.
3. Existing standalone MCP fallback/proxy behavior remains unchanged.
4. Task notes record that the `${AGENTMEMORY_URL}` placeholder guard is already present and separate from this fix.
5. Targeted tests pass or blockers are documented with exact command output.

**Intended Verification:**

- `corepack pnpm exec vitest run test/mcp-standalone.test.ts`
- If dependencies are missing and pnpm hardening blocks execution, run `corepack pnpm install --frozen-lockfile --ignore-scripts`, then rerun the targeted test.
- `semgrep scan --config p/default --error --metrics=off .` because MCP protocol handling changes.
- `gitleaks protect --staged --redact` after staging and before commit.
- If feasible after targeted pass: `corepack pnpm test -- --runInBand` is not a valid vitest flag here, so prefer `corepack pnpm test` only when dependency setup succeeds and time allows.

**Known Boundaries:**

- MCP protocol negotiation is an externally visible MCP API behavior, but the change is backward-compatible: clients that omit a protocol version retain the existing default.
- No security/auth behavior should change.
- No generated plugin surface should change.

**Stop Conditions:**

- Stop before broad MCP protocol redesign.
- Stop if test evidence suggests Claude Code requires capabilities/tool schema changes instead of protocol negotiation.
- Stop before remote-state changes.
- Stop if dependency installation requires private registry credentials or lifecycle build approval beyond `--ignore-scripts`.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Negotiate requested MCP protocol version for standalone `initialize` | New regression in `test/mcp-standalone.test.ts` | Done | RED: `corepack pnpm exec vitest run test/mcp-standalone.test.ts` failed with expected `2025-03-26` but received `2024-11-05`. GREEN: same command passed 39 tests after fix and final review update. |
| Preserve default protocol when request omits/invalidates version | New regression in `test/mcp-standalone.test.ts` | Done | GREEN: same targeted suite passed with omitted, numeric, and unsupported string `protocolVersion` cases asserting `2024-11-05`. |
| Preserve handler-visible tool list shape after initialize | New handler-level `tools/list` assertion | Done | GREEN: same targeted suite passed, including `{ tools: expect.any(Array) }` after `initialize` with `2025-03-26`. |
| Preserve existing tool list/call behavior | Existing `test/mcp-standalone.test.ts` | Done | GREEN: same targeted suite passed 39 tests. |
| Protocol-handling security gate | Semgrep default scan | Done | `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings over 670 tracked files before and after local base merge. |
| Local PR-prep branch state without remote writes | `git status`, local commit, github-push-prepare preflight | Done | Local commit `58fec41a`; local base merge commit `39d6dc3e`; no fetch/push/PR creation. PR base used existing local `origin/main` at `b5e02429e85792ef1565acb816fd890eaba00fe4`, freshness unverified. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation review | Plan and task record | No | High/Medium findings on scope, tests, integration risk | Medium findings accepted into plan: non-string test, narrow version scope, tools/list handler assertion, Semgrep gate | None |
| Final implementation review | Task-owned diff | No | Security/test/maintainability findings or ACCEPT | Security ACCEPT; test coverage Medium fixed; maintainability Medium fixed | None after fixes and rerun |

## Progress

- [x] Read repo-local instructions and governing workflow skills.
- [x] Inspected initial git state.
- [x] Read public issue and comments for fork #206 and upstream #510.
- [x] Identified local root cause candidate from source evidence.
- [x] Created task branch.
- [x] Write implementation plan.
- [x] Run pre-implementation review.
- [x] Write RED regression test.
- [x] Implement minimal fix.
- [x] Run targeted verification.
- [x] Run final review and cleanup gates.
- [x] Commit task-owned changes.
- [x] Complete local github-push-prepare handoff without remote writes.

## Review Notes

- Pre-implementation reviewer found four Medium gaps: missing non-string protocol test, overly broad arbitrary string echo, missing handler-level `tools/list` assertion, and missing Semgrep gate. All four were accepted into the plan before production-code edits.
- Dependency setup: initial `corepack pnpm exec vitest run test/mcp-standalone.test.ts` triggered pnpm install and failed on ignored builds before Vitest. Followed repo instruction with `corepack pnpm install --frozen-lockfile --ignore-scripts`, which completed. pnpm inserted an `allowBuilds` placeholder block into `pnpm-workspace.yaml`; removed that task-extraneous config churn and confirmed no remaining diff in `pnpm-workspace.yaml`.
- RED evidence: after importing the mocked transport factory, `corepack pnpm exec vitest run test/mcp-standalone.test.ts` failed only the new Claude Code protocol test: expected `2025-03-26`, received `2024-11-05`.
- GREEN evidence: after `src/mcp/standalone.ts` fix and cleanup, `corepack pnpm exec vitest run test/mcp-standalone.test.ts` passed 1 file / 38 tests.
- Final review: Security reviewer ACCEPT. Test coverage reviewer found one Medium gap for unsupported string protocol versions; fixed with `protocolVersion: "2099-01-01"` default regression. Maintainability reviewer found one Medium plan-drift gap; fixed completed plan checkboxes. Post-fix `corepack pnpm exec vitest run test/mcp-standalone.test.ts` passed 1 file / 39 tests.
- Final verification before staging: `git diff --check` passed; `corepack pnpm exec vitest run test/mcp-standalone.test.ts` passed 1 file / 39 tests; `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings over 670 tracked files.
- Commit `58fec41a` created with task-owned source, test, and task-state changes.
- GitHub push-prep used existing local `origin/main` only; no fetch was approved or run. Existing local PR base was `b5e02429e85792ef1565acb816fd890eaba00fe4`. Local merge commit `39d6dc3e` integrated that base; merge touched only `.github/workflows/ci.yml` from the base side and had no conflicts.
- Post-base targeted verification: `corepack pnpm exec vitest run test/mcp-standalone.test.ts` passed 1 file / 39 tests.
- Post-base full test attempt: `corepack pnpm test` failed with 2 unrelated failures out of 2200 tests: generated skill reference drift (`plugin/skills/agentmemory-config/REFERENCE.md`, message says run `corepack pnpm run skills:gen`) and `test/backup-scheduler.test.ts` temp directory cleanup `ENOTEMPTY`. This matches the known generated-doc drift caveat and is not caused by the MCP initialize diff.
- Post-base Semgrep: `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings over 670 tracked files.
- PR check follow-up: GitHub Actions failed at `pnpm run skills:check` on both Ubuntu and macOS because `plugin/skills/agentmemory-config/REFERENCE.md` was stale. Ran `corepack pnpm run skills:gen`; the generated reference now includes five env vars already present in source (`AGENTMEMORY_BACKUP_DIR`, `AGENTMEMORY_BACKUP_ENABLED`, `AGENTMEMORY_BACKUP_INTERVAL_MS`, `AGENTMEMORY_BACKUP_RETENTION_DAYS`, `AGENTMEMORY_HOST`). `corepack pnpm run skills:check` passes after regeneration.
