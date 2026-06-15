# Unit/Core Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise V8 coverage for `src/functions/**`, `src/state/**`, `src/prompts/**`, and `src/utils/**` above 80% for lines, statements, and functions, with branch coverage above 80% where practical.

**Architecture:** This is a test-only coverage improvement. Add behavior-first unit tests around existing core functions and state utilities, using existing Vitest and `iii-sdk` mock patterns without changing production APIs or persistence contracts.

**Tech Stack:** TypeScript, Vitest, V8 coverage, existing `iii-sdk` mocks.

---

## Task 1: Measure Baseline And Select Targets

**Files:**
- Inspect: `coverage/coverage-summary.json`
- Inspect: `src/functions/**`
- Inspect: `src/state/**`
- Inspect: `src/prompts/**`
- Inspect: `src/utils/**`
- Modify: `docs/todos/2026-06-14-unit-core-coverage/todo.md`

- [x] **Step 1: Run baseline coverage**

Run: `npm run coverage`

Expected: coverage completes and writes `coverage/coverage-summary.json`.

- [x] **Step 2: Compute scoped totals**

Run a local Node script that reads `coverage/coverage-summary.json`, selects files under `src/functions/`, `src/state/`, `src/prompts/`, and `src/utils/`, and reports line, statement, function, and branch percentages.

Expected: baseline percentages identify the largest useful gaps.

- [x] **Step 3: Update task record**

Record baseline scoped coverage and the selected test target files in `docs/todos/2026-06-14-unit-core-coverage/todo.md`.

## Task 2: Add Behavior-First Tests

**Files:**
- Modify existing `test/*.test.ts` files near the selected uncovered modules.
- Avoid production file edits unless a red-green cycle exposes an actual bug.

- [x] **Step 1: Write one failing test for the next selected behavior**

Add a focused test that describes existing intended behavior or a boundary condition in a selected low-coverage scoped file.

- [x] **Step 2: Verify RED**

Run the smallest targeted `vitest run` command for the changed test file and confirm the new assertion fails for the expected reason.

- [x] **Step 3: Make minimal change**

Prefer test-only changes for coverage. If production behavior is wrong, make the smallest scoped production change that preserves public contracts.

- [x] **Step 4: Verify GREEN**

Run the same targeted `vitest run` command and confirm it passes.

- [x] **Step 5: Repeat**

Repeat the red-green loop until scoped coverage exceeds the acceptance target or the remaining branch gaps are concretely identified as impractical.

## Task 3: Full Verification And Commit

**Files:**
- Modify: `docs/todos/2026-06-14-unit-core-coverage/todo.md`
- Possibly modify: `vitest.config.ts` only if global threshold changes are stable and merge-compatible.

- [x] **Step 1: Run required checks**

Run:

```bash
npm run lint
npm test
npm run coverage
```

Expected: all commands exit 0.

- [x] **Step 2: Run required security checks**

After staging intended changes, run:

```bash
gitleaks protect --staged --redact
```

If production code or config changed, also run the repo-documented Semgrep command or `semgrep scan --config p/default --error --metrics=off .`.

- [x] **Step 3: Update task record with final evidence**

Record final scoped coverage numbers, commands run, caveats, and residual branch gaps if any.

- [x] **Step 4: Review and commit**

Review `git diff`, stage only scoped files, and commit with a factual Conventional Commit message.
