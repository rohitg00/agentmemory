# Issue 817 / PR 821 Agent Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve `Memory.agentId` when search fallback wraps memories as observations so isolated AGENT_ID search can return an agent's own saved memories while still excluding other agents.

**Architecture:** The current fork already applies the isolation filter inside `mem::search` after loading observations or fallback memories. The minimal change is to keep the existing filter and make the fallback adapter preserve the `agentId` field that `mem::remember` already writes to `Memory`.

**Tech Stack:** TypeScript, ESM, Vitest, iii-sdk mocked test harnesses.

---

## File Structure

- Modify `test/agent-isolation-search.test.ts`: add one regression test that seeds two `Memory` records with different `agentId` values, indexes them through `memoryToObservation()`, and proves isolated search for `agent_a` returns only agent A's memory.
- Modify `src/state/memory-utils.ts`: add `agentId: memory.agentId` to the returned `CompressedObservation` shape.
- Update `docs/todos/2026-06-15-issue-817-pr-821-agent-id-search-isolation/todo.md`: record decision, verification, and security notes.

## Task 1: Prove Memory Fallback Loses Agent Scope

**Files:**
- Modify: `test/agent-isolation-search.test.ts`
- Read: `src/state/memory-utils.ts`

- [ ] **Step 1: Add the failing test**

Add imports:

```ts
import { memoryToObservation } from "../src/state/memory-utils.js";
import type { CompressedObservation, Memory, Session, SearchResult } from "../src/types.js";
```

Add a test after the existing isolated observation test:

```ts
  it("isolated mode returns same-agent memories indexed through the memory fallback", async () => {
    configState.isolated = true;
    configState.agentId = "agent_a";
    const ownMemory: Memory = {
      id: "mem-a-secret",
      title: "agent A saved memory",
      content: "SECRET_MARKER saved AAA",
      concepts: ["secret"],
      files: [],
      strength: 9,
      createdAt: "2026-01-01T03:00:00Z",
      updatedAt: "2026-01-01T03:00:00Z",
      accessCount: 0,
      isLatest: true,
      sessionIds: [],
      sourceObservationIds: [],
      agentId: "agent_a",
    } as Memory;
    const otherMemory: Memory = {
      ...ownMemory,
      id: "mem-b-secret",
      title: "agent B saved memory",
      content: "SECRET_MARKER saved BBB",
      agentId: "agent_b",
    } as Memory;
    await kv.set(KV.memories, ownMemory.id, ownMemory);
    await kv.set(KV.memories, otherMemory.id, otherMemory);
    const idx = getSearchIndex();
    idx.add(memoryToObservation(ownMemory));
    idx.add(memoryToObservation(otherMemory));

    const result = (await sdk.trigger("mem::search", {
      query: "SECRET_MARKER",
      limit: 10,
    })) as { results: SearchResult[] };

    expect(result.results.map((r) => r.observation.id)).toEqual(["mem-a-secret"]);
    expect(result.results[0]?.observation.agentId).toBe("agent_a");
  });
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run:

```bash
npm test -- test/agent-isolation-search.test.ts
```

Expected: the new test fails because the memory-backed observation has `agentId` undefined and is removed by the isolated-mode filter.

## Task 2: Apply Minimal Adapter Fix

**Files:**
- Modify: `src/state/memory-utils.ts`

- [ ] **Step 1: Preserve `agentId` in the adapter**

Update the returned object:

```ts
    importance: memory.strength,
    agentId: memory.agentId,
```

- [ ] **Step 2: Run the targeted test and confirm GREEN**

Run:

```bash
npm test -- test/agent-isolation-search.test.ts
```

Expected: all tests in the file pass.

## Task 3: Verify Adjacent Search Surfaces

**Files:**
- Read: `src/functions/search.ts`
- Read: `src/triggers/api.ts`
- Read: `src/mcp/server.ts`
- Test: `test/agent-isolation-search.test.ts`
- Test: `test/api-boundary-coverage.test.ts`
- Test: `test/mcp-server-surface.test.ts`
- Test: `test/mcp-project-scope.test.ts`

- [ ] **Step 1: Run focused related tests**

Run:

```bash
npm test -- test/agent-isolation-search.test.ts test/api-boundary-coverage.test.ts test/mcp-server-surface.test.ts test/mcp-project-scope.test.ts
```

Expected: related search/API/MCP boundary tests pass.

- [ ] **Step 2: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Run required security checks or record blockers**

Run available scanner commands without changing repo state where possible:

```bash
semgrep scan --config p/default --error --metrics=off .
osv-scanner scan source .
```

Expected: no unresolved findings. If scanners are missing or network-dependent checks cannot run, record exact blocker.

## Task 4: Document Decision and Merge Prep

**Files:**
- Modify: `docs/todos/2026-06-15-issue-817-pr-821-agent-id-search-isolation/todo.md`

- [ ] **Step 1: Record neutral result**

Update the task record with:

- Decision: adapted import.
- Current fork already fixed the direct cross-agent leak in `mem::search`, REST `/search`, `memory_recall`, and `recall_context`.
- PR 821 remains relevant for memory fallback availability/isolation correctness because `Memory.agentId` was dropped.
- Verification commands and outcomes.
- Security review outcome and residual risks.

- [ ] **Step 2: Run `$prep-merge-to-local-main`**

Follow the skill preflight, review chain, commit discipline, local-main merge, post-merge verification, and handoff requirements.

## Self-Review

- Spec coverage: The plan covers issue-first assessment, PR 821 inspection, minimal adapted import, tests, security gates, local documentation, and merge prep.
- Placeholder scan: No TBD placeholders remain.
- Type consistency: The plan uses existing `Memory`, `CompressedObservation`, and `SearchResult` types and the existing `memoryToObservation()` adapter.

