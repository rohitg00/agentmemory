# Plaintext Bearer Guard Task State

Task id: `2026-06-13-plaintext-bearer-guard`
Scope: current agentmemory worktree
Status: implemented; prep-merge review/verification in progress, broad checks limited by missing dependencies

## Sprint Contract

Goal: close Security Finding 01 by preventing Agentmemory clients from sending bearer-authenticated memory payloads to non-loopback plaintext HTTP endpoints.

Scope:
- Core hook clients under `src/hooks/`.
- MCP REST proxy under `src/mcp/rest-proxy.ts`.
- OpenCode capture plugin under `plugin/opencode/agentmemory-capture.ts`.
- Filesystem watcher under `integrations/filesystem-watcher/watcher.mjs`.
- Hermes copyable integration under `integrations/hermes/`.
- Existing plaintext bearer guard users in PI and OpenClaw when needed for a consistent shared contract.
- Focused tests for the guard and each affected client family.

Non-goals:
- No push, deploy, merge to main, package publish, or dependency changes.
- No transport redesign, schema migration, endpoint count change, MCP tool count change, or auth model redesign.
- No broad generated-file churn beyond hook bundles if a build makes it necessary.

Acceptance criteria:
- Loopback HTTP remains allowed with bearer auth.
- HTTPS remains allowed with bearer auth.
- No-secret HTTP remains allowed.
- Non-loopback plaintext HTTP with a bearer secret is guarded before any request sends the token or memory payload.
- `AGENTMEMORY_REQUIRE_HTTPS=1` fails before any request for guarded clients.
- Tests cover core hooks, MCP proxy, OpenCode, and filesystem watcher behavior.

Known boundaries:
- Remote plaintext HTTP with `AGENTMEMORY_SECRET` is externally visible behavior. The current request authorizes task-owned security fixes for this finding, but no unrelated API or transport changes.
- OpenCode and filesystem watcher are copyable standalone artifacts, so they must not import repo-internal helper paths that would break after copying.
- Generated `plugin/scripts/*.mjs` are build outputs from `src/hooks`; update them only if the repo-native build does so.

Stop conditions:
- A fix would require a new dependency, migration, remote state change, push, deploy, merge, or broad generated rewrite.
- Tests show the guard blocks loopback HTTP, HTTPS, or no-secret configurations.
- Verification tools report findings that cannot be fixed within the task-owned scope.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Subagent validity and fix-strategy consensus | Two read-only subagents | Done | Validity subagent accepted source-to-sink impact; strategy subagent recommended guard-before-fetch with no default send |
| Shared TypeScript guard for repo-internal clients | Guard tests in `test/integration-plaintext-http.test.ts` | Done | Focused suite passed: `test/integration-plaintext-http.test.ts test/hooks-plaintext-http.test.ts test/mcp-standalone-proxy.test.ts test/fs-watcher.test.ts` |
| Core hook guard | New focused hook regression test | Done | `test/hooks-plaintext-http.test.ts` verifies post-tool-use, prompt-submit, session-end, pre-tool-use, and pre-compact skip remote plaintext bearer requests and allow loopback |
| MCP REST proxy guard | `test/mcp-standalone-proxy.test.ts` | Done | Remote plaintext bearer defaults to local fallback without fetch; `AGENTMEMORY_FORCE_PROXY=1` cannot bypass; strict mode rejects before probe |
| OpenCode guard | `test/integration-plaintext-http.test.ts` | Done | OpenCode session capture skips remote plaintext bearer requests and allows loopback bearer requests |
| Filesystem watcher guard | `test/fs-watcher.test.ts` | Done | Watcher warns once and skips remote plaintext bearer emits; loopback bearer behavior and strict rejection covered |
| Hermes guard | `test/integration-plaintext-http.test.ts` | Done | Hermes guard now returns false for remote plaintext bearer requests and `_api` returns before `urlopen` |

## Subagent Ledger

| Workstream | Agent | Allowed scope | Edits allowed | Result | Residual risk |
|---|---|---|---:|---|---|
| Validity and impact | `019ec275-8d84-7c81-92b2-7a797f1c8296` | Read-only inspection of named source, sinks, and guard tests | No | Accepted finding as real; traced URL/secret/payload to fetch across hooks, MCP, OpenCode, and filesystem watcher | Static evidence only; no runtime PoC |
| Fix strategy and regressions | `019ec275-a3f0-7001-9c52-c0ac26658f37` | Read-only inspection of affected clients and tests | No | Recommended guard-before-fetch, fallback/skip default unsafe requests, strict fail before request, and targeted regression tests | Remote plaintext users with secrets must move to HTTPS/tunnel or unset secret |
| Final security review | `019ec2e9-7f58-7ee0-a463-b7a54821a274` | Read-only review of current diff and generated/source consistency | No | Found no remaining scoped bearer exfil path; flagged generated pre-tool-use/pre-compact `guardedFetch` undefined handling, now fixed with tests | Review was read-only and did not rerun tests |
| Final maintainability review | `019ec2e9-910a-7632-9b54-511272ff4805` | Read-only review of generated/source consistency, docs, and copyable integrations | No | Flagged Hermes warn-but-send default behavior and stale README wording; both fixed with regression coverage | Review stopped after current verdict |
| Prep-merge code review | `019ec525-0965-7f41-afba-3c22202a8c06` | Read-only review of current prep-merge diff | No | No critical/important issues; minor docs/test-coverage notes only | Did not review later `resolveCwd` follow-up edit |
| Prep-merge implementation review | `019ec525-0a96-78d1-a585-0b88975d84f0` | Read-only review of current diff, generated/source drift, and local-main overlap | No | Found important local-main `cwd` hardening regression risk; fixed by preserving `resolveCwd` in shared helper, source hooks, generated scripts, and regression tests | Read-only review; verification rerun by main agent |

## Initial Evidence

- `git status -sb --untracked-files=all` -> clean detached HEAD.
- Existing guard semantics found in `integrations/pi/security.ts` and `integrations/openclaw/plugin.mjs`.
- Existing tests in `test/integration-plaintext-http.test.ts` cover loopback, HTTPS, no-secret, LAN IPs, loopback-looking hostnames, and strict mode for existing integrations.

## Progress Notes

- Consensus reached before edits: finding is valid and guard-before-fetch is the right boundary.
- Red tests were observed first with remote plaintext bearer requests still being sent by OpenClaw, hooks, MCP, OpenCode, and filesystem watcher; the PI guard also returned no proceed/block signal.
- Implemented stricter default behavior: remote plaintext HTTP plus `AGENTMEMORY_SECRET` warns once and skips the unsafe request; `AGENTMEMORY_REQUIRE_HTTPS=1` throws or exits before request depending on client contract.
- `npm run build` could not regenerate hook bundles because this worktree has no installed `tsdown`; generated `plugin/scripts/*.mjs` were mechanically updated to mirror the source hook guard.
- Final security review found the generated `pre-tool-use` and `pre-compact` bundles missing the source-level `if (!res) return` after blocked context fetches; both bundles now match the source behavior and `test/hooks-plaintext-http.test.ts` covers the mismatch.
- Final maintainability review found Hermes still warned but sent in default mode; Hermes now follows the same fail-closed default and README wording.
- Prep-merge implementation review found that this branch predated local main's non-string `cwd` hardening for hook project resolution. `resolveCwd` was restored in `src/hooks/_project.ts`, applied to affected source hooks and generated scripts, and regression tests from local main were preserved.
- Minor prep-merge docs findings were fixed for filesystem watcher, OpenCode, and OpenClaw README guidance.
- Codex Security diff scan artifacts were refreshed after the `resolveCwd` and README follow-ups: `/tmp/codex-security-scans/agentmemory/21ac25a_20260614T100158/report.md` validates and `/tmp/codex-security-scans/agentmemory/21ac25a_20260614T100158/report.html` was rendered.

## Final Verification Evidence

- `npx --no-install vitest run test/integration-plaintext-http.test.ts test/hooks-plaintext-http.test.ts test/mcp-standalone-proxy.test.ts test/fs-watcher.test.ts --exclude test/integration.test.ts` -> passed, 4 files / 64 tests.
- `npx --no-install vitest run test/pre-tool-use-project.test.ts --exclude test/integration.test.ts` -> passed, 1 file / 1 test.
- `npx --no-install vitest run test/hook-project.test.ts test/pre-tool-use-project.test.ts --exclude test/integration.test.ts` -> passed, 2 files / 17 tests after preserving local-main `cwd` hardening.
- `npx --no-install vitest run test/integration-plaintext-http.test.ts test/hooks-plaintext-http.test.ts test/mcp-standalone-proxy.test.ts test/fs-watcher.test.ts test/hook-project.test.ts test/pre-tool-use-project.test.ts --exclude test/integration.test.ts` -> passed, 6 files / 81 tests after prep-merge review fix.
- `npx --no-install vitest run test/fs-watcher.test.ts --exclude test/integration.test.ts` -> passed, 1 file / 21 tests after a broad-run timing failure.
- `git diff --check` -> passed.
- `semgrep scan --config p/default --error --metrics=off .` -> passed, 0 findings over tracked files.
- `semgrep scan --config p/default --error --metrics=off --no-git-ignore .` -> passed, 0 findings including new untracked files.
- `semgrep scan --config p/default --error --metrics=off --no-git-ignore .` -> passed again after prep-merge review fix, 0 findings over 488 scanned targets.
- `semgrep scan --config p/default --error --metrics=off --no-git-ignore .` -> passed after final docs update, 0 findings over 488 scanned targets.
- `gitleaks detect --source . --redact` -> passed, no leaks; latest run scanned 500 commits and about 8.05 MB.
- `npm run build` -> failed: `tsdown: command not found` because dependencies are not installed in this worktree.
- `npx --no-install tsc --noEmit` -> failed because TypeScript is not installed in this worktree.
- `npx --no-install vitest run --exclude test/integration.test.ts` -> failed due missing runtime dependencies such as `iii-sdk` and `@clack/prompts`; task-focused tests passed.
- Codex Security diff scan -> no findings, 50/50 refreshed worklist rows have `no_candidate` receipts, report validated and HTML rendered.

## Residual Risks

- Generated hook bundles were updated manually because the build tool was unavailable. A later dependency-installed build should confirm `tsdown` reproduces equivalent bundles from the source hook changes.
- Hermes was added to the guarded copyable integrations after final review identified the same bearer/plaintext failure mode there.
- Code outside the named Finding 01 surfaces, such as CLI/viewer/mesh clients, was not expanded in this task; a separate scoped review should cover those if Finding 01 is broadened.
