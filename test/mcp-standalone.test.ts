import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import {
  getAllTools,
  CORE_TOOLS,
  V040_TOOLS,
} from "../src/mcp/tools-registry.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { writeFileSync } from "node:fs";

describe("Tools Registry", () => {
  it("getAllTools returns 18 tools", () => {
    const tools = getAllTools();
    expect(tools.length).toBe(18);
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
