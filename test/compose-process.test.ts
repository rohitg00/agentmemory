import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyComposeProcess, readUnixProcessExecutable, sameResolvedExecutable } from "../src/cli/compose-process.js";

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

describe("Compose process identity classification", () => {
  const expected = {
    namespace: "agentmemory-3111",
    file: "/home/u/.agentmemory/compose/worker-compose.yaml",
    binPath: process.execPath,
  };
  const ownedCommand = `iii compose --namespace ${expected.namespace} --up --file ${expected.file}`;

  it("matches the recorded daemon command and executable", () => {
    expect(classifyComposeProcess({ command: ownedCommand, executable: process.execPath }, expected)).toBe("match");
  });

  it("reports a reused PID running an unrelated command as foreign", () => {
    expect(classifyComposeProcess({ command: "/bin/sleep 300", executable: "/bin/sleep" }, expected)).toBe("foreign");
    expect(classifyComposeProcess({ command: "iii compose --namespace agentmemory-3211 --up --file /other.yaml", executable: process.execPath }, expected)).toBe("foreign");
  });

  it("stays unknown when process inspection fails", () => {
    expect(classifyComposeProcess(null, expected)).toBe("unknown");
    expect(classifyComposeProcess({ command: "", executable: "" }, expected)).toBe("unknown");
  });

  it("stays unknown when the daemon command matches but its executable no longer resolves to the saved binary", () => {
    expect(classifyComposeProcess({ command: ownedCommand, executable: "" }, expected)).toBe("unknown");
    expect(classifyComposeProcess({ command: ownedCommand, executable: "/nonexistent/iii (deleted)" }, expected)).toBe("unknown");
  });
});
