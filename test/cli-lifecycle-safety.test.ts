import { spawnSync } from "node:child_process";
import {
  chmodSync,
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

const sandboxes: string[] = [];
const FULL_CONTAINER_ID =
  "a348133fe52fc5ba49b74cb0a4e36a1ec1d64827d79dc120940a96054bbe87c4";

function sandbox(): string {
  const path = mkdtempSync(join(tmpdir(), "agentmemory-lifecycle-"));
  sandboxes.push(path);
  return path;
}

function installFakeDocker(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const dockerPath = join(binDir, "docker");
  writeFileSync(
    dockerPath,
    `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.DOCKER_LOG, args.join(" ") + "\\n");
const isComposePs = args[0] === "compose" && args.includes("ps");
const isGlobalPs = args[0] === "ps";
if (process.env.DOCKER_FAILURE_MODE === "scan" && (isComposePs || isGlobalPs)) {
  process.exit(1);
}
if (isComposePs || isGlobalPs) {
  if (process.env.DOCKER_FAILURE_MODE === "duplicate") {
    process.stdout.write((isComposePs ? process.env.FULL_CONTAINER_ID.slice(0, 12) : process.env.FULL_CONTAINER_ID) + "\\n");
  } else {
    process.stdout.write("candidate-id\\n");
  }
  process.exit(0);
}
if (args[0] === "inspect") {
  if (process.env.DOCKER_FAILURE_MODE === "duplicate") {
    process.stdout.write(JSON.stringify([{
      Id: process.env.FULL_CONTAINER_ID,
      State: { Running: false },
      Config: {
        Image: "iiidev/iii:0.11.2",
        Labels: {
          "com.docker.compose.project": "agentmemory-3111",
          "com.docker.compose.service": "iii-engine"
        }
      },
      HostConfig: { PortBindings: { "3111/tcp": [{ HostPort: "3111" }] } },
      Mounts: [{ Type: "bind", Source: process.env.DOCKER_DATA_DIR, Destination: "/data" }]
    }]));
    process.exit(0);
  }
  process.exit(1);
}
process.exit(0);
`,
  );
  chmodSync(dockerPath, 0o755);
}

function runDockerStop(
  failureMode: "scan" | "inspect" | "duplicate",
  command: "stop" | "remove" = "stop",
) {
  const root = sandbox();
  const home = join(root, "home");
  const runtimeDir = join(home, ".agentmemory");
  const dataDir = join(root, "data");
  const binDir = join(root, "bin");
  const composeFile = join(root, "docker-compose.yml");
  const dockerLog = join(root, "docker.log");
  const privateBin = join(runtimeDir, "bin", "iii");
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  if (command === "remove") {
    mkdirSync(join(runtimeDir, "bin"), { recursive: true });
    writeFileSync(privateBin, "owned binary");
  }
  installFakeDocker(binDir);
  writeFileSync(
    composeFile,
    "services:\n  iii-engine:\n    image: iiidev/iii:0.11.2\n  iii-init:\n    image: busybox\n",
  );
  const statePath = join(runtimeDir, "engine-state.json");
  writeFileSync(
    statePath,
    JSON.stringify({
      kind: "docker",
      schemaVersion: 2,
      composeFile,
      projectName: "agentmemory-3111",
      engineVersion: "0.11.2",
      restPort: 3111,
      dataDir,
      ...(failureMode === "inspect" ? { containerId: "candidate-id" } : {}),
      dataMountType: "bind",
      dataMountSource: dataDir,
      preserveContainer: false,
    }),
  );

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli.ts",
      command,
      ...(command === "remove" ? ["--force", "--keep-data"] : []),
      "--data-dir",
      dataDir,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        CI: "1",
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DOCKER_LOG: dockerLog,
        DOCKER_FAILURE_MODE: failureMode,
        DOCKER_DATA_DIR: dataDir,
        FULL_CONTAINER_ID,
      },
    },
  );

  return {
    result,
    statePath,
    privateBin,
    dockerLog: existsSync(dockerLog) ? readFileSync(dockerLog, "utf-8") : "",
  };
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
      restPort: 3111,
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

describe("Docker lifecycle discovery", () => {
  it.each(["scan", "inspect"] as const)(
    "preserves ownership and performs no cleanup when Docker %s fails",
    (failureMode) => {
      const { result, statePath, dockerLog } = runDockerStop(failureMode);

      expect(result.status).toBe(1);
      expect(existsSync(statePath)).toBe(true);
      expect(dockerLog).not.toMatch(/\bcompose\b.*\brm\b/);
      expect(`${result.stdout}\n${result.stderr}`).toContain("cannot be verified");
    },
  );

  it("deduplicates short and full IDs for the same inspected container", () => {
    const { result, statePath, dockerLog } = runDockerStop("duplicate");

    expect(result.status).toBe(0);
    expect(existsSync(statePath)).toBe(true);
    expect(dockerLog).not.toMatch(/\bcompose\b.*\brm\b/);
    expect(JSON.parse(readFileSync(statePath, "utf-8")).containerId).toBe(
      FULL_CONTAINER_ID,
    );
  });

  it("removes shared assets while preserving validated Docker recovery state with --keep-data", () => {
    const { result, statePath, privateBin, dockerLog } = runDockerStop(
      "duplicate",
      "remove",
    );

    expect(result.status).toBe(0);
    expect(existsSync(statePath)).toBe(true);
    expect(existsSync(privateBin)).toBe(false);
    expect(dockerLog).not.toMatch(/\bcompose\b.*\brm\b/);
  });
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
