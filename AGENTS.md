# agentmemory — Agent Instructions

## Architecture

agentmemory is a persistent memory system for AI coding agents, built on iii-engine's three primitives (Worker/Function/Trigger). Everything goes through `registerFunction`/`registerTrigger`/`sdk.trigger()` — never bypass iii-engine with standalone SQLite or in-process alternatives.

- **Engine**: iii-sdk 0.22.1 with @iii-dev/helpers 0.22.1 (WebSocket to iii-engine 0.22.1 on port 49134; the client type is `IIIClient`, HTTP requests are `HttpRequest` from `@iii-dev/helpers/http`)
- **State**: File-based SQLite via iii-engine's StateModule (`./data/state_store.db`)
- **Build**: TypeScript → ESM via tsdown, output to `dist/`
- **Test**: vitest (`npm test` excludes integration tests)

## Consistency Rules

**Before every commit, run `npm run docs:sync` and commit what it changes.** It computes MCP tool counts (all, core, local fallback), REST endpoints, skills, hooks, tests, iii functions, source files, lines of code and KV scopes from the source, and rewrites them in README.md, the translated READMEs, AGENTS.md, INSTALL_FOR_AGENTS.md, plugin manifests, integration READMEs, the stat badges and the `src/index.ts` banner. The last synced values live in `scripts/docs-sync.state.json`; commit that file with the rest. `npm run docs:check` exits non-zero when anything is out of date. When the sync prints `check <fact> <old> left in <file>`, open that line: either fix it by hand or add its noun to the fact in `scripts/docs-sync.ts` so the next sync catches it. Never hand-edit these numbers or versions in the docs; change the source and sync.

**When adding or removing MCP tools, update:**
1. `src/mcp/tools-registry.ts` — tool definition + `getAllTools()` array
2. `src/mcp/server.ts` — handler case in the `mcp::tools::call` switch
3. `src/triggers/api.ts` — REST endpoint registration
4. `src/index.ts` — function registration
5. `test/mcp-standalone.test.ts` — tool count assertion

**When adding REST endpoints, update:**
1. `src/triggers/api.ts` — endpoint registration

**When bumping version, change only `package.json`.** `npm run docs:sync` carries the new version into `src/version.ts`, the `src/types.ts` ExportData union, the `supportedVersions` set in `src/functions/export-import.ts`, every plugin and package manifest that shared the old version, the deploy templates, the AGENTS.md stats heading, and CHANGELOG.md (the Unreleased section becomes the new version with today's date, plus its compare link).

**When adding new KV scopes:**
1. `src/state/schema.ts` — add to the KV object
2. `src/types.ts` — add the corresponding interface

**When adding new audit operations:**
1. `src/types.ts` — add to AuditEntry.operation union type

## Code Patterns

### Function Registration
```typescript
sdk.registerFunction(
  "mem::your-function",
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
import type { HttpRequest } from "@iii-dev/helpers/http";

sdk.registerFunction("api::your-endpoint", async (req: HttpRequest) => {
  const denied = checkAuth(req, secret);
  if (denied) return denied;
  const body = req.body as Record<string, unknown>;
  // validate + whitelist fields (never pass raw body to sdk.trigger)
  const result = await sdk.trigger({
    function_id: "mem::your-function",
    payload: { ... },
  });
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
  const result = await sdk.trigger({
    function_id: "mem::your-function",
    payload: { ... },
  });
  return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
}
```

### Hook Scripts
Hook scripts in `src/hooks/` are standalone Node.js scripts (no iii-sdk import). They read JSON from stdin, make HTTP calls to the REST API, and exit. There are two patterns depending on whether Claude Code consumes the script's stdout:

- **Context-injecting hooks** (`pre-tool-use`, `pre-compact`, `session-start`) write recalled context to stdout for Claude Code to inject. These MUST use `try/catch` with `await fetch(..., { signal: AbortSignal.timeout(N) })` — the script has to wait for the response before exiting, and the timeout is the only bound on hang time.
- **Telemetry-only hooks** (`notification`, `post-tool-failure`, `post-tool-use`, `prompt-submit`, `stop`, `session-end`, `subagent-start`, `subagent-stop`, `task-completed`) write nothing to stdout. These MUST use fire-and-forget `fetch(..., { signal: AbortSignal.timeout(N) }).catch(() => {})` paired with `setTimeout(() => process.exit(0), 500).unref()`. The unawaited fetch dispatches the request; the unref'd `setTimeout` force-exits the process after the request has been flushed to the local daemon's socket buffer (~500ms is enough for single-request hooks; use 1500ms for multi-request hooks like `stop` and `session-end` so all fetches have time to start, especially when `AGENTMEMORY_URL` points to a remote daemon). Without the `setTimeout` Node keeps the event loop alive waiting for any in-flight fetch to settle, which means the hook still blocks Claude Code's next-prompt boundary for up to the AbortSignal duration — exactly the bug fire-and-forget is meant to fix.

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

- Before every commit run, in order: `npm run build`, `npm run skills:gen`, `npm run docs:sync`, `npm run skills:check`, `npm test` (2,600+ tests). Commit anything the generators changed. CI runs the same build, skills check and tests.
- Before any npm publish: `npm run release:gate` must pass. It installs the packed tarballs into a clean home and runs capture, recovery, restart, export/import, MCP and status checks against the installed CLI (see CONTRIBUTING.md, Release process)
- Mock pattern: `vi.mock("iii-sdk")` with mock `sdk.trigger`, `kv.get/set/list`
- Test files go in `test/` with `.test.ts` extension
- Follow existing patterns in `test/crystallize.test.ts` for function tests

## Current Stats (v0.9.30)

- 54 MCP tools (8 visible by default, `AGENTMEMORY_TOOLS=all` for all)
- 138 REST endpoints
- 6 MCP resources, 3 MCP prompts
- 12 hooks, 17 skills
- 312+ iii functions
- 2,600+ tests
