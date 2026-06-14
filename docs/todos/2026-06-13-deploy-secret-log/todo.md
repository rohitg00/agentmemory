# Deploy Secret Log Fix

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/fd0a/agentmemory`
- Worktree: detached `HEAD` at `21ac25ad367aca55886d2afb920383ff8ab5f1d1`
- Task owner: fix delegated Security Finding 06 for deploy entrypoints.
- Spec source: user delegation in thread `019ec256-5108-7710-b6cf-794b75e2d048` plus read-only subagent consensus.

## Sprint Contract

Goal: stop generated `AGENTMEMORY_SECRET` values from being written to deploy/platform logs while preserving first-boot generation, `/data/.hmac` persistence, permissions, and runtime export.

Scope:
- Update `deploy/*/entrypoint.sh` first-boot messages so they never print the secret value.
- Update deploy/operator docs that currently instruct users to capture or rotate secrets through logs.
- Update stale runtime/help text that says deploy images print the secret.
- Add a focused regression test that fails on the current secret-log behavior and checks the safe invariant.

Non-goals:
- No push, deploy, merge to `main`, or remote state change.
- No dependency additions or package-manager migration.
- No change to auth semantics, secret storage path, volume layout, Docker runtime privilege model, or published ports.
- No platform-specific credential/API actions.

Acceptance criteria:
- No entrypoint emits `AGENTMEMORY_SECRET=$SECRET` or any log line containing the generated secret variable.
- Entrypoints still generate a 64-hex secret, write `/data/.hmac` with restrictive permissions, chown it, load it, and export `AGENTMEMORY_SECRET`.
- Deploy docs tell operators to retrieve the secret through authenticated shell/volume access or preseed `/data/.hmac`, not from logs.
- Rotation docs do not tell operators to retrieve fresh rotated secrets from logs.
- Regression test fails before implementation and passes after implementation.
- Focused search shows no stale secret-log instructions in touched deploy surfaces.

Intended verification:
- `npm test -- test/deploy-entrypoint-secret.test.ts`
- `npm test -- test/viewer-host.test.ts`
- Targeted `rg` checks for banned log patterns.
- Semgrep default scan because this is a non-trivial security/deploy/docs change.
- `gitleaks protect --staged --redact` only if a commit is made or staging is needed.

Known boundaries:
- Existing deployed instances may already have leaked secrets into retained platform logs; docs should recommend rotation after upgrading if old logs may be accessible.
- Reading `/data/.hmac` prints the secret to the operator's terminal; this remains a controlled operator action, not platform log emission.
- Semgrep/OSV may require network or installed scanner availability; failures must be reported with evidence.

Stop conditions:
- Any fix would require changing auth semantics, persistence model, Docker user model, published ports, platform APIs, dependencies, or remote state.
- Verification repeatedly fails without a clear local fix.
- Unexpected unrelated dirty work appears in touched files and cannot be preserved safely.

## Subagent Ledger

| Workstream | Agent | Scope | Edits allowed | Result | Residual risk |
|------------|-------|-------|---------------|--------|---------------|
| Validity and impact | `019ec27b-d69e-7e01-ace0-4ab30b40fcbd` | Deploy entrypoints, Docker wiring, auth code, deploy docs | No | Valid finding; `echo "AGENTMEMORY_SECRET=$SECRET"` leaks live bearer secret on first boot/rotation; all four templates affected. | Provider-specific log ACL/retention not inspected. |
| Deployment UX and fix strategy | `019ec27b-d93d-79c3-826c-f46faee74eb0` | Deploy docs/scripts, tests, viewer UX text | No | Minimum fix: keep generation/storage/export, remove value logging, document authenticated retrieval via shell/volume or explicit operator-set secret. | Existing deployments may need rotation if old logs are accessible. |
| Security/privacy review | `019ec418-0a8c-7a31-b1c1-4b715c50eff9` | Current diff, deploy scripts/docs, auth/config neighbors | No | Accepted with no findings; confirmed secret value is no longer echoed and auth/env precedence remains anchored to `AGENTMEMORY_SECRET`. | Provider shell commands were not live-tested; older deployments may still need rotation if retained logs exposed the old value. |
| Test coverage review | `019ec419-f16e-7a72-86ae-6d0dec8afd6c` | New regression test, deploy entrypoints/docs, package scripts | No | Found the first static test was too narrow for alternate leak forms such as `echo "$AGENTMEMORY_SECRET"` or `printf "$SECRET" >&2`; fixed by rejecting output lines that reference secret sources and adding negative fixtures. | Static shell text coverage is intentionally focused on known output commands and direct `/data/.hmac` reads; it is not a full shell data-flow analyzer. |
| Maintainability/integration review | `019ec41a-041f-7263-8c10-314430a1f64c` | Current diff, deploy scripts/docs/config, viewer text, tests, task notes | No | Accepted with no findings; confirmed the patch remains scoped and provider docs/viewer text consistently use `/data/.hmac` retrieval instead of deploy logs. | Provider CLI command syntax was not live-tested against real providers or installed CLIs. |

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|--------|---------------------|--------|----------|
| Regression guard for entrypoints/docs | Vitest red then green plus review hardening | Done | `npm test -- test/deploy-entrypoint-secret.test.ts` could not start because `vitest` was not installed. `npx -y vitest@4.1.6 run --exclude test/integration.test.ts test/deploy-entrypoint-secret.test.ts` failed red on `AGENTMEMORY_SECRET=$SECRET` and stale docs, then passed after the fix. After coverage review, the test was hardened for alternate leak forms and `npx -y vitest@4.1.6 run --exclude test/integration.test.ts test/deploy-entrypoint-secret.test.ts test/viewer-host.test.ts` passed 35 tests across 2 files. |
| Entrypoints no longer log generated value | Static test, shell syntax, and `rg` banned-pattern search | Done | Entrypoint assertions passed; `sh -n deploy/fly/entrypoint.sh && sh -n deploy/render/entrypoint.sh && sh -n deploy/railway/entrypoint.sh && sh -n deploy/coolify/entrypoint.sh` passed; targeted `rg` over `deploy README.md src` returned no matches. |
| Deploy docs no longer instruct log capture | Static test and targeted `rg` | Done | Provider docs now use shell/volume retrieval commands; targeted `rg` over `deploy README.md src` returned no matches for stale log-capture patterns. |
| Viewer/help text no longer says first-boot logs contain the secret | `test/viewer-host.test.ts` and `rg` | Done | `npx -y vitest@4.1.6 run --exclude test/integration.test.ts test/deploy-entrypoint-secret.test.ts test/viewer-host.test.ts` passed 35 tests across 2 files after the regression-test hardening. |
| Security gates | Semgrep; staged Gitleaks | Done | `semgrep scan --config p/default --error --metrics=off .` completed with 0 findings for tracked files. Explicit changed-file Semgrep over all touched paths, including new files, completed with 0 findings. `gitleaks protect --staged --redact` scanned ~26.13 KB of staged content and found no leaks. |

## Progress

- 2026-06-13: Read active instructions, repo state, deploy scripts/docs, package scripts.
- 2026-06-13: Received two read-only subagent reviews. Consensus: valid finding, fix should remove plaintext secret log path and update operator docs.
- 2026-06-13: Added `test/deploy-entrypoint-secret.test.ts` and verified red/green with `npx -y vitest@4.1.6`.
- 2026-06-13: Updated four entrypoints to log only non-secret first-boot status, while preserving generation, `/data/.hmac`, `chmod 600`, `chown`, load, and export.
- 2026-06-13: Updated shared and provider deploy docs, Fly config comments, README deploy summary, and viewer error text to point to shell/volume retrieval instead of logs.
- 2026-06-13: Final verification passed: focused Vitest checks, shell syntax checks, stale-pattern `rg` sweep, `git diff --check`, full-repo tracked-file Semgrep, and explicit changed-file Semgrep.
- 2026-06-14: Prep-merge review added three read-only lanes. Security/privacy accepted the diff; test coverage found the static regression was too narrow. The test was hardened and focused Vitest re-passed with 35 tests.
- 2026-06-14: Staged only task-owned files and ran `gitleaks protect --staged --redact`; no leaks found.

## Review Notes

- No unrelated dirty files present before edits (`git status -sb --untracked-files=all` showed only detached `HEAD`).
- No repo-local `docs/lessons/` directory found.
- Existing deployments may have exposed prior first-boot or rotation secrets in retained logs; docs now tell operators to rotate after upgrading when that may have happened.
- Full `npm test` was not run because this worktree has no `node_modules`; focused tests used the declared Vitest version through `npx` without changing dependency metadata. The first `npm test -- test/deploy-entrypoint-secret.test.ts` attempt failed before tests with `sh: vitest: command not found`.
- OSV was not run because the task did not change dependencies, lockfiles, Dockerfiles/container image instructions, vendored code, or third-party package surfaces.
- GStack Review was unavailable locally (`/Users/A1538552/.claude/skills/gstack/bin` and `.claude/skills/review/checklist.md` missing). Prep-merge continued only after explicit user approval to proceed without it.
