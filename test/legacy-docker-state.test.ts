import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { legacyDockerStateMessage, legacyDockerStopCommand } from "../src/cli/legacy-docker-state.js";

const state = {
  kind: "docker" as const,
  composeFile: "/tmp/old project's/docker-compose.yml",
  projectName: "agentmemory-3111",
  restPort: 3111,
};

const command = `docker compose -p 'agentmemory-3111' -f '/tmp/old project'"'"'s/docker-compose.yml' stop`;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to allocate free REST port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

describe("legacy Docker state migration notice", () => {
  it("builds a scoped Compose stop command from the saved project and file", () => {
    expect(legacyDockerStopCommand(state)).toBe(command);
  });

  it("warns without changing state and explains the exact next action", () => {
    const message = legacyDockerStateMessage(state);
    expect(message).toContain("older Docker-based agentmemory CLI (REST port 3111)");
    expect(message).toContain(command);
    expect(message).toContain("no container or data was changed");
  });

  it("falls back to the saved container ID only when Compose metadata is absent", () => {
    expect(legacyDockerStopCommand({ kind: "docker", containerId: "old-engine-1" })).toBe("docker stop 'old-engine-1'");
  });
});


const sandboxes: string[] = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("legacy Docker lifecycle CLI compatibility", () => {
  it.each(["start", "stop", "status", "remove"] as const)(
    "reports recovery instructions on %s without calling Docker or clearing state/data",
    async (command) => {
      const root = mkdtempSync(join(tmpdir(), "agentmemory-legacy-cli-"));
      sandboxes.push(root);
      const home = join(root, "home");
      const runtime = join(home, ".agentmemory");
      const port = await freePort();
      const legacyStateForPort = { ...state, restPort: port, projectName: `agentmemory-${port}` };
      const dataDir = join(root, "data");
      const binDir = join(root, "bin");
      const dockerLog = join(root, "docker.log");
      mkdirSync(runtime, { recursive: true });
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, "legacy-data.txt"), "preserve me");
      mkdirSync(binDir, { recursive: true });
      const docker = join(binDir, "docker");
      writeFileSync(docker, `#!/bin/sh\nprintf called >> "$DOCKER_LOG"\nexit 90\n`, { mode: 0o755 });
      const statePath = join(runtime, "engine-state.json");
      const legacyState = legacyStateForPort;
      writeFileSync(statePath, JSON.stringify(legacyState));
      const args = command === "start"
        ? ["--port", String(port), "--data-dir", dataDir, "--reset"]
        : [command, ...(command === "remove" ? ["--force"] : []), "--port", String(port), "--data-dir", dataDir];
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          AGENTMEMORY_RUNTIME_DIR: runtime,
          CI: "1",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          DOCKER_LOG: dockerLog,
          AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
          III_REST_PORT: String(port),
        },
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain(`older Docker-based agentmemory CLI (REST port ${port})`);
      if (command !== "remove") expect(output).toContain(command);
      expect(output).toContain(`docker compose -p 'agentmemory-${port}'`);
      expect(readFileSync(statePath, "utf8")).toBe(JSON.stringify(legacyState));
      expect(readFileSync(join(dataDir, "legacy-data.txt"), "utf8")).toBe("preserve me");
      expect(existsSync(dockerLog)).toBe(false);
    },
  );
});
