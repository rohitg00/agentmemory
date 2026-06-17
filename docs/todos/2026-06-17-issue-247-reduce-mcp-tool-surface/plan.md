# Reduce MCP Tool Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default MCP `tools/list` surface the 8-tool core set while preserving the full 56-tool opt-in and direct legacy tool calls.

**Architecture:** Keep the existing registry split between `getAllTools()` and `getVisibleTools()`. Change only the default visibility mode and generated MCP env defaults, then update tests and documentation to define `core` as the default and `all` as the explicit full-surface mode. Do not add a visibility gate to `mcp::tools::call`; callability remains controlled by the existing handler switch.

**Tech Stack:** TypeScript, ESM, Vitest, JSON plugin manifests, Markdown documentation, existing pnpm project scripts.

---

## File Structure

- Modify `src/mcp/tools-registry.ts`: change the default mode in `getVisibleTools()` from `all` to `core` and update the nearby rationale comment.
- Modify `src/cli.ts`: update help text and invalid `--tools` fallback wording so unset/default means `core`.
- Modify `src/cli/connect/util.ts`: change generated MCP env interpolation from `${AGENTMEMORY_TOOLS:-all}` to `${AGENTMEMORY_TOOLS:-core}`.
- Modify `plugin/.mcp.json` and `plugin/.mcp.copilot.json`: change static plugin MCP env defaults to `${AGENTMEMORY_TOOLS:-core}`.
- Modify `.env.example`, `README.md`, `INSTALL_FOR_AGENTS.md`, `plugin/skills/agentmemory-config/SKILL.md`, `scripts/skills/generate.ts`, and generated `plugin/skills/agentmemory-mcp-tools/REFERENCE.md`: document core-by-default and `AGENTMEMORY_TOOLS=all` / `--tools all` for the full 56-tool surface.
- Modify `test/mcp-surface-default.test.ts`, `test/mcp-server-surface.test.ts`, `test/tool-count-consistency.test.ts`, `test/cli-connect.test.ts`, `test/connect-new-agents.test.ts`, and `test/copilot-plugin.test.ts`: update the default visibility and config-default assertions and prove non-core direct callability.

## Tasks

### Task 1: Flip Registry And CLI Defaults

**Files:**
- Modify: `src/mcp/tools-registry.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Update the failing default-surface assertions first**

In `test/mcp-surface-default.test.ts`, change the default test to assert the core set:

```ts
it("default returns the 8 essential tools", () => {
  const visible = getVisibleTools();
  const names = new Set(visible.map((t) => t.name));
  expect(names).toEqual(new Set([...ESSENTIAL_TOOLS]));
});
```

Expected first run before implementation:

```bash
corepack pnpm exec vitest run test/mcp-surface-default.test.ts --exclude test/integration.test.ts
```

Expected: FAIL because unset `AGENTMEMORY_TOOLS` still returns all tools.

- [ ] **Step 2: Change `getVisibleTools()` default mode**

In `src/mcp/tools-registry.ts`, use:

```ts
const mode = process.env["AGENTMEMORY_TOOLS"] || "core";
```

Keep `mode === "all"` returning `getAllTools()` and `mode === "core"` returning the essential filter.

- [ ] **Step 3: Update CLI help and invalid value fallback**

In `src/cli.ts`, change the help line to:

```ts
--tools all|core   Tool visibility (default: core = ${CORE_TOOLS_COUNT} essentials; all = ${ALL_TOOLS_COUNT} tools)
```

Change the invalid `--tools` warning to say it falls back to `core`, and set invalid values to `core` before assigning `process.env["AGENTMEMORY_TOOLS"]`.

- [ ] **Step 4: Verify targeted surface test**

Run:

```bash
corepack pnpm exec vitest run test/mcp-surface-default.test.ts --exclude test/integration.test.ts
```

Expected: PASS, including default core and `AGENTMEMORY_TOOLS=all` full-surface assertions.

### Task 2: Update MCP Config Defaults

**Files:**
- Modify: `src/cli/connect/util.ts`
- Modify: `plugin/.mcp.json`
- Modify: `plugin/.mcp.copilot.json`
- Modify: `test/cli-connect.test.ts`
- Modify: `test/connect-new-agents.test.ts`
- Modify: `test/copilot-plugin.test.ts`

- [ ] **Step 1: Change generated env defaults**

In `src/cli/connect/util.ts`, update both standard MCP block renderers:

```ts
AGENTMEMORY_TOOLS: "${AGENTMEMORY_TOOLS:-core}",
```

- [ ] **Step 2: Change static plugin MCP defaults**

In `plugin/.mcp.json` and `plugin/.mcp.copilot.json`, set:

```json
"AGENTMEMORY_TOOLS": "${AGENTMEMORY_TOOLS:-core}"
```

- [ ] **Step 3: Update config tests**

Replace assertions that expect or regex-match `${AGENTMEMORY_TOOLS:-all}` with `${AGENTMEMORY_TOOLS:-core}` in:

```text
test/cli-connect.test.ts
test/connect-new-agents.test.ts
test/copilot-plugin.test.ts
test/mcp-surface-default.test.ts
```

- [ ] **Step 4: Verify generated/static config tests**

Run:

```bash
corepack pnpm exec vitest run test/cli-connect.test.ts test/connect-new-agents.test.ts test/copilot-plugin.test.ts test/mcp-surface-default.test.ts --exclude test/integration.test.ts
```

Expected: PASS.

### Task 3: Update Documentation And Consistency Tests

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `INSTALL_FOR_AGENTS.md`
- Modify: `scripts/skills/generate.ts`
- Modify: `plugin/skills/agentmemory-config/SKILL.md`
- Modify: `plugin/skills/agentmemory-mcp-tools/REFERENCE.md`
- Modify: `test/tool-count-consistency.test.ts`

- [ ] **Step 1: Update docs wording**

Use this contract consistently:

```text
Default MCP discovery exposes the 8 core tools. Set AGENTMEMORY_TOOLS=all
or pass --tools all to expose the full 56-tool surface.
```

Keep "56 MCP tools" where the text describes available tools, badges, or the
full opt-in surface.

- [ ] **Step 2: Update generated skill docs source**

In `scripts/skills/generate.ts`, change the MCP tools reference intro so it says the core set is the default and the rest load with `--tools all` or `AGENTMEMORY_TOOLS=all`.

Run:

```bash
corepack pnpm run skills:gen
```

Expected: generated `plugin/skills/agentmemory-mcp-tools/REFERENCE.md` matches the updated source wording.

- [ ] **Step 3: Update consistency test help expectation**

In `test/tool-count-consistency.test.ts`, update the CLI help assertion to:

```ts
"(default: core = ${CORE_TOOLS_COUNT} essentials; all = ${ALL_TOOLS_COUNT} tools)"
```

- [ ] **Step 4: Search for stale default references**

Run:

```bash
rg -n "default: all|all \\(56 tools, default\\)|AGENTMEMORY_TOOLS:-all|--tools all\\).*default|all.*default|\\(default\\).*all" README.md INSTALL_FOR_AGENTS.md .env.example plugin src test
```

Expected: no stale text claiming `all` is the default. Matches that explain `all` as an explicit opt-in are acceptable.

- [ ] **Step 5: Verify tool-count consistency**

Run:

```bash
corepack pnpm exec vitest run test/tool-count-consistency.test.ts --exclude test/integration.test.ts
```

Expected: PASS.

### Task 4: Focused Review, Verification, And PR Prep

**Files:**
- Modify: `test/mcp-server-surface.test.ts`
- Update: `docs/todos/2026-06-17-issue-247-reduce-mcp-tool-surface/todo.md`

- [ ] **Step 1: Add direct-callability regression**

In `test/mcp-server-surface.test.ts`, add a targeted regression proving default `tools/list` hides a non-core tool such as `memory_timeline`, while `tools/call` still dispatches that tool through the existing switch.

- [ ] **Step 2: Run targeted test set**

Run:

```bash
corepack pnpm exec vitest run test/mcp-surface-default.test.ts test/mcp-server-surface.test.ts test/tool-count-consistency.test.ts test/cli-connect.test.ts test/connect-new-agents.test.ts test/copilot-plugin.test.ts --exclude test/integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repo-native checks**

Run:

```bash
corepack pnpm test
corepack pnpm run lint
corepack pnpm run skills:check
```

Expected: PASS, or record dependency/setup blockers and closest targeted alternatives.

- [ ] **Step 4: Run mandatory security scans for protocol/config/doc changes**

Run:

```bash
semgrep scan --config p/default --error --metrics=off .
```

Expected: PASS with no findings. OSV is not required unless dependency, lockfile, container, vendored, or package-surface files change.

- [ ] **Step 5: Stage and run staged secret scan**

Stage only task-owned files, then run:

```bash
gitleaks protect --staged --redact
```

Expected: PASS with no leaks.

- [ ] **Step 6: Commit locally**

Commit with:

```bash
git commit -m "fix: reduce default MCP tool surface"
```

Expected: local commit created on `github-pr/issue-247-reduce-mcp-surface-fe927dc`. Do not push or create a PR without separate current-turn confirmation.

## Self-Review

- Spec coverage: Covers the approved issue #247 behavior, config defaults, docs, tests, verification, and PR-flow boundaries.
- Placeholder scan: No placeholders remain; every task names exact files and commands.
- Boundary check: The plan changes only MCP discovery defaults and generated config defaults. It explicitly preserves `tools/call` dispatch and avoids dependency, REST, auth, storage, and schema changes.
