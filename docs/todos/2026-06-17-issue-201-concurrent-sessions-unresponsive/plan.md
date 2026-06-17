# Issue 201 Concurrent Sessions Unresponsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure default Claude Code `session-start` telemetry does not keep hook processes alive while a slow or unresponsive AgentMemory server handles concurrent session registration.

**Architecture:** Preserve the existing REST/session-start contract and change only the telemetry-only hook process lifecycle. The default non-injection path will dispatch the same guarded fetch and then schedule an unref'd short forced exit, matching other telemetry hooks; the context-injection path remains awaited because Claude Code consumes its stdout.

**Tech Stack:** TypeScript ESM hook scripts, Vitest, repo-local hook-source smoke harness.

---

## Source Of Truth

- Spec path: none.
- Task record: `docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive/todo.md`
- User request: work GitHub issue #201 through `github-feature-loop`, verify if still fix-needed, then fix or document closure/blocker.
- Public issue evidence: fork #201 and upstream #499 are open; report targets concurrent Claude Code sessions and unresponsive AgentMemory.

## File Structure

- Modify `test/hook-source-smoke.test.ts`: update the `session-start` regression so default telemetry requires an unref'd forced exit and injection mode still writes context.
- Modify `src/hooks/session-start.ts`: add the same unref'd `setTimeout(() => process.exit(0), 500)` lifecycle guard used by other single-request telemetry hooks, only in the non-injection path.
- Modify `docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive/todo.md`: record red/green verification, review results, and final handoff details.
- Do not modify REST endpoint definitions, MCP server code, storage schema, package manifests, lockfiles, or plugin metadata.

## Task 1: Red Test For Session-Start Telemetry Detachment

**Files:**
- Modify: `test/hook-source-smoke.test.ts`

- [ ] **Step 1: Change the default session-start assertion**

Replace the default branch assertions in `session-start is fire-and-forget by default and writes context only when opted in` with:

```ts
    expect(telemetry.stdoutWrite).not.toHaveBeenCalled();
    expect(telemetry.setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(telemetry.setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
    const exitCallback = telemetry.setTimeoutSpy.mock.calls[0]?.[0] as
      | (() => void)
      | undefined;
    expect(exitCallback).toBeTypeOf("function");
    exitCallback?.();
    expect(telemetry.processExitSpy).toHaveBeenCalledWith(0);
    const timeoutHandle = telemetry.setTimeoutSpy.mock.results[0]?.value as
      | { unref?: () => unknown }
      | undefined;
    expect(timeoutHandle?.unref).toHaveBeenCalledTimes(1);
```

Keep the injected-mode assertion:

```ts
    expect(injected.stdoutWrite).toHaveBeenCalledWith("remembered context");
    expect(injected.setTimeoutSpy).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the targeted test and verify it fails for the expected reason**

First confirm dependencies are materialized:

```bash
test -d node_modules
```

If that fails, run the safe setup before any `pnpm exec` command:

```bash
corepack pnpm install --frozen-lockfile --ignore-scripts
git diff --exit-code -- package.json pnpm-lock.yaml pnpm-workspace.yaml
```

Then run:

```bash
corepack pnpm exec vitest run test/hook-source-smoke.test.ts --no-file-parallelism
```

Expected before source edit:

```text
FAIL test/hook-source-smoke.test.ts
expected "setTimeout" to be called 1 times
```

If pnpm reports ignored-build hardening or missing materialized dependencies, run:

```bash
corepack pnpm install --frozen-lockfile --ignore-scripts
git diff --exit-code -- package.json pnpm-lock.yaml pnpm-workspace.yaml
corepack pnpm exec vitest run test/hook-source-smoke.test.ts --no-file-parallelism
```

Do not approve lifecycle builds or change dependency metadata.

## Task 2: Minimal Session-Start Hook Fix

**Files:**
- Modify: `src/hooks/session-start.ts`

- [ ] **Step 1: Add the forced exit to the telemetry-only path**

In the `if (!INJECT_CONTEXT)` block, after the `guardedFetch(... )?.catch(() => {});` call and before `return`, add:

```ts
    setTimeout(() => process.exit(0), 500).unref();
```

Do not change `INJECT_TIMEOUT_MS`, `REGISTER_TIMEOUT_MS`, payload shape, endpoint path, or the context-injection `await` path.

- [ ] **Step 2: Run the targeted test and verify it passes**

Run:

```bash
corepack pnpm exec vitest run test/hook-source-smoke.test.ts --no-file-parallelism
```

Expected after source edit:

```text
Test Files  1 passed
Tests  ... passed
```

## Task 3: Focused Cleanup, Review, And Local PR Prep

**Files:**
- Modify: `docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive/todo.md`
- Inspect: task diff only

- [ ] **Step 1: Simple-code pass**

Inspect:

```bash
git diff -- src/hooks/session-start.ts test/hook-source-smoke.test.ts docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive
```

Confirm there is no broader behavior change, duplicated code, or comment churn outside the touched hook/test/task record surface. Make no cleanup edit unless it removes task-caused complexity while preserving the API/auth/storage/protocol boundaries.

- [ ] **Step 2: Final targeted verification**

Run:

```bash
corepack pnpm exec vitest run test/hook-source-smoke.test.ts --no-file-parallelism
```

If time and dependencies permit after the targeted hook test:

```bash
corepack pnpm test
```

Record any known unrelated full-suite blocker rather than broadening scope.

- [ ] **Step 3: Local GitHub push preparation**

Run the local-only `github-push-prepare` phase:

```bash
git status -sb --untracked-files=all
git diff --name-status
git diff -- src/hooks/session-start.ts test/hook-source-smoke.test.ts docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive
```

Use existing local `origin/main` only unless the user approves `git fetch origin main`.

Stage only task-owned files:

```bash
git add src/hooks/session-start.ts test/hook-source-smoke.test.ts docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive/todo.md docs/todos/2026-06-17-issue-201-concurrent-sessions-unresponsive/plan.md
```

Run required before-commit checks that are available and in scope, including staged secret scan:

```bash
gitleaks protect --staged --redact
```

For this hook/process-lifecycle change, Semgrep is mandatory:

```bash
semgrep scan --config p/default --error --metrics=off .
```

If Semgrep is missing, unavailable, or errors, record it as a blocker requiring explicit current-turn acceptance before handoff or commit.

OSV is not required unless dependency, lockfile, vendored, or container surfaces change; record skip reason.

Commit:

```bash
git commit -m "fix: detach session-start telemetry hook"
```

Do not push or create a PR without explicit current-turn approval.

## Self-Review

- Spec coverage: the plan covers issue relevance, dependency setup guardrails, red/green reproduction, minimal fix, targeted verification, review, local commit, and no remote writes.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: test changes use the existing `importHook` return shape and Vitest `expect`.
- Boundary check: no public REST/MCP/auth/storage/protocol behavior changes are planned.
