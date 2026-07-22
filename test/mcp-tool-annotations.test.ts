import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../src/mcp/transport.js", () => ({
  createStdioTransport: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock("../src/config.js", () => ({
  getStandalonePersistPath: vi.fn(() => "/tmp/test-annotations.json"),
}));

import {
  getAllTools,
  getVisibleTools,
  ESSENTIAL_TOOLS,
  type McpToolDef,
} from "../src/mcp/tools-registry.js";
import { handleToolsList } from "../src/mcp/standalone.js";
import {
  resetHandleForTests,
  setLivezProbe,
} from "../src/mcp/rest-proxy.js";

const READ_ONLY_TOOLS = new Set([
  "memory_recall",
  "memory_file_history",
  "memory_patterns",
  "memory_sessions",
  "memory_smart_search",
  "memory_vision_search",
  "memory_timeline",
  "memory_export",
  "memory_relations",
  "memory_commit_lookup",
  "memory_commits",
  "memory_graph_query",
  "memory_team_feed",
  "memory_audit",
  "memory_frontier",
  "memory_next",
  "memory_diagnose",
  "memory_facet_query",
  "memory_verify",
  "memory_lesson_recall",
  "memory_insight_list",
  "memory_slot_list",
  "memory_slot_get",
]);

const DESTRUCTIVE_TOOLS = new Set([
  "memory_governance_delete",
  "memory_heal",
  "memory_slot_delete",
]);

const TOTAL = getAllTools().length;

const instantLocalFallbackProbe = vi.fn(async () => ({
  ok: false,
  status: 0,
  statusText: "stubbed: forced local fallback",
}));

const fetchTrap = vi.fn(async (url: unknown) => {
  throw new Error(
    `unexpected real fetch() in mcp-tool-annotations.test.ts: ${String(url)}`,
  );
});

function classification(tool: McpToolDef): string {
  const ro = tool.annotations?.readOnlyHint === true;
  const de = tool.annotations?.destructiveHint === true;
  if (ro && !de) return "read-only";
  if (!ro && de) return "destructive";
  if (!ro && !de) return "state-changing";
  return "invalid";
}

describe("MCP tool risk annotations", () => {
  it("every tool carries an annotations object", () => {
    for (const tool of getAllTools()) {
      expect(tool.annotations, `tool ${tool.name} missing annotations`).toBeDefined();
      expect(typeof tool.annotations).toBe("object");
    }
  });

  it("no tool is both read-only and destructive", () => {
    for (const tool of getAllTools()) {
      const a = tool.annotations;
      if (a?.readOnlyHint && a?.destructiveHint) {
        throw new Error(`tool ${tool.name} is both readOnly and destructive`);
      }
    }
  });

  it("read-only set is exactly 23 tools with readOnlyHint true + destructiveHint false", () => {
    const tools = getAllTools();
    const ro = tools.filter((t) => classification(t) === "read-only");
    expect(new Set(ro.map((t) => t.name))).toEqual(READ_ONLY_TOOLS);
    expect(ro.length).toBe(23);
    for (const t of ro) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
    }
  });

  it("destructive set is exactly 3 tools with destructiveHint true + readOnlyHint false", () => {
    const tools = getAllTools();
    const de = tools.filter((t) => classification(t) === "destructive");
    expect(new Set(de.map((t) => t.name))).toEqual(DESTRUCTIVE_TOOLS);
    expect(de.length).toBe(3);
    for (const t of de) {
      expect(t.annotations?.destructiveHint).toBe(true);
      expect(t.annotations?.readOnlyHint).toBe(false);
    }
  });

  it("remaining 27 tools are state-changing (readOnlyHint false, destructiveHint false)", () => {
    const tools = getAllTools();
    const sc = tools.filter((t) => classification(t) === "state-changing");
    expect(sc.length).toBe(27);
    for (const t of sc) {
      expect(t.annotations?.readOnlyHint).toBe(false);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(READ_ONLY_TOOLS.has(t.name)).toBe(false);
      expect(DESTRUCTIVE_TOOLS.has(t.name)).toBe(false);
    }
  });

  it("every tool falls into exactly one classification (23 + 3 + 27 covers total)", () => {
    const tools = getAllTools();
    expect(tools.length).toBe(TOTAL);
    const counts = { "read-only": 0, destructive: 0, "state-changing": 0, invalid: 0 };
    for (const t of tools) counts[classification(t) as keyof typeof counts]++;
    expect(counts["read-only"]).toBe(23);
    expect(counts.destructive).toBe(3);
    expect(counts["state-changing"]).toBe(27);
    expect(counts.invalid).toBe(0);
    expect(counts["read-only"] + counts.destructive + counts["state-changing"]).toBe(TOTAL);
  });

  it("getVisibleTools preserves annotations in every visibility mode", () => {
    const prev = process.env["AGENTMEMORY_TOOLS"];
    try {
      for (const mode of ["all", "core"]) {
        process.env["AGENTMEMORY_TOOLS"] = mode;
        const visible = getVisibleTools();
        if (mode === "all") expect(visible.length).toBe(TOTAL);
        if (mode === "core") expect(visible.length).toBe(ESSENTIAL_TOOLS.size);
        for (const tool of visible) {
          expect(tool.annotations, `tool ${tool.name} lost annotations in ${mode} mode`).toBeDefined();
        }
      }
    } finally {
      if (prev === undefined) delete process.env["AGENTMEMORY_TOOLS"];
      else process.env["AGENTMEMORY_TOOLS"] = prev;
    }
  });
});

describe("MCP tools/list wire response carries annotations", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    instantLocalFallbackProbe.mockClear();
    fetchTrap.mockClear();
    resetHandleForTests();
    setLivezProbe(instantLocalFallbackProbe);
    (globalThis as { fetch: typeof fetch }).fetch =
      fetchTrap as unknown as typeof fetch;
  });

  afterEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    resetHandleForTests();
  });

  it("handleToolsList returns tools whose annotations match the registry", async () => {
    const registry = new Map(getAllTools().map((t) => [t.name, t]));
    const res = await handleToolsList();
    expect(Array.isArray(res.tools)).toBe(true);
    expect(res.tools.length).toBeGreaterThan(0);
    for (const wire of res.tools as McpToolDef[]) {
      const reg = registry.get(wire.name);
      expect(reg, `wire tool ${wire.name} not in registry`).toBeDefined();
      expect(wire.annotations).toEqual(reg?.annotations);
    }
  });
});
