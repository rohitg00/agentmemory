import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const require = createRequire(import.meta.url);
const entrypoint = readFileSync("deploy/runtime/entrypoint.sh", "utf8");
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deploy-runtime-"));
  roots.push(root);
  mkdirSync(join(root, "config"));
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("deployment entrypoint", () => {
  it.each(["2000", "500"])("generates file and Redis configurations with save interval %s", (interval) => {
    const root = fixture();
    const program = entrypoint.split("node <<'NODE'\n")[1].split("\nNODE")[0]
      .replace('"/opt/agentmemory/worker-compose.yaml"', JSON.stringify(resolve("deploy/runtime/worker-compose.yaml")))
      .replace('"/opt/agentmemory/node_modules/yaml"', JSON.stringify(require.resolve("yaml")))
      .replaceAll(/fs\.chownSync\([^;]+\);/g, "");
    for (const backend of ["", "redis"]) {
      execFileSync(process.execPath, ["-e", program], { env: {
        PATH: process.env.PATH, AGENTMEMORY_DATA_DIR: root,
        AGENTMEMORY_STATE_SAVE_INTERVAL_MS: interval,
        REST_ALLOWED_ORIGINS: "https://viewer.example,https://other.example",
        AGENTMEMORY_STATE_BACKEND: backend, AGENTMEMORY_REDIS_URL: "redis://127.0.0.1:6379/2",
      } });
      const text = readFileSync(join(root, "worker-compose.runtime.yaml"), "utf8")
        .replaceAll("${AGENTMEMORY_STATE_SAVE_INTERVAL_MS:-2000}", interval);
      const compose = parse(text);
      expect(compose.containers.state.config_override.adapter).toEqual(backend === "redis"
        ? { name: "redis", config: { redis_url: "redis://127.0.0.1:6379/2" } }
        : { name: "kv", config: { store_method: "file_based", file_path: "/data/state_store.db", save_interval_ms: interval } });
      expect(compose.containers.http.config_override.cors.allowed_origins).toEqual(["https://viewer.example", "https://other.example"]);
      expect(compose.containers.state.version).toBe("${STATE_VERSION}");
    }
  });

  it.each([false, true])("migrates the legacy file without overriding an explicit secret (%s)", (explicit) => {
    const root = fixture();
    writeFileSync(join(root, ".hmac"), "legacy-fixture\n");
    const prefix = entrypoint.split("# The former Docker runtime")[0];
    const script = `chown() { :; }\n${prefix}\nexec node --import tsx --input-type=module -e 'import { ensureServerSecret } from "./src/secret-store.ts"; const result = ensureServerSecret(); if(result.secret !== process.env.EXPECTED_SECRET) process.exit(1);'`;
    execFileSync("sh", ["-c", script], { env: {
      PATH: process.env.PATH, HOME: join(root, "home"), USERPROFILE: join(root, "home"),
      AGENTMEMORY_DATA_DIR: root, AGENTMEMORY_SECRET: explicit ? "operator-fixture" : "",
      EXPECTED_SECRET: explicit ? "operator-fixture" : "legacy-fixture",
    } });
    if (!explicit) {
      expect(readFileSync(join(root, "secret"), "utf8").trim()).toBe("legacy-fixture");
      expect(readFileSync(join(root, "home/.agentmemory/secret"), "utf8").trim()).toBe("legacy-fixture");
      expect(statSync(join(root, "secret")).mode & 0o777).toBe(0o600);
    }
  });
});
