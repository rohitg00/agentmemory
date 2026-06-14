# REST/API Integration Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use focused TDD and project-native verification task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise scoped REST/API and event-trigger coverage above 80% and commit the verified result.

**Architecture:** Tests will instantiate `registerApiTriggers` and `registerEventTriggers` with in-memory sdk/kv fakes, then call registered handlers directly. This keeps iii-engine, HTTP servers, providers, and network boundaries mocked while exercising the real REST/event boundary code.

**Tech Stack:** TypeScript, Vitest, V8 coverage, mocked `iii-sdk` function registration, in-memory KV fakes.

---

### Task 1: Baseline and Gap Selection

**Files:**
- Inspect: `coverage/coverage-summary.json`
- Inspect: `src/triggers/api.ts`
- Inspect: `src/triggers/events.ts`

- [x] Run `npm run coverage`.
- [x] Record total and scoped coverage for `src/triggers/api.ts` and `src/triggers/events.ts`.
- [x] Inspect uncovered line ranges from the text/summary coverage report and map them to REST/event behaviors.
- [x] Choose test targets that cover boundary behavior and avoid API contract changes.

### Task 2: REST API Boundary Tests

**Files:**
- Create or modify: `test/api-boundary.test.ts`
- Cover: `src/triggers/api.ts`

- [x] Write tests for auth denied/allowed, missing and malformed request inputs, and whitelisted payload construction.
- [x] Run targeted tests and confirm expected coverage gaps before production-code changes.
- [x] Add only minimal production fixes if tests reveal a current contract bug.
- [x] Re-run targeted tests until green.

### Task 3: Event Trigger Tests

**Files:**
- Create or modify: `test/events-boundary.test.ts`
- Cover: `src/triggers/events.ts`

- [x] Write tests for session start/stop/end and observation-count changed behaviors.
- [x] Run targeted tests and confirm expected coverage gaps.
- [x] Add only minimal production fixes if tests reveal a current contract bug.
- [x] Re-run targeted tests until green.

### Task 4: Verification and Commit

**Files:**
- Update: `docs/todos/2026-06-14-rest-api-integration-coverage/todo.md`
- Stage: scoped test/task-state changes and any minimal source fixes.

- [x] Run targeted API/event tests.
- [x] Run `npm test`.
- [x] Run `npm run coverage` and confirm scoped REST/API coverage above threshold.
- [x] Run `npm run lint`.
- [x] Run `semgrep scan --config p/default --error --metrics=off .`.
- [ ] Stage only scoped files.
- [x] Run `gitleaks protect --staged --redact`.
- [ ] Commit with a factual Conventional Commit message.
- [ ] Update final handoff with before/after coverage, tests/scans, commit hash, remaining gaps, and branch.
