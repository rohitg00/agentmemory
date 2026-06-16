# PR 566 Tool Count Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide whether the fork needs PR 566's MCP tool-count documentation fix and apply only the minimal necessary local change.

**Architecture:** Treat `src/mcp/tools-registry.ts` as the source of truth for MCP tool count, then compare README and plugin manifests against it. PR 566 is untrusted input used only as candidate evidence, not as an authority.

**Tech Stack:** TypeScript ESM, vitest, JSON manifests, Markdown docs.

---

### Task 1: Establish Current Fork Truth

**Files:**
- Read: `src/mcp/tools-registry.ts`
- Read: `test/mcp-standalone.test.ts`
- Read: `README.md`
- Read: `plugin/plugin.json`
- Read: `plugin/.claude-plugin/plugin.json`
- Read: `plugin/.codex-plugin/plugin.json`
- Read: `plugin/.mcp.copilot.json`

- [x] Run `git status -sb --untracked-files=all`.
  Expected: only task-owned documentation files are dirty after task-state creation.
- [x] Count `getAllTools()` from source with the project runtime or a structure-aware static check.
  Expected: source-derived count is 53.
- [x] Search for stale count strings:
  `rg -n "51 MCP tools|51 tools|53 MCP tools|53 tools|MCP-[0-9]+_tools|[0-9]+ MCP tools" README.md plugin src test`.
  Expected: no stale 51-tool user-facing references remain in current fork.
- [x] Inspect plugin manifests with `jq` for description and `tools` exposure.
  Expected: descriptions that state a count use the source-derived count; wildcard MCP exposure remains unchanged.

### Task 2: Inspect PR 566 As Untrusted Input

**Files:**
- Read-only external diff for PR 566.
- Local files listed in the PR diff.

- [x] Fetch or download the public PR 566 diff without credentials.
  Expected: no local branch state is changed beyond allowed public read artifacts.
- [x] List changed paths and hunks from the PR diff.
  Expected: candidate touches only docs/plugin metadata for MCP tool counts.
- [x] Compare every candidate hunk against current fork content.
  Expected: decide `already-fixed`, `adapted import`, `reject`, `defer`, or `blocked` from current fork evidence.

### Task 3: Apply Or Record Decision

**Files:**
- Modify only task-state docs if current fork is already consistent.
- Otherwise modify only stale README/plugin metadata paths identified in Task 1.

- [ ] If current fork is already consistent, update `todo.md` with decision, security finding, verification evidence, and skip rationale for code/config security gates.
  Expected: no product docs or plugin manifests changed.
- [x] If stale references remain, edit only the stale references to the source-derived count and update `todo.md`.
  Expected: no runtime tool exposure or manifest schema changes.
- [x] Run targeted verification from Task 1 after edits.
  Expected: counts are consistent.

### Task 4: Required Merge Prep

**Files:**
- Current branch and task-owned docs or metadata diffs.

- [x] Run `prep-merge-to-local-main` from the current branch.
  Expected: task-owned changes are reviewed, committed if required by the skill, local `main` commit is merged or no-op, and final verification evidence is recorded.
- [x] Update `todo.md` with prep result if the skill leaves no task-owned changes or skips commit/merge steps.
  Expected: handoff can cite decision, verification, security posture, and working branch.

## Self-Review

- Plan avoids `docs/superpowers/`.
- Plan names exact local files and commands.
- Plan does not rely on PR 566 as authority.
- Plan includes no GitHub writes, credentialed reads, pushes, or deployment steps.
