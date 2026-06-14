# OpenCode Consolidation Opt-out Task State

Task id: `2026-06-13-opencode-consolidation-optout`
Scope: current agentmemory worktree
Branch: `prep-merge/opencode-consolidation-optout-21ac25a`
Base/local main: `21ac25ad367aca55886d2afb920383ff8ab5f1d1`
Status: implemented with post-review auto-crystallize opt-out fix; pre-merge review gates accepted; targeted checks passed; build blocked by missing local dependencies

## Sprint Contract

Goal: prevent OpenCode and REST callers from bypassing the global consolidation opt-out while preserving explicitly internal boolean `force` behavior.

Scope:
- OpenCode `session.deleted` consolidation/crystallization behavior.
- REST `/agentmemory/consolidate-pipeline` payload handling.
- REST `/agentmemory/crystals/auto` payload handling and automatic crystallization opt-out behavior.
- Consolidation pipeline `force` semantics at the internal function boundary.
- Focused tests for disabled consolidation, REST boundary sanitization, and OpenCode hook parity.

Non-goals:
- No push, deploy, merge to main, publishing, dependency changes, or remote state changes.
- No MCP tool count, REST endpoint count, version, schema, persistence, auth, or provider changes.
- No removal of internal `force: true` support for trusted in-process callers.
- No change to Claude/session-end behavior beyond comparison tests.

Acceptance criteria:
- `CONSOLIDATION_ENABLED=false` cannot be bypassed by OpenCode `session.deleted`.
- REST `/agentmemory/consolidate-pipeline` ignores external `force` input and only forwards whitelisted fields.
- REST `/agentmemory/crystals/auto` does not trigger automatic crystallization when consolidation is disabled and forwards only whitelisted fields when enabled.
- Internal `mem::auto-crystallize` does not reach provider-backed summarization when consolidation is disabled.
- Internal `mem::consolidate-pipeline` still honors boolean `force: true`, but not truthy non-boolean values.
- Tests cover the exploit condition and legitimate internal force behavior.
- Verification results and residual risks are recorded.

Known boundaries:
- Explicit `CONSOLIDATION_ENABLED=false` is a user privacy/cost opt-out even when an LLM provider is configured.
- REST payload handling is an external boundary; it must whitelist fields rather than forwarding raw bodies.
- Internal `force` is retained only for trusted in-process paths.

Stop conditions:
- A proposed fix requires dependency installation, auth/security redesign, schema migration, or remote/published state changes.
- Tests require unavailable dependencies and cannot be run through an existing local install.
- A compatibility decision requires changing whether internal trusted code can force consolidation when disabled.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Validate finding with read-only subagents | Subagent consensus | Done | Carson and Kant both reported valid opt-out bypass |
| Protect REST boundary from `force` | New API regression test | Done | `test/consolidation-api-boundary.test.ts` proves REST drops `force` and unrelated fields |
| Protect automatic crystallization opt-out | Crystallize/API regression tests | Done | `test/crystallize.test.ts` proves `mem::auto-crystallize` skips when disabled; `test/consolidation-api-boundary.test.ts` proves `/crystals/auto` disabled gate and payload whitelist |
| Gate OpenCode session delete consolidation | OpenCode plugin text regression test | Done | `test/opencode-auto-context.test.ts` proves `CONSOLIDATION_ENABLED=true` gate and no OpenCode `force` payload |
| Preserve internal boolean force only | Consolidation pipeline unit tests | Done | `test/consolidation-pipeline.test.ts` preserves boolean force and rejects non-boolean force bypass |
| Verify targeted surface | Targeted vitest command | Done | 6 files / 55 tests passed after auto-crystallize fix |
| Diff-scoped security review | Codex Security local-patch scan | Done | `/tmp/codex-security-scans/agentmemory/21ac25a_20260614T044100Z_local-patch/report.md` validated; no findings |
| Pre-landing reviews | GStack-style and code-review subagents | Done | Both read-only review gates accepted/no actionable findings |

## Subagent Ledger

| Workstream | Agent | Allowed scope | Edits allowed | Result | Residual risk |
|---|---|---|---:|---|---|
| Validity and impact | `019ec275-78ef-73e1-af30-1bb6a06e2318` | Referenced OpenCode/plugin/config/hook files | No | Valid finding; OpenCode `session.deleted` can force LLM-backed consolidation despite explicit opt-out. | Runtime reproduction not run in read-only pass. |
| Fix strategy and compatibility | `019ec275-7a08-7a53-aadf-05f78aa69ba4` | Referenced code and tests | No | Preserve internal `force`, whitelist REST body, gate OpenCode like core hook, add boundary tests. | Dependencies were absent in subagent environment, so tests were not run there. |
| GStack-style pre-landing review | `019ec403-ff0e-7c22-91f6-94f6cc1ee879` | Working-tree diff and relevant source/tests/docs | No | Verdict ACCEPT; no pre-landing blockers. Confirmed tests cover REST stripping, non-boolean force rejection, internal force preservation, OpenCode no-force behavior, and session-end parity. | Did not fetch remote state; `npm test -- ...` still blocked by missing local `vitest`. |
| Independent code review | `019ec404-1652-7f12-8d8a-f0b97cfacc7e` | Working-tree diff and relevant source/tests/docs | No | No Critical, Important, or Minor actionable findings. | Assumes strict OpenCode `CONSOLIDATION_ENABLED=true` behavior intentionally mirrors the core hook. |
| Pre-merge focused code review after local main advanced | `019ec51d-700e-7782-9248-f34413fbde3b` | Committed branch diff against `21ac25ad...` | No | ACCEPT; no Critical or Important issues. | Did not run tests in read-only review. |
| Pre-merge Review Implementation | `019ec51d-b1ef-7d22-98b9-0c701f176485` | Committed branch diff and directly related crystallization paths | No | Found important adjacent `/crystals/auto` automatic crystallization opt-out gap. | Blocked merge until fixed. |
| Auto-crystallize fix focused code review | `019ec524-ebdb-78f0-ac02-6e584dc8e037` | `src/functions/crystallize.ts`, `src/triggers/api.ts`, `test/crystallize.test.ts`, `test/consolidation-api-boundary.test.ts` | No | ACCEPT; no Critical or Important issues after `olderThanDays: 0` compatibility fix. | Did not run tests in read-only review; main agent ran targeted Vitest. |
| Auto-crystallize fix Review Implementation | `019ec525-09de-77a1-bdcd-03dc0c8e23d1` | Same auto-crystallize fix surface | No | NO FINDINGS. Confirmed manual `mem::crystallize` unchanged, auto path gated, REST whitelist preserves `olderThanDays: 0`. | `npm test -- ...` still blocked by missing local `vitest`; main agent used no-install Vitest path. |

## Initial Evidence

- `git status -sb --untracked-files=all` -> clean detached `HEAD`.
- `plugin/opencode/agentmemory-capture.ts` posts `/consolidate-pipeline` with `{ tier: "all", force: true }` on `session.deleted`.
- `src/functions/consolidation-pipeline.ts` currently skips `isConsolidationEnabled()` whenever `data?.force` is truthy.
- `src/config.ts` makes explicit `CONSOLIDATION_ENABLED=false` override provider-based defaults.
- `src/hooks/session-end.ts` and `plugin/scripts/session-end.mjs` gate consolidation work on `CONSOLIDATION_ENABLED === "true"`.

## Final Verification Evidence

- RED: `npx --no-install vitest run test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts --exclude test/integration.test.ts` -> failed for expected reasons after test-only changes:
  - REST boundary forwarded `force` and unrelated fields.
  - `force: "true"` bypassed disabled consolidation.
  - OpenCode `session.deleted` had no `CONSOLIDATION_ENABLED` guard and sent `force: true`.
- GREEN: same targeted command after implementation -> passed, 3 files / 13 tests.
- Expanded target: `npx --no-install vitest run test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts test/session-end-consolidation-gate.test.ts test/session-end-triggers-graph.test.ts --exclude test/integration.test.ts` -> passed, 5 files / 27 tests.
- Pre-merge rerun: `npx --no-install vitest run test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts test/session-end-consolidation-gate.test.ts test/session-end-triggers-graph.test.ts --exclude test/integration.test.ts` -> passed, 5 files / 27 tests.
- `npm test -- test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts test/session-end-consolidation-gate.test.ts test/session-end-triggers-graph.test.ts` -> failed before tests because local `vitest` is not installed.
- `npm run build` -> failed before build because local `tsdown` is not installed.
- `npx --no-install tsdown --version` -> unavailable without installing `tsdown`; no dependency installation was performed.
- `npx --no-install tsc --version` -> unavailable without installing TypeScript; no dependency installation was performed.
- `semgrep scan --config p/default --error --metrics=off src/functions/consolidation-pipeline.ts src/triggers/api.ts plugin/opencode/agentmemory-capture.ts plugin/opencode/README.md test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts test/session-end-consolidation-gate.test.ts docs/todos/2026-06-13-opencode-consolidation-optout/todo.md docs/todos/2026-06-13-opencode-consolidation-optout/plan.md` -> passed, 0 findings.
- Pre-merge full tracked Semgrep: `semgrep scan --config p/default --error --metrics=off .` -> passed, 0 findings across tracked files.
- Codex Security diff scan -> validated report at `/tmp/codex-security-scans/agentmemory/21ac25a_20260614T044100Z_local-patch/report.md`; no findings.
- Pre-merge branch-diff Codex Security scan after local `main` advanced -> validated report at `/tmp/codex-security-scans/agentmemory/16393b1_20260614T075213Z_branch-diff/report.md`; no findings.
- Auto-crystallize fix targeted tests: `npx --no-install vitest run test/crystallize.test.ts test/consolidation-api-boundary.test.ts test/consolidation-pipeline.test.ts test/opencode-auto-context.test.ts test/session-end-consolidation-gate.test.ts test/session-end-triggers-graph.test.ts --exclude test/integration.test.ts` -> passed, 6 files / 55 tests.
- Auto-crystallize fix Codex Security scan -> validated report at `/tmp/codex-security-scans/agentmemory/16393b1_20260614T080010Z_autocrystal-fix2/report.md`; no findings.
- `gitleaks detect --source . --redact --no-color` -> passed, no leaks across 488 commits.
- Pre-commit staged secret scan: `gitleaks protect --staged --redact` -> passed, no leaks found.
- `git diff --check` -> passed.

## Final Review Notes

- The original issue no longer reproduces in the added regression tests: OpenCode no longer sends a forced consolidation request, REST no longer forwards external `force`, and non-boolean force values no longer bypass disabled consolidation.
- The adjacent automatic crystallization gap found during pre-merge Review Implementation is fixed: `mem::auto-crystallize` skips when disabled, `/crystals/auto` returns the standard disabled response before triggering, and enabled REST calls preserve `olderThanDays: 0` while dropping `force` and unrelated fields.
- Internal `force: true` remains supported for trusted in-process callers and remains covered by `test/consolidation-pipeline.test.ts`.
- Manual `mem::crystallize` remains unchanged as an explicit operation; the fix is scoped to automatic crystallization.
- Core session-end source and built plugin script still gate their forced consolidation call on `CONSOLIDATION_ENABLED=true`; `test/session-end-consolidation-gate.test.ts` records that comparison.
- No push, deploy, dependency install, fetch, pull, or remote state change was performed.
- Residual risk: full `npm test` and `npm run build` could not run in this worktree because local project dependencies are absent and no lockfile is present. The closest available focused Vitest path and Semgrep/Gitleaks checks were run instead.
