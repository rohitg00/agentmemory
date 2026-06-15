# Issue 884 / PR 904 Review

## Scope

- Repository: agentmemory
- Working branch: review/issue-884-pr-904-mcp-tool-descriptions
- Review group: Issue 884, PR 904, Fork issue 393
- Owning scope: MCP tool registry and generated MCP tool reference surfaces

## Sprint Contract

- Goal: decide whether PR 904 should be imported, adapted, rejected, deferred, marked already-fixed, or blocked, then implement only the minimum task-owned change if needed.
- Scope: issue-first analysis, untrusted PR inspection, local fork fit, targeted tests, security review, neutral local documentation, and prep-merge-to-local-main.
- Non-goals: no remote writes, no push, no PR creation, no tracker comments or labels, no broad tool-count or MCP API refactor.
- Acceptance criteria:
  - Issue relevance is checked against the current fork.
  - PR 904 diff is inspected as untrusted input.
  - Decision is documented locally without URLs, hash issue references, or mentions.
  - Any imported/adapted code has focused tests and required security gates where available.
  - prep-merge-to-local-main is run or its no-op/blocked state is documented.
- Intended verification: targeted vitest coverage for tool registry/reference behavior, `npm run skills:check` when generated skill reference changes, `git diff --check`, and required security gates for MCP/tooling surface changes.
- Known boundaries: no credentialed GitHub API reads, no logged-in browser reads, no remote state changes, no publishing/deployment, no dependency changes unless separately justified.
- Stop conditions: unclear PR intent that cannot be resolved from public/local evidence, required credentialed reads, security findings without a minimal safe fix, merge/review gate blocker.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance check | Inspect current tool descriptions and downstream generated reference | complete | Issue remains relevant; current fork had what-only descriptions and the cited jargon examples. |
| PR 904 evaluation | Public PR diff inspection as untrusted input | complete | PR 904 changes only the MCP tools registry descriptions. |
| Fork decision | Compare issue need, PR design, and local architecture | complete | Adapted import. |
| Minimal implementation, if needed | Focused tests and generated-surface check | complete | Registry descriptions, generated MCP tools reference, and regression test updated. |
| Security review | MCP/tooling focused scan plus required gates for changed surface | complete | Manual boundary review plus Semgrep and staged Gitleaks found no issues. |
| prep-merge-to-local-main | Skill workflow result | in progress | Preflight, review chain, staged diff inspection, and staged Gitleaks passed; merge still pending. |

## Assumptions

- Public unauthenticated reads are allowed for issue and PR inspection.
- The current worktree is the intended isolated workspace.
- There are no repo-local lesson files to apply for this task.

## Progress

- Read repo-local AGENTS instructions.
- Checked initial status: detached HEAD at local main commit, clean worktree.
- Created working branch `review/issue-884-pr-904-mcp-tool-descriptions`.
- Read coordinator worklist row for Issue 884 / PR 904.
- Confirmed Issue 884 is still open upstream from public unauthenticated metadata.
- Confirmed PR 904 is still open upstream from public unauthenticated metadata.
- Inspected PR 904 patch as untrusted input. It changes only `src/mcp/tools-registry.ts`.
- Decision: adapted import. The issue is still relevant in the fork because current MCP tool descriptions still contained what-only descriptions and the specific jargon examples from the issue. The import was adapted by preserving local wording such as the allowed-root constraint, adding a regression test, and updating the generated MCP tools reference.
- Security review: description-only MCP metadata change; no tool names, schemas, handlers, REST endpoints, auth, filesystem access, persistence, network calls, subprocesses, dependencies, hooks, or protocol behavior changed. No data exfiltration or privilege boundary change identified.
- Generator note: direct generator execution in the worktree failed because this worktree has no `node_modules`; a temporary copy with symlinked existing main-checkout dependencies ran `scripts/skills/generate.ts --check` successfully against the changed tree.
- Verification:
  - `git diff --check`: passed in the worktree.
  - Targeted vitest in temporary copy: `test/mcp-standalone.test.ts`, `test/consistency.test.ts`, `test/tool-count-consistency.test.ts`, `test/mcp-surface-default.test.ts`: 4 files, 47 tests passed.
  - `scripts/skills/generate.ts --check` in temporary copy: passed.
  - `scripts/skills/check.ts` in temporary copy: passed, 15 skills checked.
  - `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings.
- Review-chain note: independent subagent review was not run because the available subagent tool permits spawning only when the user explicitly asks for subagents or delegation. A separate manual adversarial review pass was performed instead.

## Review Notes

- No critical or important findings from the focused implementation review.
- Residual risk: the actual improvement in model tool-selection behavior is qualitative and was not measured against live LLM calls.
- prep-merge-to-local-main status: in progress.
