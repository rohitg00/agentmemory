import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { prepareProbe, probeLifetime, stopProbe } from "./helpers/compose-probe-lifetime.js";

it("stops the owned probe when its Compose parent has already exited", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentmemory-probe-cleanup-"));
  let parent: ChildProcess | undefined;
  let probe: ChildProcess | undefined;
  try {
    prepareProbe(root);
    parent = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    await new Promise<void>((accept) => parent!.once("exit", () => accept()));
    probe = spawn(process.execPath, ["--input-type=module", "-e", `
      import { existsSync, writeFileSync } from "node:fs";
      ${probeLifetime(root)}
    `], { stdio: "ignore" });
    const deadline = Date.now() + 5000;
    while (!existsSync(join(root, "probe-pid"))) {
      if (Date.now() >= deadline) throw new Error("Test probe did not start");
      await sleep(20);
    }
    await stopProbe(parent, root);
    expect(parent.exitCode).toBe(0);
    expect(probe.exitCode).toBe(0);
  } finally {
    try { await stopProbe(parent, root); }
    finally {
      if (probe && probe.exitCode === null && probe.signalCode === null) {
        const exited = new Promise<void>((accept) => probe!.once("exit", () => accept()));
        probe.kill("SIGKILL");
        await exited;
      }
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 15000);


it.each(["parent", "probe", "both"])("preserves cleanup diagnostics: %s", async (failure) => {
  const root = mkdtempSync(join(tmpdir(), "agentmemory-probe-errors-"));
  const killFailure = Object.assign(new Error("process-group kill denied"), { code: "EPERM" });
  const child = Object.assign(new EventEmitter(), {
    exitCode: null, signalCode: null, pid: 123456, kill: vi.fn(() => true),
  }) as unknown as ChildProcess;
  const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
    if (pid < 0) throw killFailure;
    if (failure === "parent") throw Object.assign(new Error("probe already exited"), { code: "ESRCH" });
    return true;
  });
  try {
    prepareProbe(root);
    writeFileSync(join(root, "probe-pid"), "123456");
    let caught: unknown;
    try { await stopProbe(failure === "probe" ? undefined : child, root, 1); }
    catch (error) { caught = error; }
    if (failure === "parent") expect(caught).toBe(killFailure);
    else if (failure === "probe") expect(caught).toHaveProperty("message", "Test probe did not exit after its lifetime ended");
    else {
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([
        killFailure, expect.objectContaining({ message: "Test probe did not exit after its lifetime ended" }),
      ]);
    }
  } finally {
    kill.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
