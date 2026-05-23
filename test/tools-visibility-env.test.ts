import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];
const ORIGINAL_TOOLS = process.env["AGENTMEMORY_TOOLS"];

let sandboxHome: string;

async function freshTools() {
  vi.resetModules();
  return await import("../src/mcp/tools-registry.js");
}

function writeEnv(contents: string) {
  const dir = join(sandboxHome, ".agentmemory");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".env"), contents);
}

describe("getVisibleTools env resolution", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-tools-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    delete process.env["AGENTMEMORY_TOOLS"];
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    if (ORIGINAL_TOOLS === undefined) delete process.env["AGENTMEMORY_TOOLS"];
    else process.env["AGENTMEMORY_TOOLS"] = ORIGINAL_TOOLS;
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("exposes the full tool surface when AGENTMEMORY_TOOLS=all is set in the .env file", async () => {
    writeEnv("AGENTMEMORY_TOOLS=all");
    const reg = await freshTools();
    const visible = reg.getVisibleTools();
    expect(visible.length).toBe(reg.getAllTools().length);
    expect(visible.map((t) => t.name)).toContain("memory_graph_query");
  });

  it("falls back to the core subset when AGENTMEMORY_TOOLS is unset", async () => {
    writeEnv("");
    const reg = await freshTools();
    const names = reg.getVisibleTools().map((t) => t.name);
    expect(names).toContain("memory_save");
    expect(names).not.toContain("memory_graph_query");
    expect(names.length).toBeLessThan(reg.getAllTools().length);
  });

  it("lets process.env override the .env file value", async () => {
    writeEnv("AGENTMEMORY_TOOLS=core");
    process.env["AGENTMEMORY_TOOLS"] = "all";
    const reg = await freshTools();
    expect(reg.getVisibleTools().length).toBe(reg.getAllTools().length);
  });
});
