# Issue 833 / PR 842 Review

## Scope

- Repository: agentmemory
- Working branch: `review/issue-833-pr-842-memory-forget-tool`
- Owning scope: MCP/REST memory deletion surface and local review documentation
- Upstream candidates: Issue 833, PR 842, Fork issue 429

## Sprint Contract

- Goal: determine whether the fork should import PR 842 or implement an adapted fix for the reported forget/delete mismatch.
- Scope: inspect current fork behavior for `memory_governance_delete`, `mem::governance-delete`, REST `/agentmemory/forget`, `mem::forget`, and related MCP/server tests.
- Non-goals: do not broaden deletion semantics beyond existing `mem::forget`; do not add remote writes, labels, comments, pushes, PRs, or tracker updates.
- Acceptance criteria:
  - Issue 833 is evaluated issue-first against current fork behavior.
  - PR 842 is inspected as untrusted input.
  - Decision is recorded as import, adapted import, reject, defer, already-fixed, or blocked.
  - Any code change has targeted tests for MCP deletion of observations and validation behavior.
  - Security review covers auth/isolation, data deletion scope, schema/protocol handling, persistence, DoS/performance, and tooling exposure.
  - Result is documented locally with neutral IDs only.
- Intended verification:
  - Targeted vitest for MCP and forget behavior.
  - `git diff --check`.
  - Security gates required for code/MCP surface changes where available.
- Known boundaries:
  - Public reads of upstream issue/PR are allowed.
  - No credentialed GitHub reads or writes.
  - No remote push or PR creation.
  - Preserve externally visible APIs unless the existing REST forget contract is simply exposed through MCP.
- Stop conditions:
  - Required current-turn approval would be needed for remote state changes, API/schema boundary broadening, destructive local actions, or unresolved security findings.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first current behavior analysis | Source inspection and targeted tests | Done | `memory_governance_delete` dispatches to `mem::governance-delete`, which deletes only `KV.memories`; observations are stored under session observation scopes and are deleted by existing `mem::forget`. |
| PR 842 comparison | Public issue/PR metadata and fetched diff inspection | Done | PR 842 adds a `memory_forget` MCP tool and broader governance/delete result changes. Only the MCP exposure and related surface-count/documentation changes were imported. |
| Minimal fork-fit implementation | Focused source diff and targeted vitest | Done | Added `memory_forget` to the MCP registry and handler with argument validation and whitelisted payload dispatch to existing `mem::forget`; updated counts, generated reference, plugin guidance, and targeted tests. |
| Security review | Manual diff scan, Semgrep, and Codex Security report | Done | No reportable findings. Final scan artifacts: `/tmp/codex-security-scans/agentmemory/bfde73b_20260615T2113/report.md` and `/tmp/codex-security-scans/agentmemory/bfde73b_20260615T2113/report.html`. |
| Neutral local documentation | Inspect saved task record for neutral IDs and no URLs | Done | This task record uses neutral IDs only and contains no upstream URLs or cross-reference markup. |
| Prep merge to local main | `$prep-merge-to-local-main` workflow | Done | Task commit `8e3b2d6af5cffb7712da809bcdd59b59c9ae3b6a`; merged local main `6c387b4efea524db5bf8fe0e923958cbcf0213f1` with merge commit `91c133cbed9ed05ee8d2b38276d659b55579ccae`; no conflicts. |

## Progress

- Created isolated review branch from detached worktree at local main commit.
- Read repo instructions, package scripts, README entry points, and coordinator worklist row.
- Recalled relevant workflow lesson: avoid source GitHub URLs and cross-reference syntax in local/public tracker material.
- Confirmed Issue 833 is still relevant in the current fork for MCP users: the available governance delete tool targets saved memories only, while observation and session deletion already exists behind REST/internal `mem::forget`.
- Inspected PR 842 as untrusted input. Decision: adapted import. The fork imports only the MCP `memory_forget` exposure, user-facing tool guidance, count/reference updates, and tests. Broader result-shape and governance-delete semantic changes were not imported because they would change existing externally consumed behavior beyond the minimal issue fix.
- Implemented `memory_forget` with required-context validation:
  - `observationIds` requires `sessionId`.
  - at least one of `sessionId` or `memoryId` is required.
  - payload passed to `sdk.trigger()` is whitelisted and delegates to existing `mem::forget`.
- Updated the forget skill and OpenCode injected guidance so observation/session deletion uses `memory_forget`, while `memory_governance_delete` is described as saved-memory-only.
- Regenerated MCP tool reference with `npm run skills:gen`.
- Added the missing README extended-tool row for `memory_forget` after review found that only the count had been updated there.
- Security-diff scan completed with zero reportable findings. Scan goal usage recorded by tool result: 287379 tokens, about 12 minutes 38 seconds elapsed.

## Review Notes

- Verification completed before merge-prep:
  - `npm run skills:gen` passed.
  - `npm test -- test/mcp-server-surface.test.ts test/mcp-standalone.test.ts test/tool-count-consistency.test.ts test/consistency.test.ts test/plugin-surface-contract.test.ts` passed: 5 files, 157 tests.
  - `git diff --check` passed.
  - `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings.
  - Codex Security report validation passed and HTML render completed.
- `$prep-merge-to-local-main` review chain checkpoint:
  - Passive `$security-best-practices` review for the TypeScript/Node MCP surface found no critical or major issue in the task-owned diff.
  - `$simple-code` cleanup made one readability-only formatting change in the new `memory_forget` handler and preserved behavior/contracts.
  - `$requesting-code-review` and `$review-implementation` were invoked. The environment exposes a subagent tool, but its policy permits spawning only when the user explicitly asks for subagents or parallel agent work; this request did not. A focused local requirements/test/integration review and a separate adversarial local pass found no blocking findings.
  - Fresh post-cleanup verification passed: `npm run skills:check`, `git diff --check`, targeted vitest suite, Semgrep, and stale-count search.
- `$prep-merge-to-local-main` completed:
  - Preflight found no staged changes, no Git operation state, no active hooks, no signing config, and a clean local main worktree.
  - Local main advanced to `6c387b4efea524db5bf8fe0e923958cbcf0213f1`; incoming paths did not overlap the task-owned diff.
  - Merge command initially hit sandbox metadata permissions, then succeeded after escalation with no conflicts.
  - Post-merge verification passed: `git diff --check`, `npm run skills:check`, and targeted vitest suite.
  - The task-created parent-level dependency symlink used for verification was removed after escalation. A repo-local ignored `node_modules/` directory remains classified as a verification artifact; removing ignored directories requires explicit cleanup approval.
- OSV was not required because no dependency, lockfile, container, vendored code, or third-party package surface changed.
- Process caveat: the TDD skill was loaded after the initial implementation had already been written, so this task cannot honestly claim a pre-code red phase. Targeted tests were still added and passed.
- Residual product risk: `mem::forget` keeps its existing return shape and no-op behavior. The adapted import does not add PR 842's more detailed delete breakdown or changed governance-delete no-op semantics.
- Prep-merge workflow completed successfully.
