import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  getAllTools,
  getVisibleTools,
} from "../src/mcp/tools-registry.js";

// plugin manifests and README advertise 54 MCP tools. The old
// default was AGENTMEMORY_TOOLS=core which silently capped the surface
// at 8 essentials with no indication the other 46 existed. Default
// flipped to "all"; the lean set is still accessible via
// AGENTMEMORY_TOOLS=core.
describe("MCP tool surface default", () => {
  const ORIG = process.env["AGENTMEMORY_TOOLS"];
  beforeEach(() => {
    delete process.env["AGENTMEMORY_TOOLS"];
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env["AGENTMEMORY_TOOLS"];
    else process.env["AGENTMEMORY_TOOLS"] = ORIG;
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

  it("plugin MCP uses its bundled bridge and inherits the host environment", () => {
    const cfg = JSON.parse(readFileSync("plugin/.mcp.json", "utf-8"));
    expect(cfg.mcpServers.agentmemory).toEqual({
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/scripts/plugin-bridge.mjs"],
    });
  });
});
