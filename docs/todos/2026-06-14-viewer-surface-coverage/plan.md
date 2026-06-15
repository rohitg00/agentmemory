# Viewer Surface Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise scoped Viewer TypeScript coverage above 80% while adding deterministic behavior and boundary tests for the Viewer server and document helpers.

**Architecture:** Keep production behavior unchanged unless a red test exposes a concrete bug. Prefer HTTP-level tests around `startViewerServer()` with a local in-process REST stub, plus direct helper tests for exported host/auth utilities and static VM/text tests for `index.html` behavior.

**Tech Stack:** TypeScript ESM, Vitest, Node `http`, V8 coverage.

---

## Tasks

- [ ] Add focused red tests for exported host/auth helper boundaries: override normalization, duplicate/case Host values, malformed bearer strings.
- [ ] Add focused red tests for HTTP routing and proxy behavior: OPTIONS CORS, `/viewer` and `/agentmemory/viewer`, path/query forwarding, JSON content-type forwarding, DELETE body forwarding, upstream timeout/error status.
- [ ] Add focused red tests for document/static asset behavior that is feasible without module-loader rewrites: document nonce/version replacement and favicon/HTML status behavior through the server.
- [ ] Run the new/changed targeted tests and confirm at least one new test fails before any production code changes.
- [ ] Make the minimal production change only if the red test identifies missing behavior; otherwise keep source unchanged and use tests to raise coverage.
- [ ] Run targeted Viewer tests and scoped coverage; update `todo.md` with after percentages.
- [ ] Run required repo verification: targeted Viewer tests, `npm test`, `npm run coverage`, `npm run build`, `npm run lint`, Semgrep over Viewer source/tests, then stage only task-owned files and run `gitleaks protect --staged --redact`.
- [ ] Commit task-owned changes with a factual message.

## Expected Commands

```bash
npx vitest run --exclude test/integration.test.ts test/viewer-host.test.ts test/viewer-security.test.ts test/viewer-memories-sort.test.ts test/viewer-graph-cooldown.test.ts test/viewer-session-id.test.ts test/viewer-server-routing.test.ts
npx vitest run --coverage --coverage.include='src/viewer/**' --exclude test/integration.test.ts test/viewer-host.test.ts test/viewer-security.test.ts test/viewer-memories-sort.test.ts test/viewer-graph-cooldown.test.ts test/viewer-session-id.test.ts test/viewer-server-routing.test.ts
npm test
npm run coverage
npm run build
npm run lint
semgrep scan --config p/default --error --metrics=off src/viewer test/viewer-host.test.ts test/viewer-security.test.ts test/viewer-memories-sort.test.ts test/viewer-graph-cooldown.test.ts test/viewer-session-id.test.ts test/viewer-server-routing.test.ts
gitleaks protect --staged --redact
```
