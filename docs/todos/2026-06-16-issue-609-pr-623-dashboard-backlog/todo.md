# Issue 609 / PR 623 Dashboard Backlog Review

Task id: `2026-06-16-issue-609-pr-623-dashboard-backlog`

## Scope

Review upstream Issue 609 and PR 623 for the local fork, then adapt a minimal local fix only if the current fork still has a plausible dashboard freeze path while processing large `mem-live` sync backlogs.

Owning scope:
- Repository: `/Users/A1538552/.codex/worktrees/4d42/agentmemory`
- Branch: `review/issue-609-pr-623-dashboard-backlog`
- Touched area expected: viewer dashboard client code and focused viewer tests

## Sprint Contract

Goal: determine whether the dashboard backlog freeze remains relevant locally, and if so add regression coverage and the smallest bounded dashboard update fix.

Scope:
- Inspect current viewer `mem-live` handling, dashboard loading, auto-refresh, and tests.
- Compare PR 623 as evidence only; do not import it blindly.
- Add focused regression coverage before production code if the bug is present or plausible.
- Preserve local main integration and existing unrelated work in other worktrees.

Non-goals:
- No credentialed remote reads or writes.
- No push, PR creation, publishing, deployment, migrations, or external service changes.
- No broad viewer redesign, route migration, or backend protocol changes.
- Do not process other PR candidates from the review list.

Acceptance criteria:
- Worktree path, branch, git status, and local main integration are recorded.
- Dependencies are materialized deterministically if needed for tests.
- Issue 609 is classified as relevant, already fixed, or not reproducible/plausible with evidence.
- If relevant, a regression fails before the fix and passes after the minimal implementation.
- Targeted tests pass; full `corepack pnpm test` runs when feasible.
- If code/tests change, `prep-merge-to-local-main` is run afterward or any blocker is recorded.

Intended verification:
- `corepack pnpm install --frozen-lockfile --store-dir /tmp/agentmemory-pnpm-store`
- Targeted viewer regression test
- `corepack pnpm test`
- Required security/review gates if code changes before merge prep

Known boundaries:
- Local `main` integration is allowed; fetch/pull/push is not.
- Public unauthenticated GitHub reads are only a fallback if local evidence is insufficient.
- The dashboard receives untrusted live stream data and API payload shapes; fixes must bound client-side work without weakening auth or error handling.

Stop conditions:
- Required branch or local `main` state cannot be verified.
- Dependency setup requires private registry or credential exposure.
- Correct fix would change externally consumed protocol/API, auth, persistence, or system boundaries without explicit approval.
- A merge or review gate reports unresolved findings that require user acceptance.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Preflight and local main integration | Git status, branch, worktree, merge-base, explicit merge | Done | Initial worktree was detached at `0fc5b4d`; switched to `review/issue-609-pr-623-dashboard-backlog`; `git merge --ff-only refs/heads/main` reported already up to date. |
| Dependency materialization | Frozen pnpm install with isolated store | Blocked / usable fallback | `corepack pnpm install --frozen-lockfile --store-dir /tmp/agentmemory-pnpm-store` downloaded packages but exited nonzero because hardened pnpm ignored build scripts and wrote placeholder `allowBuilds`; removed the unintended config diff. Existing `node_modules/.bin/vitest` was usable for verification. |
| Relevance / reproduction | Viewer code inspection plus red regression if bug exists | Done | Current fork still routed every `sync` backlog observation through `routeWsMessage`; while Dashboard was active each routed observation started `loadDashboard()`. Red test with 50 backlog observations produced 550 fetches. Public Issue 609 and PR 623 diff confirmed the same bug class and proposed debounce/cap/in-flight sharing. |
| Minimal fix | Targeted test goes red then green | Done | Added dashboard backlog regression in `test/viewer-session-id.test.ts`; implemented `loadDashboardOnce()`, debounced dashboard refresh scheduling, dashboard `sync` short-circuit, and non-dashboard `sync` cap in `src/viewer/index.html`. |
| Final verification | Targeted/full tests and merge-prep workflow if changed | Done | Targeted tests, full non-integration Vitest, `git diff --check`, Semgrep, and Codex Security diff scan passed. Prep committed the fix, merged local `main` commit `f58174d3`, and post-merge tests passed. |

## Progress Notes

- 2026-06-16: Delegated task started in Codex worktree `/Users/A1538552/.codex/worktrees/4d42/agentmemory`.
- 2026-06-16: Read governing instructions and tracker files named by the user. The PR review inventory marks PR 623 / Issue 609 as the only remaining open-draft dashboard backlog bugfix candidate in scope.
- 2026-06-16: Initial `git status -sb --untracked-files=all` showed detached HEAD with no dirty paths. Local target branch exists and points to `0fc5b4d`.
- 2026-06-16: Switched to `review/issue-609-pr-623-dashboard-backlog`. Status is clean. Local `main` and branch share merge-base `0fc5b4d`; explicit local-main merge was a no-op.
- 2026-06-16: Dependency setup with isolated pnpm store was attempted under a sanitized environment. It exited nonzero after package materialization due ignored build scripts (`esbuild`, `onnxruntime-node`, `protobufjs`, `sharp`) and generated placeholder `allowBuilds` in `pnpm-workspace.yaml`; that task-caused placeholder diff was removed.
- 2026-06-16: Public unauthenticated reads were used only after local evidence showed the bug path. Issue 609 describes a root `mem-live` initial `sync` backlog with 214,887 observations causing Chrome renderer memory growth, and PR 623 changes the same viewer areas with debounce/cap/in-flight sharing. The local patch was adapted rather than imported verbatim.
- 2026-06-16: TDD red/green evidence: new regression initially failed with `expected 550 to be less than or equal to 11`; after the fix it passed.
- 2026-06-16: Verification passed:
  - `./node_modules/.bin/vitest run test/viewer-session-id.test.ts`
  - `./node_modules/.bin/vitest run test/memories-pagination.test.ts`
  - `./node_modules/.bin/vitest run --exclude test/integration.test.ts` (`169 passed`, `2176 passed`)
  - `git diff --check`
  - `semgrep scan --config p/default --error --metrics=off src/viewer/index.html test/viewer-session-id.test.ts` (`0 findings`)
- 2026-06-16: `corepack pnpm exec vitest ...` and `corepack pnpm test` were not used for final verification because pnpm attempted an install/purge after the hardened install failure. Direct Vitest binary was used from the materialized dependencies.
- 2026-06-16: Initial merge-prep preflight after code/test changes stopped before staging or committing because the local `main` worktree was dirty with unrelated runtime-ports files. This worktree was not modified.
- 2026-06-16: User explicitly invoked `prep-merge-to-local-main` again. Fresh preflight showed local `main` worktree clean and `refs/heads/main` at `f58174d3` (`fix: keep runtime iii config v0.11 compatible`). Incoming main paths are runtime-port files only and do not overlap the task-owned viewer/test/doc paths.
- 2026-06-16: Focused reviewer subagent and adversarial reviewer subagent were spawned read-only, but the available tool interface did not expose `wait_agent`; both threads were later closed and their Codex thread records show `interrupted` with no review result. Local focused review and local adversarial `review-implementation` pass found no critical or important findings.
- 2026-06-16: Codex Security diff scan ran for the local patch. Discovery reviewed `src/viewer/index.html` with `test/viewer-session-id.test.ts` as supporting verification, produced no plausible candidate findings, and wrote reports under `/tmp/codex-security-scans/agentmemory/0fc5b4d_20260616_dashboard_backlog/`.
- 2026-06-16: Fresh pre-stage verification passed:
  - `./node_modules/.bin/vitest run test/viewer-session-id.test.ts`
  - `./node_modules/.bin/vitest run test/memories-pagination.test.ts`
  - `git diff --check`
  - `semgrep scan --config p/default --error --metrics=off src/viewer/index.html test/viewer-session-id.test.ts` (`0 findings`)
- 2026-06-16: Committed task-owned fix as `afaa7ec6` (`fix(viewer): debounce dashboard backlog refreshes`).
- 2026-06-16: First local-main merge attempt failed under sandbox because Git could not write `.git/worktrees/agentmemory/ORIG_HEAD.lock`; reran the same captured-SHA merge with approved escalation. Merge commit `17e1c882` merged local `main` commit `f58174d3`.
- 2026-06-16: Post-merge verification passed:
  - `git diff --check`
  - `./node_modules/.bin/vitest run test/viewer-session-id.test.ts test/memories-pagination.test.ts` (`13 passed`)
  - `./node_modules/.bin/vitest run --exclude test/integration.test.ts` (`169 passed`, `2176 passed`)

## Review Notes

- Simple-code pass: no additional simplification applied. The new state is local to dashboard refresh coordination, and the `sync` cap is the narrow boundary needed for the backlog failure.
- Passive security review: no new HTML injection, credential, auth, or storage boundary was introduced. The change reduces unbounded browser work from untrusted WebSocket backlog data.
- Focused implementation review: no critical or important findings. Residual risk is that the `WS_SYNC_PROCESS_LIMIT` value is a local viewer constant rather than a user-configurable setting; this is acceptable for the minimal bugfix because historical data remains available through REST-backed tabs.
- Independent subagent review was attempted after explicit prep-merge invocation, but no review result was retrievable from the available tooling. A second local adversarial pass was performed instead.
