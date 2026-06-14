# Mesh URL Validation Security Fix

Task id: `2026-06-13-mesh-url-validation`
Date: 2026-06-13
Scope: agentmemory repository, mesh peer URL validation
Spec: none; source of truth is the delegated user request for Security Finding 07.

## Sprint Contract

Goal: fix Security Finding 07 by making mesh peer URL validation fail closed on DNS resolution failures and continue blocking loopback, private, and link-local network targets before registration and sync.

Scope:
- Modify `src/functions/mesh.ts` URL validation only.
- Modify `test/mesh.test.ts` for deterministic DNS/IP regression coverage.
- Document residual DNS TOCTOU risk in this task record and final handoff.

Non-goals:
- No new dependencies.
- No API/schema/storage/migration changes.
- No push, deploy, merge to main, or remote state changes.
- No private-network allowlist design.
- No custom HTTP client or DNS-pinning implementation unless current evidence shows the smaller fail-closed fix is insufficient.

Acceptance criteria:
- DNS lookup failure for mesh peer hostnames is rejected during registration.
- DNS lookup hangs are bounded and fail closed during registration and sync validation.
- Any private, loopback, link-local, or unspecified DNS answer blocks registration/sync.
- Public DNS answers and public IP literals remain allowed.
- Private/link-local/loopback IP literals are rejected, including IPv4-mapped IPv6.
- Sync recheck blocks a peer if DNS changes from public to private before fetch.
- Existing mesh push behavior still sends the configured Authorization header for allowed peers.
- Redirects remain rejected by `fetch` configuration.

Intended verification:
- `npm test -- test/mesh.test.ts`
- `npm run build`
- `npm test`
- `semgrep scan --config p/default --error --metrics=off .`
- If committing or staging for commit: `gitleaks protect --staged --redact`

Known boundaries:
- Mesh REST endpoints require configured secret plus bearer auth.
- The reusable security boundary is `isAllowedUrl()` in `src/functions/mesh.ts`.
- `fetch(peer.url)` still performs its own later hostname resolution; revalidation narrows but does not fully eliminate DNS TOCTOU.

Stop conditions:
- Any fix requires new dependencies, remote network services, schema/storage changes, or a private-network allowlist decision.
- Required verification fails twice for the same unexplained reason.
- The worktree contains unrelated conflicting edits in touched files.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Fail closed on DNS lookup failure | `npm test -- test/mesh.test.ts` DNS failure case | Passed | Red run failed before implementation; final focused run passed 71/71 |
| Fail closed on DNS lookup timeout | `npm test -- test/mesh.test.ts` DNS timeout cases | Passed | Prep review added a bounded DNS validation timeout; focused run passed 74/74, including registration and sync recheck timeout coverage |
| Block private/link-local/loopback DNS answers | `npm test -- test/mesh.test.ts` DNS answer cases | Passed | Final focused run passed 71/71 |
| Preserve public DNS and public IP literals | `npm test -- test/mesh.test.ts` positive cases | Passed | Final focused run passed 71/71 |
| Block private/link-local/loopback IP literals | `npm test -- test/mesh.test.ts` literal cases | Passed | Final focused run passed 71/71 |
| Sync recheck blocks rebinding before fetch | `npm test -- test/mesh.test.ts` sync recheck cases | Passed | Focused run passed 74/74; fetch was not called when DNS rechecked to `127.0.0.1` or timed out |
| Preserve Authorization header and redirect blocking for allowed sync | Existing and added mesh sync tests | Passed | Push and pull tests assert bearer header plus `redirect: "error"`; redirect rejection tests assert push/pull errors and peer `error` status |
| Block `.localhost` hostnames without DNS | `npm test -- test/mesh.test.ts` localhost subdomain case | Passed | Prep review added direct coverage for `https://peer.localhost`; focused run passed 73/73 |
| Build and repo tests still pass | `npm run build`, targeted tests, serial suite | Passed with caveat | `npm run build` exit 0. `npm test -- test/mesh.test.ts` passed 74/74. Serial `npm test -- --maxWorkers=1` twice hit unrelated varying timeouts (`auto-compress`, then `auto-forget`); each failed file passed standalone. Earlier serial run passed before prep fixes. |
| Security gate for code/config change | `semgrep scan --config p/default --error --metrics=off .` | Passed | Exit 0, 0 findings, 485 tracked files scanned |

## Subagent Ledger

| Workstream | Agent | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| Validity and impact | `019ec276-1570-7f93-b8a0-afa2c32a5394` | Read `src/functions/mesh.ts`, `src/triggers/api.ts`, adjacent mesh paths | No | Finding validity, source/control/sink, impact, caveats | Valid, medium impact; authenticated SSRF-style bypass, secret exposure risk; noted adjacent literal-IP gaps | No runtime DNS-rebinding PoC |
| Fix strategy and compatibility | `019ec276-34e3-7641-9377-0c1e2dc6e3a3` | Read mesh implementation/tests | No | Minimal fix and test strategy, compatibility risks | Fail-closed DNS, stricter IP blocking, deterministic DNS mocks, sync recheck; document remaining TOCTOU | Full closure requires DNS pinning/custom client or egress controls |
| Pre-code plan review | `019ec279-796c-7221-a704-8ffcf188f3eb` | Plan/task record/current mesh code | No | High/Medium review findings | Found full DNS-pinning boundary question and hex IPv4-mapped IPv6 coverage gap | DNS-pinning accepted as out of current scope; hex mapped coverage fixed |
| Pre-code test review | `019ec279-8c5e-75d0-b3a7-72ec74f82af2` | Plan/task record/current mesh tests | No | High/Medium verification findings | Found missing pull Auth/redirect assertion | Fixed with pull sync test |
| Final security review | `019ec281-5e13-7ba3-89db-5180c1a5d316` | Current diff and task docs | No | ACCEPT or High/Medium security findings | ACCEPT; no High/Medium security findings | Residual DNS TOCTOU remains documented |
| Final test coverage review | `019ec281-7977-7191-88e2-6e2141ef0306` | Current diff and mesh tests | No | ACCEPT or High/Medium test findings | Found redirect rejection path not exercised | Fixed with push and pull redirect-rejection tests |
| Final maintainability review | `019ec281-b250-7522-822e-9006754e9d57` | Current diff and task docs | No | ACCEPT or High/Medium maintainability findings | Found task record not final-ready | Fixed by recording verification evidence and residual risk |
| Test coverage re-review | `019ec281-7977-7191-88e2-6e2141ef0306` | Current diff after redirect rejection tests | No | ACCEPT or High/Medium test findings | ACCEPT | None |
| Maintainability re-review | `019ec281-b250-7522-822e-9006754e9d57` | Task record after verification update | No | ACCEPT or High/Medium maintainability findings | ACCEPT | None |
| GStack testing specialist | `019ec406-e188-7b83-88e3-8c166da4fe84` | Local task-owned diff against `21ac25a` | No | GStack testing findings or `NO FINDINGS` | Found missing `.localhost` negative-path test | Fixed with `peer.localhost` registration rejection test |
| GStack maintainability specialist | `019ec406-e359-7a71-b856-dc0ad76d5aed` | Local task-owned diff against `21ac25a` | No | GStack maintainability findings or `NO FINDINGS` | `NO FINDINGS` | None |
| GStack security specialist | `019ec406-e446-73c2-b0d5-5f539af354ff` | Local task-owned diff against `21ac25a` | No | GStack security findings or `NO FINDINGS` | Re-raised fetch-time DNS TOCTOU | Accepted as documented residual risk; full fix requires broader HTTP/TLS transport boundary change |
| GStack performance specialist | `019ec406-e532-7593-b0b6-4ae7f1a631e6` | Local task-owned diff against `21ac25a` | No | GStack performance findings or `NO FINDINGS` | Found unbounded DNS lookup latency | Fixed with fail-closed DNS validation timeout |
| Requesting-code-review Security/Privacy | `019ec40b-4ecf-7443-b1db-9cb4782c51c3` | Final working-tree diff against `21ac25a` | No | ACCEPT or Critical/Important findings | ACCEPT | None |
| Requesting-code-review Test Coverage | `019ec40b-503a-7113-9dc6-1ba63c61b15b` | Final working-tree diff against `21ac25a` | No | ACCEPT or Critical/Important findings | Found missing sync-timeout test and centralized cleanup gap | Fixed with sync-timeout test, central `afterEach`, and real-time guard |
| Requesting-code-review Maintainability/Integration | `019ec40b-5140-7043-86fe-f95a3ff363dc` | Final working-tree diff against `21ac25a` | No | ACCEPT or Critical/Important findings | ACCEPT | None |
| Requesting-code-review Test Coverage re-review | `019ec40e-cd63-7cc2-a62d-0f7075377b9b` | Diff after test coverage fixes | No | ACCEPT or Critical/Important findings | ACCEPT | None |

## Progress

- Confirmed workdir: `/Users/A1538552/.codex/worktrees/2874/agentmemory`.
- Confirmed git state before edits: detached HEAD at `21ac25a`, clean worktree.
- Active instructions: repo `AGENTS.md`, provided global AGENTS instructions, user delegation constraints.
- Confirmed no repo-local `security:local` script; Semgrep direct gate applies for this security code change.
- Consensus: Finding is valid and fix should proceed.
- Installed existing `package.json` dependencies locally for verification without manifest or lockfile changes. Optional native test/build packages were installed `--no-save` to repair local `vitest`/`tsx` startup in this worktree.
- Implemented fail-closed mesh URL validation and deterministic DNS tests.
- `/prep-merge-to-local-main` created local branch `prep-merge/mesh-url-validation-21ac25a` from detached HEAD after confirming no Git operation state.
- GStack review ran in local no-fetch mode because the user request forbids fetch/pull. Checklist plus Testing/Maintainability/Security/Performance specialists completed; actionable in-scope findings were fixed or documented.

## Review Triage

| Finding | Classification | Action |
| --- | --- | --- |
| Full DNS TOCTOU remains if `fetch(peer.url)` does its own later hostname lookup | Accepted risk within approved scope | Keep fail-closed DNS and sync-time/per-fetch revalidation. Do not replace `fetch` with a custom pinned HTTP client in this task because that changes the network boundary and TLS/request behavior more broadly than the requested fix direction. Document residual risk in final handoff. |
| IPv4-mapped IPv6 coverage misses hex-normalized mapped literals such as `::ffff:c0a8:101` | Fixed in plan | Add explicit tests and decode mapped IPv4 hex tails before blocklist checks. |
| Pull sync lacks redirect/Auth regression coverage | Fixed in plan | Add a pull sync test for `/agentmemory/mesh/export?since=` with bearer header and `redirect: "error"`. |
| Redirect rejection path not exercised | Fixed | Add push and pull tests where `fetch` rejects with `TypeError("redirect blocked")`; assert `push failed:` / `pull failed:` errors and peer `error` status. |
| `.localhost` subdomain guard lacked direct coverage | Fixed | Add `https://peer.localhost` registration rejection test and assert DNS is not called. |
| DNS lookup could hang validation before fetch timeout applies | Fixed | Add a 5 second DNS validation timeout that rejects and therefore fails closed for registration and sync recheck. |
| Sync DNS timeout lacked direct test coverage | Fixed | Add sync recheck timeout test with public registration, hanging DNS on sync, fake-timer advancement, real-time test guard, peer `error` status, and `fetch` not called. |
| Test cleanup could leak fake timers or stubbed globals after failures | Fixed | Add centralized `afterEach` cleanup with `vi.useRealTimers()` and `vi.unstubAllGlobals()`; remove per-test global cleanup. |
| Fetch-time DNS TOCTOU remains because `fetch(peer.url)` resolves the hostname after validation | Accepted risk within approved scope | Document as residual. Do not introduce a DNS-pinned/custom HTTP transport in this task because preserving TLS SNI/certificate validation and HTTP semantics would change the network boundary more broadly. |
| Task record pending verification evidence | Fixed | Update this matrix, progress, and final notes with concrete command results. |

## Verification Evidence

- `npm test -- test/mesh.test.ts` before production fix: failed 16 new cases as expected, proving DNS-fail-open and IP-literal gaps reproduced.
- `npm test -- test/mesh.test.ts` after final tests: passed, 1 file / 71 tests.
- `npm test -- test/mesh.test.ts` after GStack fixes: passed, 1 file / 73 tests.
- `npm test -- test/mesh.test.ts` after requesting-code-review fixes: passed, 1 file / 74 tests.
- `npm test -- test/mesh.test.ts` final pre-commit run: passed, 1 file / 74 tests.
- `npm run build`: passed after final diff; warnings were existing tsdown deprecation/plugin-timing/chunking warnings.
- `npm test -- --maxWorkers=1` final run 1: failed only `test/auto-compress.test.ts` timeout in full suite; `npm test -- test/auto-compress.test.ts` passed 8/8 standalone.
- `npm test -- --maxWorkers=1` final run 2: failed only `test/auto-forget.test.ts` timeout in full suite; `npm test -- test/auto-forget.test.ts` passed 8/8 standalone.
- `npm test`: standard parallel suite did not finish cleanly in this environment, but failures varied outside this task:
  - `test/retention.test.ts` timeout in full suite; standalone `npm test -- test/retention.test.ts` passed 15/15.
  - `test/cli-connect.test.ts` timeout in full suite; standalone `npm test -- test/cli-connect.test.ts` passed 25/25.
  - `test/fs-watcher.test.ts` fake-timer assertion in full suite; standalone `npm test -- test/fs-watcher.test.ts` passed 19/19.
- Earlier `npm test -- --maxWorkers=1`: passed, 134 files / 1484 tests before prep review fixes.
- `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings, 485 tracked files scanned.
- `gitleaks protect --staged --redact`: passed after explicit task-owned staging; scanned about 36.90 KB and found no leaks.

## Final Notes

- Security Finding 07 was fixed for DNS-fail-open behavior: DNS lookup errors and empty answers now reject mesh peer URLs.
- DNS validation now also times out after 5 seconds and fails closed.
- Hostname DNS answers now fail if any resolved address is private, loopback, link-local, unspecified, ULA, or IPv4-mapped to a blocked IPv4 address.
- IP literals are normalized before checking, including bracketed IPv6 and hex-normalized IPv4-mapped IPv6.
- Sync rechecks peer URL before fetch and records an error without calling fetch when DNS rebinds to a blocked address or DNS validation times out before sync.
- Push and pull preserve `Authorization: Bearer <meshAuthToken>` for allowed peers and `redirect: "error"`; redirect rejection errors are captured and set peer status to `error`.
- Residual risk: full fetch-time DNS TOCTOU is narrowed but not eliminated because `fetch(peer.url)` still resolves the hostname internally after validation. Fully eliminating that requires a larger network-boundary change such as DNS pinning/custom HTTP client with preserved TLS SNI/certificate validation, or deployment egress controls.
