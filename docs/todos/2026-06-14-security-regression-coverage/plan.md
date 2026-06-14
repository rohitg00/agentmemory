# Security Regression Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise security and secret-handling regression coverage above 80% on the scoped agentmemory source surface and commit the result.

**Architecture:** Keep the change test-heavy and scoped. Measure coverage over the concrete security/secret surface, add missing regression tests in existing focused suites, and change production code only when a red test exposes an actual security-boundary gap.

**Tech Stack:** TypeScript, Vitest with V8 coverage, Node.js subprocess tests, existing filesystem watcher JavaScript integration, shell-script static regression tests.

---

## Files

- Modify: `test/integration-plaintext-http.test.ts` if plaintext bearer guard branch coverage is missing.
- Modify: `test/hooks-plaintext-http.test.ts` if generated hook guard behavior has uncovered branches.
- Modify: `test/deploy-entrypoint-secret.test.ts` if deploy entrypoint secret leak forms are under-covered.
- Modify: `test/fs-watcher.test.ts` if redaction edge cases are under-covered.
- Modify: `test/replay-sensitive.test.ts` if sensitive path matching branches are under-covered.
- Modify: `test/viewer-security.test.ts` if viewer non-loopback or bearer-boundary branches are under-covered.
- Modify: scoped source files only when a failing test proves a security regression gap.
- Modify: `docs/todos/2026-06-14-security-regression-coverage/todo.md` with coverage evidence and final review notes.

### Task 1: Establish Baseline

- [ ] **Step 1: Run scoped coverage baseline**

Run a Vitest coverage command that includes only scoped source files and the focused security tests.

Expected: command completes or records the missing local dependency blocker. Capture lines/statements/functions/branches for the scoped surface.

- [ ] **Step 2: Identify uncovered branches**

Inspect `coverage/coverage-summary.json` and, if useful, `coverage/coverage-final.json`.

Expected: list the scoped files or functions below 80% and map them to existing test files.

### Task 2: Add Failing Security Regression Tests

- [ ] **Step 1: Add one focused failing test for each real gap**

Prefer existing test files and existing helper patterns. Candidate behaviors:
- Plaintext bearer guard: malformed URLs, empty secrets, one-time warning, strict mode no-warning/no-request.
- Filesystem watcher: YAML sensitive keys, log-style token lines, lowercase private-key markers, safe config errors that do not echo raw regex content.
- Replay-sensitive path guard: basename-delimited secret/token filenames without false positives on project names.
- Viewer: non-loopback bind refuses missing secret or missing `VIEWER_ALLOWED_HOSTS`, unauthorized upstream proxy returns 401 without leaking the expected token.
- Deploy entrypoints: additional shell output forms that would print secret variables or persisted HMAC content.

- [ ] **Step 2: Run the narrow failing test**

Run only the edited test file or test name.

Expected: fail for the intended behavioral or coverage gap, not because of syntax or missing dependencies.

### Task 3: Implement Minimal Fixes If Needed

- [ ] **Step 1: Change only the source needed by a red test**

Keep security boundaries intact. Do not loosen auth, Host checks, plaintext bearer checks, redaction, replay path guards, or deploy secret handling.

- [ ] **Step 2: Run the narrow test again**

Expected: the red test turns green and neighboring tests remain green.

### Task 4: Coverage and Verification

- [ ] **Step 1: Run final scoped coverage**

Expected: scoped coverage is above 80% for lines, statements, functions, and practical branches.

- [ ] **Step 2: Run focused security tests**

Run the security-oriented test files touched or used for coverage.

Expected: all pass.

- [ ] **Step 3: Run full project checks**

Run `npm test`, `npm run coverage`, and `npm run lint`.

Expected: all pass or blockers are recorded with exact evidence.

- [ ] **Step 4: Stage and run security gates**

Stage only task-owned files, then run `gitleaks protect --staged --redact` and Semgrep. Do not run OSV unless dependency/package/container/vendored surfaces changed.

Expected: no findings.

- [ ] **Step 5: Commit**

Commit only scoped changes with a factual commit message.

Expected: branch `coverage/security-regressions` contains the task commit and no unrelated files are staged.

## Plan Self-Review

- Spec coverage: Baseline, TDD, scoped coverage target, focused security tests, full checks, security gates, and commit are covered.
- Placeholder scan: no `TBD`, generic test placeholders, or unspecified paths remain.
- Boundary check: plan does not authorize dependency install, remote operations, auth weakening, API migration, or generated rewrites.
