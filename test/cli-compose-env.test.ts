import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { III_PINNED_VERSION } from "../src/version.js";

describe.skipIf(process.platform === "win32")("CLI Compose environment", () => {
  it("copies the selected env file instead of the unrelated home default", async () => {
    const root = mkdtempSync(join(tmpdir(), "am-cli-compose-env-"));
    const home = join(root, "home");
    const dataDir = join(root, "data");
    const binDir = join(home, ".agentmemory", "bin");
    const customEnv = join(root, "custom.env");
    const listeners = Array.from({ length: 3 }, () => createServer());
    try {
      const ports = await Promise.all(listeners.map((server) => new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
      })));
      await Promise.all(listeners.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "iii"), [
        "#!/bin/sh",
        `if [ "$1" = "--version" ]; then printf '%s\\n' 'iii ${III_PINNED_VERSION}'; exit 0; fi`,
        "exit 1", "",
      ].join("\n"), { mode: 0o755 });
      writeFileSync(join(home, ".agentmemory", ".env"), "CUSTOM_SETTING=wrong-profile\n");
      writeFileSync(customEnv, "CUSTOM_SETTING=selected-profile\nIII_NAMESPACE=wrong-namespace\n");
      const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts"], {
        cwd: resolve(import.meta.dirname, ".."),
        env: {
          HOME: home, USERPROFILE: home,
          PATH: [binDir, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
          CI: "1", NO_COLOR: "1",
          AGENTMEMORY_DATA_DIR: dataDir,
          AGENTMEMORY_ENV_FILE: customEnv,
          AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "1000",
          AGENTMEMORY_READY_TIMEOUT_MS: "1000",
          III_REST_PORT: String(ports[0]), III_VIEWER_PORT: String(ports[1]), III_ENGINE_PORT: String(ports[2]),
        },
        timeout: 10_000,
      }).then(() => ({ code: 0 }), (error: { code: unknown; stdout?: string; stderr?: string }) => error);
      expect(result.code).toBe(1);
      const filtered = join(dataDir, "compose", ".agentmemory-filtered.env");
      expect(readFileSync(filtered, "utf8")).toBe("CUSTOM_SETTING=selected-profile\n\n");
      const compose = parse(readFileSync(join(dataDir, "compose", "worker-compose.yaml"), "utf8"));
      expect(compose.containers.agentmemory.env_file).toEqual([filtered]);
      expect(compose.containers.agentmemory.environment.AGENTMEMORY_ENV_FILE).toBe(filtered);
    } finally {
      for (const server of listeners) server.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
