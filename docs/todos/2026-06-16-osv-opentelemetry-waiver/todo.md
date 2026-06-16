# OSV OpenTelemetry Waiver

Task id: `2026-06-16-osv-opentelemetry-waiver`

## Scope

Implement the user-selected short-term option for the OSV blocker:
add a narrow, time-bounded OSV Scanner waiver for
`GHSA-8988-4f7v-96qf` / `CVE-2026-54285` in transitive
`@opentelemetry/core@1.30.1` through `iii-sdk@0.11.2`.

## Sprint Contract

Goal: unblock `osv-scanner scan source .` without changing dependency
resolution or masking unrelated vulnerabilities.

Scope:
- Add a root `osv-scanner.toml` with exactly one ignored vulnerability.
- Bound the exception with an expiry date and rationale.
- Add a quality-gate test that prevents broad OSV ignores.
- Run targeted and security verification.

Non-goals:
- No dependency, lockfile, SDK, engine, or OpenTelemetry override changes.
- No broad package, ecosystem, regex, or directory-level OSV ignores.
- No upstream issue, PR, remote write, publish, push, or deployment.

Acceptance criteria:
- The OSV config ignores only `GHSA-8988-4f7v-96qf`.
- The waiver expires on `2026-07-16`.
- The rationale names the transitive path and unsupported OpenTelemetry
  2.x override risk.
- `osv-scanner scan source .` passes with the root config.
- Targeted quality-gate test passes.

Intended verification:
- `corepack pnpm install --frozen-lockfile --ignore-scripts`
- `corepack pnpm exec vitest run test/quality-gates.test.ts`
- `osv-scanner scan source .`
- `semgrep scan --config p/default --error --metrics=off .`
- `git diff --check`

Known boundaries:
- This is an accepted temporary security risk, not a remediation.
- The durable fix still requires upstream `iii-sdk` / `@iii-dev/observability`
  support for an OpenTelemetry stack containing `@opentelemetry/core >=2.8.0`.
- Before a commit, staged Gitleaks is still required after staging.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Quality-gate test for narrow OSV waiver | `corepack pnpm exec vitest run test/quality-gates.test.ts` | Red observed | Failed because `osv-scanner.toml` was missing, proving the new test covers the intended config. |
| Root OSV waiver config | File inspection and OSV scan | Done | `osv-scanner scan source .` loaded `osv-scanner.toml`, filtered `GHSA-8988-4f7v-96qf` and 1 alias, and reported no issues found. |
| Security/tooling gate | Semgrep, lint, and diff check | Done | `corepack pnpm run lint`, full tracked-file Semgrep, explicit changed-file Semgrep including new files, and `git diff --check` passed. |

## Progress Notes

- 2026-06-16: User selected option 1 after subagent evaluation of four paths.
- 2026-06-16: Baseline worktree `/Users/A1538552/.codex/worktrees/846e/agentmemory`; `git status -sb --untracked-files=all` returned `## HEAD (no branch)`.
- 2026-06-16: RED test added to `test/quality-gates.test.ts` and run with `corepack pnpm exec vitest run test/quality-gates.test.ts`; it failed only because root `osv-scanner.toml` was missing.
- 2026-06-16: Added root `osv-scanner.toml` with exactly one `IgnoredVulns` entry for `GHSA-8988-4f7v-96qf`, expiring on `2026-07-16`.
- 2026-06-16: GREEN targeted test passed: `corepack pnpm exec vitest run test/quality-gates.test.ts` reported 1 file passed and 14 tests passed.
- 2026-06-16: OSV passed with the root config: `osv-scanner scan source .` scanned `pnpm-lock.yaml`, loaded `osv-scanner.toml`, filtered the target GHSA plus one alias, and reported no issues found.
- 2026-06-16: Static verification passed: `corepack pnpm run lint`; `semgrep scan --config p/default --error --metrics=off test/quality-gates.test.ts osv-scanner.toml docs/todos/2026-06-16-osv-opentelemetry-waiver/todo.md` with 0 findings; full tracked-file `semgrep scan --config p/default --error --metrics=off .` with 0 findings; `git diff --check`.
- 2026-06-16: The explicit changed-file Semgrep scan initially reported an existing dynamic regex helper in `test/quality-gates.test.ts`; replaced the dynamic regex checks with exact line comparisons and reran the targeted test, lint, and Semgrep successfully.

## Current Review Notes

- The waiver is temporary and scoped to one advisory. It deliberately does not
  use `PackageOverrides`, `ignore = true`, or regex matching.
- The accepted residual risk remains availability impact from transitive
  `@opentelemetry/core@1.30.1` until upstream `iii-sdk` / observability support
  for OpenTelemetry 2.x is available and verified.
