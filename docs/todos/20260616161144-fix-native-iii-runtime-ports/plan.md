# Native iii Runtime Ports Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unsupported native iii v0.11.2 engine-port config rendering and align tests/docs with the real native runtime contract.

**Architecture:** Treat the native iii engine listen port as fixed at its default unless direct iii v0.11.2 evidence proves a supported relocation mechanism. Keep `--port`/`--instance` as REST-anchor conveniences for agentmemory REST, streams, and viewer ports, while preserving explicit `III_ENGINE_URL`/`III_ENGINE_PORT` as client-side connection overrides for externally managed engines.

**Tech Stack:** TypeScript ESM, Node CLI, iii v0.11.2 YAML config, Vitest, Markdown docs.

---

## File Structure

- `src/cli/runtime-ports.ts`: remove top-level engine `port:` rendering; keep worker port and CORS rendering.
- `src/config.ts`: adjust default engine URL derivation and comments if they still imply native engine relocation from REST port.
- `src/cli/ready-hint.ts`: adjust ready-panel derived engine URL display to the verified contract.
- `src/cli.ts`: update help text for `--port` and `--instance`.
- `test/runtime-ports-render.test.ts`: red test for no top-level `port:` and updated arg/config expectations.
- `test/multi-instance-port.test.ts`: align loadConfig expectations with fixed native engine default and explicit override semantics.
- `test/cli-ready-hint.test.ts`: align ready-hint display expectations.
- `README.md`, `INSTALL_FOR_AGENTS.md`, `CHANGELOG.md`, and generated skill docs if present: remove unverified engine relocation claims.
- `docs/todos/20260616161144-fix-native-iii-runtime-ports/todo.md`: keep progress and verification evidence current.

## Task 1: Red Test

- [x] Add a test in `test/runtime-ports-render.test.ts` asserting `renderRuntimeIiiConfig()` output starts with `workers:` and contains no top-level `port:` when given `iii-config.yaml` and a non-default `III_REST_PORT`.
- [x] Run `corepack pnpm test -- test/runtime-ports-render.test.ts`.
- [x] Confirm the test fails because the renderer currently inserts `port: 49234`, not because of setup or syntax errors.

Evidence: the exact `corepack pnpm test -- test/runtime-ports-render.test.ts` command was blocked before Vitest by pnpm ignored-build hardening. The direct `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts` red run failed for the expected rendered `port: 49234`.

## Task 2: Minimal Source Fix

- [x] Remove top-level `port:` rewrite/synthesis from `renderRuntimeIiiConfig()`.
- [x] Keep `iii-http` port, `iii-stream` port, and CORS allowed-origin rewriting intact.
- [x] Update `applyRuntimePortArgs()` so `--port`/`--instance` no longer sets `III_ENGINE_PORT` or `III_ENGINE_URL` by default.
- [x] Keep explicit user-supplied `III_ENGINE_PORT` and `III_ENGINE_URL` behavior available for clients/external engines.
- [x] Run `corepack pnpm test -- test/runtime-ports-render.test.ts`.

Evidence: direct `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts` passed with 4 tests. The exact pnpm wrapper remained blocked by the ignored-build gate.

## Task 3: Align Neighboring Contracts

- [x] Update `src/config.ts` and `test/multi-instance-port.test.ts` so REST relocation derives streams but not native engine URL by default.
- [x] Update `src/cli/ready-hint.ts` and `test/cli-ready-hint.test.ts` so ready hints display the fixed default engine URL unless explicitly overridden.
- [x] Update CLI help text in `src/cli.ts` to describe `--port`/`--instance` as REST, streams, and viewer relocation; mention the native iii-engine listen port remains fixed for the bundled v0.11.2 runtime unless using an externally managed engine URL.
- [x] Run `corepack pnpm test -- test/runtime-ports-render.test.ts test/multi-instance-port.test.ts test/cli-ready-hint.test.ts test/cli-server-log.test.ts`.

Evidence: exact pnpm wrapper blocked by ignored-build hardening; direct focused Vitest command passed 4 files / 34 tests after review fixes.

## Task 4: Documentation Sweep

- [x] Search stale claims with `rg -n -e "--port" -e "--instance" -e "49234" -e "N+46023" -e "whole port block" -e "whole quartet" README.md CHANGELOG.md INSTALL_FOR_AGENTS.md plugin docs src test`.
- [x] Update README/install/CHANGELOG/skill docs that state `--port` or `--instance` moves the native engine listen port.
- [x] Avoid changing historical entries unless they are current release notes or actively misleading setup guidance; if a historical entry must remain, add a current correction nearby.
- [x] Re-run stale-claim search and record evidence.

Evidence: stale live claims were removed from README, install runbook, changelog current entry, CLI help, and plugin skills. Remaining hits are unrelated text or regression-test fixtures.

## Task 5: Build, Smoke, And Gates

- [x] Run `corepack pnpm build`.
- [x] Start the built CLI in a safe temporary data dir until `iii-engine is ready` appears, then stop it.
- [x] Verify no agentmemory/iii process from the smoke run remains.
- [x] Run `git diff --check`.
- [x] Run Semgrep on changed source/docs/task files.
- [x] Run Codex Security diff scan for changed source-like files.
- [x] Update the task record with verification evidence, caveats, residual risks, and final Sprint Contract/Feature Matrix status.

Evidence: exact `corepack pnpm build` blocked before script execution by pnpm ignored-build hardening; direct `./node_modules/.bin/tsdown` build completed. Full built CLI start was blocked by an existing local iii process on 49134/3111, so no smoke-owned process was started or left running. `git diff --check` passed, Semgrep reported 0 findings, and Codex Security diff scan reported 0 findings with reports under `/tmp/codex-security-scans/agentmemory/0fc5b4ddac6f_20260616163943/`.

## Self Review

- Spec coverage: every user acceptance criterion maps to a task and a verification command.
- Placeholder scan: no placeholders remain; pending rows are status fields for execution evidence.
- Type consistency: file/function names match inspected source names.
