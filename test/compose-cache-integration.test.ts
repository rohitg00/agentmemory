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
import { prepareProbe, probeLifetime, stopProbe } from "./helpers/compose-probe-lifetime.js";

const engine = process.env.AGENTMEMORY_TEST_III;
const version = engine ? spawnSync(engine, ["--version"], { encoding: "utf8", timeout: 3000 }) : null;
const available = version?.status === 0 && version.stdout.trim() === III_PINNED_VERSION;
const skipped = !available || process.platform === "win32" || process.env.AGENTMEMORY_SKIP_LIVE_TESTS === "1";
if (process.env.AGENTMEMORY_REQUIRE_LIVE_TESTS === "1" && skipped) {
  throw new Error(`Required Compose cache path test needs iii ${III_PINNED_VERSION} and live tests enabled on macOS or Linux`);
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


describe.skipIf(skipped)("pinned Compose literal cache path round trip", () => {
  it.each(["env-file", "process"])("preserves literal cache paths from %s through Compose interpolation", async (source) => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-compose-cache-"));
    let child: ChildProcess | undefined;
    try {
      prepareProbe(root);
      const pkg = join(root, "worker");
      const snapshot = join(root, "received.json");
      mkdirSync(join(pkg, "dist"), { recursive: true });
      const value = "model-cache/${HOME}/$MODELS/$$/models";
      const cwd = join(root, "caller$directory");
      const expected = {
        cache: join(cwd, value),
        document: source === "env-file" ? "passage: ${HOME} $$ " : "passage: ${AGENTMEMORY_TEST_UNDEFINED} $$ ",
        query: "query: ${HOME} $$ ",
      };
      const envFile = join(root, "worker.env");
      writeFileSync(envFile, `export LOCAL_EMBEDDING_CACHE_DIR='${source === "env-file" ? value : "ignored-cache"}'\n`);
      const sdk = pathToFileURL(createRequire(import.meta.url).resolve("iii-sdk")).href;
      writeFileSync(join(pkg, "dist/index.mjs"), `
        import { existsSync, renameSync, writeFileSync } from "node:fs";
        ${probeLifetime(root)}
        const { default: sdkModule } = await import(${JSON.stringify(sdk)});
        const { registerWorker } = sdkModule;
        const worker = registerWorker(process.env.III_URL, { workerName: "agentmemory" });
        const received = { cache: process.env.LOCAL_EMBEDDING_CACHE_DIR,
          document: process.env.LOCAL_EMBEDDING_DOCUMENT_PREFIX, query: process.env.LOCAL_EMBEDDING_QUERY_PREFIX };
        worker.registerFunction("test::env", async () => received);
        writeFileSync(${JSON.stringify(`${snapshot}.tmp`)}, JSON.stringify(received));
        renameSync(${JSON.stringify(`${snapshot}.tmp`)}, ${JSON.stringify(snapshot)});
      `);
      const ports = { restPort: await freePort(), viewerPort: await freePort(), enginePort: await freePort() };
      const project = writeWorkerCompose({
        ports, projectRoot: pkg, dataDir: join(root, "data"), homeDir: join(root, "home"),
        nodeBin: process.execPath, cwd, envFile,
        workerEnvironment: {
          ...(source === "process" ? { LOCAL_EMBEDDING_CACHE_DIR: value } : {}),
          LOCAL_EMBEDDING_DOCUMENT_PREFIX: expected.document,
          LOCAL_EMBEDDING_QUERY_PREFIX: expected.query,
        },
      });
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
          expect(JSON.parse(readFileSync(snapshot, "utf8"))).toEqual(expected);
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Compose exited before the worker received its value: ${logs}`);
        await sleep(50);
      }
      throw new Error(`Worker environment snapshot timed out: ${logs}`);
    } finally {
      try { await stopProbe(child, root); }
      finally { rmSync(root, { recursive: true, force: true }); }
    }
  }, 30000);
});
