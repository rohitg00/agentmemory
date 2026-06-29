import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  bareToolName,
  captureOutputMax,
  preCompactBudget,
  shouldCaptureTool,
} from "../src/hooks/_capture-filter.js";

describe("bareToolName", () => {
  it("returns plain tool names unchanged", () => {
    expect(bareToolName("Bash")).toBe("Bash");
    expect(bareToolName("memory_recall")).toBe("memory_recall");
  });

  it("strips Claude Code MCP prefixes", () => {
    expect(bareToolName("mcp__agentmemory__memory_smart_search")).toBe(
      "memory_smart_search",
    );
  });
});

describe("shouldCaptureTool (#993)", () => {
  const envKeys = [
    "AGENTMEMORY_CAPTURE_ALLOW",
    "AGENTMEMORY_CAPTURE_DENY",
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("captures normal agent tools by default", () => {
    expect(shouldCaptureTool("Bash")).toBe(true);
    expect(shouldCaptureTool("Edit")).toBe(true);
    expect(shouldCaptureTool("Agent")).toBe(true);
  });

  it("skips agentmemory memory_* MCP tools by default", () => {
    expect(shouldCaptureTool("memory_recall")).toBe(false);
    expect(shouldCaptureTool("memory_smart_search")).toBe(false);
    expect(shouldCaptureTool("mcp__agentmemory__memory_recall")).toBe(false);
  });

  it("skips plumbing tools by default", () => {
    expect(shouldCaptureTool("ToolSearch")).toBe(false);
    expect(shouldCaptureTool("ListMcpResources")).toBe(false);
  });

  it("honors AGENTMEMORY_CAPTURE_DENY", () => {
    process.env.AGENTMEMORY_CAPTURE_DENY = "Grep, Glob";
    expect(shouldCaptureTool("Grep")).toBe(false);
    expect(shouldCaptureTool("Bash")).toBe(true);
  });

  it("honors AGENTMEMORY_CAPTURE_ALLOW over defaults", () => {
    process.env.AGENTMEMORY_CAPTURE_ALLOW = "memory_recall, Bash";
    expect(shouldCaptureTool("memory_recall")).toBe(true);
    expect(shouldCaptureTool("memory_smart_search")).toBe(false);
    expect(shouldCaptureTool("Bash")).toBe(true);
    expect(shouldCaptureTool("Edit")).toBe(false);
  });
});

describe("captureOutputMax", () => {
  const key = "AGENTMEMORY_CAPTURE_OUTPUT_MAX";
  const original = process.env[key];

  afterEach(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });

  it("defaults to 8000", () => {
    delete process.env[key];
    expect(captureOutputMax()).toBe(8000);
  });

  it("reads a positive override", () => {
    process.env[key] = "4096";
    expect(captureOutputMax()).toBe(4096);
  });
});

describe("preCompactBudget", () => {
  const key = "AGENTMEMORY_PRE_COMPACT_BUDGET";
  const original = process.env[key];

  afterEach(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });

  it("defaults to 1500", () => {
    delete process.env[key];
    expect(preCompactBudget()).toBe(1500);
  });

  it("allows disabling injection with 0", () => {
    process.env[key] = "0";
    expect(preCompactBudget()).toBe(0);
  });
});
