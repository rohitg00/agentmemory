import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const sandboxes: string[] = [];
const cli = join(process.cwd(), "dist", "cli.mjs");

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});


function sandbox(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(path);
  return path;
}

describe("stop port ownership", () => {
  it("refuses saved Compose state on a different requested port without signaling the daemon", async () => {
    const root = sandbox("agentmemory-stop-port-");
    const home = join(root, "home");
    const runtime = join(home, ".agentmemory");
    const statePath = join(runtime, "engine-state.json");
    const enginePidfile = join(runtime, "iii.pid");
    const workerPidfile = join(runtime, "worker.pid");
    const namespace = "agentmemory-35111";
    const composeFile = join(root, "compose.yml");
    mkdirSync(runtime, { recursive: true });
    const daemon = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "compose", "--namespace", namespace, "--file", composeFile], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    if (!daemon.pid) throw new Error("synthetic Compose daemon failed to start");
    const state = {
      kind: "compose",
      restPort: 35111,
      viewerPort: 35113,
      enginePort: 81134,
      engineUrl: "http://127.0.0.1:81134",
      namespace,
      file: composeFile,
      stateDir: join(root, "state"),
      logFile: join(root, "compose.log"),
      binPath: process.execPath,
      composePid: daemon.pid,
    };
    writeFileSync(statePath, JSON.stringify(state));
    writeFileSync(enginePidfile, "424242\n");
    writeFileSync(workerPidfile, "424243\n");

    try {
      const result = spawnSync(process.execPath, [cli, "stop", "--port", "35121"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          AGENTMEMORY_RUNTIME_DIR: runtime,
          AGENTMEMORY_URL: "",
          CI: "1",
        },
      });
      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain("Saved Compose lifecycle state belongs to REST port 35111");
      expect(daemon.exitCode).toBe(null);
      expect(readFileSync(statePath, "utf8")).toBe(JSON.stringify(state));
      expect(readFileSync(enginePidfile, "utf8")).toBe("424242\n");
      expect(readFileSync(workerPidfile, "utf8")).toBe("424243\n");
    } finally {
      if (daemon.exitCode === null) daemon.kill("SIGTERM");
      await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
    }
  }, 20_000);
});

describe("configured status endpoint ownership", () => {
  it.each([
    { label: "remote IPv6", url: "http://[::1]:35111", expectedPrefix: "http://[::1]:35111/" },
    { label: "local Compose", url: "", expectedPrefix: "http://localhost:35111/" },
  ])("preserves the $label endpoint when Compose state has the same REST port", ({ url, expectedPrefix }) => {
    const root = sandbox("agentmemory-status-endpoint-");
    const home = join(root, "home");
    const runtime = join(home, ".agentmemory");
    const preload = join(root, "mock-fetch.mjs");
    const requestLog = join(root, "requests.log");
    const port = 35111;
    mkdirSync(runtime, { recursive: true });
    writeFileSync(preload, `
      import { appendFileSync } from "node:fs";
      globalThis.fetch = async (input) => {
        const url = String(input);
        appendFileSync(process.env.REQUEST_LOG, url + "\\n");
        const path = new URL(url).pathname;
        const body = path === "/"
          ? "{}"
          : path.endsWith("/livez")
            ? JSON.stringify({ status: "ok", viewerPort: null, viewerSkipped: true })
            : path.endsWith("/health")
              ? JSON.stringify({ status: "healthy", version: "fixture", health: { uptimeSeconds: 1 } })
              : path.endsWith("/sessions")
                ? JSON.stringify({ sessions: [] })
                : path.endsWith("/graph/stats")
                  ? JSON.stringify({ totalNodes: 0, totalEdges: 0 })
                  : path.endsWith("/memories")
                    ? JSON.stringify({ total: 0 })
                    : path.endsWith("/config/flags")
                      ? JSON.stringify({ flags: [] })
                      : JSON.stringify({ agentInitiatedSearches: 0, followupWithinWindow: 0, windowSeconds: 30 });
        return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
      };
    `);
    const state = {
      kind: "compose",
      restPort: port,
      viewerPort: port + 2,
      enginePort: port + 46023,
      engineUrl: "http://127.0.0.1:1",
      namespace: "agentmemory-fixture",
      file: join(root, "compose.yml"),
      stateDir: join(root, "state"),
      logFile: join(root, "compose.log"),
      binPath: "/bin/true",
    };
    writeFileSync(join(runtime, "engine-state.json"), JSON.stringify(state));

    const result = spawnSync(process.execPath, ["--import", preload, cli, "status"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        AGENTMEMORY_RUNTIME_DIR: runtime,
        AGENTMEMORY_URL: url,
        III_REST_PORT: String(port),
        REQUEST_LOG: requestLog,
        CI: "1",
      },
    });
    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Connected");
    const requests = readFileSync(requestLog, "utf8").trim().split("\n");
    expect(requests.length).toBeGreaterThan(1);
    expect(requests[0]).toBe(expectedPrefix);
    expect(requests.every((requestUrl) => requestUrl.startsWith(expectedPrefix))).toBe(true);
  }, 15_000);
});
