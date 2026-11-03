import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readUnixProcessExecutable, sameResolvedExecutable } from "../src/cli/compose-process.js";

const children: ChildProcess[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill("SIGKILL");
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Compose process executable identity", () => {
  it.skipIf(process.platform === "win32")("rejects a live PID running another binary", async () => {
    const child = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    expect(child.pid).toBeDefined();
    const os = process.platform === "darwin" ? "darwin" : "linux";
    const executable = readUnixProcessExecutable(child.pid!, os);
    expect(executable).not.toBe("");
    expect(sameResolvedExecutable(executable, process.execPath)).toBe(false);
  });

  it("accepts a configured executable through a symlink", () => {
    const directory = mkdtempSync(join(tmpdir(), "am-compose-bin-"));
    temporaryDirectories.push(directory);
    const link = join(directory, "node");
    symlinkSync(process.execPath, link);
    expect(sameResolvedExecutable(process.execPath, link)).toBe(true);
  });
});
