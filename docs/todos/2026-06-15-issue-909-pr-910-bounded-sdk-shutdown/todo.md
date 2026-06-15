# Issue 909 / PR 910 Review Task

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/f1fa/agentmemory`
- Branch: `review/issue-909-pr-910-bounded-sdk-shutdown`
- Source group: Issue 909, PR 910, Fork issue 392.
- Current upstream status from coordinator list: Issue 909 open, PR 910 open.

## Sprint Contract

Goal: Decide whether the fork should import PR 910's bounded `sdk.shutdown()` behavior, adapt it, reject it, defer it, or mark it already fixed.

Scope:
- Issue-first shutdown investigation.
- Inspect PR 910 as untrusted input using public/read-only evidence.
- If relevant, implement the smallest fork-appropriate fix and targeted tests.
- Run focused verification and applicable security gates.
- Document the local decision neutrally.
- Run `prep-merge-to-local-main` before final handoff.

Non-goals:
- No GitHub writes, tracker comments, labels, PR creation, pushes, deploys, or credentialed browser/API reads.
- No unrelated refactors or release/version changes.
- No changes to iii-engine boundaries beyond bounded local shutdown handling if needed.

Acceptance criteria:
- Issue 909 relevance is assessed against current fork code.
- PR 910 diff is reviewed as untrusted input.
- Security-sensitive surfaces are assessed: auth/isolation, data flow, filesystem, protocol/schema, DoS/performance, supply chain, hooks/tooling, persistence.
- Decision is recorded locally without GitHub URLs, hash-issue references, or mentions.
- If code changes are made, targeted tests cover the bounded shutdown behavior.
- Verification results and skipped checks are recorded.
- `prep-merge-to-local-main` result is recorded.

Known boundaries:
- Public network reads are allowed; credentialed reads or state-changing remote actions require current-turn approval and are out of scope.
- Local `main` is the merge target for final prep; do not fetch or pull.

Stop conditions:
- Evidence suggests the fix requires changing auth/security behavior, externally consumed APIs, schema/persistence, or system boundaries beyond bounded shutdown without explicit approval.
- Required security gates report unresolved findings.
- `prep-merge-to-local-main` finds unrelated staged changes, merge-control state, dirty local `main`, or an unsafe hook/signing path.

## Plan

1. Confirm branch, local instructions, git state, task record, scripts, and relevant shutdown code.
2. Reproduce or demonstrate the shutdown hang risk with a focused test seam where feasible.
3. Inspect PR 910 public diff as untrusted input and compare with fork patterns.
4. Decide import/adapt/reject/defer/already-fixed/blocked.
5. If adapting, write failing targeted test first, then minimal implementation.
6. Run targeted verification and applicable security gates.
7. Document decision and evidence locally.
8. Run `prep-merge-to-local-main` and record outcome.

## Progress

- Branch created from detached HEAD at local main commit `bfde73b`.
- Working tree was clean before task-state creation.
- Issue-first finding: current fork still awaited `sdk.shutdown()` directly in the SIGINT/SIGTERM handler after index persistence save. If iii-sdk telemetry never resolves, `clearWorkerPidfile()` and `process.exit(0)` are unreachable.
- PR 910 review: public patch adds a 3s timeout race directly inside `src/index.ts`. The underlying behavior is appropriate, but the fork import was adapted to isolate the timeout primitive in `src/shutdown.ts` with a focused regression test.
- Decision: adapted import.

## Security Review

- Auth/isolation: no auth, tenant, agent-scope, or request authorization behavior changed.
- Data exposure: the timeout may drop unflushed telemetry during process shutdown only; no new telemetry fields, outbound destinations, or payloads are introduced.
- Filesystem/persistence: existing shutdown order is preserved. Index persistence still saves before bounded SDK shutdown; pidfile cleanup remains after SDK shutdown attempt or timeout.
- Protocol/schema/API: no REST, MCP, resource, schema, or package API contract changes.
- DoS/performance: bounds a previously unbounded shutdown await to 3000 ms, reducing shutdown DoS/hang risk.
- Supply chain: no dependency or manifest changes were made. `npm install --ignore-scripts` was used only to install existing dependencies for local verification; generated install artifacts are ignored and not task-owned.
- Hooks/tooling/persistence: no hook scripts or plugin manifests changed.

## Verification Evidence

- RED: `npm test -- test/shutdown.test.ts` initially failed because `../src/shutdown.js` did not exist.
- Targeted GREEN: `npm test -- test/shutdown.test.ts` passed, 1 test.
- Build: `npm run build` passed. It emitted existing tsdown deprecation/plugin timing warnings and wrote ignored build artifacts.
- Lint: `npm run lint` passed.
- Semgrep full tracked scan: `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings, but only tracked files were scanned.
- Semgrep task surface scan: `semgrep scan --config p/default --error --metrics=off src/index.ts src/shutdown.ts test/shutdown.test.ts` passed with 0 findings.
- Full tests: first `npm test` run had one `test/cli-connect.test.ts` timeout after 1973/1974 tests passed; isolated rerun of that test passed in 659 ms. Final `npm test` rerun passed: 158 test files, 1974 tests.

## Feature / Verification Matrix

| Change / Decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue 909 relevance | Inspect current shutdown paths and tests | done | `src/index.ts` awaited `sdk.shutdown()` directly in signal handler. |
| PR 910 review | Public/read-only diff inspection | done | Public patch reviewed; adapted rather than imported inline. |
| Fork implementation decision | Compare issue, PR, and current fork behavior | done | Adapted import with isolated helper. |
| Targeted tests | Focused vitest or narrow project-native check | done | `npm test -- test/shutdown.test.ts` passed after RED. |
| Security review | Manual surface review plus required gates when code changes | done | Manual review plus Semgrep 0 findings. |
| Local documentation | Task record update without URLs/hash refs/mentions | done | This task record uses neutral IDs. |
| Prep merge | `prep-merge-to-local-main` workflow | pending |  |

## Open Risks

- This is a defensive bound, not the iii-sdk root-cause fix. If SDK shutdown needs longer than 3000 ms for legitimate telemetry flushes, telemetry can be dropped during shutdown.
- The test verifies the timeout helper, not a real systemd SIGTERM path with a wedged OTel exporter.
