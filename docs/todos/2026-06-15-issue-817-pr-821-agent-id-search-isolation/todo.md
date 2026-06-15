# Issue 817 / PR 821 Agent Isolation Review

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/ca9b/agentmemory`
- Working branch: `review/issue-817-pr-821-agent-id-search-isolation`
- Review group: Issue 817, PR 821, Fork issue 440
- Owning scope: core search and state conversion path.

## Sprint Contract

**Goal:** Decide whether PR 821 is relevant to the current fork and, if needed, adapt the smallest safe fix for AGENT_ID isolation in search recall paths.

**Scope:** `mem::search`, REST `/agentmemory/search`, MCP `memory_recall`, MCP prompt `recall_context`, and the `Memory` to `CompressedObservation` fallback used by search indexes.

**Non-goals:** No GitHub writes, no remote PR creation, no tracker comments or labels, no dependency changes, no route/tool count changes, no broad refactors.

**Acceptance criteria:**

- Current fork behavior is assessed issue-first before trusting PR 821.
- PR 821 is inspected as untrusted input via public read/fetch.
- If still relevant, a failing regression test is added before production code.
- Any imported/adapted change is minimal and preserves existing isolation semantics: isolated mode filters by active agent, wildcard `agentId: "*"` bypass remains explicit, shared mode remains unscoped.
- Result is documented locally with neutral identifiers and no GitHub URLs.
- Targeted verification and applicable security gates are recorded.
- `$prep-merge-to-local-main` is run or its no-op/blocker state is recorded.

**Intended verification:**

- Targeted red/green test for `test/agent-isolation-search.test.ts`.
- Targeted related tests for search/API/MCP forwarding where practical.
- `git diff --check`.
- Security gates required for code changes touching auth/isolation/persistence surfaces: Semgrep, OSV, Gitleaks staged check when staging/commit is reached, plus any repo-native local security gate if defined.

**Known boundaries:**

- Public fetches are allowed for PR inspection; credentialed API/browser reads and all GitHub writes are not authorized.
- No dependency, schema, migration, external service, or remote state changes are in scope.
- `docs/todos/...` task-state docs are task-owned.

**Stop conditions:**

- PR evidence requires changing externally visible auth/isolation semantics beyond preserving the documented behavior.
- Required scanner reports unresolved high-impact findings.
- Verification repeatedly fails for unclear reasons that cannot be isolated to this task.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first assessment of current fork | Inspect search/API/MCP/prompt code and tests | Complete | Current fork already has `mem::search` agent filter, REST `/search` propagation, MCP `memory_recall` propagation, and `recall_context` raw-memory filtering. `memoryToObservation()` omitted `agentId`. |
| PR 821 inspection | Public Git fetch and diff inspection | Complete | PR 821 changes only `src/state/memory-utils.ts` to carry `Memory.agentId`; no dependency, route, schema, or tool-surface changes. |
| Regression coverage | Add failing test before production code | Complete | RED: targeted Vitest run failed only the new memory fallback test; expected `mem-a-secret`, received `[]`. |
| Minimal adapted import | Preserve `Memory.agentId` in `memoryToObservation()` if test proves gap | Complete | Added `agentId: memory.agentId` to `src/state/memory-utils.ts`. |
| Local neutral documentation | Update this task record | Complete | This file records decision, evidence, verification, and risk notes with neutral IDs. |
| Merge prep | Run `$prep-merge-to-local-main` | Pending | Not yet reached. |

## Progress Notes

- 2026-06-15: Branch created from detached worktree at `bfde73b`.
- 2026-06-15: Coordinator list confirms PR 821 is pending candidate for Issue 817 / Fork issue 440.
- 2026-06-15: Current fork already enforces agent filtering in `mem::search`, forwards agentId through REST `/search` and MCP `memory_recall`, and filters `recall_context` raw memory list. Remaining PR-relevant gap appears to be `Memory.agentId` loss in `memoryToObservation()`.
- 2026-06-15: Decision: adapted import. The direct cross-agent leak claim is already addressed in the fork, but PR 821 exposes a still-relevant fallback correctness gap: saved memories tagged with the active agent are converted to observations without `agentId`, then isolated `mem::search` drops them. This is not a new data-exfiltration path after the existing fork fix; it is an availability/correctness failure in the same isolation surface.
- 2026-06-15: RED verification: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --root /Users/A1538552/.codex/worktrees/ca9b/agentmemory --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts --exclude test/integration.test.ts test/agent-isolation-search.test.ts` failed 1 of 5 tests, with the new memory fallback test receiving `[]` instead of `["mem-a-secret"]`.
- 2026-06-15: GREEN verification after fix: same targeted command passed 1 file / 5 tests.
- 2026-06-15: Adjacent verification: targeted run for `test/agent-isolation-search.test.ts`, `test/api-boundary-coverage.test.ts`, `test/mcp-server-surface.test.ts`, and `test/mcp-project-scope.test.ts` passed 4 files / 121 tests.
- 2026-06-15: Diff integrity: `git diff --check` passed.
- 2026-06-15: Semgrep: `semgrep scan --config p/default --error --metrics=off .` scanned 555 tracked files with 507 rules and reported 0 findings.
- 2026-06-15: OSV: `osv-scanner scan source .` exited nonzero with "No package sources found"; no dependency, lockfile, container, vendored, or package-manager files changed in this task.
- 2026-06-15: Focused `$requesting-code-review` gate: read-only reviewer returned ACCEPT with no Critical/Important findings. It inspected `src/state/memory-utils.ts`, supporting `src/functions/search.ts`, the regression test, and task-state verification notes.
- 2026-06-15: `$review-implementation` gate: parent adversarial pass found no blocking findings. A second adversarial subagent was started but did not complete before timeout and was shut down; it is not used as evidence.
- 2026-06-15: `codex-security:security-diff-scan`: no reportable findings. Final reports written to `/tmp/codex-security-scans/agentmemory/bfde73b_localpatch_20260615T224452/report.md` and `/tmp/codex-security-scans/agentmemory/bfde73b_localpatch_20260615T224452/report.html`. Goal usage: 121096 tokens, about 15 minutes.

## Security Notes

- Auth/isolation: Existing fork filter remains fail-closed in isolated mode when no active agent is available, still honors explicit wildcard bypass, and still defaults to shared mode when isolation is not enabled. The adapted change only preserves an already-stored `Memory.agentId` through the internal adapter.
- Data exposure: The change does not broaden wildcard behavior or introduce new read paths. It lets same-agent saved memories survive the existing filter; other-agent memories continue to be filtered because their `agentId` is now visible to the filter instead of being lost.
- Path/file access: No filesystem access changes.
- Protocol/schema handling: No route, MCP tool, REST endpoint, schema, or serialized field contract changes; `agentId` already exists on both `Memory` and `CompressedObservation`.
- Prompt/LLM flows: No prompt or LLM invocation changes.
- DoS/performance: No additional I/O or loops; one property copy in an adapter.
- Supply chain/hooks/tooling/persistence: No dependency, hook, package-manager, or persistence format change.

## Open Risks

- Full non-integration suite has not been run yet in this worktree. The worktree does not have its own `node_modules`; verification uses the main checkout's existing local Vitest install with `--root` pointed at this worktree.
- An ignored `node_modules/.vite/vitest/` directory was created as an empty Vitest cache artifact during the first test-runner attempt. It is not task source and is not staged. Cleanup would require explicit deletion approval.
