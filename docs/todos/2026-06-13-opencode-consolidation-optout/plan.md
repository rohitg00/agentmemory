# OpenCode Consolidation Opt-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent external OpenCode/REST callers from forcing consolidation when the global opt-out is disabled.

Plan status: implemented with targeted verification and accepted pre-merge reviews; build blocked by missing local dependencies.

**Architecture:** Keep the opt-out check in the consolidation function as the final safety control, but only allow trusted in-process callers to use boolean `force: true`. The REST endpoint becomes a whitelist boundary, and OpenCode mirrors the core hook by calling consolidation only when `CONSOLIDATION_ENABLED=true`.

**Tech Stack:** TypeScript, ESM, iii-sdk function registration, Vitest text/unit tests.

---

## File Structure

- Modify `test/consolidation-pipeline.test.ts`: flip the unsafe force-disabled expectation, add strict boolean force coverage.
- Modify `test/opencode-auto-context.test.ts`: assert OpenCode `session.deleted` gates consolidation and does not send `force`.
- Create `test/consolidation-api-boundary.test.ts`: register the REST endpoint with a mocked SDK and prove external `force` is not forwarded.
- Modify `src/functions/consolidation-pipeline.ts`: treat only `force === true` as internal override.
- Modify `src/triggers/api.ts`: whitelist `tier` and `project` before triggering the consolidation function.
- Modify `plugin/opencode/agentmemory-capture.ts`: gate crystals/consolidation on `CONSOLIDATION_ENABLED === "true"` and omit `force`.
- Update `docs/todos/2026-06-13-opencode-consolidation-optout/todo.md`: record progress and final verification evidence.

## Tasks

### Task 1: Encode the failing consolidation boundary behavior

**Files:**
- Modify: `test/consolidation-pipeline.test.ts`
- Create: `test/consolidation-api-boundary.test.ts`
- Modify: `test/opencode-auto-context.test.ts`

- [x] Add a test in `test/consolidation-pipeline.test.ts` that `force: "true"` does not bypass disabled consolidation.
- [x] Keep the internal boolean `force: true` test, but rename it to make the trusted internal boundary explicit.
- [x] Add `test/consolidation-api-boundary.test.ts` with a mocked API registration proving REST body `{ tier: "all", force: true }` is forwarded without `force`.
- [x] Add OpenCode text assertions that the `session.deleted` block gates consolidation on `CONSOLIDATION_ENABLED` and does not include `force: true`.
- [x] Run `npx --no-install vitest run test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts --exclude test/integration.test.ts`.
- [x] Expected before implementation: tests fail for missing REST sanitization, OpenCode gate, and strict boolean force.

### Task 2: Implement the minimal opt-out fix

**Files:**
- Modify: `src/functions/consolidation-pipeline.ts`
- Modify: `src/triggers/api.ts`
- Modify: `plugin/opencode/agentmemory-capture.ts`

- [x] In `src/functions/consolidation-pipeline.ts`, compute `const force = data?.force === true` and use it for the disabled check.
- [x] In `src/triggers/api.ts`, replace raw `req.body || {}` forwarding with an explicitly built payload that includes only string `tier` and string `project`.
- [x] In `plugin/opencode/agentmemory-capture.ts`, wrap `/crystals/auto` and `/consolidate-pipeline` calls in `if (process.env.CONSOLIDATION_ENABLED === "true")`.
- [x] Remove OpenCode `force: true` from the consolidation request.
- [x] Run the targeted tests again and expect pass.

### Task 3: Focused cleanup and verification

**Files:**
- Review current diff only.
- Update: `docs/todos/2026-06-13-opencode-consolidation-optout/todo.md`

- [x] Run a focused simplification pass on touched code without broad refactors.
- [x] Run `npm test -- test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts test/session-end-triggers-graph.test.ts`.
- [x] Run `npx --no-install vitest run test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts test/session-end-triggers-graph.test.ts --exclude test/integration.test.ts` if the npm argument form is not usable.
- [x] Run `npm run build`.
- [x] Run `semgrep scan --config p/default --error --metrics=off src/functions/consolidation-pipeline.ts src/triggers/api.ts plugin/opencode/agentmemory-capture.ts test/consolidation-pipeline.test.ts test/consolidation-api-boundary.test.ts test/opencode-auto-context.test.ts`.
- [x] If committing, stage only task-owned files and run `gitleaks protect --staged --redact` before commit.
- [x] Run Codex Security diff scan and record no-findings report.
- [x] Run GStack-style pre-landing review and independent code review.
- [x] Record command results, final matrix status, and residual risks in the task record.

Notes:
- `npm test -- ...` and `npm run build` were run but could not execute because local `vitest` and `tsdown` are absent. The direct no-install Vitest command passed for the targeted surface.
- Staged `gitleaks protect --staged --redact` passed before the prep-merge commit; `gitleaks detect --source . --redact --no-color` also passed during implementation verification.
