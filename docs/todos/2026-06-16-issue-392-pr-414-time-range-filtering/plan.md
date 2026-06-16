# Time Range Filtering Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate PR 414 for Issue 392 and, if current fork behavior still lacks safe time filtering, implement the minimal validated behavior for recall, smart search, and sessions.

**Architecture:** Keep time filtering additive at existing API/MCP boundaries and apply it after existing auth, agent isolation, project/cwd filters, and store reads. Date parsing must be explicit, reject invalid user input at public boundaries, and use ISO timestamp comparisons only after normalization.

**Tech Stack:** TypeScript ESM, iii-sdk function registration, MCP server handlers, REST trigger functions, vitest.

---

## File Structure

- Modify `src/functions/search.ts` only if recall/smart-search filtering belongs in the shared search function.
- Modify `src/functions/sessions.ts` or the current session-listing function file only if session filtering is missing.
- Modify `src/mcp/tools-registry.ts` only if MCP schemas need additive `startTime` or `endTime` inputs.
- Modify `src/mcp/server.ts` only if MCP handlers need to validate and forward time filters.
- Modify `src/triggers/api.ts` only if REST endpoints need to validate and forward time filters.
- Modify focused tests under `test/` matching the current existing tests for search, MCP, and sessions.
- Modify `docs/todos/2026-06-16-issue-392-pr-414-time-range-filtering/todo.md` and the coordinator worklist with the final neutral decision.

### Task 1: Evidence And Relevance

- [x] Inspect current recall, smart search, and sessions source paths with `rg "memory_recall|memory_smart_search|mem::search|session" src test`.
- [x] Read the nearest tests covering those paths.
- [x] Fetch or inspect PR 414 and Issue 392 using public read-only access only.
- [x] Record whether current fork already supports time filtering, lacks it, or supports only part of it.
- [x] Decide the smallest test surface for any missing behavior.

### Task 2: TDD For Missing Behavior

- [x] Write failing tests for the confirmed missing time filter behavior before production edits.
- [x] Run the targeted tests and confirm they fail for the expected missing behavior.
- [x] Include invalid date tests at the public boundary that accepts user input.
- [x] Include open-ended start-only or end-only tests when the accepted interface supports them.
- [x] Include inclusive boundary tests for observations or sessions exactly equal to start/end.

### Task 3: Minimal Implementation

- [x] Add a small shared date-range parser only if multiple boundaries need identical validation.
- [x] Whitelist any new REST fields before calling `sdk.trigger()`.
- [x] Validate MCP arguments with `typeof` checks before forwarding.
- [x] Apply filters after existing auth and isolation filters.
- [x] Preserve existing pagination and limit behavior; do not load broader data than the current implementation already loads unless no narrower repo pattern exists.

### Task 4: Security And Verification

- [x] Review the final diff for auth/isolation, data exposure, path/filesystem access, protocol/schema handling, prompt/LLM flow impact, resource usage, hooks/tooling, persistence, and supply chain.
- [x] Run targeted vitest commands covering changed code.
- [x] Run `git diff --check`.
- [x] Run required security gates for code changes as tools are available: staged gitleaks before commit, Semgrep for protocol/storage/API handling changes, and OSV only if dependency surfaces change.
- [x] Record any unavailable tools or accepted limitations.

### Task 5: Documentation And Prep

- [x] Update this task record with final decision, files changed, security finding, verification, caveats, and matrix evidence.
- [ ] Update the coordinator worklist row for PR 414 with neutral IDs and no GitHub URLs or hash issue references, if reachable and safe to edit.
- [x] Execute `$prep-merge-to-local-main`.
- [ ] Report decision, diffs, security assessment, verification, open risks, and prep-merge status.

## Self-Review

- Spec coverage: The plan covers issue-first validation, public PR inspection, implementation decision, TDD, security, neutral documentation, and prep merge.
- Placeholder scan: No placeholder task remains; implementation details are intentionally gated on current codepath and PR evidence.
- Type consistency: Field names are provisional only where the current API has not yet been inspected; final names must be taken from source and tests before implementation.
