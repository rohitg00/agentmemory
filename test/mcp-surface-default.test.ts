import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  getAllTools,
  getVisibleTools,
  LLM_BACKED_TOOLS,
  WORKSTATION_LLM_TOOLS,
  WORKSTATION_TOOLS,
} from "../src/mcp/tools-registry.js";

// Plugin manifests and README advertise the full MCP surface. The old
// default was AGENTMEMORY_TOOLS=core which silently capped the surface
// at a lean subset with no indication the other tools existed. Default
// flipped to "all"; the lean set is still accessible via
// AGENTMEMORY_TOOLS=core.
describe("MCP tool surface default (#553)", () => {
  const ORIG = process.env["AGENTMEMORY_TOOLS"];
  beforeEach(() => {
    delete process.env["AGENTMEMORY_TOOLS"];
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env["AGENTMEMORY_TOOLS"];
    else process.env["AGENTMEMORY_TOOLS"] = ORIG;
  });

  it("default returns the full tool surface, matching plugin advertising", () => {
    const visible = getVisibleTools();
    const all = getAllTools();
    expect(visible.length).toBe(all.length);
    expect(visible.length).toBeGreaterThanOrEqual(48);
  });

  it("AGENTMEMORY_TOOLS=all returns the same full set", () => {
    process.env["AGENTMEMORY_TOOLS"] = "all";
    expect(getVisibleTools().length).toBe(getAllTools().length);
  });

  it("AGENTMEMORY_TOOLS=core returns the non-LLM essentials", () => {
    process.env["AGENTMEMORY_TOOLS"] = "core";
    const names = new Set(getVisibleTools().map((t) => t.name));
    expect(names.size).toBe(7);
    for (const t of [
      "memory_save",
      "memory_recall",
      "memory_smart_search",
      "memory_sessions",
      "memory_diagnose",
      "memory_lesson_save",
      "memory_lesson_recall",
    ]) {
      expect(names.has(t)).toBe(true);
    }
  });

  it("AGENTMEMORY_TOOLS=workstation exposes coordination without dead LLM tools", () => {
    process.env["AGENTMEMORY_TOOLS"] = "workstation";
    const names = new Set(getVisibleTools().map((tool) => tool.name));
    expect(names).toEqual(WORKSTATION_TOOLS);
    expect(names.has("memory_action_create")).toBe(true);
    expect(names.has("memory_action_list")).toBe(true);
    expect(names.has("memory_lease")).toBe(true);
    expect(names.has("memory_signal_send")).toBe(true);
    expect(names.has("memory_consolidate")).toBe(false);
    expect(names.has("memory_reflect")).toBe(false);
  });

  it("AGENTMEMORY_TOOLS=workstation-llm adds only the LLM-backed tools", () => {
    process.env["AGENTMEMORY_TOOLS"] = "workstation-llm";
    const names = new Set(getVisibleTools().map((tool) => tool.name));
    expect(names).toEqual(WORKSTATION_LLM_TOOLS);
    expect(names.size).toBe(WORKSTATION_TOOLS.size + LLM_BACKED_TOOLS.size);
    for (const tool of LLM_BACKED_TOOLS) {
      expect(names.has(tool)).toBe(true);
    }
    expect(names.has("memory_enrich_session")).toBe(true);
    expect(names.has("memory_diagnostic_followup")).toBe(true);
    expect(names.has("memory_flow_compress")).toBe(true);
    expect(names.has("memory_llm_smoke")).toBe(true);
    expect(names.has("memory_governance_delete")).toBe(false);
  });

  it("supports custom allowlists and explicit disabled tools", () => {
    process.env["AGENTMEMORY_TOOLS"] = "memory_recall,memory_sessions,memory_reflect";
    process.env["AGENTMEMORY_DISABLED_TOOLS"] = "memory_sessions";
    process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"] = "true";
    expect(getVisibleTools().map((tool) => tool.name)).toEqual(["memory_recall"]);
    delete process.env["AGENTMEMORY_DISABLED_TOOLS"];
    delete process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"];
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
