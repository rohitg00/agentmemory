import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { composeNamespace, writeWorkerCompose } from "../src/cli/compose-project.js";
import { III_PINNED_VERSION } from "../src/version.js";

const engine = process.env.AGENTMEMORY_TEST_III;
const version = engine ? spawnSync(engine, ["--version"], { encoding: "utf8", timeout: 3000 }) : null;
const available = version?.status === 0 && version.stdout.trim() === III_PINNED_VERSION;
const skipped = !available || process.platform === "win32" || process.env.AGENTMEMORY_SKIP_LIVE_TESTS === "1";
if (process.env.AGENTMEMORY_REQUIRE_LIVE_TESTS === "1" && skipped) {
  throw new Error(`Required Compose C1 test needs iii ${III_PINNED_VERSION} and live tests enabled on macOS or Linux`);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((accept) => server.close(() => accept()));
  return port;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((accept) => child.once("exit", () => accept()));
  child.kill("SIGINT");
  const result = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
  if (!result && child.pid) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await exited;
  }
}

describe.skipIf(skipped)("pinned Compose C1 environment round trip", () => {
  it("delivers all C1 characters and line breaks unchanged to a real worker", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-compose-c1-"));
    let child: ChildProcess | undefined;
    try {
      const pkg = join(root, "worker");
      const snapshot = join(root, "received.json");
      mkdirSync(join(pkg, "dist"), { recursive: true });
      const value = `first\n${String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 0x80 + i))}\r\nquote'\"\\\tend\n`;
      const sdk = pathToFileURL(createRequire(import.meta.url).resolve("iii-sdk")).href;
      writeFileSync(join(pkg, "dist/index.mjs"), `
        import sdkModule from ${JSON.stringify(sdk)};
        import { writeFileSync } from "node:fs";
        const { registerWorker } = sdkModule;
        const worker = registerWorker(process.env.III_URL, { workerName: "agentmemory" });
        worker.registerFunction("test::env", async () => process.env.OPENAI_BASE_URL);
        writeFileSync(${JSON.stringify(snapshot)}, JSON.stringify(process.env.OPENAI_BASE_URL));
      `);
      const ports = { restPort: await freePort(), viewerPort: await freePort(), enginePort: await freePort() };
      const project = writeWorkerCompose({
        ports, projectRoot: pkg, dataDir: join(root, "data"), homeDir: join(root, "home"),
        nodeBin: process.execPath, workerEnvironment: { OPENAI_BASE_URL: value },
      });
      // Keep the generated scalar untouched while replacing registry workers with one local probe.
      const header = project.text.slice(0, project.text.indexOf("containers:\n"));
      const app = project.text.slice(project.text.indexOf("  agentmemory:\n"))
        .replace("    start_after: [state, http]", "    start_after: []");
      writeFileSync(project.file, `${header}containers:\n${app}`);
      child = spawn(engine!, ["compose", "--namespace", composeNamespace(ports.restPort), "--up", "--file", project.file], {
        env: { PATH: process.env.PATH, HOME: join(root, "home"), USERPROFILE: join(root, "home"),
          III_COMPOSE_STATE_DIR: project.stateDir, III_TELEMETRY_ENABLED: "false", III_BUNDLE_WORKERS_DISABLED: "1", RUST_LOG: "error" },
        detached: true, stdio: ["ignore", "ignore", "pipe"],
      });
      let logs = "";
      child.stderr?.on("data", (chunk) => { logs = `${logs}${chunk}`.slice(-16000); });
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        try {
          expect(JSON.parse(readFileSync(snapshot, "utf8"))).toBe(value);
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Compose exited before the worker received its value: ${logs}`);
        await sleep(50);
      }
      throw new Error(`Worker environment snapshot timed out: ${logs}`);
    } finally {
      if (child) await stop(child);
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
