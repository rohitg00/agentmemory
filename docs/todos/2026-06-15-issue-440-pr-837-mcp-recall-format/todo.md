# Issue 440 / PR 837 Review

## Scope

- Repository: agentmemory
- Worktree: `/Users/A1538552/.codex/worktrees/4e04/agentmemory`
- Branch: `review/issue-440-pr-837-mcp-recall-format`
- Owning task: review Issue 440 and PR 837, then decide whether to import, adapt, reject, defer, mark already-fixed, or block.

## Sprint Contract

- Goal: determine whether Issue 440 is still relevant in the fork and apply the minimum safe fix if needed.
- Scope: MCP standalone proxy handling for `memory_recall` and `memory_smart_search`, plus targeted tests and neutral local documentation.
- Non-goals: no GitHub writes, no tracker updates, no push, no PR creation, no unrelated MCP surface refactors.
- Acceptance criteria:
  - Issue 440 is checked issue-first against current fork behavior.
  - PR 837 is treated as untrusted input and compared to local code.
  - Any adopted change is minimal and covered by a failing-then-passing test.
  - Security review covers MCP/protocol handling, auth/isolation, data disclosure, DoS/performance, tooling, hooks, persistence, and supply chain as relevant.
  - Outcome is documented locally without GitHub URLs, hash issue references, or mentions.
  - `prep-merge-to-local-main` is run or its no-op/blocked state is recorded.
- Intended verification:
  - Targeted Vitest coverage for `test/mcp-standalone-proxy.test.ts`.
  - `git diff --check`.
  - Required security gates for MCP protocol handling if code changes remain.
- Known boundaries:
  - Public reads only for upstream issue and PR details.
  - No credentialed API reads, logged-in browser reads, remote writes, fetches, pulls, pushes, labels, comments, or PR operations.
  - Preserve unrelated worktree changes if any appear.
- Stop conditions:
  - Same-file unrelated hunks cannot be separated.
  - A needed fix changes auth, persistence, API schema, or system boundaries beyond the requested MCP proxy behavior.
  - Required checks or review gates produce unresolved blocking findings.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Classify Issue 440 current relevance | Inspect current MCP standalone/server/search code and targeted tests | Done | Current fork already routes standalone `memory_recall` to `/agentmemory/search` with `format`, `token_budget`, and `project`; `memory_smart_search.expandIds` was still dropped. |
| Compare PR 837 and related PR 489 | Public diff/API reads only | Done | PR 837 has the right remaining fix shape for `expandIds`; PR 489 keeps recall/smart-search aliased and is not suitable for this fork. |
| If needed, forward `memory_smart_search.expandIds` through standalone proxy | Red/green Vitest test | Done | Red: targeted test failed because proxied body lacked `expandIds`. Green: targeted test passed after minimal forwarding. |
| Preserve `memory_recall` full-format path | Existing regression tests plus targeted rerun | Done | `test/mcp-standalone-proxy.test.ts` passed: 27/27 in temporary dependency copy. |
| Security review of MCP proxy change | Manual review plus required gates where available | Done | Passive review found no new auth, isolation, filesystem, subprocess, persistence, prompt, dependency, or network-destination surface. Semgrep returned 0 findings. Codex Security diff scan returned no reportable findings. |
| Merge prep | `prep-merge-to-local-main` workflow | In progress | Initial preflight was blocked by a dirty local `main` worktree. A later explicit prep invocation found local `main` clean at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`; prep resumed. |

## Notes

- Current fork already routes standalone `memory_recall` proxy calls to `/agentmemory/search` and forwards `format`, `token_budget`, and `project`.
- Current fork does not yet forward `memory_smart_search.expandIds` from the standalone MCP proxy body.
- PR 489 keeps `memory_recall` and `memory_smart_search` aliased to `/agentmemory/smart-search`; that approach is not suitable for this fork.

## Decision

Adapt PR 837 minimally. Import only the `memory_smart_search.expandIds` standalone proxy behavior, not the unrelated or stale recall/format portions from earlier candidate work.

## Implementation Notes

- `src/mcp/standalone.ts`: add `expandIds?: string[]` to the validated MCP argument shape, normalize `args.expandIds` with existing `normalizeList()` only when the tool is `memory_smart_search`, and include `expandIds` in the proxied `/agentmemory/smart-search` body only when present.
- `test/mcp-standalone-proxy.test.ts`: add a regression proving comma-separated MCP input is forwarded as an array.

## Verification Evidence

- `npm test -- test/mcp-standalone-proxy.test.ts -t "forwards expandIds"` in the real worktree could not start because `vitest` was not installed.
- Temporary dependency copy used to avoid repo-local install artifacts: `/tmp/agentmemory-pr837-test.m034qQ/repo`.
- Red evidence in temporary copy: the new targeted test failed because the body was `{ query: "auth bug", limit: 3 }` without `expandIds`.
- Green targeted evidence: `pnpm exec vitest run --exclude test/integration.test.ts test/mcp-standalone-proxy.test.ts -t "forwards expandIds"` passed, 1/1 selected test.
- Full targeted file: `pnpm exec vitest run --exclude test/integration.test.ts test/mcp-standalone-proxy.test.ts` passed, 27/27 tests.
- `git diff --check` passed.
- `pnpm exec tsc --noEmit` in the temporary copy failed on existing repo-wide TypeScript errors outside this change, including `src/cli/server-log.ts`, `src/functions/diagnostics.ts`, `src/functions/leases.ts`, `src/functions/mesh.ts`, `src/functions/slots.ts`, `src/index.ts`, and other unrelated files.
- `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings.
- Codex Security diff scan report: `/tmp/codex-security-scans/agentmemory/localpatch-20260615T181209Z/report.md`, no reportable findings.

## Security Review Notes

- Auth and plaintext bearer protections remain in `src/mcp/rest-proxy.ts`; no change to secret handling or transport policy.
- The new field is normalized through existing list handling and is bounded by downstream smart-search logic.
- The downstream REST smart-search endpoint already whitelists payload fields before triggering `mem::smart-search`.
- No dependency, hook, CI, package-manager, filesystem, subprocess, persistence, schema, prompt, LLM, or external-service boundary changed.

## Residual Risks

- The repository has no lockfile or local `node_modules` in this worktree, so verification required a temporary dependency copy.
- Broad TypeScript compile currently fails on unrelated baseline errors; targeted Vitest coverage is the primary behavioral evidence for this scoped change.
- The first `prep-merge-to-local-main` attempt could not proceed because `/Users/A1538552/_projects/_tools/agentmemory` had unrelated dirty/staged work on `main`. A later explicit prep invocation found the local `main` worktree clean at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`, so prep resumed against that captured local `main` commit.

## Prep-Merge Preflight Result

- Working branch: `review/issue-440-pr-837-mcp-recall-format`
- Task-owned dirty files before prep stop:
  - `src/mcp/standalone.ts`
  - `test/mcp-standalone-proxy.test.ts`
  - `docs/todos/2026-06-15-issue-440-pr-837-mcp-recall-format/plan.md`
  - `docs/todos/2026-06-15-issue-440-pr-837-mcp-recall-format/todo.md`
- Already-staged files in this worktree: none.
- Git operation state in this worktree: none detected.
- Commit hooks: no active hooks configured; only sample hooks present under the shared git hooks directory.
- Signing config: no commit signing config values were present.
- Initial local main worktree status: dirty with unrelated paths from another task, so prep stopped before staging, committing, or merging.
- Resumed local main worktree status: clean at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
