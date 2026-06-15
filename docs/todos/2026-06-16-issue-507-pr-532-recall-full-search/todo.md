# Issue 507 / PR 532 Review

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/e706/agentmemory`
- Branch: `review/issue-507-pr-532-mcp-recall-full-search`
- Review group: Issue 507, PR 532, Fork issue 609
- Coordinator list: `/Users/A1538552/.codex/worktrees/fdf5/agentmemory/docs/todos/2026-06-15-pr-issue-fix-review/pr-issue-fix-review-list.md`

## Sprint Contract

- Goal: decide whether PR 532 should be imported, adapted, rejected, deferred, marked already-fixed, or blocked for the fork.
- Scope: `memory_recall` MCP standalone/server handling, `/agentmemory/search` versus `/agentmemory/smart-search`, format propagation, and targeted tests/docs if needed.
- Non-goals: no GitHub writes, no pushes, no PR creation, no tracker comments or labels, no unrelated refactors.
- Acceptance criteria:
  - Issue behavior is understood issue-first against the current fork.
  - PR 532 is inspected as untrusted input via public read-only data.
  - Decision is documented locally using neutral IDs only.
  - If code changes are needed, minimal task-owned changes and targeted tests cover the behavior.
  - Security review covers recall data exposure, scope filters, format handling, protocol handling, and DoS/performance implications.
  - `$prep-merge-to-local-main` is executed or its no-op/skip is documented per skill.
- Intended verification:
  - Targeted Vitest coverage for MCP standalone/server recall behavior if changed.
  - `git diff --check`.
  - Security gates required by the touched surface when code changes remain.
  - Prep-merge preflight and post-merge verification per skill.
- Known boundaries:
  - No credentialed GitHub API or logged-in browser reads without current-turn approval.
  - No remote state changes.
  - Preserve unrelated worktree changes.
- Stop conditions:
  - Current fork behavior cannot be determined from local code/tests and public read-only PR/issue data.
  - Required review/security gate is unavailable and the governing skill says to stop.
  - A fix would broaden auth, scope isolation, persisted schema, or external API behavior beyond the user's approval.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Determine current fork relevance | Inspect `src/mcp/standalone.ts`, `src/mcp/server.ts`, `src/triggers/api.ts`, and targeted tests | Done | Proxy-mode Issue 507 behavior already fixed locally: standalone `memory_recall` routes to `/agentmemory/search` and forwards `format`, `token_budget`, and `project`. |
| Inspect PR 532 as untrusted input | Public read-only issue/PR/diff fetch | Done | PR 532 changes `src/mcp/standalone.ts` and tests; useful local-fallback idea, but direct import would drop the fork's local `project` filter. |
| Import/adapt/reject decision | Compare issue behavior, PR diff, and fork behavior | Done | Decision: adapted import. Keep existing proxy fix, add minimal local fallback format support while preserving project isolation. |
| Targeted implementation, if needed | Minimal diff plus targeted Vitest | Done | `src/mcp/standalone.ts`, `test/mcp-standalone.test.ts`, `test/mcp-standalone-proxy.test.ts`. |
| Security review | Manual security analysis plus required diff scan/gates if changed | Done | Security diff scan found no reportable findings; Semgrep found 0 findings. |
| Prep local-main merge | `$prep-merge-to-local-main` workflow | Done | Local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was already an ancestor of the branch; merge was a no-op. |

## Progress

- Read repo-local `AGENTS.md`, package scripts, coordinator worklist row, and initial recall-related code references.
- `git status -sb --untracked-files=all` before branch creation: clean detached HEAD.
- Created branch `review/issue-507-pr-532-mcp-recall-full-search`.
- Public read-only Issue 507 and PR 532 data inspected. No credentialed GitHub reads or writes used.
- Added local fallback `memory_recall` formats:
  - default `full` shape with `observation.narrative`;
  - `compact` shape without full content;
  - `narrative` text;
  - strict `memory_recall` `format` and `token_budget` validation.
- Preserved local fallback project filter before matching/formatting. This avoids the project-isolation regression present in PR 532's helper extraction.
- Review chain:
  - Passive security-best-practices pass: no critical/major issue. Main risk was recall data exposure; project-filter regression is covered.
  - Simple-code pass: extracted shared `searchLocalMemories()` to avoid duplicate local search/filter logic.
  - Focused requesting-code-review subagent: skipped because the available subagent tool policy only allows spawning when the user explicitly asks for subagents. Main-agent review performed instead.
  - Review implementation: no critical/important findings after inspecting changed files and targeted tests.
  - Codex Security diff scan: no reportable findings. Report path: `/tmp/codex-security-scans/agentmemory/localpatch-6c387b4-20260615T230625Z/report.md`.

## Verification Evidence

- Red test before implementation: targeted `memory_recall` tests failed because local fallback returned compact mode and accepted invalid format.
- Pass: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts --root /Users/A1538552/.codex/worktrees/e706/agentmemory --exclude test/integration.test.ts test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts` — 57 tests passed.
- Pass: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/eslint --config /Users/A1538552/_projects/_tools/agentmemory/eslint.config.js src/mcp/standalone.ts test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts`.
- Pass: `git diff --check`.
- Pass: `semgrep scan --config p/default --error --metrics=off .` — 0 findings.
- Limited: full Vitest suite with the main-checkout Vitest binary failed because this worktree has no full `node_modules` resolution for packages such as `iii-sdk` and `@clack/prompts`; targeted MCP standalone tests passed. No dependency install was performed.

## Artifacts And Caveats

- Ignored verification artifacts observed and preserved, not deleted: `node_modules/.vite/`, `integrations/hermes/__pycache__/__init__.cpython-314.pyc`.
- Build was not run because the project build writes `dist/` artifacts into the worktree.

## Prep Merge Closeout

- Pre-merge task commit: `a6f9e316f83f5a8a19e4e08e6553a1f5bea1f7b2`.
- Local `main` captured: `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
- Merge result: no-op; local `main` was already an ancestor of the task branch.
- Conflicts: none.
- Preserved ignored artifacts: `node_modules/.vite/`, `integrations/hermes/__pycache__/__init__.cpython-314.pyc`.
