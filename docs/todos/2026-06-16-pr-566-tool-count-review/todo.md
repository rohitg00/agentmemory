# PR 566 Tool Count Review

Scope: repository review branch `review/issue-565-pr-566-mcp-tool-count-docs`.

## Sprint Contract

Goal: Determine whether Issue 565 still requires a fork-side fix and, if so, apply only the minimal docs/plugin metadata change needed to keep MCP tool counts consistent.

Scope:
- README MCP tool count references.
- Plugin and MCP manifest descriptions or tool exposure metadata.
- Source-of-truth MCP registry and existing tests used to confirm the count.
- Local neutral review notes for PR 566, Issue 565, and Fork issue 586.

Non-goals:
- No MCP tool additions or removals.
- No behavior changes to auth, persistence, hooks, protocol handling, or runtime tool exposure.
- No GitHub writes, labels, comments, PR creation, pushes, deployments, or credentialed browser/API reads.
- No unrelated docs or metadata cleanup.

Acceptance criteria:
- Current fork count is derived from source, not assumed from PR text.
- README and plugin/manifest count references are checked for 51/53 drift.
- PR 566 diff is inspected as untrusted input and compared against current fork state.
- Decision is recorded locally with neutral identifiers and no GitHub URLs or hash-style issue references.
- Targeted verification and applicable security review are recorded.
- `prep-merge-to-local-main` is run or its no-op/skip state is documented per skill.

Intended verification:
- `git status -sb --untracked-files=all`
- Source count check from `src/mcp/tools-registry.ts` via project TypeScript runtime or equivalent static parse.
- Text search for stale `51 MCP tools`, `51 tools`, and relevant `53 MCP tools` references.
- Targeted manifest/README consistency checks.
- `npm test -- test/mcp-standalone.test.ts` if a metadata or test-affecting change is made; otherwise skip with rationale.
- Required security gates for code/config changes, or documented skip if only local review notes are changed.

Known boundaries:
- Public network reads are allowed for PR/issue inspection.
- Credentialed `gh api`, logged-in browser reads, GitHub writes, pushes, and remote state changes are not allowed without fresh approval.
- Plugin metadata is treated as security-sensitive configuration because it influences exposed tools and agent setup.

Stop conditions:
- Source-derived tool count differs from documented manifest count and the required fix would change exposed tools or runtime behavior.
- PR 566 requires importing unrelated changes.
- Verification cannot distinguish task-owned changes from unrelated local work.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue 565 relevance in current fork | Source count plus README/plugin search | Adapted import | `src/mcp/tools-registry.ts` contains 53 `memory_*` tool definitions; README and plugin manifests already advertise 53; `.env.example` and website comparison still advertised 51 before this task. |
| PR 566 diff fit | Public diff inspection, compared to local files | Adapted import | Public PR 566 diff touches `.env.example`, `README.md`, `plugin/.claude-plugin/plugin.json`, `src/mcp/standalone.ts`, and `website/components/Compare.tsx`; only stale current-fork hunks were imported, with current fork skill counts/default semantics preserved. |
| Local documentation of decision | Inspect created task record | Complete | This task record uses neutral IDs only: PR 566, Issue 565, Fork issue 586. |
| Prep merge to local main | `prep-merge-to-local-main` workflow | Pending |  |

## Progress

- Target branch created from detached local main worktree.
- Initial repo instructions, package scripts, coordinator worklist row, and MCP-count paths inspected.
- Public read-only status check: Issue 565 is closed; PR 566 is open, non-draft, not merged, and last updated 2026-05-20.
- Decision: adapted import. The current fork already fixed README and plugin manifest count strings, but `.env.example`, `website/components/Compare.tsx`, and stale test text still carried 51-tool drift.
- Applied changes:
  - `.env.example`: corrected `AGENTMEMORY_TOOLS` comment to `all (53 tools, default) | core (8 essential tools)`.
  - `website/components/Compare.tsx`: corrected MCP tools comparison value to 53.
  - `test/mcp-surface-default.test.ts`: corrected stale 51-tool comment and test title.
  - `test/tool-count-consistency.test.ts`: added a metadata-surface regression check for stale 51-tool advertising.
- Verification:
  - `git diff --check`: passed.
  - Static registry count: 53 `memory_*` tool definitions.
  - Static stale-count surface check across `.env.example`, README, website compare, plugin manifests, OpenCode README, and generated MCP tools reference: passed.
  - `semgrep scan --config p/default --error --metrics=off .`: passed with 0 findings.
  - `npm test -- test/tool-count-consistency.test.ts test/mcp-surface-default.test.ts`: blocked because `vitest` is not installed in this dependency-free worktree.
  - Transient `npx --yes vitest@4.1.8 ...` verification was not run because the approval layer rejected the install-like package download.
- Security review:
  - Auth/authorization/tenancy: no behavior touched.
  - Data exposure and persistence: no storage or network behavior touched.
  - Tool exposure and agent configuration: documentation/config comments now match the existing default `all` mode and 53-tool registry; no manifest wildcard or runtime exposure changed.
  - Supply chain: no dependency, lockfile, install script, or package-manager config changes.
  - Hooks/tooling: no hook behavior changed.
  - DoS/performance: no runtime path changed.
- Review chain:
  - `security-best-practices`: passive JavaScript/TypeScript frontend guidance checked; no critical or major issue.
  - `simple-code`: stabilization review found no simplification that would reduce complexity without changing scope.
  - Focused implementation review: no critical or important issue; subagent review was not used because the available subagent tool requires explicit user authorization.
  - Codex Security diff scan: completed under `/tmp/codex-security-scans/agentmemory/6c387b4_20260616T003608Z`; no plausible candidates, validation and attack-path phases skipped by rule.
  - Security scan goal usage: 22064 tokens, about 73 seconds.

## Review Notes

- Focused code review found no critical or important issue in the adapted diff. Remaining risk: targeted Vitest files could not be executed without installing dependencies.
