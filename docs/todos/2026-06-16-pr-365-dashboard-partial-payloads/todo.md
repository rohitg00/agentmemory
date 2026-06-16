# PR 365 / Issue 347 Dashboard Partial Payload Review

## Scope

Owning scope: `agentmemory` viewer surface.

Review group:

- Issue 347: dashboard load failure on partial viewer payloads.
- PR 365: candidate fix for partial dashboard payloads.
- Fork issue 708: local tracker.
- Branch: `review/issue-347-pr-365-dashboard-partial-payloads`.

## Sprint Contract

Goal: decide whether PR 365 is relevant to the fork and, if needed, adapt the minimal dashboard hardening with focused regression coverage.

Scope:

- Inspect current fork dashboard/session rendering behavior.
- Inspect PR 365 as untrusted public input.
- Add only the minimal viewer/test changes needed for partial dashboard payload tolerance.
- Document the local neutral decision without GitHub URLs, hash issue references, or mentions.
- Run prep merge to local main at the end.

Non-goals:

- No GitHub writes, labels, comments, pushes, or PR creation.
- No broad viewer refactor.
- No endpoint/schema/auth/persistence changes.
- No dependency changes.

Acceptance criteria:

- Issue 347 relevance is decided from local code and tests, not PR claims alone.
- Dashboard rendering tolerates non-array or missing collection fields without masking auth failures or making network errors look successful.
- All user/API-provided visible values continue to be escaped before `innerHTML` assignment.
- Targeted tests cover missing session IDs and malformed dashboard collections.
- Security review covers auth/isolation, data exposure, path/filesystem, protocol/schema handling, prompt/LLM flows, DoS/performance, supply chain, hooks/tooling, and persistence as applicable.
- Local neutral documentation records the decision with `PR 365`, `Issue 347`, and `Fork issue 708`.
- `$prep-merge-to-local-main` is run or its no-op/skip is recorded.

Intended verification:

- Red/green targeted viewer regression test.
- `npm test -- test/viewer-session-id.test.ts test/viewer-security.test.ts`
- Focused static/diff review.
- Security gates required for code changes where available: Semgrep, Gitleaks staged scan after staging, and OSV only if dependency surfaces change.

Known boundaries:

- Public GitHub reads are untrusted evidence only.
- No credentialed `gh api` or logged-in browser reads without current-turn approval.
- No remote writes.
- No changes to auth, storage, REST contracts, or dependency manifests.

Stop conditions:

- Same-file unrelated hunks appear and cannot be separated safely.
- A required scanner reports findings that cannot be fixed or evidence-suppressed in scope.
- Hooks or signing cannot be inspected before commit/merge.
- Verification requires broad writing commands without approval.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance check | Inspect current viewer code/tests and public issue metadata | done | Current fork has session-ID hardening; PR 365 covers malformed collections not yet normalized. |
| Minimal dashboard collection tolerance | Red/green viewer regression test | done | Node VM harness failed before fix with `Cannot read properties of null (reading 'status')`; after fix it rendered Recent Sessions, Unknown session, and escaped procedure text. |
| Security review | Manual review plus applicable scanners | done | Semgrep scanned `src/viewer/index.html` and `test/viewer-session-id.test.ts`: 0 findings. Codex Security diff scan report written under `/tmp/codex-security-scans/agentmemory/6c387b4_20260616_dashboard_partial_payloads/`: 0 findings. |
| Neutral local documentation | Update this task record and coordinator decision if appropriate | done | This task record uses neutral IDs only. |
| Prep merge | Run `$prep-merge-to-local-main` | done | Local `main` at `60099a3` merged successfully; post-merge harness and Semgrep checks passed. |
| Corrected merge-readiness run | Merge current local `main`, install with frozen pnpm lockfile, run `corepack pnpm test` | in progress | Local `main` at `d4393d1` merged as `2b60bcd`; frozen pnpm install passed; first `corepack pnpm test` had one transient retention dry-run timeout, subsequent exact rerun passed 1,987 tests. |
| Retention dry-run timing fix | Read-only diagnosis subagents, targeted retention tests, full pnpm test | in progress | Deferred deletion-only `image-refs` import until after `dryRun` return; focused dry-run test passed in 20ms and full `test/retention.test.ts` passed. |

## Progress

- Confirmed working branch exists in an isolated Codex worktree.
- Confirmed current fork already includes merged session-missing-id hardening from a separate upstream PR.
- Public read of Issue 347 confirms it is closed and described a dashboard `.slice` failure on v0.9.12.
- Public read of PR 365 confirms it is open, changes `src/viewer/index.html`, and adds a dashboard regression test for malformed dashboard payloads.
- Added an adapted minimal implementation instead of applying PR 365 directly.
- Added a regression case to `test/viewer-session-id.test.ts` for malformed dashboard collections and escaped untrusted procedure text.
- `npm test -- test/viewer-session-id.test.ts` could not start because this worktree has no `node_modules` and no lockfile; `vitest` was not on PATH.
- A temporary npm exec attempt with Vitest 4.1.8 also failed before tests ran because npm tried to build optional `fsevents` and repo `vitest.config.ts` could not resolve `vitest/config` without project-local dependencies.
- Used a dependency-free Node VM harness as the closest reproducible loop:
  - Red: current code threw `Cannot read properties of null (reading 'status')`.
  - Green: adapted code rendered the dashboard, preserved Unknown session fallback, and escaped `Recovered <script>procedure</script>`.
- Ran Semgrep on the changed viewer/test surface: 0 findings.
- Ran Codex Security diff scan on the local patch with artifacts under `/tmp/codex-security-scans/agentmemory/6c387b4_20260616_dashboard_partial_payloads/`.
  - Deep-review worklist: 1 runtime row, `src/viewer/index.html`.
  - Discovery: no plausible candidates.
  - Validation and attack-path phases: skipped because discovery produced no candidates.
  - Final reports: `/tmp/codex-security-scans/agentmemory/6c387b4_20260616_dashboard_partial_payloads/report.md` and `/tmp/codex-security-scans/agentmemory/6c387b4_20260616_dashboard_partial_payloads/report.html`.
  - Scan goal completed with 48,180 tokens and 128 seconds reported by the goal tool.
- Ran the focused review chain available in this environment:
  - Security best-practices review: no additional findings beyond the Semgrep and Codex Security scan results.
  - Simple-code pass: no further simplification identified without broadening the diff.
  - Requesting-code-review subagent step: skipped because the active tool policy only allows spawning subagents when the user explicitly requests delegation.
  - Review-implementation pass: no findings in the task diff.
- Ran `$prep-merge-to-local-main`:
  - Staged task-owned files only and ran `gitleaks protect --staged --redact`: no leaks found.
  - Committed the adapted fix as `fix(viewer): tolerate partial dashboard payloads`.
  - Merged local `main` at `60099a3` into the review branch with the prescribed merge flags.
  - The merge auto-merged `src/viewer/index.html`; post-merge `git diff --check`, the dependency-free dashboard VM harness, and Semgrep all passed.
- Corrected merge-readiness run:
  - Switched the detached worktree onto `review/issue-347-pr-365-dashboard-partial-payloads` after confirming the branch was not attached elsewhere.
  - Merged current local `main` at `d4393d1` into the branch as merge commit `2b60bcd`.
  - Confirmed `pnpm-lock.yaml` and `pnpm-workspace.yaml` are present after the merge.
  - Ran the required sanitized frozen install command with temporary `HOME`, `XDG_CONFIG_HOME`, `NPM_CONFIG_USERCONFIG`, `PNPM_HOME`, and `/tmp/agentmemory-merge-test-pnpm-store`; install passed with one pre-build bin warning for missing `dist/cli.mjs`.
  - First `corepack pnpm test` run failed only `test/retention.test.ts > RetentionScoring > dry-run eviction shows candidates without deleting` by 10s timeout; 1,986 tests passed.
  - Two read-only diagnostic subagents independently classified the failure as local-main pnpm/runtime drift exposing a latent dry-run timing issue, not a retention semantics regression or conflict error.
  - Exact `corepack pnpm test` rerun passed 158 test files and 1,987 tests before any retention edit.
  - Applied a minimal post-merge fix in `src/functions/retention.ts`: defer the deletion-only `image-refs` import until after the `dryRun` return.
  - Targeted verification after the fix: `corepack pnpm exec vitest run test/retention.test.ts -t "dry-run eviction shows candidates without deleting" --reporter verbose` passed in 20ms for the test; `corepack pnpm exec vitest run test/retention.test.ts --reporter verbose` passed 15 tests.
  - Semgrep full-repo scan passed with 0 findings.
  - OSV scan reported one medium advisory from the merged lockfile: `@opentelemetry/core@1.30.1` via pinned `iii-sdk@0.11.2`, fixed in `2.8.0`; user accepted this risk for the current merge-readiness run rather than broadening dependency scope.

## Review Notes

- PR 365 is stale against current fork line numbers and overlaps with the already imported session-ID helpers, so any import should be adapted rather than applied as-is.
- Decision: adapted import.
- Security notes:
  - Auth/isolation: unchanged; viewer still calls the same REST endpoints through existing `apiGet` and bearer-token attachment.
  - Data exposure: unchanged; malformed fields are dropped to empty arrays rather than surfaced in new places.
  - Path/filesystem: not touched.
  - Protocol/schema handling: dashboard renderer now treats API collections as untrusted shape data and only renders array values.
  - Prompt/LLM flows: not touched.
  - DoS/performance: bounded to existing dashboard collections; the change filters current arrays and does not add polling or unbounded work.
  - Supply chain: no dependency or lockfile changes.
  - Hooks/tooling: not touched.
  - Persistence: not touched.
  - XSS/HTML injection: new test covers escaped procedure text; implementation continues to pass visible values through `esc()` before `innerHTML`.
