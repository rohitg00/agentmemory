import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStartupCleanup, runStartupCleanup } from "../src/shutdown.js";

let unregister: (() => void) | undefined;
afterEach(() => { unregister?.(); unregister = undefined; });

describe("startup-owned process cleanup", () => {
  it("leaves normal runtime shutdown unchanged after readiness", async () => {
    const cleanup = vi.fn(async () => {});
    unregister = registerStartupCleanup(cleanup);
    unregister();
    expect(await runStartupCleanup(0)).toBe(0);
    expect(await runStartupCleanup(1)).toBe(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("coalesces fatal, signal and worker shutdown exits until the same cleanup finishes", async () => {
    let finish!: () => void;
    const cleanup = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    unregister = registerStartupCleanup(cleanup);
    const interrupt = runStartupCleanup(130);
    const fatal = runStartupCleanup(1);
    const workerExit = runStartupCleanup(0);
    let settled = false;
    void workerExit.then(() => { settled = true; });
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finish();
    expect(await Promise.all([interrupt, fatal, workerExit])).toEqual([130, 130, 130]);
  });

  it("shares startup ownership across separately loaded module instances", async () => {
    const cleanup = vi.fn(async () => {});
    unregister = registerStartupCleanup(cleanup);
    vi.resetModules();
    const workerModule = await import("../src/shutdown.js");
    expect(await workerModule.runStartupCleanup(1)).toBe(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("does not let an older completed attempt unregister the next attempt", async () => {
    const clearOld = registerStartupCleanup(async () => {});
    await runStartupCleanup(1);
    const cleanup = vi.fn(async () => {});
    unregister = registerStartupCleanup(cleanup);
    clearOld();
    expect(await runStartupCleanup(143)).toBe(143);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("keeps the original failure code when a later signal races with cleanup", async () => {
    unregister = registerStartupCleanup(async () => {});
    expect(await Promise.all([runStartupCleanup(1), runStartupCleanup(143)])).toEqual([1, 1]);
  });

  it("shares cleanup failure without running a second destructive cleanup", async () => {
    const cleanup = vi.fn(async () => { throw new Error("cleanup failed"); });
    unregister = registerStartupCleanup(cleanup);
    const results = await Promise.allSettled([runStartupCleanup(1), runStartupCleanup(143)]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
