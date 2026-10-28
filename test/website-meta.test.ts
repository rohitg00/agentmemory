import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("website metadata", () => {
  it("counts REST routes regardless of config field order and includes viewer endpoints", () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-website-meta-"));
    try {
      const scripts = join(root, "website", "scripts");
      const triggers = join(root, "src", "triggers");
      mkdirSync(scripts, { recursive: true });
      mkdirSync(triggers, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
      copyFileSync("website/scripts/gen-meta.mjs", join(scripts, "gen-meta.mjs"));
      writeFileSync(join(root, "offline.mjs"), "globalThis.fetch = async () => { throw new Error('offline'); };\n");
      writeFileSync(join(triggers, "api.ts"), `
        sdk.registerTrigger({ type: "http", config: { api_path: "/agentmemory/health", http_method: "GET" } });
        sdk.registerTrigger({ type: "http", config: { middleware_function_ids: ["auth"], api_path: \`/agentmemory/compression\`, http_method: "GET" } });
        sdk.registerTrigger({ type: "http", config: { http_method: "POST", api_path: "/agentmemory/compression/retry" } });
      `);
      writeFileSync(join(triggers, "viewer-sse.ts"), `
        sdk.registerTrigger({ type: "http", config: { api_path: "/agentmemory/viewer/events", http_method: "GET" } });
      `);
      writeFileSync(join(triggers, "viewer-streams.ts"), `
        sdk.registerTrigger({ type: "http", config: { api_path: "/agentmemory/viewer/snapshot", http_method: "GET" } });
        sdk.registerTrigger({ type: "http", config: { api_path: "/agentmemory/counts", http_method: "GET" } });
      `);

      execFileSync(process.execPath, ["--import", join(root, "offline.mjs"), join(scripts, "gen-meta.mjs")], { timeout: 10_000, stdio: "pipe" });

      const meta = JSON.parse(readFileSync(join(root, "website", "lib", "generated-meta.json"), "utf8"));
      expect(meta.version).toBe("1.2.3");
      expect(meta.restEndpoints).toBe(6);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
