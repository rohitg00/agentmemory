# Issue 440 / PR 837 MCP Proxy Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review Issue 440 and PR 837 against the fork and apply only the still-needed MCP standalone proxy fix.

**Architecture:** The standalone MCP shim validates tool arguments into a local `Validated` shape, then either proxies to REST endpoints or uses local fallback storage. `memory_recall` must stay routed to `/agentmemory/search`; `memory_smart_search` may optionally include an `expandIds` array for progressive disclosure.

**Tech Stack:** TypeScript, ESM, Vitest, local REST proxy abstraction in `src/mcp/standalone.ts`.

---

## Files

- Modify: `src/mcp/standalone.ts`
- Modify: `test/mcp-standalone-proxy.test.ts`
- Modify: `docs/todos/2026-06-15-issue-440-pr-837-mcp-recall-format/todo.md`

## Tasks

### Task 1: Prove the Remaining Proxy Gap

- [ ] Add a Vitest case in `test/mcp-standalone-proxy.test.ts` that calls `handleToolCall("memory_smart_search", { query: "auth bug", limit: 3, expandIds: "obs_1, obs_2" })`.
- [ ] Assert the proxied `/agentmemory/smart-search` body is `{ query: "auth bug", limit: 3, expandIds: ["obs_1", "obs_2"] }`.
- [ ] Run `npm test -- test/mcp-standalone-proxy.test.ts -t "forwards expandIds"` and confirm the test fails because `expandIds` is absent.

### Task 2: Implement Minimal Forwarding

- [ ] Add `expandIds?: string[]` to the standalone `Validated` interface.
- [ ] In the shared `memory_recall`/`memory_smart_search` validation branch, only when `toolName === "memory_smart_search"`, normalize `args["expandIds"]` with existing `normalizeList()` and store non-empty results.
- [ ] In the `memory_smart_search` proxy branch, include `body["expandIds"] = v.expandIds` only when present.
- [ ] Do not change `memory_recall` routing or fallback behavior.

### Task 3: Verify Behavior and Safety

- [ ] Rerun the targeted failing test and the existing recall proxy tests in `test/mcp-standalone-proxy.test.ts`.
- [ ] Run `git diff --check`.
- [ ] Run required security gates if available for MCP protocol handling changes.
- [ ] Update `todo.md` with decision, security findings, verification evidence, and residual risks.
- [ ] Run `prep-merge-to-local-main` and record its result.
