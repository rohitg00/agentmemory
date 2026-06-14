# Plaintext Bearer Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent bearer-authenticated agentmemory requests from being sent over non-loopback plaintext HTTP.

**Architecture:** Add a shared TypeScript guard for repo-internal clients that detects `http://` plus non-loopback host plus non-empty bearer secret. The guard returns whether a request may proceed, warns once when blocking in default mode, and throws before request construction when `AGENTMEMORY_REQUIRE_HTTPS=1`; standalone copyable integrations keep equivalent local helpers to avoid broken copied-plugin imports.

**Tech Stack:** TypeScript ESM, standalone MJS integrations, Vitest, Node child-process hook tests.

---

## Source Of Truth

No separate product spec exists. The current delegated request and `docs/todos/2026-06-13-plaintext-bearer-guard/todo.md` are the source of truth.

## File Structure

- Create `src/security/plaintext-bearer-auth.ts`: shared guard for `src/hooks/*`, `src/mcp/rest-proxy.ts`, and import-capable TypeScript integrations.
- Modify `integrations/pi/security.ts`: align existing exported guard with the new boolean proceed contract.
- Modify `integrations/pi/index.ts`: return before fetch when the guard blocks.
- Modify `integrations/openclaw/plugin.mjs`: keep standalone helper, return boolean, return before fetch when blocked.
- Modify `src/hooks/*.ts`: import shared guard helper and check before each fetch that can attach `AGENTMEMORY_SECRET`.
- Modify `src/mcp/rest-proxy.ts`: guard before livez probe and proxy calls; fall back to local mode when default guard blocks; strict mode throws before fetch.
- Modify `plugin/opencode/agentmemory-capture.ts`: keep standalone helper and guard `post`/`postJson` before fetch.
- Modify `integrations/filesystem-watcher/watcher.mjs`: keep standalone helper, one guard per watcher, return before fetch when blocked.
- Modify `integrations/hermes/__init__.py`: keep standalone Python helper, return boolean, return before `urlopen` when blocked.
- Modify tests:
  - `test/integration-plaintext-http.test.ts`
  - `test/mcp-standalone-proxy.test.ts`
  - `test/fs-watcher.test.ts`
  - new `test/hooks-plaintext-http.test.ts`

## Task 1: Add Failing Guard Contract Tests

**Files:**
- Modify: `test/integration-plaintext-http.test.ts`

- [x] Add tests proving `createPlaintextBearerAuthGuard` returns `false` for `http://remote.example:3111` plus secret and warns only once.
- [x] Add tests proving loopback HTTP, HTTPS, and no-secret return `true`.
- [x] Add a strict-mode test proving the guard throws before warning.
- [x] Add OpenClaw regression coverage that remote HTTP plus secret does not call `fetch` by default.
- [x] Run `npx --no-install vitest run test/integration-plaintext-http.test.ts --exclude test/integration.test.ts` and verify the new tests fail before implementation.

## Task 2: Add Failing Client-Surface Tests

**Files:**
- Create: `test/hooks-plaintext-http.test.ts`
- Modify: `test/mcp-standalone-proxy.test.ts`
- Modify: `test/fs-watcher.test.ts`

- [x] Add hook child-process tests for `post-tool-use`, `prompt-submit`, and `session-end` using direct generated-script execution and a preload/mock strategy that proves remote HTTP plus secret exits without any fetch, while loopback still sends auth for at least one hook.
- [x] Add MCP proxy tests proving remote HTTP plus secret does not probe/fetch by default, `AGENTMEMORY_FORCE_PROXY=1` does not bypass the guard, and strict mode rejects before fetch.
- [x] Add filesystem watcher tests proving remote HTTP plus secret logs one warning and does not fetch, loopback still sends bearer auth, and strict mode rejects before fetch.
- [x] Run targeted Vitest files and verify the new tests fail before implementation.

## Task 3: Implement Shared Guard And Import-Capable Callers

**Files:**
- Create: `src/security/plaintext-bearer-auth.ts`
- Modify: `integrations/pi/security.ts`
- Modify: `integrations/pi/index.ts`
- Modify: `src/hooks/*.ts`
- Modify: `src/mcp/rest-proxy.ts`

- [x] Implement loopback detection for `localhost`, `127.0.0.1`, and `::1`, preserving malformed URL no-op behavior.
- [x] Return `true` when no secret, HTTPS, loopback HTTP, or non-HTTP protocols are configured.
- [x] Return `false` after warning once for non-loopback HTTP plus secret in default mode.
- [x] Throw `Error(plaintextBearerAuthMessage(baseUrl))` when `AGENTMEMORY_REQUIRE_HTTPS=1`.
- [x] Ensure every guarded hook catches strict-mode errors, writes a safe message to stderr, and returns without sending.
- [x] Ensure MCP default blocked proxy resolves to local mode without calling fetch, while strict mode rejects before fetch.

## Task 4: Implement Standalone Integration Guards

**Files:**
- Modify: `integrations/openclaw/plugin.mjs`
- Modify: `plugin/opencode/agentmemory-capture.ts`
- Modify: `integrations/filesystem-watcher/watcher.mjs`
- Modify: `integrations/hermes/__init__.py`

- [x] Keep OpenClaw, OpenCode, filesystem watcher, and Hermes helpers self-contained so copied artifacts still run.
- [x] Make each helper return boolean with the same warn-once and strict-throw behavior.
- [x] Guard immediately before request creation, before adding bearer auth to an outbound fetch.
- [x] Preserve debug/log behavior except for the new security warning.

## Task 5: Verify, Simplify, And Update Task State

**Files:**
- Modify: `docs/todos/2026-06-13-plaintext-bearer-guard/todo.md`
- Modify generated hook bundles manually when `npm run build` is unavailable.

- [x] Run focused tests:
  `npx --no-install vitest run test/integration-plaintext-http.test.ts test/hooks-plaintext-http.test.ts test/mcp-standalone-proxy.test.ts test/fs-watcher.test.ts --exclude test/integration.test.ts`
- [x] Run broader checks as feasible: `npm test`, `npm run build`.
- [x] Run mandatory security checks for this security/tooling surface change: `semgrep scan --config p/default --error --metrics=off .` and `gitleaks detect --source . --redact` if available.
- [x] Do a focused simplification pass over touched code.
- [x] Update the Feature / Verification Matrix with commands and results.
- [x] Preserve local-main hook project `cwd` hardening found during prep-merge review and rerun focused resolver/hook tests.
- [ ] If a commit is requested later, stage intended files and run `gitleaks protect --staged --redact` before committing.

## Open Decisions

- Default behavior is intentionally fail-closed for remote plaintext HTTP plus bearer secret by warning and skipping the request. This is stricter than the earlier PI/OpenClaw warning-only behavior, but it is the smallest behavior change that actually closes the bearer and payload exfiltration path.
- Remote plaintext users with `AGENTMEMORY_SECRET` need HTTPS, a loopback tunnel, or no bearer secret for that transport.
