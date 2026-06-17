# Issue 926 MCP Project Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the optional `project` argument across MCP save and recall/search paths.

**Architecture:** Keep the fix at MCP boundary layers because REST and core memory/search functions already understand `project`. Add optional schema fields, normalize once at MCP validation boundaries, and forward/store/filter the value without changing tool counts, endpoint counts, storage schema, or auth behavior.

**Tech Stack:** TypeScript ESM, Vitest, iii-sdk mocked tests, MCP standalone shim, REST proxy wrapper.

---

## Files

- Modify: `src/mcp/standalone.ts`
- Modify: `src/mcp/tools-registry.ts`
- Modify: `src/mcp/server.ts`
- Modify: `test/mcp-standalone.test.ts`
- Modify: `test/mcp-standalone-proxy.test.ts`
- Create: `test/mcp-server-tools.test.ts`
- Modify: `docs/todos/2026-06-17-issue-926-mcp-project-scope/todo.md`

## Spec Source

No separate product spec exists. Source of truth is the user delegation, Issue #926 summary, repo instructions, and `todo.md` Sprint Contract.

## Subagent Work

- Read-only Explorer already spawned to validate issue #926 independently. Main agent owns implementation and verification because the code surface is small and overlapping.

## Task 1: Add Red Regression Tests

**Files:**
- Modify: `test/mcp-standalone.test.ts`
- Modify: `test/mcp-standalone-proxy.test.ts`
- Create: `test/mcp-server-tools.test.ts`

- [ ] **Step 1: Add local fallback project persistence/filter tests**

Add a test near the standalone local save/recall tests proving:

```ts
const api = await handleToolCall("memory_save", {
  content: "Use request-scoped JWT middleware",
  project: "api",
}, kv);
const web = await handleToolCall("memory_save", {
  content: "Use request-scoped JWT middleware",
  project: "web",
}, kv);
await handleToolCall("memory_save", {
  content: "Use request-scoped JWT middleware legacy",
}, kv);
const apiMemory = await kv.get<{ project?: string }>("mem:memories", JSON.parse(api.content[0].text).saved);
const webMemory = await kv.get<{ project?: string }>("mem:memories", JSON.parse(web.content[0].text).saved);
expect(apiMemory?.project).toBe("api");
expect(webMemory?.project).toBe("web");
const recall = JSON.parse((await handleToolCall("memory_recall", {
  query: "request-scoped JWT",
  project: "api",
}, kv)).content[0].text);
expect(recall.results.map((m: { project?: string }) => m.project)).toEqual(["api", undefined]);
```

Also assert `memory_smart_search` with `project: "web"` returns the web and legacy memories, not the api memory.

- [ ] **Step 2: Add proxy forwarding tests**

Extend existing proxy tests to assert request bodies include `project`:

```ts
await handleToolCall("memory_save", {
  content: "proxy scoped",
  project: "api",
});
expect(rememberCall?.body).toMatchObject({ content: "proxy scoped", project: "api" });
```

Update recall expected body to include `project: "api"` when passed, and update smart-search test to capture/expect `project`.

- [ ] **Step 3: Add server MCP forwarding tests**

Create `test/mcp-server-tools.test.ts` using the same `registerMcpEndpoints(sdk, kv)` pattern as `test/mcp-prompts.test.ts` and `test/mcp-resources.test.ts`. Add assertions that `memory_recall` calls `mem::search` with `project: "api"` and `memory_smart_search` calls `mem::smart-search` with `project: "api"`. Keep blank project behavior out of payload.

- [ ] **Step 4: Add schema assertions**

Assert `CORE_TOOLS` schema for `memory_recall` and `memory_smart_search` includes a `project` string property.

- [ ] **Step 5: Run focused red tests**

Run:

```bash
npx vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts
```

Expected: failures showing missing `project` persistence/forwarding/schema fields.

## Task 2: Implement MCP Boundary Project Forwarding

**Files:**
- Modify: `src/mcp/standalone.ts`
- Modify: `src/mcp/tools-registry.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Add project to standalone validation model**

Add `project?: string` to `Validated` and assign a trimmed non-empty value for `memory_save`, `memory_recall`, and `memory_smart_search`.

- [ ] **Step 2: Forward project in standalone proxy mode**

Add conditional `project` fields to bodies for `/agentmemory/remember`, `/agentmemory/search`, and `/agentmemory/smart-search`.

- [ ] **Step 3: Persist and filter project in standalone local mode**

Add `project` to saved local memory objects when present. In local recall/smart-search, if `v.project` is set, exclude memories whose own `project` is a different non-empty string and keep legacy unscoped memories visible.

- [ ] **Step 4: Add project to read tool schemas**

Add optional `project` string properties to `memory_recall` and `memory_smart_search` in `src/mcp/tools-registry.ts`.

- [ ] **Step 5: Forward project in full MCP server handlers**

In `src/mcp/server.ts`, parse a trimmed optional `project` for `memory_recall` and `memory_smart_search`, then include it conditionally in the downstream payload.

## Task 3: Green Verification And Cleanup

**Files:**
- Modify: touched source/tests only as needed.
- Modify: `docs/todos/2026-06-17-issue-926-mcp-project-scope/todo.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts
```

Expected: pass.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Run repo-native tests if dependencies are available**

Run:

```bash
npm test
```

Expected: exit 0, or record blocker/failing tests with evidence.

- [ ] **Step 4: Simplification pass**

Review the active diff for avoidable duplication or unclear local names while preserving MCP schemas, REST routes, auth, storage, and search semantics.

- [ ] **Step 5: Security gates**

Run Semgrep for non-trivial code changes:

```bash
semgrep scan --config p/default --error --metrics=off .
```

Before any commit, stage only task-owned files and run:

```bash
gitleaks protect --staged --redact
```

OSV is not required unless dependency, lockfile, container, vendored, or third-party package surfaces change.

- [ ] **Step 6: Update task record and handoff**

Update `todo.md` with Explorer result, verification evidence, security gate results or blockers, final matrix statuses, and residual risks.

## Self-Review

- No placeholder paths remain.
- Acceptance criteria map to Task 1 tests and Task 2 implementation.
- No plan step requires remote operations.
- No dependency changes are planned.
