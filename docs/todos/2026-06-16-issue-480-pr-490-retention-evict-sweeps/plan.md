# Retention Evict Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal, testable worker timer for `mem::evict` that satisfies Issue 480 while preserving existing deletion semantics.

**Architecture:** Keep destructive eviction logic inside the existing `mem::evict` function. Add a small scheduler helper that parses the `EVICTION_ENABLED` and `EVICTION_INTERVAL_MS` environment contract, schedules `sdk.trigger({ function_id: "mem::evict", payload: { dryRun: false } })`, unrefs the timer, returns it for shutdown cleanup, and logs contained sweep failures. Wire that helper from `src/index.ts` next to the existing `mem::auto-forget` timer, using the repo env loader so `~/.agentmemory/.env` is honored.

**Tech Stack:** TypeScript ESM, iii-sdk worker functions, Vitest.

---

## Files

- Create: `src/functions/evict-scheduler.ts`
- Create: `test/evict-scheduler.test.ts`
- Modify: `src/index.ts`
- Modify: `docs/todos/2026-06-16-issue-480-pr-490-retention-evict-sweeps/todo.md`

### Task 1: Scheduler Helper

**Files:**
- Create: `src/functions/evict-scheduler.ts`
- Create: `test/evict-scheduler.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

Add tests that call `startEvictSweep` with an injected env and injected interval function:

```typescript
it("schedules mem::evict by default every 24 hours", async () => {
  const trigger = vi.fn().mockResolvedValue({ success: true });
  const unref = vi.fn();
  let callback: (() => Promise<void>) | undefined;
  const setIntervalFn = vi.fn((cb: () => Promise<void>, intervalMs: number) => {
    callback = cb;
    return { unref } as NodeJS.Timeout;
  });

  const handle = startEvictSweep(
    { trigger },
    { warn: vi.fn() },
    {},
    setIntervalFn,
  );

  expect(handle).toEqual({ unref });
  expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 86_400_000);
  expect(unref).toHaveBeenCalledTimes(1);

  await callback?.();

  expect(trigger).toHaveBeenCalledWith({
    function_id: "mem::evict",
    payload: { dryRun: false },
  });
});
```

Also test `EVICTION_ENABLED=false`, `EVICTION_INTERVAL_MS=1234`, invalid interval fallback, and contained trigger failure logging.

- [ ] **Step 2: Run failing tests**

Run: `npm test -- test/evict-scheduler.test.ts`

Expected before implementation: fails because `src/functions/evict-scheduler.ts` does not exist.

- [ ] **Step 3: Implement scheduler**

Create `src/functions/evict-scheduler.ts` with:

```typescript
import type { ISdk } from "iii-sdk";

export const DEFAULT_EVICTION_INTERVAL_MS = 86_400_000;

type TimerHandle = ReturnType<typeof setInterval>;
type LoggerLike = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};
type SetIntervalFn = (
  callback: () => Promise<void>,
  intervalMs: number,
) => TimerHandle;

export function getEvictSweepIntervalMs(
  env: Record<string, string | undefined>,
): number {
  const value = env["EVICTION_INTERVAL_MS"];
  if (!value) return DEFAULT_EVICTION_INTERVAL_MS;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EVICTION_INTERVAL_MS;
}

export function startEvictSweep(
  sdk: Pick<ISdk, "trigger">,
  log: LoggerLike,
  env: Record<string, string | undefined>,
  setIntervalFn: SetIntervalFn = setInterval,
): TimerHandle | null {
  if (env["EVICTION_ENABLED"] === "false") return null;

  const intervalMs = getEvictSweepIntervalMs(env);
  const timer = setIntervalFn(async () => {
    try {
      await sdk.trigger({
        function_id: "mem::evict",
        payload: { dryRun: false },
      });
    } catch (err) {
      log.warn("Eviction sweep failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, intervalMs);

  timer.unref?.();
  return timer;
}
```

- [ ] **Step 4: Run scheduler tests**

Run: `npm test -- test/evict-scheduler.test.ts`

Expected after implementation: scheduler tests pass.

### Task 2: Worker Wiring

**Files:**
- Modify: `src/index.ts`
- Modify: `test/evict-scheduler.test.ts`

- [ ] **Step 1: Add source-level integration test**

Add a source inspection test in `test/evict-scheduler.test.ts`:

```typescript
it("worker keeps the eviction timer handle for shutdown cleanup", () => {
  const source = readFileSync("src/index.ts", "utf-8");

  expect(source).toContain("startEvictSweep(");
  expect(source).toContain("const evictSweepTimer = startEvictSweep(");
  expect(source).toContain("if (evictSweepTimer) clearInterval(evictSweepTimer);");
});
```

- [ ] **Step 2: Wire scheduler into worker**

In `src/index.ts`, import `startEvictSweep` and `getEvictSweepIntervalMs`, then after the auto-forget timer block add:

```typescript
  const evictSweepEnv = {
    EVICTION_ENABLED: getEnvVar("EVICTION_ENABLED"),
    EVICTION_INTERVAL_MS: getEnvVar("EVICTION_INTERVAL_MS"),
  };
  const evictSweepTimer = startEvictSweep(sdk, logger, evictSweepEnv);
  if (evictSweepTimer) {
    bootLog(
      `Evict sweep: enabled (every ${getEvictSweepIntervalMs(evictSweepEnv) / 60000}m)`,
    );
  }
```

Inside `shutdown`, before closing the viewer server, add:

```typescript
    if (evictSweepTimer) clearInterval(evictSweepTimer);
```

- [ ] **Step 3: Run targeted tests**

Run: `npm test -- test/evict-scheduler.test.ts test/evict.test.ts`

Expected: both scheduler and existing eviction tests pass.

### Task 3: Security And Review Closure

**Files:**
- Modify: `docs/todos/2026-06-16-issue-480-pr-490-retention-evict-sweeps/todo.md`

- [ ] **Step 1: Update local review notes**

Record the final decision as `adapted import`, with neutral IDs only: `Issue 480`, `PR 490`, and `Fork issue 630`.

- [ ] **Step 2: Run verification**

Run:

```bash
npm test -- test/evict-scheduler.test.ts test/evict.test.ts
git diff --check
```

If code changed, run available required security gates:

```bash
semgrep scan --config p/default --error --metrics=off .
osv-scanner scan source .
```

If a scanner is unavailable, record the missing tool output instead of claiming it passed.

- [ ] **Step 3: Run merge prep**

Run `$prep-merge-to-local-main` from this branch. Record whether it committed, merged local main, skipped due no task-owned changes, or blocked.
