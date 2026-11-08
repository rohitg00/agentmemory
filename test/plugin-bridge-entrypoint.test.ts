import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("bundled MCP bridge entrypoint", () => {
  it("answers initialize when the plugin directory is reached through a symlink", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "agentmemory-linked-plugin-"));
    try {
      const linked = join(sandbox, "plugin link");
      symlinkSync(resolve(__dirname, "../plugin"), linked, "junction");
      const output = execFileSync(process.execPath, [join(linked, "scripts/plugin-bridge.mjs")], {
        input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }) + "\n",
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, AGENTMEMORY_URL: "http://127.0.0.1:1", AGENTMEMORY_SECRET: "" },
      });
      expect(JSON.parse(output)).toMatchObject({ id: 1, result: { serverInfo: { name: "agentmemory" } } });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
