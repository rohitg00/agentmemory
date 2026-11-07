import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  bareToolName,
  captureOutputMax,
  preCompactBudget,
  shouldCaptureTool,
  truncateCaptureOutput,
  truncateJson,
  truncateText,
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

describe("shouldCaptureTool", () => {
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

  it("matches an exact pattern against the full MCP tool name", () => {
    process.env.AGENTMEMORY_CAPTURE_DENY = "mcp__github__create_issue";
    expect(shouldCaptureTool("mcp__github__create_issue")).toBe(false);
    expect(shouldCaptureTool("mcp__gitlab__create_issue")).toBe(true);
    process.env.AGENTMEMORY_CAPTURE_DENY = "create_issue";
    expect(shouldCaptureTool("mcp__gitlab__create_issue")).toBe(false);
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

describe("truncateText", () => {
  it("returns text within the limit unchanged", () => {
    expect(truncateText("ab\u{1F600}", 4)).toBe("ab\u{1F600}");
  });

  it("keeps a surrogate pair that ends exactly at the limit", () => {
    expect(truncateText("ab\u{1F600}c", 4)).toBe("ab\u{1F600}");
  });

  it("drops a surrogate pair that the limit would split", () => {
    expect(truncateText("ab\u{1F600}c", 3)).toBe("ab");
  });
});

describe("truncation redacts before cutting", () => {
  const token = "ghp_" + "A".repeat(40);

  it("truncateText leaves text within the limit unchanged", () => {
    expect(truncateText(`short ${token}`, 100)).toBe(`short ${token}`);
  });

  it("truncateText does not keep the start of a token the cut lands in", () => {
    const out = truncateText("x".repeat(10) + " " + token + " tail", 20);
    expect(out).not.toContain("ghp_");
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it("truncateCaptureOutput redacts strings and JSON before cutting", () => {
    const str = truncateCaptureOutput("x".repeat(10) + " " + token + "y".repeat(100), 40) as string;
    expect(str).not.toContain("ghp_");
    expect(str.length).toBeLessThanOrEqual(40);
    const json = truncateCaptureOutput({ out: "x".repeat(10) + " " + token + "y".repeat(100) }, 40) as string;
    expect(json).not.toContain("ghp_");
    expect(json.length).toBeLessThanOrEqual(40);
  });
});

describe("truncateCaptureOutput redacts structured values before serializing", () => {
  it("redacts values under secret-like keys in both helpers", () => {
    const value = { password: "A".repeat(100), nested: { apiKey: "K".repeat(40) }, note: "kept" };
    for (const out of [truncateJson(value, 90), truncateCaptureOutput(value, 90) as string]) {
      expect(out).not.toContain("AAAA");
      expect(out).not.toContain("KKKK");
      expect(out).toContain("[REDACTED_SECRET]");
    }
  });

  it("leaves a short value with a secret-like key unchanged", () => {
    const value = { password: "short" };
    expect(truncateJson(value, 100)).toBe(JSON.stringify(value));
    expect(truncateCaptureOutput(value, 100)).toBe(value);
  });

  it("removes a private block whose tag spans a line break", () => {
    const out = truncateCaptureOutput({ log: "<private\n>hidden-value</private>" + "y".repeat(200) }, 60) as string;
    expect(out).not.toContain("hidden");
  });

  it("removes a private block that opens in one field and closes in the next", () => {
    const value = { a: "start <private>", b: "hidden-value</private> end", pad: "y".repeat(200) };
    expect(truncateCaptureOutput(value, 80) as string).not.toContain("hidden");
    expect(truncateJson(value, 80)).not.toContain("hidden");
  });

  it("redacts a credential in a key that a line break separates from its scheme", () => {
    const key = "Bearer\n" + "A".repeat(32);
    const value = { [key]: "x", pad: "y".repeat(200) };
    expect(truncateJson(value, 100)).not.toContain("A".repeat(32));
    expect(truncateCaptureOutput(value, 100) as string).not.toContain("A".repeat(32));
  });

  it("redacts a quoted credential whose quote JSON escapes", () => {
    const value = { cmd: 'secret="' + "B".repeat(32) + '"', pad: "y".repeat(200) };
    expect(truncateJson(value, 100)).not.toContain("B".repeat(20));
    expect(truncateCaptureOutput(value, 100) as string).not.toContain("B".repeat(20));
  });

  it("redacts a credential that a vertical tab separates from its scheme", () => {
    const value = { header: "Bearer\u000b" + "C".repeat(32), pad: "y".repeat(200) };
    expect(truncateJson(value, 100)).not.toContain("C".repeat(20));
  });

  it("keeps every field when two keys redact to the same text", () => {
    const value = { ["token=" + "A".repeat(24)]: "first", ["token=" + "B".repeat(24)]: "second", pad: "y".repeat(200) };
    const out = truncateJson(value, 150);
    expect(out).toContain("first");
    expect(out).toContain("second");
  });

  it("keeps escaped backslashes and line breaks in the cut JSON", () => {
    const out = truncateJson({ a: "one\ntwo\\nthree", pad: "y".repeat(200) }, 60);
    expect(out.startsWith('{"a":"one\\ntwo\\\\nthree"')).toBe(true);
  });

  it("truncateJson leaves short JSON unchanged and redacts long JSON before cutting", () => {
    expect(truncateJson({ a: 1 }, 100)).toBe('{"a":1}');
    const out = truncateJson({ log: "<private\n>hidden-value</private>" + "y".repeat(200) }, 60);
    expect(out).not.toContain("hidden");
    expect(out.length).toBeLessThanOrEqual(60);
  });
});

describe("truncateCaptureOutput", () => {
  it("leaves short strings alone", () => {
    expect(truncateCaptureOutput("hello", 20)).toBe("hello");
  });

  it("keeps truncated string length within max", () => {
    const out = truncateCaptureOutput("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 20);
    expect(typeof out).toBe("string");
    expect((out as string).length).toBe(20);
    expect(out).toBe("ABCDE\n[...truncated]");
  });

  it("handles max smaller than the marker", () => {
    expect(truncateCaptureOutput("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 5)).toBe(
      "\n[...",
    );
  });

  it("keeps truncated JSON length within max", () => {
    const out = truncateCaptureOutput({ a: "x".repeat(50) }, 30);
    expect(typeof out).toBe("string");
    expect((out as string).length).toBe(30);
    expect(out).toMatch(/\.\.\.\[truncated\]$/);
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
