# agentmemory — Agent Instructions

## Architecture

agentmemory is a persistent memory system for AI coding agents, built on iii-engine's three primitives (Worker/Function/Trigger). Everything goes through `registerFunction`/`registerTrigger`/`sdk.trigger()` — never bypass iii-engine with standalone SQLite or in-process alternatives.

- **Engine**: iii-sdk (WebSocket to iii-engine on port 49134)
- **State**: File-based SQLite via iii-engine's StateModule (`./data/state_store.db`)
- **Build**: TypeScript → ESM via tsdown, output to `dist/`
- **Test**: vitest (`npm test` excludes integration tests)

## Consistency Rules

**When adding or removing MCP tools, you MUST update ALL of the following:**
1. `src/mcp/tools-registry.ts` — tool definition + `getAllTools()` array
2. `src/mcp/server.ts` — handler case in the `mcp::tools::call` switch
3. `src/triggers/api.ts` — REST endpoint registration
4. `src/index.ts` — function registration + endpoint count in the log line
5. `test/mcp-standalone.test.ts` — tool count assertion
6. `README.md` — tool counts (search for "MCP tools")
7. `plugin/.claude-plugin/plugin.json` — tool count in description

**When adding REST endpoints, you MUST update:**
1. `src/triggers/api.ts` — endpoint registration
2. `src/index.ts` — endpoint count in the log line
3. `README.md` — endpoint count (search for "REST endpoints" and "endpoints on port")

**When bumping version, you MUST update ALL of the following:**
1. `package.json` — version field
2. `src/version.ts` — VERSION constant and type union
3. `src/types.ts` — ExportData version union
4. `src/functions/export-import.ts` — supportedVersions set
5. `test/export-import.test.ts` — version assertion
6. `plugin/.claude-plugin/plugin.json` — version field

**When adding new KV scopes:**
1. `src/state/schema.ts` — add to the KV object
2. `src/types.ts` — add the corresponding interface

**When adding new audit operations:**
1. `src/types.ts` — add to AuditEntry.operation union type

## Code Patterns

### Function Registration
```typescript
sdk.registerFunction(
  { id: "mem::your-function" },
  async (data: { ... }) => {
    // validate inputs
    // do work via kv.get/kv.set/kv.list
    // record audit via recordAudit()
    return { success: true, ... };
  },
);
```

### REST Endpoint Registration
```typescript
sdk.registerFunction({ id: "api::your-endpoint" }, async (req: ApiRequest) => {
  const denied = checkAuth(req, secret);
  if (denied) return denied;
  const body = req.body as Record<string, unknown>;
  // validate + whitelist fields (never pass raw body to sdk.trigger)
  const result = await sdk.trigger("mem::your-function", { ... });
  return { status_code: 200, body: result };
});
sdk.registerTrigger({
  type: "http",
  function_id: "api::your-endpoint",
  config: { api_path: "/agentmemory/your-path", http_method: "POST" },
});
```

### MCP Tool Handler
```typescript
case "memory_your_tool": {
  // validate args with typeof checks
  // parse CSV args: args.field.split(",").map(t => t.trim()).filter(Boolean)
  const result = await sdk.trigger("mem::your-function", { ... });
  return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
}
```

### Hook Scripts
Hook scripts in `src/hooks/` are standalone Node.js scripts (no iii-sdk import). They read JSON from stdin, make HTTP calls to the REST API, and exit. Always use `try/catch` with `AbortSignal.timeout()` for best-effort calls.

## Coding Standards

- TypeScript, ESM only (`"type": "module"`)
- No code comments explaining WHAT — use clear naming instead
- Use `fingerprintId()` for content-addressable dedup, `generateId()` for unique IDs
- Parallel operations where possible (`Promise.all` for independent kv writes/reads)
- Input validation at system boundaries (MCP handlers, REST endpoints)
- REST endpoints must whitelist fields — never pass raw request body to `sdk.trigger()`
- Use `recordAudit()` for state-changing operations
- Timestamps: capture once with `new Date().toISOString()` and reuse

## Testing

- All tests must pass before PR: `npm test` (573+ tests)
- Mock pattern: `vi.mock("iii-sdk")` with mock `sdk.trigger`, `kv.get/set/list`
- Test files go in `test/` with `.test.ts` extension
- Follow existing patterns in `test/crystallize.test.ts` for function tests

## Current Stats (v0.7.0)

- 41 MCP tools (7 visible by default, `AGENTMEMORY_TOOLS=all` for all)
- 100 REST endpoints
- 6 MCP resources, 3 MCP prompts
- 12 hooks, 4 skills
- 50+ iii functions
- 573 tests
