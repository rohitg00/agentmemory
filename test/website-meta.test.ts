import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("website metadata", () => {
  it("derives source counts and refuses stale metadata or incomplete evaluation receipts", () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-website-meta-"));
    try {
      const scripts = join(root, "website", "scripts");
      const triggers = join(root, "src", "triggers");
      mkdirSync(scripts, { recursive: true });
      mkdirSync(triggers, { recursive: true });
      mkdirSync(join(root, "scripts"));
      mkdirSync(join(root, "src", "mcp"));
      writeFileSync(join(root, "scripts", "docs-sync.state.json"), JSON.stringify({
        version: "1.2.3", facts: { tests: ["4000+"] },
      }));
      writeFileSync(join(root, "src", "mcp", "tools-registry.ts"), 'const tool = { name: "memory_save" };');
      writeFileSync(join(root, "src", "types.ts"), 'export type HookType = "session-start" | "stop";');
      const receipts = "docs/benchmarks/receipts/2026-10-28";
      for (const suite of ["longmemeval", "coding"]) {
        const target = join(root, receipts, suite);
        mkdirSync(target, { recursive: true });
        for (const name of ["manifest.json", "summary.json"]) {
          copyFileSync(join(receipts, suite, name), join(target, name));
        }
      }
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
      expect(meta.mcpTools).toBe(1);
      expect(meta.hooks).toBe(2);
      expect(meta.testCases).toBe("4000+");
      expect(meta).not.toHaveProperty("testsPassing");
      const generated = JSON.parse(readFileSync(join(root, "website", "lib", "generated-evaluation.json"), "utf8"));
      expect(generated.longmemeval).toEqual(JSON.parse(readFileSync(join(receipts, "longmemeval", "summary.json"), "utf8")));

      const run = () => execFileSync(process.execPath, ["--import", join(root, "offline.mjs"), join(scripts, "gen-meta.mjs")], { timeout: 10_000, stdio: "pipe" });
      writeFileSync(join(root, receipts, "longmemeval", "summary.json"), JSON.stringify({ planned: 1000, completed: 999, failed: 0 }));
      expect(run).toThrow("incomplete longmemeval evaluation receipts");
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.4" }));
      expect(run).toThrow("source metadata is missing or stale");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
