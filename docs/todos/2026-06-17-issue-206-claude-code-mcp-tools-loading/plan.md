# Issue 206 Claude Code MCP Tools Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue #206 by making the standalone MCP shim negotiate Claude Code's requested `2025-03-26` MCP protocol version during initialization.

**Architecture:** The standalone MCP server already owns the JSON-RPC `initialize` response inside `src/mcp/standalone.ts`. Keep the default protocol version for clients that do not provide a supported one, and allow the issue-evidenced Claude Code version `2025-03-26` so it is not downgraded to `2024-11-05`. The placeholder URL guard in `src/mcp/rest-proxy.ts` is already present and stays unchanged.

**Tech Stack:** TypeScript ESM, vitest, pnpm via corepack, local stdio MCP transport helpers.

---

## Source Of Truth

- User request: fix or clearly block fork GitHub issue #206 using `github-feature-loop`.
- Task record: `docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/todo.md`
- Spec path: none.
- Remote freshness: no fetch approved; use existing local `origin/main` only.

## File Structure

- Modify `src/mcp/standalone.ts`: add a tiny helper for protocol-version negotiation and call it from the `initialize` handler.
- Modify `test/mcp-standalone.test.ts`: add regression tests that invoke the standalone handler through the mocked transport factory.
- Modify `docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/todo.md`: keep progress, verification evidence, review notes, and matrix status current.

## Security-Sensitive Surface For Push Prep

This touches MCP protocol handling. It does not touch auth, secrets, dependencies, filesystem access, persistence, or plugin exposure. Because protocol handling is in scope, the final local prep must include Semgrep or a recorded missing-tool/network blocker, plus staged Gitleaks before commit.

## Task 1: Regression Test

**Files:**

- Modify: `test/mcp-standalone.test.ts`

- [x] **Step 1: Add a RED test for client-requested protocol negotiation**

Add `createStdioTransport` to the existing import list from `../src/mcp/transport.js` and add this test block after the `fetchTrap` declaration:

```ts
describe("standalone initialize protocol negotiation", () => {
  it("echoes Claude Code's requested MCP protocol version", async () => {
    const transportFactory = vi.mocked(createStdioTransport);
    const handler = transportFactory.mock.calls[0][0];

    const result = await handler("initialize", {
      protocolVersion: "2025-03-26",
    });

    expect(result).toMatchObject({
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "agentmemory" },
    });
  });

  it("keeps the default MCP protocol version when the client omits it", async () => {
    const transportFactory = vi.mocked(createStdioTransport);
    const handler = transportFactory.mock.calls[0][0];

    const result = await handler("initialize", {});

    expect(result).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "agentmemory" },
    });
  });

  it("keeps the default MCP protocol version when the client sends a non-string value", async () => {
    const transportFactory = vi.mocked(createStdioTransport);
    const handler = transportFactory.mock.calls[0][0];

    const result = await handler("initialize", {
      protocolVersion: 20250326,
    });

    expect(result).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "agentmemory" },
    });
  });

  it("still returns the tools/list shape after negotiating Claude Code's protocol version", async () => {
    const transportFactory = vi.mocked(createStdioTransport);
    const handler = transportFactory.mock.calls[0][0];

    await handler("initialize", { protocolVersion: "2025-03-26" });
    const result = await handler("tools/list", {});

    expect(result).toMatchObject({
      tools: expect.any(Array),
    });
    expect((result as { tools: unknown[] }).tools.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
corepack pnpm exec vitest run test/mcp-standalone.test.ts
```

Expected: the first new test fails because `protocolVersion` is still `"2024-11-05"` when the client requested `"2025-03-26"`. If `node_modules` is missing or pnpm reports ignored-build hardening, run:

```bash
corepack pnpm install --frozen-lockfile --ignore-scripts
```

Then rerun the focused test.

## Task 2: Minimal MCP Initialize Fix

**Files:**

- Modify: `src/mcp/standalone.ts`

- [x] **Step 1: Add protocol negotiation helper**

Add this constant and helper after `SERVER_INFO`:

```ts
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  SERVER_INFO.protocolVersion,
  "2025-03-26",
]);

function negotiatedProtocolVersion(params: Record<string, unknown>): string {
  const requested = params["protocolVersion"];
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
    ? requested
    : SERVER_INFO.protocolVersion;
}
```

- [x] **Step 2: Use helper in `initialize`**

Change the `initialize` handler from:

```ts
protocolVersion: SERVER_INFO.protocolVersion,
```

to:

```ts
protocolVersion: negotiatedProtocolVersion(params),
```

- [x] **Step 3: Run focused test and verify GREEN**

Run:

```bash
corepack pnpm exec vitest run test/mcp-standalone.test.ts
```

Expected: `test/mcp-standalone.test.ts` passes.

- [x] **Step 4: Run protocol-handling security gate**

Run:

```bash
semgrep scan --config p/default --error --metrics=off .
```

Expected: pass with 0 findings. If Semgrep is missing or network access is unavailable, record the exact blocker in the task record and do not install tooling without approval.

## Task 3: Cleanup, Review, And Handoff Prep

**Files:**

- Modify: `docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/todo.md`

- [x] **Step 1: Inspect diff**

Run:

```bash
git diff -- src/mcp/standalone.ts test/mcp-standalone.test.ts docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/todo.md docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/plan.md
```

Expected: only task-owned files changed.

- [x] **Step 2: Run final targeted verification**

Run:

```bash
corepack pnpm exec vitest run test/mcp-standalone.test.ts
```

Expected: pass.

- [x] **Step 3: Update task record**

Update the Feature / Verification Matrix with command evidence and add final review notes. If a real Claude Code plugin session was not run, record that as a local reproduction limit, not as a pass.

- [x] **Step 4: Prepare local commit**

Stage only task-owned files:

```bash
git add src/mcp/standalone.ts test/mcp-standalone.test.ts docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/todo.md docs/todos/2026-06-17-issue-206-claude-code-mcp-tools-loading/plan.md
```

Run staged secret scan:

```bash
gitleaks protect --staged --redact
```

Commit:

```bash
git commit -m "fix: negotiate standalone mcp protocol version"
```

Expected: local commit created. No push or PR creation without explicit approval.

## Self-Review

- Spec coverage: The issue's still-plausible local root cause is covered by Task 1 and Task 2. The already-present placeholder guard is recorded but not changed.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: `params` is already passed to the transport handler as `Record<string, unknown>`, matching the helper signature.
