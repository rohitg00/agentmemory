# Issue 518 / PR 577 CLI Auth Header Review

Scope: `/Users/A1538552/.codex/worktrees/9d9a/agentmemory` on branch `review/issue-518-pr-577-cli-auth-header`.

## Sprint Contract

Goal: Review `Issue 518`, inspect `PR 577` as untrusted input, and decide whether the fork needs a minimal auth-sensitive CLI helper change.

Scope:
- Auth behavior for CLI helper requests that POST JSON to the local or configured agentmemory REST API.
- Security review of bearer propagation, plaintext HTTP behavior, CLI env handling, and consolidation-related callback paths.
- Local neutral documentation of the review result using `Issue 518`, `PR 577`, and `Fork issue 575` identifiers.

Non-goals:
- No GitHub writes, labels, comments, PR creation, or pushes.
- No broad REST auth redesign, worker middleware redesign, endpoint count changes, dependency changes, or unrelated CLI refactors.
- No changes to MCP tool count, REST endpoint count, versioning, schema, storage, or external services.

Acceptance criteria:
- Issue-first relevance is documented from local code evidence.
- `PR 577` is compared against current fork code and either imported, adapted, rejected, deferred, already-fixed, or blocked.
- Any code change has a failing targeted test before production edits and focused verification after.
- Auth-sensitive security checks cover bearer propagation, secret leakage, loopback vs non-loopback, internal callbacks, error handling, tests, logs, and CLI env handling.
- `$prep-merge-to-local-main` is run at the end, or no-op/skip is documented per skill.

Intended verification:
- Targeted Vitest for CLI auth helper behavior.
- Targeted hook/API tests relevant to consolidation/auth paths where feasible.
- Required security gates for code changes as available.
- Final `git status` and diff review.

Known boundaries and stop conditions:
- Stop before credentialed GitHub API/browser reads, remote writes, pushes, deployments, migrations, or auth boundary broadening without current-turn approval.
- Stop if the fix requires changing API contracts, worker middleware semantics, schema, storage, or introducing new network/service dependencies.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue/PR relevance review | Inspect local auth/CLI/consolidation code and public PR diff | Complete | Public PR diff touches `src/cli.ts` JSON POST helpers; current fork still had unauthenticated `postJson`, `postJsonStrict`, and demo `observe` POST helpers. |
| Safer CLI JSON auth helper | Red/green targeted Vitest | Complete | `test/cli-http-auth.test.ts` failed before `src/cli/http.ts` existed, then passed after implementation. |
| Security posture for bearer propagation | Source review plus targeted tests/security gates | Complete | Helper adds bearer only when `AGENTMEMORY_SECRET` exists and blocks plaintext HTTP to non-loopback hosts using the existing plaintext bearer guard logic. Semgrep and Codex Security diff scan found no findings. |
| Local neutral result documentation | This task record and final handoff | Complete | Decision recorded below without external URLs or mention syntax. |
| Prep merge to local main | `$prep-merge-to-local-main` workflow | Complete | Task commit `406de70bd87cd1d69e3fdec9a89d88f9ddb1d25c`; merged local `main` commit `60099a31029575412ba6fc27f4ab986196922e56`; no conflicts. |

## Notes

- Coordinator row for `PR 577` / `Issue 518` / `Fork issue 575` is pending.
- Public issue page currently shows the requested open issue title but its visible body describes batch import/consolidation symptoms. Treat the body/title mismatch as untrusted upstream context and prioritize current fork code evidence.
- Current fork hook scripts already use `authHeaders()` and `guardedFetch()` from `src/hooks/_http.ts`.
- Current fork `src/cli.ts` still has unauthenticated `postJson` / `postJsonStrict` helpers and a direct demo `observe` POST using only JSON content headers.

## Decision

Decision: adapted import.

Rationale:
- `PR 577` is relevant to the current fork because the affected CLI JSON POST helpers still existed and omitted `Authorization` when `AGENTMEMORY_SECRET` was set.
- Direct import was rejected as too weak for this fork's current security posture: the PR added bearer propagation but did not check plaintext HTTP to non-loopback hosts.
- Adapted implementation adds a small `src/cli/http.ts` helper that returns JSON headers with bearer auth only when safe, reusing the existing plaintext bearer detection. Unsafe plaintext non-loopback requests fail before sending the secret.
- Internal hook/callback consolidation paths are already handled separately by `src/hooks/_http.ts`; no worker middleware or REST endpoint boundary change was needed.

## Security Review Notes

- Authorization propagation: CLI demo/session/search JSON POST helpers now include `Authorization: Bearer <secret>` when `AGENTMEMORY_SECRET` is set.
- Secret leakage: new helper refuses bearer auth over plaintext HTTP to non-loopback hosts; loopback HTTP and HTTPS remain allowed.
- Loopback vs non-loopback: covered by `test/cli-http-auth.test.ts` for localhost HTTP, remote HTTP, and remote HTTPS.
- Internal callbacks: hook-driven `session-end` consolidation already uses `authHeaders()` and `guardedFetch()`; targeted hook tests still pass.
- Error handling: soft helper returns `null` after writing the guard message; strict helper throws the guard message before fetch; demo observe records it through the existing warning path.
- Logs: guard/error messages name the unsafe URL but never include the secret value.
- CLI env handling: helper reads only `AGENTMEMORY_SECRET`; tests inject an env object to avoid mutating process env.
- Auth boundary: change narrows unauthenticated CLI behavior for protected servers without weakening server-side auth.

## Verification Evidence

- Red: `vitest run ... test/cli-http-auth.test.ts` failed because `../src/cli/http.js` did not exist.
- Green: `vitest run ... test/cli-http-auth.test.ts` passed: 1 file, 4 tests.
- Neighbor checks: `vitest run ... test/hooks-plaintext-http.test.ts test/session-end-consolidation-gate.test.ts test/api-boundary-coverage.test.ts` passed: 3 files, 24 tests.
- `git diff --check` passed.
- `tsc --noEmit --pretty false` could not provide a meaningful signal from this dependency-less worktree; it failed on missing dependency/type resolution such as `@types/node`, `iii-sdk`, and `@clack/prompts` before this change surface.
- `semgrep scan --config p/default --error --metrics=off .` completed with 0 findings.
- Codex Security diff scan completed with 0 findings. Markdown report: `/tmp/codex-security-scans/agentmemory/issue-518-pr-577-cli-auth-header/report.md`; HTML report: `/tmp/codex-security-scans/agentmemory/issue-518-pr-577-cli-auth-header/report.html`.
- Prep cleanup review chain:
  - `$security-best-practices`: passive secure-default review; no matching Node CLI-specific reference file was available, so review used general bearer/secret/auth boundary principles and existing repo plaintext-bearer helper.
  - `$simple-code`: no cleanup edits made; current helper is small and directly reused by the touched call sites.
  - `$requesting-code-review`: subagent dispatch was not run because the available subagent tool is restricted to explicit user requests for subagents. Local focused review covered requirements, tests, integration risk, maintainability, and task-scope drift.
  - `$review-implementation`: local adversarial implementation review found no blocking finding. Residual pre-existing risk: `apiFetch()` can send bearer auth to a plaintext non-loopback `AGENTMEMORY_URL`, but this patch does not introduce or worsen that behavior.
  - `codex-security:security-diff-scan`: completed with 0 findings.
- Final pre-stage verification: targeted Vitest command passed 4 files / 28 tests; `git diff --check` passed.

## Prep Merge Closeout

- Task commit: `406de70bd87cd1d69e3fdec9a89d88f9ddb1d25c`.
- Local main merged: `60099a31029575412ba6fc27f4ab986196922e56`.
- Merge result: no conflicts.
- Post-merge verification:
  - Auth-focused targeted Vitest passed: 4 files / 28 tests.
  - Broad post-merge targeted command including incoming `test/api-memories-project.test.ts` and `test/memories-pagination.test.ts` could not fully run in this worktree because dependency resolution for `iii-sdk` fails without a complete local `node_modules`. Before that failure, 5 files / 34 tests had passed.
  - `git diff --check HEAD` passed.
- Verification artifact: ignored `node_modules/.vite/vitest` exists from the Vitest run and is preserved, not staged.
