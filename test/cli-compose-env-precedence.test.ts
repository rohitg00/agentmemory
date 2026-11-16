import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { III_PINNED_VERSION } from "../src/version.js";

const execFileAsync = promisify(execFile);

describe.skipIf(process.platform === "win32")("CLI Compose env-file precedence", () => {
  it.each([
    { name: "keeps file-only values out of the YAML", withFile: true, shellKey: undefined, tools: false },
    { name: "preserves a different shell override", withFile: true, shellKey: "fixture-shell-openai", tools: false },
    { name: "preserves a shell override equal to the file value", withFile: true, shellKey: "fixture-file-openai", tools: false },
    { name: "forwards shell values without an env file", withFile: false, shellKey: "fixture-shell-openai", tools: false },
    { name: "preserves --tools over the shell and env file", withFile: true, shellKey: undefined, tools: true },
  ])("$name", async ({ withFile, shellKey, tools }) => {
    const withKeys = withFile && !tools;
    const root = mkdtempSync(join(tmpdir(), "am-cli-compose-precedence-"));
    const home = join(root, "home");
    const dataDir = join(root, "data");
    const binDir = join(home, ".agentmemory", "bin");
    const envFile = join(root, "selected.env");
    const listeners = Array.from({ length: 3 }, () => createServer());
    const cwd = resolve(import.meta.dirname, "..");
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
      const fileContent = [
        ...(withKeys ? [
          "OPENAI_API_KEY=fixture-file-openai",
          "ANTHROPIC_API_KEY=fixture-file-anthropic",
          "AGENTMEMORY_SECRET=fixture-file-auth",
        ] : []),
        ...(tools ? ["AGENTMEMORY_TOOLS=all"] : []),
        "AGENTMEMORY_STATE_SAVE_INTERVAL_MS=9000",
        "",
      ].join("\n");
      if (withFile) writeFileSync(envFile, fileContent);
      const result = await execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", ...(tools ? ["--tools", "core"] : [])], {
        cwd,
        env: {
          HOME: home, USERPROFILE: home,
          PATH: [binDir, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
          CI: "1", NO_COLOR: "1",
          AGENTMEMORY_DATA_DIR: dataDir,
          AGENTMEMORY_ENV_FILE: envFile,
          AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "1000",
          AGENTMEMORY_READY_TIMEOUT_MS: "1000",
          III_REST_PORT: String(ports[0]), III_VIEWER_PORT: String(ports[1]), III_ENGINE_PORT: String(ports[2]),
          ...(shellKey === undefined ? {} : { OPENAI_API_KEY: shellKey }),
          ...(tools ? { AGENTMEMORY_TOOLS: "all" } : {}),
        },
        timeout: 12_000,
      }).then(() => ({ code: 0 }), (error: { code: unknown }) => error);
      expect(result.code).toBe(1);
      const text = readFileSync(join(dataDir, "compose", "worker-compose.yaml"), "utf8");
      const compose = parse(text);
      const worker = compose.containers.agentmemory;
      if (withFile) {
        const filtered = join(dataDir, "compose", ".agentmemory-filtered.env");
        expect(readFileSync(filtered, "utf8")).toBe(`${fileContent}\n`);
        expect(worker.env_file).toEqual([filtered]);
        expect(worker.environment.AGENTMEMORY_ENV_FILE).toBe(filtered);
        expect(compose.containers.state.config_override.adapter.config.save_interval_ms).toBe(9000);
      } else {
        expect(worker.env_file).toBeUndefined();
      }
      const hydrated = await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", [
        'import { hydrateProcessEnvFromFile } from "./src/config.ts";',
        "hydrateProcessEnvFromFile();",
        'console.log(JSON.stringify(Object.fromEntries(["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AGENTMEMORY_SECRET", "AGENTMEMORY_STATE_SAVE_INTERVAL_MS", "AGENTMEMORY_TOOLS"].map(key => [key, process.env[key]]))));',
      ].join("\n")], { cwd, env: worker.environment, timeout: 12_000 });
      const effective = JSON.parse(hydrated.stdout);
      expect(effective.OPENAI_API_KEY).toBe(shellKey ?? (withKeys ? "fixture-file-openai" : undefined));
      expect(effective.ANTHROPIC_API_KEY).toBe(withKeys ? "fixture-file-anthropic" : undefined);
      expect(effective.AGENTMEMORY_SECRET).toBe(withKeys ? "fixture-file-auth" : undefined);
      if (withFile) expect(effective.AGENTMEMORY_STATE_SAVE_INTERVAL_MS).toBe("9000");

      if (tools) {
        expect(worker.environment.AGENTMEMORY_TOOLS).toBe("core");
        expect(effective.AGENTMEMORY_TOOLS).toBe("core");
      }
      expect(worker.environment.OPENAI_API_KEY).toBe(shellKey);
      expect(worker.environment).not.toHaveProperty("ANTHROPIC_API_KEY");
      expect(worker.environment).not.toHaveProperty("AGENTMEMORY_SECRET");
      if (withFile) expect(text).not.toContain("fixture-file-anthropic");
    } finally {
      for (const server of listeners) server.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 25_000);
});
