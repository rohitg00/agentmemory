import { describe, it, expect, beforeEach, vi } from "vitest";

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
  getStandalonePersistPath: vi.fn(() => "/tmp/test-standalone.json"),
}));

import {
  getAllTools,
  CORE_TOOLS,
  V040_TOOLS,
} from "../src/mcp/tools-registry.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { handleToolCall } from "../src/mcp/standalone.js";
import { writeFileSync } from "node:fs";

describe("Tools Registry", () => {
  it("getAllTools returns all tools with unique names", () => {
    const tools = getAllTools();
    expect(tools.length).toBeGreaterThanOrEqual(41);
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(tools.length);
    for (const required of [
      "memory_verify",
      "memory_lesson_save",
      "memory_lesson_recall",
      "memory_obsidian_export",
      "memory_save",
      "memory_recall",
    ]) {
      expect(tools.some((t) => t.name === required)).toBe(true);
    }
  });

  it("CORE_TOOLS has 10 items", () => {
    expect(CORE_TOOLS.length).toBe(10);
  });

  it("V040_TOOLS has 8 items", () => {
    expect(V040_TOOLS.length).toBe(8);
  });

  it("all tools have required name, description, inputSchema fields", () => {
    const tools = getAllTools();
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});

describe("InMemoryKV", () => {
  let kv: InMemoryKV;

  beforeEach(() => {
    kv = new InMemoryKV();
  });

  it("get/set/list/delete operations work", async () => {
    await kv.set("scope1", "key1", { value: "hello" });
    const result = await kv.get<{ value: string }>("scope1", "key1");
    expect(result).toEqual({ value: "hello" });

    const list = await kv.list("scope1");
    expect(list.length).toBe(1);

    await kv.delete("scope1", "key1");
    const afterDelete = await kv.get("scope1", "key1");
    expect(afterDelete).toBeNull();
  });

  it("list returns empty array for unknown scope", async () => {
    const result = await kv.list("nonexistent");
    expect(result).toEqual([]);
  });

  it("persist writes JSON", async () => {
    const kvWithPersist = new InMemoryKV("/tmp/test-kv.json");
    await kvWithPersist.set("scope1", "key1", { data: "test" });
    kvWithPersist.persist();

    expect(writeFileSync).toHaveBeenCalledWith(
      "/tmp/test-kv.json",
      expect.any(String),
      "utf-8",
    );
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.scope1.key1).toEqual({ data: "test" });
  });

  it("set overwrites existing values", async () => {
    await kv.set("scope1", "key1", "first");
    await kv.set("scope1", "key1", "second");
    const result = await kv.get("scope1", "key1");
    expect(result).toBe("second");
    const list = await kv.list("scope1");
    expect(list.length).toBe(1);
  });
});

describe("handleToolCall", () => {
  beforeEach(() => {
    vi.mocked(writeFileSync).mockClear();
  });

  it("memory_save persists to disk immediately after saving", async () => {
    const kv = new InMemoryKV("/tmp/test-handle.json");
    const result = await handleToolCall(
      "memory_save",
      { content: "Test memory content" },
      kv,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.saved).toMatch(/^mem_/);
    expect(writeFileSync).toHaveBeenCalledWith(
      "/tmp/test-handle.json",
      expect.any(String),
      "utf-8",
    );
  });

  it("memory_save without persist path does not call writeFileSync", async () => {
    const kv = new InMemoryKV();
    await handleToolCall("memory_save", { content: "No persist path" }, kv);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("memory_save throws when content is missing", async () => {
    const kv = new InMemoryKV();
    await expect(
      handleToolCall("memory_save", {}, kv),
    ).rejects.toThrow("content is required");
  });

  it("memory_save rejects non-string content safely (no runtime TypeError)", async () => {
    const kv = new InMemoryKV();
    // These would have crashed on .trim() before the type-guard fix.
    for (const bogus of [42, {}, [], null, undefined, true]) {
      await expect(
        handleToolCall("memory_save", { content: bogus }, kv),
      ).rejects.toThrow("content is required");
    }
  });

  it("memory_recall returns matching memories", async () => {
    const kv = new InMemoryKV();
    await handleToolCall("memory_save", { content: "TypeScript is great" }, kv);
    await handleToolCall("memory_save", { content: "Python is also great" }, kv);
    const result = await handleToolCall(
      "memory_recall",
      { query: "typescript" },
      kv,
    );
    const memories = JSON.parse(result.content[0].text);
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("TypeScript is great");
  });

  it("memory_save accepts concepts/files as arrays (plugin skill format, #139)", async () => {
    const kv = new InMemoryKV();
    const result = await handleToolCall(
      "memory_save",
      {
        content: "Use HMAC for API auth",
        concepts: ["hmac", "api-auth", "security"],
        files: ["src/auth.ts", "src/middleware.ts"],
      },
      kv,
    );
    const saved = JSON.parse(result.content[0].text);
    const mem = await kv.get<{ concepts: string[]; files: string[] }>(
      "mem:memories",
      saved.saved,
    );
    expect(mem?.concepts).toEqual(["hmac", "api-auth", "security"]);
    expect(mem?.files).toEqual(["src/auth.ts", "src/middleware.ts"]);
  });

  it("memory_save still accepts concepts/files as comma-separated strings (legacy)", async () => {
    const kv = new InMemoryKV();
    const result = await handleToolCall(
      "memory_save",
      {
        content: "JWT refresh rotation",
        concepts: "jwt, refresh, rotation",
        files: "src/auth.ts",
      },
      kv,
    );
    const saved = JSON.parse(result.content[0].text);
    const mem = await kv.get<{ concepts: string[]; files: string[] }>(
      "mem:memories",
      saved.saved,
    );
    expect(mem?.concepts).toEqual(["jwt", "refresh", "rotation"]);
    expect(mem?.files).toEqual(["src/auth.ts"]);
  });

  it("memory_smart_search falls back to substring match in the standalone shim (#139)", async () => {
    const kv = new InMemoryKV();
    await handleToolCall(
      "memory_save",
      { content: "Use bcrypt for password hashing" },
      kv,
    );
    await handleToolCall(
      "memory_save",
      { content: "Use argon2id for new projects" },
      kv,
    );
    const result = await handleToolCall(
      "memory_smart_search",
      { query: "bcrypt", limit: 5 },
      kv,
    );
    const memories = JSON.parse(result.content[0].text);
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("Use bcrypt for password hashing");
  });

  it("memory_smart_search rejects empty query to prevent match-all in forget flow (#139)", async () => {
    const kv = new InMemoryKV();
    await handleToolCall("memory_save", { content: "anything" }, kv);
    await expect(
      handleToolCall("memory_smart_search", {}, kv),
    ).rejects.toThrow("query is required");
    await expect(
      handleToolCall("memory_smart_search", { query: "" }, kv),
    ).rejects.toThrow("query is required");
    await expect(
      handleToolCall("memory_smart_search", { query: "   " }, kv),
    ).rejects.toThrow("query is required");
  });

  it("memory_smart_search searches files and concepts, not just title/content (#139)", async () => {
    const kv = new InMemoryKV();
    await handleToolCall(
      "memory_save",
      {
        content: "generic note",
        concepts: ["oauth", "token-rotation"],
        files: ["src/auth/refresh.ts"],
      },
      kv,
    );
    await handleToolCall("memory_save", { content: "unrelated" }, kv);

    // Find by file path
    const byFile = JSON.parse(
      (
        await handleToolCall(
          "memory_smart_search",
          { query: "src/auth/refresh.ts" },
          kv,
        )
      ).content[0].text,
    );
    expect(byFile).toHaveLength(1);
    expect(byFile[0].files).toContain("src/auth/refresh.ts");

    // Find by concept
    const byConcept = JSON.parse(
      (
        await handleToolCall(
          "memory_smart_search",
          { query: "token-rotation" },
          kv,
        )
      ).content[0].text,
    );
    expect(byConcept).toHaveLength(1);
  });

  it("memory_sessions honours the limit arg (#139)", async () => {
    const kv = new InMemoryKV();
    for (let i = 0; i < 5; i++) {
      await kv.set("mem:sessions", `ses_${i}`, {
        id: `ses_${i}`,
        project: "demo",
      });
    }
    const result = await handleToolCall(
      "memory_sessions",
      { limit: 2 },
      kv,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.sessions).toHaveLength(2);
  });

  it("parseLimit clamps bad/malicious limit values to a safe range", async () => {
    const kv = new InMemoryKV();
    for (let i = 0; i < 150; i++) {
      await handleToolCall("memory_save", { content: `mem ${i}` }, kv);
    }

    // Negative / NaN / Infinity / string / object — all should fall back
    // to the default (10) for memory_smart_search.
    for (const bogus of [-1, NaN, Infinity, "abc", {}, true]) {
      const r = await handleToolCall(
        "memory_smart_search",
        { query: "mem", limit: bogus },
        kv,
      );
      expect(JSON.parse(r.content[0].text)).toHaveLength(10);
    }

    // An absurdly large limit gets clamped to MAX_LIMIT (100).
    const huge = await handleToolCall(
      "memory_smart_search",
      { query: "mem", limit: 99999 },
      kv,
    );
    expect(JSON.parse(huge.content[0].text)).toHaveLength(100);
  });

  it("memory_governance_delete removes memories by id array (#139)", async () => {
    const kv = new InMemoryKV();
    const a = JSON.parse(
      (await handleToolCall("memory_save", { content: "one" }, kv)).content[0]
        .text,
    );
    const b = JSON.parse(
      (await handleToolCall("memory_save", { content: "two" }, kv)).content[0]
        .text,
    );
    const c = JSON.parse(
      (await handleToolCall("memory_save", { content: "three" }, kv)).content[0]
        .text,
    );
    const result = await handleToolCall(
      "memory_governance_delete",
      { memoryIds: [a.saved, c.saved] },
      kv,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.deleted).toBe(2);
    expect(parsed.requested).toBe(2);

    const remaining = await kv.list<Record<string, unknown>>("mem:memories");
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as { id: string }).id).toBe(b.saved);
  });

  it("memory_governance_delete accepts CSV-string memoryIds too", async () => {
    const kv = new InMemoryKV();
    const saved = JSON.parse(
      (await handleToolCall("memory_save", { content: "x" }, kv)).content[0]
        .text,
    );
    const result = await handleToolCall(
      "memory_governance_delete",
      { memoryIds: saved.saved, reason: "test csv" },
      kv,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.deleted).toBe(1);
    expect(parsed.reason).toBe("test csv");
  });

  it("memory_governance_delete throws when memoryIds is missing or empty", async () => {
    const kv = new InMemoryKV();
    await expect(
      handleToolCall("memory_governance_delete", {}, kv),
    ).rejects.toThrow("memoryIds is required");
    await expect(
      handleToolCall("memory_governance_delete", { memoryIds: [] }, kv),
    ).rejects.toThrow("memoryIds is required");
  });

  it("memory_governance_delete silently skips unknown ids", async () => {
    const kv = new InMemoryKV();
    const saved = JSON.parse(
      (await handleToolCall("memory_save", { content: "real" }, kv)).content[0]
        .text,
    );
    const result = await handleToolCall(
      "memory_governance_delete",
      { memoryIds: [saved.saved, "mem_does_not_exist"] },
      kv,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.deleted).toBe(1);
    expect(parsed.requested).toBe(2);
  });
});
