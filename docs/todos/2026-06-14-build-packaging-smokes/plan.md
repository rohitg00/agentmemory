# Build Packaging Smokes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise build and packaging smoke coverage above 80% on the scoped build/package surface and commit the result.

**Architecture:** Keep production behavior unchanged unless a contract gap exposes a real build-facing helper bug. Add focused Vitest contract tests for build metadata and package outputs; add source-level tests only where they exercise exported or testable build/package helper behavior.

**Tech Stack:** TypeScript, ESM, Vitest with V8 coverage, tsdown, npm scripts.

---

## Files

- Modify: `test/codex-plugin.test.ts` or create a focused build/package smoke test if existing tests become too broad.
- Modify: existing CLI/build helper tests only when they cover real helper behavior.
- Modify: `src/cli.ts` or smaller helper modules only if a failing test exposes an implementation bug or if existing private helper structure prevents meaningful coverage.
- Modify: `docs/todos/2026-06-14-build-packaging-smokes/todo.md` and this plan for progress/evidence.

## Tasks

### Task 1: Establish Baseline

- [ ] Run `npm test -- test/codex-plugin.test.ts test/cli-server-log.test.ts test/engine-supervisor.test.ts test/mcp-surface-default.test.ts`.
- [ ] Run `npm run coverage` and inspect `coverage/coverage-summary.json` for `src/cli.ts`, `src/index.ts`, and build/package helper files.
- [ ] Record baseline results in `todo.md`.

### Task 2: Add Build Output Contract Tests

- [ ] Write failing tests that parse `tsdown.config.ts`, `package.json`, and plugin manifests to assert package entrypoints map to emitted `dist/*.mjs` files, hook entries are emitted to both `dist/hooks` and `plugin/scripts`, and `npm run build` copied runtime assets are represented in package `files`.
- [ ] Run the targeted test and confirm the new assertions fail before implementation if a helper or fixture is missing.
- [ ] Add the minimal test helper code needed to make the contract test executable without changing production behavior.
- [ ] Run the targeted test and record evidence.

### Task 3: Add Executable Hook Script Contract Tests

- [ ] Write failing tests that assert every hook script referenced by plugin manifests has an executable `.mjs` output contract, corresponds to a `src/hooks/*.ts` source entry, and is covered by the tsdown plugin scripts build entries.
- [ ] Run the targeted test and confirm red behavior for the new contract assertions.
- [ ] Add or adjust only test code unless the contract exposes a real mismatch.
- [ ] Run the targeted test and record evidence.

### Task 4: Add Source-Level Failure Path Coverage

- [ ] Identify build-facing helper functions in `src/cli.ts` or existing extracted helper modules with low coverage and realistic failure paths.
- [ ] Write failing tests for behavior such as unsupported iii release asset mapping, restart exhaustion, package-root config resolution order, or server log permission repair.
- [ ] Make minimal production changes only if tests expose a bug or require a small helper extraction that preserves CLI behavior.
- [ ] Run targeted tests and record evidence.

### Task 5: Full Verification and Commit

- [ ] Run targeted build/package tests.
- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Run `npm run coverage`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run skills:check` if plugin/script outputs were touched.
- [ ] Stage only scoped changes.
- [ ] Run `gitleaks protect --staged --redact`.
- [ ] Run Semgrep for build/tooling/package changes.
- [ ] Run OSV if package/dependency surfaces changed.
- [ ] Commit with a factual message and record commit hash.
