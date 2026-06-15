# MCP Proxy Timeout Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the Issue 866 / PR 867 timeout fix only if local evidence shows the fork still has the MCP proxy call timeout problem.

**Architecture:** Keep timeout parsing in `src/mcp/rest-proxy.ts` beside the existing probe timeout parser. Use the parsed value only for proxied tool calls; keep livez probe behavior separate. Raise shipped iii HTTP worker defaults consistently for local and Docker configs.

**Tech Stack:** TypeScript ESM, Vitest, YAML config, generated plugin skill environment reference.

---

### Task 1: Add MCP Proxy Call Timeout Parser

**Files:**
- Modify: `src/mcp/rest-proxy.ts`
- Test: `test/mcp-standalone-proxy.test.ts`

- [x] **Step 1: Add a default call timeout constant and parser**

```typescript
const DEFAULT_CALL_TIMEOUT_MS = 600_000;

function callTimeoutMs(): number {
  const raw = process.env["AGENTMEMORY_CALL_TIMEOUT_MS"];
  if (!raw) return DEFAULT_CALL_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CALL_TIMEOUT_MS;
}
```

- [x] **Step 2: Use the parser for proxied REST calls**

```typescript
signal: AbortSignal.timeout(callTimeoutMs()),
```

- [x] **Step 3: Add targeted tests**

```typescript
it("AGENTMEMORY_CALL_TIMEOUT_MS overrides the default proxy call timeout", async () => {
  process.env["AGENTMEMORY_FORCE_PROXY"] = "1";
  process.env["AGENTMEMORY_CALL_TIMEOUT_MS"] = "50";
  let timeoutSignal: AbortSignal | undefined;
  installFetch((url, init) => {
    timeoutSignal = init?.signal ?? undefined;
    if (url.endsWith("/agentmemory/sessions")) {
      return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });

  await handleToolCall("memory_sessions", {});

  expect(timeoutSignal).toBeDefined();
});
```

- [x] **Step 4: Run targeted test**

Run: `npx vitest run test/mcp-standalone-proxy.test.ts --exclude test/integration.test.ts`
Expected: pass.

### Task 2: Align Shipped HTTP Worker Defaults

**Files:**
- Modify: `iii-config.yaml`
- Modify: `iii-config.docker.yaml`

- [x] **Step 1: Raise HTTP default timeout in both configs**

```yaml
default_timeout: 600000
```

- [x] **Step 2: Inspect config diff**

Run: `git diff -- iii-config.yaml iii-config.docker.yaml`
Expected: only `default_timeout` changes from `180000` to `600000`.

### Task 3: Document Runtime Knob

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `plugin/skills/agentmemory-config/REFERENCE.md`

- [x] **Step 1: Add `.env.example` runtime knob**

```env
# AGENTMEMORY_CALL_TIMEOUT_MS=600000             # MCP shim proxied REST call timeout
```

- [x] **Step 2: Add README runtime knob**

```env
# AGENTMEMORY_CALL_TIMEOUT_MS=600000   # MCP shim proxied REST call timeout.
```

- [x] **Step 3: Refresh generated skill env reference if generator is available**

Run: `npm run skills:gen -- --check`
Expected: either the generated reference is current or the command reports the required generated diff.

### Task 4: Review, Security, And Prep

**Files:**
- Modify: `docs/todos/2026-06-15-issue-866-pr-867-mcp-timeout/todo.md`
- Modify coordinator list only if reachable.

- [x] **Step 1: Record decision and security review**

Record adapted import, manual security findings, verification evidence, and residual risk in `todo.md`.

- [x] **Step 2: Run targeted verification and required gates**

Run: targeted vitest, `git diff --check`, Semgrep, OSV if applicable, and Gitleaks staged scan before commit if staging occurs.

- [ ] **Step 3: Run `$prep-merge-to-local-main`**

Follow the skill workflow exactly and record the outcome.
