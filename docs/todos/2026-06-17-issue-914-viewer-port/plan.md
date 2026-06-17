# Viewer Port Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Honor the documented viewer-port environment override when loading config and starting the viewer server.

**Architecture:** Keep REST as the runtime anchor, but add a first-class `viewerPort` to `AgentMemoryConfig`. `loadConfig()` derives `viewerPort` from `AGENTMEMORY_VIEWER_PORT`, then legacy `III_VIEWER_PORT`, then `restPort + 2`; startup passes that value into `startViewerServer()`.

**Tech Stack:** TypeScript ESM, Vitest, existing `loadConfig()` runtime-port tests.

---

## Sprint Contract

- Goal: fix the confirmed current residual from issue #914 validity review.
- Scope: `src/config.ts`, `src/types.ts`, `src/index.ts`, `test/multi-instance-port.test.ts`, and task notes.
- Non-goals: no GitHub fetch, push, PR creation, upstream PR work, auth/CORS/host-binding behavior changes, dependency changes, or runtime-port redesign beyond viewer-port config plumbing.
- Acceptance criteria:
  - `AgentMemoryConfig` includes `viewerPort`.
  - `loadConfig()` defaults `viewerPort` to `restPort + 2`.
  - `loadConfig()` honors `AGENTMEMORY_VIEWER_PORT` and then `III_VIEWER_PORT`.
  - Invalid viewer-port overrides, including partially numeric strings, fall back to `restPort + 2`.
  - `src/index.ts` starts the viewer with `config.viewerPort`.
- Intended verification:
  - Red test: `corepack pnpm exec vitest run test/multi-instance-port.test.ts`
  - Green targeted tests: `corepack pnpm exec vitest run test/multi-instance-port.test.ts test/runtime-ports-render.test.ts test/viewer-host.test.ts test/viewer-server-routing.test.ts`
  - Final broader targeted audit suite if reviews require it.
- Known boundaries:
  - Networking configuration is touched only to honor already documented local port env vars.
  - No host binding, auth, CORS, REST endpoint, storage, schema, or dependency behavior changes.
- Stop conditions:
  - A reviewer identifies an unresolved High/Medium plan gap.
  - The red test does not fail for missing `viewerPort` behavior.
  - The implementation requires broad runtime-port redesign or remote/state-changing actions.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Config exposes viewer port | `test/multi-instance-port.test.ts` | Complete | Red failed because `viewerPort` was undefined; green passed 13 tests. |
| Startup uses configured viewer port | Source inspection plus targeted runtime/viewer tests | Complete | `src/index.ts` now passes `config.viewerPort`; targeted runtime/viewer suite passed. |
| Existing runtime port rendering stays intact | `test/runtime-ports-render.test.ts` | Complete | Passed in targeted runtime/viewer suite. |
| Viewer server behavior unchanged | `test/viewer-host.test.ts`, `test/viewer-server-routing.test.ts` | Complete | Passed in targeted runtime/viewer suite. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Verification responsibility |
| --- | --- | --- | --- | --- |
| Plan review | Plan, task record, `src/config.ts`, `src/types.ts`, `src/index.ts`, runtime-port tests | No | High/Medium findings or `ACCEPT` | Lead triages findings before implementation. |

## File Structure

- Modify `test/multi-instance-port.test.ts`: add red tests proving `viewerPort` default, REST-derived default, explicit env overrides, legacy env overrides, and invalid override fallback.
- Modify `src/types.ts`: add `viewerPort: number` to `AgentMemoryConfig`.
- Modify `src/config.ts`: compute `viewerPort` with strict viewer-port parsing and return it in `loadConfig()`.
- Modify `src/index.ts`: pass `config.viewerPort` to `startViewerServer()`.

### Task 1: Add Failing Config Tests

**Files:**
- Modify: `test/multi-instance-port.test.ts`

- [x] **Step 1: Include viewer env vars in cleanup**

Add the two viewer env vars to `PORT_ENVS`:

```ts
const PORT_ENVS = [
  "III_REST_PORT",
  "III_STREAM_PORT",
  "III_STREAMS_PORT",
  "III_ENGINE_PORT",
  "III_ENGINE_URL",
  "AGENTMEMORY_VIEWER_PORT",
  "III_VIEWER_PORT",
] as const;
```

- [x] **Step 2: Add assertions and viewer-port-specific cases**

Update existing assertions and add these tests:

```ts
expect(cfg.viewerPort).toBe(3113);
```

```ts
it("relocating REST derives the viewer port from the same REST anchor", () => {
  process.env["III_REST_PORT"] = "3211";
  const cfg = loadConfig();
  expect(cfg.restPort).toBe(3211);
  expect(cfg.streamsPort).toBe(3212);
  expect(cfg.viewerPort).toBe(3213);
});

it("explicit AGENTMEMORY_VIEWER_PORT pins viewer without affecting REST, streams, or engine", () => {
  process.env["III_REST_PORT"] = "3211";
  process.env["AGENTMEMORY_VIEWER_PORT"] = "4400";
  const cfg = loadConfig();
  expect(cfg.restPort).toBe(3211);
  expect(cfg.streamsPort).toBe(3212);
  expect(cfg.viewerPort).toBe(4400);
  expect(cfg.engineUrl).toBe("ws://localhost:49134");
});

it("legacy III_VIEWER_PORT is honored when AGENTMEMORY_VIEWER_PORT is unset", () => {
  process.env["III_REST_PORT"] = "3211";
  process.env["III_VIEWER_PORT"] = "4500";
  const cfg = loadConfig();
  expect(cfg.viewerPort).toBe(4500);
});

it("AGENTMEMORY_VIEWER_PORT wins over legacy III_VIEWER_PORT", () => {
  process.env["AGENTMEMORY_VIEWER_PORT"] = "4400";
  process.env["III_VIEWER_PORT"] = "4500";
  const cfg = loadConfig();
  expect(cfg.viewerPort).toBe(4400);
});

it("invalid explicit viewer port falls back to the REST-derived viewer port", () => {
  process.env["III_REST_PORT"] = "3211";
  for (const [primary, legacy] of [
    ["not-a-port", "also-invalid"],
    ["4400abc", "4500abc"],
    ["1.5", "2.5"],
  ]) {
    process.env["AGENTMEMORY_VIEWER_PORT"] = primary;
    process.env["III_VIEWER_PORT"] = legacy;
    const cfg = loadConfig();
    expect(cfg.viewerPort).toBe(3213);
  }
});
```

- [x] **Step 3: Run red test**

Run:

```bash
corepack pnpm exec vitest run test/multi-instance-port.test.ts
```

Expected: FAIL because `viewerPort` is not present on `AgentMemoryConfig` / returned config.

Evidence: failed as expected with `expected undefined to be 3113` and related `viewerPort` assertions.

### Task 2: Implement Viewer-Port Config Plumbing

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`

- [x] **Step 1: Add config type field**

In `AgentMemoryConfig`, add:

```ts
viewerPort: number;
```

- [x] **Step 2: Add strict viewer-port parser**

Near `parsePort()`, add:

```ts
function parseStrictPort(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return parsePort(value);
}
```

This is intentionally used only for viewer-port env vars in this task so existing REST, streams, and engine parsing semantics do not change incidentally.

- [x] **Step 3: Parse viewer port in loadConfig**

After `streamsPort`, add:

```ts
const viewerPort =
  parseStrictPort(env["AGENTMEMORY_VIEWER_PORT"]) ??
  parseStrictPort(env["III_VIEWER_PORT"]) ??
  restPort + 2;
```

Then include `viewerPort` in the returned config object:

```ts
return {
  engineUrl,
  restPort,
  streamsPort,
  viewerPort,
  provider,
  tokenBudget: safeParseInt(env["TOKEN_BUDGET"], 2000),
  maxObservationsPerSession: safeParseInt(env["MAX_OBS_PER_SESSION"], 500),
  compressionModel: provider.compressModel ?? provider.model,
  dataDir: DATA_DIR,
};
```

- [x] **Step 4: Use configured viewer port at startup**

Replace:

```ts
const viewerPort = config.restPort + 2;
const viewerServer = startViewerServer(
  viewerPort,
  kv,
  sdk,
  secret,
  config.restPort,
);
```

with:

```ts
const viewerServer = startViewerServer(
  config.viewerPort,
  kv,
  sdk,
  secret,
  config.restPort,
);
```

- [x] **Step 5: Run green targeted tests**

Run:

```bash
corepack pnpm exec vitest run test/multi-instance-port.test.ts test/runtime-ports-render.test.ts test/viewer-host.test.ts test/viewer-server-routing.test.ts
```

Expected: PASS.

Evidence: passed 4 files / 65 tests.

### Task 3: Review, Simplify, And Prepare Local PR Branch

**Files:**
- Review active diff only.

- [x] **Step 1: Run focused simplification pass**

Inspect:

```bash
git diff -- src/config.ts src/types.ts src/index.ts test/multi-instance-port.test.ts
```

Expected: only task-owned viewer-port plumbing and tests are changed; no extra abstraction is needed.

Evidence: `git diff --check` clean; active diff is scoped to config/type/startup/test/task docs.

- [x] **Step 2: Run final targeted verification**

Run:

```bash
corepack pnpm exec vitest run test/multi-instance-port.test.ts test/runtime-ports-render.test.ts test/viewer-host.test.ts test/viewer-server-routing.test.ts test/api-boundary-coverage.test.ts test/hook-source-smoke.test.ts test/hooks-plaintext-http.test.ts test/events-boundary.test.ts test/context-injection.test.ts test/multimodal.test.ts
```

Expected: PASS.

Evidence: passed 10 files / 133 tests.

Security gate evidence: `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings. OSV was not applicable because no dependency, lockfile, package-manager, container, vendored, or third-party package surface changed.

- [ ] **Step 3: Stage and commit task-owned files**

Run:

```bash
git add docs/todos/2026-06-17-issue-914-viewer-port/todo.md docs/todos/2026-06-17-issue-914-viewer-port/plan.md test/multi-instance-port.test.ts src/types.ts src/config.ts src/index.ts
git diff --cached --name-status
git commit -m "fix: honor configured viewer port"
```

Expected: commit contains only task-owned files.

## Plan Self-Review

- Spec coverage: all acceptance criteria map to Task 1 and Task 2; local PR prep maps to Task 3.
- Placeholder scan: no placeholders are intentionally left.
- Type consistency: the plan uses one field name, `viewerPort`, across type, config, startup, and tests.
