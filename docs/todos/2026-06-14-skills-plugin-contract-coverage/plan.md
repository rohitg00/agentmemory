# Skills Plugin Contract Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise scoped skills, plugin, MCP package, and integration contract coverage above 80% and commit the result.

**Architecture:** Treat the affected files as contract surfaces, not runtime feature surfaces. Add tests that execute existing TypeScript scripts directly where possible and validate static manifests/package scripts with structured JSON parsing instead of string snapshots.

**Tech Stack:** TypeScript, Vitest, V8 coverage, Node `fs/path/child_process`, existing npm scripts.

---

## Sprint Contract

Goal, scope, non-goals, acceptance criteria, intended verification, boundaries, and stop conditions are recorded in `docs/todos/2026-06-14-skills-plugin-contract-coverage/todo.md`.

Spec path: none. Source of truth is the delegated user request plus repo `AGENTS.md`.

## File Structure

- Modify `vitest.config.ts` to include scoped non-`src` TypeScript/MJS/JS surfaces in coverage and keep exclusions focused.
- Add or modify `test/*plugin*.test.ts` and `test/*skill*.test.ts` for static contract coverage.
- Add or modify integration tests in the requested test files only when they cover `packages/mcp/**` or `integrations/**` contract surfaces.
- Update `docs/todos/2026-06-14-skills-plugin-contract-coverage/todo.md` after verification.

## Tasks

### Task 1: Baseline Scoped Coverage

**Files:**
- Read: `coverage/coverage-summary.json`
- Modify: none

- [ ] Run `npm run coverage` on the starting branch and preserve the scoped summary for `scripts/skills/**`, `plugin/**`, `packages/mcp/**`, and `integrations/**`.
- [ ] Identify files below 80% for lines/statements/functions/branches.
- [ ] Record the before numbers in `todo.md`.

### Task 2: Coverage Configuration for Scoped Surfaces

**Files:**
- Modify: `vitest.config.ts`

- [ ] Write a failing targeted coverage run or config inspection showing scoped files are excluded from V8 coverage.
- [ ] Update coverage `include` to cover deterministic source surfaces: `src/**/*.ts`, `scripts/skills/**/*.ts`, and integration plugin/config script surfaces that tests can execute in-process.
- [ ] Keep generated/build/vendor artifacts and bundled standalone hook/MCP wrapper artifacts excluded from V8 line coverage; cover those package/plugin artifacts with manifest, packaging, and child-process contract tests instead.
- [ ] Run `npm run coverage` and confirm scoped files appear in `coverage/coverage-summary.json`.

### Task 3: Skill Generator and Reference Contracts

**Files:**
- Modify or add: `test/*skill*.test.ts`

- [ ] Add tests that execute `scripts/skills/generate.ts --check` and `scripts/skills/check.ts` success paths.
- [ ] Add tests that verify generated reference docs contain autogen blocks for tools, REST, env, agents, and hooks.
- [ ] Add tests that compare skill directory count to plugin descriptions to catch stale counts.
- [ ] Run targeted skill tests and confirm the new tests fail before any supporting config/source change, then pass.

### Task 4: Plugin, Hook, and MCP Package Contracts

**Files:**
- Modify: `test/codex-plugin.test.ts`
- Modify: `test/copilot-plugin.test.ts`
- Modify or add targeted plugin test as needed

- [ ] Add structured manifest tests for `plugin/.claude-plugin/plugin.json`, `plugin/plugin.json`, `plugin/.codex-plugin/plugin.json`, `plugin/.mcp.json`, `plugin/.mcp.copilot.json`, and `packages/mcp/package.json`.
- [ ] Verify manifest versions, package names, binary entry points, referenced paths, exposed MCP tool defaults, and hook script existence.
- [ ] Verify hook config command roots and event naming across Claude, Codex, and Copilot variants.
- [ ] Run targeted plugin tests and confirm red/green behavior.

### Task 5: Integration Contract Coverage

**Files:**
- Modify: `test/hermes-plugin.test.ts`
- Modify: `test/openclaw-plugin.test.ts`
- Modify targeted integration tests as needed

- [ ] Add integration manifest/package checks for Hermes and OpenClaw plugin metadata.
- [ ] Cover failure/branch paths in OpenClaw prompt/config behavior where deterministic.
- [ ] Verify package/plugin references point to existing files.
- [ ] Run targeted integration tests and confirm red/green behavior.

### Task 6: Full Verification, Review, and Commit

**Files:**
- Modify: task record only after code verification

- [ ] Run `npm run skills:check`.
- [ ] Run targeted tests for changed test files.
- [ ] Run `npm test`.
- [ ] Run `npm run coverage` and record after numbers.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint`.
- [ ] Stage only scoped changes.
- [ ] Run `gitleaks protect --staged --redact`.
- [ ] Run Semgrep because plugin/tooling/hook surfaces are in scope.
- [ ] Review `git diff --cached`.
- [ ] Commit with a factual Conventional Commit message.
