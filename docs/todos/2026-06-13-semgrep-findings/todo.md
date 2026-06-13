# Semgrep Findings Task State

Task id: `2026-06-13-semgrep-findings`
Scope: current agentmemory worktree
Branch: `fix-worktree-issues`
Status: implemented and verified; commit preparation in progress

## Sprint Contract

Goal: triage and remediate the 19 current `semgrep scan --config p/default --error --metrics=off .` findings, separate valid issues from scanner noise, and make the required Semgrep gate pass without broad behavior changes.

Scope:
- Semgrep findings reported on 2026-06-13 in deploy Dockerfiles, filesystem watcher config parsing, Hermes integration URL calls, OpenCode capture logging, CLI ready-panel WebSocket strings, synthetic/flow/XML parsing helpers, sentinel pattern checks, and viewer proxy logging.
- Follow-up Gitleaks full-history gate failure on the historical synthetic JWT fixture in `test/fs-watcher.test.ts`.

Non-goals:
- No push, PR, deployment, package publish, dependency install, or API redesign.
- No change to iii-engine architecture, MCP tool count, REST endpoint count, versioning, or persisted project identity.
- No broad dependency intake unless later approved.

Acceptance criteria:
- Every Semgrep finding has a disposition and an addressing strategy.
- Valid findings have concrete code and test targets.
- False positives or accepted risks have narrow justification and a Semgrep-gate strategy.
- Required verification commands are listed and run where applicable.
- Subagent validation is recorded.

Known boundaries:
- Changing sentinel pattern acceptance tightens an externally reachable API/MCP behavior; implementation should preserve simple regex compatibility where possible and keep the change limited to unsafe/invalid patterns.
- The Docker deploy images intentionally start as root for first-boot setup and then drop to `node` with `gosu`; adding `USER node` would likely break documented managed-volume setup.
- `AGENTMEMORY_FS_WATCH_IGNORE` is documented as local operator regex configuration, not untrusted request input.

Stop conditions:
- Semgrep remains blocked after planned fixes and the remaining findings are not covered by precise, justified inline suppressions.
- A proposed fix requires dependency installation, API breakage, transport/security-boundary changes, or migration without current-turn user approval.
- Sentinel create-time pattern rejection must not be implemented without explicit current-turn approval because it tightens externally reachable REST/MCP input acceptance. This task proceeded after the user requested implementation of the reviewed plan.
- A required gate tool is missing, fails to run, reports findings, or needs network/credentialed access that is not approved.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Classify all 19 Semgrep findings | Semgrep JSON plus local source inspection plus subagent review | Done | Temporary Semgrep JSON capture, subagent ledger below |
| Implement Sentinel ReDoS remediation | New tests in `test/sentinels.test.ts`; targeted Semgrep; full Semgrep | Done | Create-time validation rejects invalid, quantified, lookaround, backreference, oversized, and repeated-quantifier shapes; check-time skips malformed legacy patterns and bounds titles |
| Implement viewer log-format hardening | Existing viewer tests plus Semgrep | Done | `src/viewer/server.ts` uses static first log argument |
| Implement false-positive dynamic regex cleanup | Existing XML/synthetic/flow tests plus Semgrep | Done | XML/flow parsing uses index-based helper; synthetic matching uses token checks |
| Implement accepted-risk/suppression path | Semgrep rerun must show no blocking findings; comments must name concrete guard | Done | Docker, Hermes, watcher, CLI display findings handled with narrow comments or display helper |
| Handle Gitleaks historical fixture finding | `gitleaks detect --source . --redact` | Done | Current fixture constructs token at runtime; `.gitleaksignore` contains one historical fingerprint for removed synthetic JWT literal |

## Subagent Ledger

| Workstream | Agent | Allowed scope | Edits allowed | Result | Residual risk |
|---|---|---|---:|---|---|
| Dockerfile missing-user validation | `019ec209-0a45-7763-86a7-1775de8f60a5` | `deploy/*/Dockerfile`, `deploy/*/entrypoint.sh`, deploy docs/manifests | No | Findings are Semgrep-blocking but runtime-root false positives; entrypoints perform root-only setup then `exec gosu node`. Do not add `USER node`; use narrow suppressions if Semgrep gate blocks. | Root setup phase stays privileged and must not gain network-facing work before `gosu`. |
| Dynamic RegExp/ReDoS validation | `019ec209-22c2-7402-92e7-d159890ee0e3` | watcher, synthetic/flow/xml helpers, sentinels, tests | No | Sentinel pattern is valid ReDoS/invalid-regex issue. Watcher env regex is accepted operator risk. Synthetic, flow, XML tag findings are false positives. | Regex safety without a dependency is conservative, not a complete formal ReDoS proof. |
| Network/logging validation | `019ec209-3600-7542-a2ea-bc8d15738e7a` | Hermes, OpenCode, viewer, CLI ready panel | No | Viewer proxy log is valid low-severity log-integrity issue. Hermes/OpenCode/CLI are mostly false positives or display-hardening opportunities. | Changing HTTP/WSS transport policy would be a separate security-boundary decision. |
| Plan security review | `019ec20e-a9d9-75b3-9a53-e5f1f0555c53` | task-state plan and referenced source | No | Requested explicit Sentinel approval gate, exact ReDoS criteria, bounded match input, API/MCP reachability coverage, and precise Hermes suppression rationale. Integrated into plan. | Superseded by implementation security review after code changes. |
| Plan implementation review | `019ec20e-b896-7c02-9bdd-ec227a6f09bc` | task-state plan and referenced tests/source | No | Requested pure CLI ready-hint helper/tests, flow-compress regression test, explicit Sentinel criteria, watcher compatibility decision, non-network test command, and Docker comment-only OSV boundary. Integrated into plan. | Superseded by implementation test and maintainability reviews after code changes. |
| Implementation security review | `019ec221-3bb2-7341-bf42-24b618d14e8b` | current diff and Semgrep/Gitleaks remediation | No | Found Sentinel validator still allowed repeated top-level quantifiers and noted `.gitleaksignore` must be included if Gitleaks relies on it. Fixed by rejecting unescaped quantifiers and documenting the fingerprint. | Pattern sentinels now support a stricter regex subset; broader regex support would need a hardened engine or separate design. |
| Implementation test coverage review | `019ec221-3d1c-7282-81ae-ec1620e557ee` | touched tests and related implementations | No | Found untracked Semgrep coverage caveat, missing watcher schedule coverage, missing legacy unsafe-pattern skip case, and missing ready-hint port override test. Added tests and will rerun Semgrep after staging new files. | Native `fs.watch` event delivery remains platform-sensitive; deterministic `schedule` and `flush` coverage are the stable contract tests. |
| Implementation maintainability review | `019ec221-3e7e-7551-86ac-dc5195eafc21` | current diff and task state | No | Found malformed legacy pattern configs could still throw, task state was stale, `.gitleaksignore` needed documentation, and planned edge tests were missing. Fixed or documented. | No generated artifact changes were observed before final staging. |

## Review Notes

- The implementation request supplied current-turn approval to apply the reviewed Sentinel hardening.
- Implementation review found partial regex-shape screening was insufficient. The fix-forward path tightened pattern sentinels to reject unescaped regex quantifiers, while preserving simple literals, anchors, character classes, and alternation such as `error|fail`.
- `.gitleaksignore` is intentionally limited to the single historical synthetic JWT fingerprint from commit `00df540c873566719c412275a66f1afc3fbeb577`; the current test fixture no longer stores that token literal.

## Initial Commands And Evidence

- `git status -sb` -> clean branch `fix-worktree-issues`.
- `semgrep scan --config p/default --error --metrics=off --json . > <temp-json>` -> exit 1 with 19 findings.
- `jq -r '.results[] | [.path, (.start.line|tostring), .check_id, (.extra.message|gsub("\n";" "))] | @tsv' <temp-json>` -> enumerated the 19 findings used by this plan.
- No repo-local Semgrep config or existing `nosemgrep` suppressions were found.

## Final Verification Evidence

- `npx --no-install vitest run test/sentinels.test.ts test/xml.test.ts test/fs-watcher.test.ts test/viewer-host.test.ts test/viewer-security.test.ts test/opencode-auto-context.test.ts test/hermes-plugin.test.ts test/auto-compress.test.ts test/flow-compress.test.ts test/cli-ready-hint.test.ts --exclude test/integration.test.ts` -> passed, 10 files / 141 tests.
- `npm test` -> passed, 134 files / 1445 tests.
- `npm run build` -> passed with existing tsdown/plugin timing and ineffective dynamic import warnings.
- `semgrep scan --config p/default --error --metrics=off .` after staging intended files -> passed, 0 findings.
- `gitleaks protect --staged --redact` -> passed, no leaks.
- `gitleaks detect --source . --redact --no-color` -> passed, no leaks.
- `npx --no-install tsc --noEmit` -> failed on pre-existing repo-wide TypeScript errors outside the touched scope; no task-owned TypeScript error remained after fixing the local unused `port` variable.
- OSV was not run because the task did not change dependencies, lockfiles, container instructions, vendored code, or package surfaces; Docker edits are comments only.
