import type { ChildProcess } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export function prepareProbe(root: string): void {
  writeFileSync(join(root, "probe-active"), "active");
}

export function probeLifetime(root: string): string {
  // The probe must stop even when Compose exits without a working reaper.
  return `
    setInterval(() => {
      if (!existsSync(${JSON.stringify(join(root, "probe-active"))})) process.exit(0);
    }, 50);
    writeFileSync(${JSON.stringify(join(root, "probe-pid"))}, String(process.pid));
    if (!existsSync(${JSON.stringify(join(root, "probe-active"))})) process.exit(0);
  `;
}

function running(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

export async function stopProbe(child: ChildProcess | undefined, root: string, timeoutMs = 5000): Promise<void> {
  const errors: unknown[] = [];
  try { rmSync(join(root, "probe-active"), { force: true }); }
  catch (error) { errors.push(error); }
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((accept) => child.once("exit", () => accept()));
      child.kill("SIGINT");
      const ended = await Promise.race([exited.then(() => true), sleep(timeoutMs).then(() => false)]);
      if (!ended && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
        await exited;
      }
    }
  } catch (error) { errors.push(error); }
  try {
    let pid: number | undefined;
    try { pid = Number(readFileSync(join(root, "probe-pid"), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (pid !== undefined) {
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid test probe pid");
      const deadline = Date.now() + timeoutMs;
      while (running(pid)) {
        if (Date.now() >= deadline) throw new Error("Test probe did not exit after its lifetime ended");
        await sleep(50);
      }
    }
  } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Compose and probe cleanup failed");
}
