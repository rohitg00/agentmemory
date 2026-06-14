import { describe, expect, it } from "vitest";
import {
  classifyEngineExit,
  formatEngineExit,
  planEngineRestart,
} from "../src/cli/engine-supervisor.js";

describe("engine supervisor decisions", () => {
  it("treats clean exit and stop signals as expected", () => {
    expect(classifyEngineExit(0, null)).toBe("expected");
    expect(classifyEngineExit(null, "SIGTERM")).toBe("expected");
    expect(classifyEngineExit(null, "SIGINT")).toBe("expected");
  });

  it("treats non-zero exits and crash signals as unexpected", () => {
    expect(classifyEngineExit(1, null)).toBe("unexpected");
    expect(classifyEngineExit(null, "SIGKILL")).toBe("unexpected");
  });

  it("formats child exits for persistent logs", () => {
    expect(formatEngineExit(1, null)).toBe("code=1 signal=null");
    expect(formatEngineExit(null, "SIGKILL")).toBe("code=null signal=SIGKILL");
  });

  it("schedules bounded restarts with increasing delays", () => {
    const first = planEngineRestart([], 1000);
    expect(first).toMatchObject({ action: "restart", attempt: 1, delayMs: 1000 });

    expect(first.action).toBe("restart");
    if (first.action !== "restart") return;

    const second = planEngineRestart(first.recentExits, 2000);
    expect(second).toMatchObject({ action: "restart", attempt: 2, delayMs: 5000 });

    expect(second.action).toBe("restart");
    if (second.action !== "restart") return;

    const third = planEngineRestart(second.recentExits, 3000);
    expect(third).toMatchObject({ action: "restart", attempt: 3, delayMs: 15000 });

    expect(third.action).toBe("restart");
    if (third.action !== "restart") return;

    const fourth = planEngineRestart(third.recentExits, 4000);
    expect(fourth).toMatchObject({ action: "exhausted", maxAttempts: 3 });
  });

  it("drops old exits outside the restart window", () => {
    const decision = planEngineRestart([0, 1000, 2000], 60_000, {
      maxAttempts: 2,
      windowMs: 10_000,
      delaysMs: [25],
    });
    expect(decision).toMatchObject({
      action: "restart",
      attempt: 1,
      delayMs: 25,
      recentExits: [60_000],
    });
  });
});
