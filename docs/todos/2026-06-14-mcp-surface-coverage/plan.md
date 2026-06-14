# MCP Surface Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise scoped V8 coverage for `src/mcp/**` above 80% while preserving the MCP API/tool contract.

**Architecture:** Exercise the registered MCP HTTP functions through the public `registerMcpEndpoints()` integration point with mocked `sdk.trigger` and an in-memory test KV. Cover representative success, validation, fallback, and contract paths instead of adding test-only exports. Use existing standalone/proxy and transport tests for the shim and stdio boundary, adding focused boundary cases only where the coverage report shows meaningful gaps.

**Tech Stack:** TypeScript, ESM, Vitest, V8 coverage, mocked iii-sdk-compatible SDK objects, project-native npm scripts.

---

## File Structure

- Create or extend `test/mcp-server-surface.test.ts`: MCP server registration, tools/call validation and payload shaping, resources/read, prompts/get, and auth behavior.
- Extend `test/mcp-standalone-proxy.test.ts` only if standalone/proxy coverage remains below target after server tests.
- Extend `test/mcp-transport.test.ts` only if transport coverage remains below target after server tests.
- Modify `src/mcp/**` only when a new failing test demonstrates an actual behavior bug.
- Update `docs/todos/2026-06-14-mcp-surface-coverage/todo.md` after each material phase.

## Tasks

### Task 1: Add MCP Server Harness And Red Tests

- [ ] Write a helper that calls `registerMcpEndpoints()` with mocked `registerFunction`, `registerTrigger`, `trigger`, and KV methods, then captures registered function handlers by id.
- [ ] Add tool validation red cases for required argument failures and malformed optional values.
- [ ] Add tool success red cases for payload shaping across string/CSV/list/number/boolean/JSON branches.
- [ ] Add resources and prompts red cases for list/read/get contracts, missing args, URI decoding failures, and fallback text on disabled optional modules.
- [ ] Run targeted Vitest and confirm at least one new assertion fails before production changes.

### Task 2: Fix Only Demonstrated Bugs

- [ ] If any new test exposes a production bug, patch the narrow MCP source branch only.
- [ ] Re-run the targeted test immediately after each patch.
- [ ] If all new tests pass without production changes, keep the diff test-only.

### Task 3: Coverage Closure

- [ ] Run the scoped MCP coverage command with thresholds neutralized and parse `coverage/mcp-after/coverage-summary.json`.
- [ ] If any required metric is below 80%, add another behavioral test against the uncovered meaningful path and repeat red/green.
- [ ] Record before/after coverage in `todo.md`.

### Task 4: Full Verification And Commit

- [ ] Run targeted MCP tests.
- [ ] Run `npm test`.
- [ ] Run `npm run coverage`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run skills:check`.
- [ ] Run Semgrep for code/MCP changes.
- [ ] Stage only task-owned files and run `gitleaks protect --staged --redact`.
- [ ] Commit with a factual Conventional Commit message.

## Self-Review

- Spec coverage: Plan covers scoped MCP source, tool validation, proxy/local fallback via existing plus optional tests, transport edges, resources/prompts contracts, coverage measurement, and requested verification.
- Placeholder scan: No `TBD`/`TODO` placeholders; optional test extension is gated by measured coverage.
- Boundary check: No MCP contract change is planned; any production change requires a failing behavioral test first.
