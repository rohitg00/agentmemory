import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// A fixed port can collide with a service already running on the host.
function freePortSync(): number {
  const probe = spawnSync(process.execPath, ["-e", "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"], { encoding: "utf-8" });
  const port = Number(probe.stdout.trim());
  if (!Number.isInteger(port) || port <= 0) throw new Error("failed to allocate a free REST port");
  return port;
}

const sandboxes: string[] = [];
function sandbox(): string {
  const path = mkdtempSync(join(tmpdir(), "agentmemory-lifecycle-"));
  sandboxes.push(path);
  return path;
}

function runInstanceRemove(instanceArgs = ["--instance", "1"]) {
  const root = sandbox();
  const home = join(root, "home");
  const privateBin = join(home, ".agentmemory", "bin", "iii");
  const dataBase = join(root, "data");
  mkdirSync(join(home, ".agentmemory", "bin"), { recursive: true });
  writeFileSync(privateBin, "shared binary");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli.ts",
      "remove",
      ...instanceArgs,
      "--data-dir",
      dataBase,
      "--force",
      "--keep-data",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        CI: "1",
      },
    },
  );
  return { result, privateBin };
}

function runNativeRemoveWithWorkerFailure() {
  const port = freePortSync();
  const root = sandbox();
  const home = join(root, "home");
  const runtimeDir = join(home, ".agentmemory");
  const privateBin = join(runtimeDir, "bin", "iii");
  const engineState = join(runtimeDir, "engine-state.json");
  const enginePidfile = join(runtimeDir, "iii.pid");
  const workerPidfile = join(runtimeDir, "worker.pid");
  const killLog = join(root, "kill.log");
  const preload = join(root, "deny-worker-signal.mjs");
  mkdirSync(join(runtimeDir, "bin"), { recursive: true });
  writeFileSync(privateBin, "owned binary");
  writeFileSync(enginePidfile, "424243\n");
  writeFileSync(workerPidfile, "424242\n");
  writeFileSync(
    engineState,
    JSON.stringify({
      kind: "native",
      configPath: join(root, "iii-config.runtime.yaml"),
      restPort: port,
    }),
  );
  writeFileSync(
    preload,
    `import { appendFileSync } from "node:fs";
const originalKill = process.kill.bind(process);
process.kill = (pid, signal) => {
  if (pid === 424242 || pid === 424243) {
    appendFileSync(process.env.KILL_LOG, String(pid) + ":" + String(signal) + "\\n");
    const error = new Error(pid === 424242 ? "worker denied" : "engine missing");
    error.code = pid === 424242 ? "EPERM" : "ESRCH";
    throw error;
  }
  return originalKill(pid, signal);
};
`,
  );

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      preload,
      "--import",
      "tsx",
      "src/cli.ts",
      "remove",
      "--force",
      "--keep-data",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        CI: "1",
        KILL_LOG: killLog,
      },
    },
  );

  return {
    result,
    privateBin,
    engineState,
    enginePidfile,
    workerPidfile,
    killLog: existsSync(killLog) ? readFileSync(killLog, "utf-8") : "",
  };
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("native removal shutdown", () => {
  it("stops the worker first and aborts all cleanup when it cannot stop", () => {
    const result = runNativeRemoveWithWorkerFailure();

    expect(result.result.status).toBe(1);
    expect(result.killLog).toBe("424242:SIGTERM\n");
    expect(existsSync(result.workerPidfile)).toBe(true);
    expect(existsSync(result.enginePidfile)).toBe(true);
    expect(existsSync(result.engineState)).toBe(true);
    expect(existsSync(result.privateBin)).toBe(true);
  });

  it("refuses an instance-scoped global uninstall before deleting shared assets", () => {
    const { result, privateBin } = runInstanceRemove();

    expect(result.status).toBe(1);
    expect(existsSync(privateBin)).toBe(true);
    expect(`${result.stdout}\n${result.stderr}`).toContain("stop --instance 1");
  });

  it.each([
    ["out-of-range", ["--instance", "51"]],
    ["non-integer", ["--instance", "nope"]],
    ["partial integer", ["--instance", "1nope"]],
    ["missing value", ["--instance"]],
    ["missing inline value", ["--instance="]],
  ])(
    "rejects an %s instance before deleting shared assets",
    (_label, instanceArgs) => {
      const { result, privateBin } = runInstanceRemove(instanceArgs);

      expect(result.status).toBe(1);
      expect(existsSync(privateBin)).toBe(true);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "--instance must be an integer between 0 and 50",
      );
    },
  );

  it.each([
    ["separate", ["--instance", "0"]],
    ["inline", ["--instance=0"]],
  ])("accepts valid instance zero in %s form", (_label, instanceArgs) => {
    const { result, privateBin } = runInstanceRemove(instanceArgs);

    expect(result.status).toBe(0);
    expect(existsSync(privateBin)).toBe(false);
  });

  it("accepts a valid nonzero inline instance", () => {
    const { result, privateBin } = runInstanceRemove(["--instance=1"]);

    expect(result.status).toBe(1);
    expect(existsSync(privateBin)).toBe(true);
    expect(`${result.stdout}\n${result.stderr}`).toContain("stop --instance 1");
  });
});
