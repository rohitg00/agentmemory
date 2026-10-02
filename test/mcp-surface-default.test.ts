import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  getAllTools,
  getVisibleTools,
  SLOT_TOOL_NAMES,
} from "../src/mcp/tools-registry.js";

// plugin manifests and README advertise 54 MCP tools. The old
// default was AGENTMEMORY_TOOLS=core which silently capped the surface
// at 8 essentials with no indication the other 46 existed. Default
// flipped to "all"; the lean set is still accessible via
// AGENTMEMORY_TOOLS=core.
describe("MCP tool surface default (#553)", () => {
  const ORIG = process.env["AGENTMEMORY_TOOLS"];
  const ORIG_SLOTS = process.env["AGENTMEMORY_SLOTS"];
  beforeEach(() => {
    delete process.env["AGENTMEMORY_TOOLS"];
    process.env["AGENTMEMORY_SLOTS"] = "true";
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env["AGENTMEMORY_TOOLS"];
    else process.env["AGENTMEMORY_TOOLS"] = ORIG;
    if (ORIG_SLOTS === undefined) delete process.env["AGENTMEMORY_SLOTS"];
    else process.env["AGENTMEMORY_SLOTS"] = ORIG_SLOTS;
  });

  it("default returns the full 54-tool surface, matching plugin advertising", () => {
    const visible = getVisibleTools();
    const all = getAllTools();
    expect(visible.length).toBe(all.length);
    expect(visible.length).toBeGreaterThanOrEqual(48);
  });

  it("AGENTMEMORY_TOOLS=all returns the same full set", () => {
    process.env["AGENTMEMORY_TOOLS"] = "all";
    expect(getVisibleTools().length).toBe(getAllTools().length);
  });

  it("slot tools are hidden when AGENTMEMORY_SLOTS is disabled", () => {
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const names = new Set(getVisibleTools().map((t) => t.name));
    expect(SLOT_TOOL_NAMES.size).toBe(6);
    for (const slotTool of SLOT_TOOL_NAMES) {
      expect(names.has(slotTool)).toBe(false);
    }
    expect(getVisibleTools().length).toBe(getAllTools().length - SLOT_TOOL_NAMES.size);
  });

  it("AGENTMEMORY_TOOLS=core returns the 8 essential tools", () => {
    process.env["AGENTMEMORY_TOOLS"] = "core";
    const names = new Set(getVisibleTools().map((t) => t.name));
    expect(names.size).toBe(8);
    for (const t of [
      "memory_save",
      "memory_recall",
      "memory_consolidate",
      "memory_smart_search",
      "memory_sessions",
      "memory_diagnose",
      "memory_lesson_save",
      "memory_reflect",
    ]) {
      expect(names.has(t)).toBe(true);
    }
  });

  it("plugin .mcp.json provides default env interpolation so CC parse never fails (#510)", () => {
    const raw = readFileSync("plugin/.mcp.json", "utf-8");
    const cfg = JSON.parse(raw) as {
      mcpServers: { agentmemory: { env: Record<string, string> } };
    };
    const env = cfg.mcpServers.agentmemory.env;
    // Per Claude Code MCP docs: ${VAR} without a default fails config
    // parse when VAR is unset, silently dropping the server. ${VAR:-x}
    // form is what unblocks fresh installs that haven't exported
    // AGENTMEMORY_URL.
    expect(env["AGENTMEMORY_URL"]).toMatch(/\$\{AGENTMEMORY_URL:-/);
    expect(env["AGENTMEMORY_SECRET"]).toMatch(/\$\{AGENTMEMORY_SECRET:-/);
    expect(env["AGENTMEMORY_TOOLS"]).toMatch(/\$\{AGENTMEMORY_TOOLS:-all\}/);
  });
});
