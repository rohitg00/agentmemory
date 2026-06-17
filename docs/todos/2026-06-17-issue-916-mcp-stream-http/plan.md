# MCP Streamable HTTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrow Streamable HTTP MCP endpoint to the existing agentmemory REST surface for MCP clients that can connect over HTTP instead of spawning the stdio shim.

**Architecture:** Register `/agentmemory/mcp` through the existing iii HTTP trigger system in `src/mcp/server.ts`. The endpoint parses JSON-RPC request objects and delegates `tools/list` and `tools/call` to the already-registered MCP handlers so tool validation, auth semantics, and response shapes stay consistent. It returns JSON responses only; GET/SSE is explicitly unsupported with HTTP 405.

**Tech Stack:** TypeScript, ESM, iii-sdk `registerFunction`/`registerTrigger`, Vitest, existing MCP tool registry and server handlers.

---

## Scope Notes

- Spec path: none. The approved scope is the user-approved re-scope plus `todo.md`.
- Task state path: `docs/todos/2026-06-17-issue-916-mcp-stream-http/todo.md`
- Plan path: `docs/todos/2026-06-17-issue-916-mcp-stream-http/plan.md`
- GitHub PR prep is mandatory after implementation. It may prepare the local branch only; fetch, push, and PR creation still require separate current-turn approval.
- Security-sensitive surface for push prep: protocol parsing, auth, Origin validation, HTTP routing, and MCP tool dispatch.

## File Map

- Modify `src/mcp/server.ts`: add Streamable HTTP request helpers, register `/agentmemory/mcp`, and delegate methods to existing MCP handlers.
- Create `test/mcp-streamable-http.test.ts`: focused behavior tests for initialize, notifications, tools/list, tools/call, auth, Origin validation, and unsupported GET/DELETE.
- Modify `test/mcp-server-surface.test.ts`: keep the stable MCP route registration assertions aligned with the new handlers.
- Modify `README.md`: document the Streamable HTTP endpoint on the existing REST port and explain the port decision.
- Modify `docs/todos/2026-06-17-issue-916-mcp-stream-http/todo.md`: keep progress and verification evidence current.

## Task 1: Add Failing Streamable HTTP Tests

**Files:**
- Create: `test/mcp-streamable-http.test.ts`
- Modify: `docs/todos/2026-06-17-issue-916-mcp-stream-http/todo.md`

- [x] **Step 1: Write failing tests for the new endpoint**

Create `test/mcp-streamable-http.test.ts` with tests that build the same `registerMcpEndpoints` harness pattern used by `test/mcp-server-surface.test.ts`. The first test should expect these additional triggers after registration:

```ts
expect(h.triggers).toContainEqual({
  type: "http",
  function_id: "mcp::streamable",
  config: { api_path: "/agentmemory/mcp", http_method: "POST" },
});
expect(h.triggers).toContainEqual({
  type: "http",
  function_id: "mcp::streamable::get",
  config: { api_path: "/agentmemory/mcp", http_method: "GET" },
});
expect(h.triggers).toContainEqual({
  type: "http",
  function_id: "mcp::streamable::delete",
  config: { api_path: "/agentmemory/mcp", http_method: "DELETE" },
});
```

Add behavior tests:

```ts
await expect(h.stream({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26" },
})).resolves.toMatchObject({
  status_code: 200,
  headers: { "Content-Type": "application/json" },
  body: {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "agentmemory" },
    },
  },
});

await expect(h.stream({
  jsonrpc: "2.0",
  method: "notifications/initialized",
})).resolves.toMatchObject({
  status_code: 202,
  body: null,
});

const listed = await h.stream({
  jsonrpc: "2.0",
  id: "tools",
  method: "tools/list",
});
expect((listed.body as { result: { tools: Array<{ name: string }> } }).result.tools)
  .toEqual((await h.listTools()).body.tools);

const called = await h.stream({
  jsonrpc: "2.0",
  id: "call",
  method: "tools/call",
  params: { name: "memory_timeline", arguments: { anchor: "2026-06-17" } },
});
expect(called.status_code).toBe(200);
expect(h.triggerCalls.at(-1)).toEqual({
  function_id: "mem::timeline",
  payload: { anchor: "2026-06-17", before: 5, after: 5 },
});
```

Add boundary tests:

```ts
await expect(h.stream({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}))
  .resolves.toMatchObject({ status_code: 401, body: { error: "unauthorized" } });

await expect(h.stream(
  { jsonrpc: "2.0", id: 1, method: "tools/list" },
  { authorization: "Bearer secret", origin: "http://attacker.invalid" },
)).resolves.toMatchObject({ status_code: 403 });

await expect(h.streamGet()).resolves.toMatchObject({
  status_code: 405,
  headers: { Allow: "POST" },
});

await expect(h.streamDelete()).resolves.toMatchObject({
  status_code: 405,
  headers: { Allow: "POST" },
});
```

Also add JSON-RPC error and Origin boundary coverage:

- Unknown methods return HTTP 200 with JSON-RPC error code `-32601`.
- Invalid `tools/call` params return HTTP 200 with JSON-RPC error code `-32602`.
- Existing helper-handler errors, such as unknown tool names, are mapped to JSON-RPC errors.
- Missing `Origin` is allowed, loopback origins such as `localhost` and `127.0.0.1` are allowed, and malformed/non-loopback origins are rejected.

- [x] **Step 2: Run the new tests and verify RED**

Run: `corepack pnpm exec vitest run test/mcp-streamable-http.test.ts`

Expected: FAIL because `mcp::streamable`, `mcp::streamable::get`, and `mcp::streamable::delete` are not registered yet.

## Task 2: Implement the Streamable HTTP Endpoint

**Files:**
- Modify: `src/mcp/server.ts`
- Test: `test/mcp-streamable-http.test.ts`
- Test: `test/mcp-server-surface.test.ts`

- [x] **Step 1: Extract local handler constants in `registerMcpEndpoints`**

Inside `registerMcpEndpoints`, turn the existing `mcp::tools::list` inline handler into:

```ts
const handleToolsList = async (req: ApiRequest): Promise<McpResponse> => {
  const authErr = checkAuth(req, secret);
  if (authErr) return authErr;
  return { status_code: 200, body: { tools: getVisibleTools() } };
};
sdk.registerFunction("mcp::tools::list", handleToolsList);
```

Turn the existing `mcp::tools::call` inline handler into:

```ts
const handleToolsCall = async (
  req: ApiRequest<{ name: string; arguments: Record<string, unknown> }>,
): Promise<McpResponse> => {
  // keep the existing body unchanged
};
sdk.registerFunction("mcp::tools::call", handleToolsCall);
```

- [x] **Step 2: Add JSON-RPC helpers near the top of `src/mcp/server.ts`**

Add types and helpers:

```ts
type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

function jsonRpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isValidJsonRpcId(id: unknown): id is JsonRpcId | undefined {
  return id === undefined || id === null || typeof id === "string" || typeof id === "number";
}
```

- [x] **Step 3: Implement `handleStreamablePost`**

Inside `registerMcpEndpoints`, add a handler that:

```ts
const handleStreamablePost = async (req: ApiRequest): Promise<McpResponse> => {
  const authErr = checkAuth(req, secret);
  if (authErr) return authErr;
  const originErr = checkStreamableOrigin(req);
  if (originErr) return originErr;

  const message = req.body as JsonRpcMessage;
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return streamJson(400, jsonRpcError(null, -32600, "Invalid Request"));
  }
  if (!isValidJsonRpcId(message.id)) {
    return streamJson(400, jsonRpcError(null, -32600, "Invalid Request: id must be string, number, or null"));
  }
  if (message.id === undefined || message.id === null) {
    return { status_code: 202, headers: { "Content-Type": "application/json" }, body: null };
  }
  if (typeof message.method !== "string") {
    return streamJson(400, jsonRpcError(message.id, -32600, "Invalid Request"));
  }

  const result = await handleStreamableMethod(message.method, message.params, req.headers || {});
  return streamJson(200, { jsonrpc: "2.0", id: message.id, result });
};
```

Implement `handleStreamableMethod` to return:

```ts
case "initialize":
  return {
    protocolVersion: "2025-03-26",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "agentmemory", version: VERSION },
  };
case "notifications/initialized":
  return {};
case "tools/list":
  return (await handleToolsList({ body: undefined, headers, query_params: {} } as ApiRequest)).body;
case "tools/call":
  // validate params is an object with name, then call handleToolsCall
```

Unknown methods should return a JSON-RPC error body with code `-32601`.

- [x] **Step 4: Register POST, GET, and DELETE triggers**

Register:

```ts
sdk.registerFunction("mcp::streamable", handleStreamablePost);
sdk.registerTrigger({
  type: "http",
  function_id: "mcp::streamable",
  config: { api_path: "/agentmemory/mcp", http_method: "POST" },
});

const streamableMethodNotAllowed = async (): Promise<McpResponse> => ({
  status_code: 405,
  headers: { Allow: "POST", "Content-Type": "application/json" },
  body: { error: "SSE is not supported; use POST for Streamable HTTP JSON-RPC" },
});
```

Register GET and DELETE to `streamableMethodNotAllowed`.

- [x] **Step 5: Run the focused test and verify GREEN**

Run: `corepack pnpm exec vitest run test/mcp-streamable-http.test.ts`

Expected: PASS.

## Task 3: Docs and Existing MCP Regression Checks

**Files:**
- Modify: `README.md`
- Modify: `docs/todos/2026-06-17-issue-916-mcp-stream-http/todo.md`
- Test: `test/mcp-server-surface.test.ts`, `test/mcp-transport.test.ts`, `test/mcp-standalone.test.ts`, `test/consistency.test.ts`

- [x] **Step 1: Update README MCP section**

Add a short subsection under `### Standalone MCP`:

```md
### Streamable HTTP MCP

Clients that support MCP Streamable HTTP can connect to the running agentmemory server at:

`http://localhost:3111/agentmemory/mcp`

This endpoint uses the existing agentmemory REST worker and bearer-token rules. If `AGENTMEMORY_SECRET` is set, send `Authorization: Bearer <secret>`. This fork intentionally serves Streamable HTTP on the existing REST port instead of opening a separate `3114` listener, so MCP stays inside the iii worker/function/trigger architecture and `3114` remains available for `iii console` examples.
```

- [x] **Step 2: Run existing MCP regression tests**

Run:

```bash
corepack pnpm exec vitest run test/mcp-streamable-http.test.ts test/mcp-server-surface.test.ts test/mcp-transport.test.ts test/mcp-standalone.test.ts test/consistency.test.ts
corepack pnpm run build
```

Expected: PASS.

## Task 4: Focused Cleanup, Review, and GitHub Push Prep

**Files:**
- Modify only active task-owned files if findings require it.

- [x] **Step 1: Run simple-code cleanup pass**

Inspect the active diff only. Remove duplicated helper logic and comments that restate code. Do not change protocol, auth, route, schema, or tool behavior.

- [x] **Step 2: Run final targeted verification**

Run the focused regression command from Task 3 again after cleanup.

- [x] **Step 3: Run required security gates for protocol/auth changes**

Run repo-native or direct required gates as available:

```bash
semgrep scan --config p/default --error --metrics=off .
```

If staging for commit:

```bash
gitleaks protect --staged --redact
```

Run OSV only if dependency, lockfile, container, or vendored surfaces changed. This plan should not change those surfaces.

- [ ] **Step 4: Commit scoped changes**

Stage only task-owned files:

```bash
git add src/mcp/server.ts test/mcp-streamable-http.test.ts test/mcp-server-surface.test.ts README.md docs/todos/2026-06-17-issue-916-mcp-stream-http/todo.md docs/todos/2026-06-17-issue-916-mcp-stream-http/plan.md
git commit -m "feat: add streamable HTTP MCP endpoint"
```

- [ ] **Step 5: Run GitHub push prep local branch phase**

Use local `origin/main` unless the user explicitly approves `git fetch origin main`. Do not push or create a PR without separate current-turn approval.

## Self-Review

- Spec coverage: no separate spec exists; the plan covers the approved re-scope from the task record.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: Streamable response uses the same `McpResponse` shape as existing MCP route handlers.
- Safety check: the plan avoids upstream's separate listener and Docker rewrite.
