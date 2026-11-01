import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerClaudeBridgeFunction } from "../src/functions/claude-bridge.js";
import type { ClaudeBridgeConfig, Memory } from "../src/types.js";
import { KV } from "../src/state/schema.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    }),
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    }),
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => functions.set(id, handler),
    trigger: async (id: string) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn();
    },
  };
}

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_1",
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    type: "pattern",
    title: "Auth pattern",
    content: "Always validate tokens",
    concepts: ["auth"],
    files: [],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
    project: "my-project",
    ...overrides,
  };
}

describe("Claude Bridge Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let root: string;
  let config: ClaudeBridgeConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AGENTMEMORY_PROJECT_NAME", "");
    root = mkdtempSync(join(tmpdir(), "agentmemory-bridge-"));
    config = {
      enabled: true,
      projectPath: join(root, "my-project"),
      memoryFilePath: join(root, "claude", "memory", "MEMORY.md"),
      lineBudget: 200,
    };
    mkdirSync(config.projectPath);
    sdk = mockSdk();
    kv = mockKV();
    registerClaudeBridgeFunction(sdk as never, kv as never, config);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  function putFile(content: string) {
    mkdirSync(dirname(config.memoryFilePath), { recursive: true });
    writeFileSync(config.memoryFilePath, content);
  }

  function sync() {
    return sdk.trigger("mem::claude-bridge-sync");
  }

  function expectRefusal(result: { success: boolean; error: string }) {
    expect(result.success).toBe(false);
    expect(result.error).toContain(config.memoryFilePath);
    expect(result.error).toContain("Refusing to replace");
    expect(readdirSync(dirname(config.memoryFilePath))).toEqual(["MEMORY.md"]);
  }

  it("reads existing handwritten content without changing it", async () => {
    const content = "# Memory\n\n## Project Summary\nA test project\n\n## Key Memories\nSome memories";
    putFile(content);
    const result = await sdk.trigger("mem::claude-bridge-read");
    expect(result.success).toBe(true);
    expect(result.content).toBe(content);
    expect(result.sections["Project Summary"]).toBe("A test project");
    expect(readFileSync(config.memoryFilePath, "utf8")).toBe(content);
  });

  it("returns empty content when the read target does not exist", async () => {
    expect(await sdk.trigger("mem::claude-bridge-read")).toEqual({
      success: true, content: "", parsed: false,
    });
  });

  it("creates a missing file and its parent directories", async () => {
    await kv.set(KV.memories, "mem_1", memory());
    const result = await sync();
    expect(result).toMatchObject({ success: true, changed: true, path: config.memoryFilePath });
    expect(readFileSync(config.memoryFilePath, "utf8")).toContain("Always validate tokens");
    expect(readdirSync(dirname(config.memoryFilePath))).toEqual(["MEMORY.md"]);
  });

  it.each(["My handwritten notes\n", "", "# Agent Memory (auto-synced by agentmemory)\nUser addition\n"])(
    "preserves existing content even if empty or bearing a generated header: %j",
    async (content) => {
      putFile(content);
      expectRefusal(await sync());
      expect(readFileSync(config.memoryFilePath, "utf8")).toBe(content);
    },
  );

  it("reports an identical existing export as an unchanged no-op", async () => {
    await kv.set(KV.memories, "mem_1", memory());
    await sync();
    const original = lstatSync(config.memoryFilePath);
    expect(await sync()).toMatchObject({ success: true, changed: false });
    const after = lstatSync(config.memoryFilePath);
    expect(after.ino).toBe(original.ino);
    expect(after.mtimeMs).toBe(original.mtimeMs);
  });

  it("does not replace its own previous export when the source memories change", async () => {
    await kv.set(KV.memories, "mem_1", memory());
    await sync();
    const original = readFileSync(config.memoryFilePath, "utf8");
    await kv.set(KV.memories, "mem_1", memory({ content: "A new version" }));
    expectRefusal(await sync());
    expect(readFileSync(config.memoryFilePath, "utf8")).toBe(original);
  });

  it("preserves a file created while the memory list is loading", async () => {
    kv.list.mockImplementationOnce(async () => {
      await Promise.resolve();
      putFile("Created during state read");
      return [memory()];
    });
    expectRefusal(await sync());
    expect(readFileSync(config.memoryFilePath, "utf8")).toBe("Created during state read");
  });

  it("preserves edits to a generated file made during the profile lookup", async () => {
    await kv.set(KV.memories, "mem_1", memory());
    await sync();
    const edited = readFileSync(config.memoryFilePath, "utf8") + "\nUser added this";
    kv.get.mockImplementationOnce(async () => {
      await Promise.resolve();
      putFile(edited);
      return null;
    });
    expectRefusal(await sync());
    expect(readFileSync(config.memoryFilePath, "utf8")).toBe(edited);
  });

  it("preserves a file created during the canonical profile lookup", async () => {
    kv.get.mockImplementationOnce(async () => null);
    kv.get.mockImplementationOnce(async () => {
      await Promise.resolve();
      putFile("Created during canonical profile read");
      return null;
    });
    expectRefusal(await sync());
    expect(readFileSync(config.memoryFilePath, "utf8")).toBe("Created during canonical profile read");
  });

  it("allows only one of two different concurrent exports to create the destination", async () => {
    kv.list.mockImplementationOnce(async () => [memory({ content: "First export" })]);
    kv.list.mockImplementationOnce(async () => [memory({ content: "Second export" })]);
    const results = await Promise.all([sync(), sync()]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toHaveLength(1);
    expect(readFileSync(config.memoryFilePath, "utf8")).toContain("First export");
    expect(readdirSync(dirname(config.memoryFilePath))).toEqual(["MEMORY.md"]);
  });

  it.each([false, true])("refuses a symlink (dangling: %s) without touching its target", async (dangling) => {
    mkdirSync(dirname(config.memoryFilePath), { recursive: true });
    const target = join(root, "user-notes.md");
    if (!dangling) writeFileSync(target, "User notes");
    symlinkSync(target, config.memoryFilePath);
    expectRefusal(await sync());
    expect(lstatSync(config.memoryFilePath).isSymbolicLink()).toBe(true);
    if (dangling) expect(existsSync(target)).toBe(false);
    else expect(readFileSync(target, "utf8")).toBe("User notes");
  });

  it("refuses a symlink even when its target equals the generated content", async () => {
    await sync();
    const content = readFileSync(config.memoryFilePath, "utf8");
    rmSync(config.memoryFilePath);
    const target = join(root, "same.md");
    writeFileSync(target, content);
    symlinkSync(target, config.memoryFilePath);
    expectRefusal(await sync());
    expect(readFileSync(target, "utf8")).toBe(content);
  });

  it("preserves an existing directory at the destination", async () => {
    mkdirSync(config.memoryFilePath, { recursive: true });
    writeFileSync(join(config.memoryFilePath, "notes"), "User data");
    expectRefusal(await sync());
    expect(readFileSync(join(config.memoryFilePath, "notes"), "utf8")).toBe("User data");
  });

  it.skipIf(process.platform === "win32")("refuses a FIFO without opening or blocking on it", async () => {
    mkdirSync(dirname(config.memoryFilePath), { recursive: true });
    execFileSync("mkfifo", [config.memoryFilePath]);
    expectRefusal(await sync());
    expect(lstatSync(config.memoryFilePath).isFIFO()).toBe(true);
  });

  it("exports only latest memories from the canonical project or exact legacy project path", async () => {
    const records = [
      memory(),
      memory({ id: "legacy", project: config.projectPath, title: "Legacy scoped title" }),
      memory({ id: "other", project: "different-project", title: "Other project secret" }),
      memory({ id: "unscoped", project: undefined, title: "Unscoped secret" }),
      memory({ id: "old", isLatest: false, title: "Superseded title" }),
    ];
    for (const record of records) await kv.set(KV.memories, record.id, record);
    await kv.set(KV.profiles, "my-project", { summary: "Canonical project summary" });
    await kv.set(KV.profiles, "different-project", { summary: "Other project summary" });
    expect((await sync()).success).toBe(true);
    const content = readFileSync(config.memoryFilePath, "utf8");
    expect(content).toContain("Auth pattern");
    expect(content).toContain("Legacy scoped title");
    expect(content).toContain("Canonical project summary");
    expect(content).not.toMatch(/Other project|Unscoped secret|Superseded title/);
  });

  it("honors the shared explicit project-name override", async () => {
    vi.stubEnv("AGENTMEMORY_PROJECT_NAME", "custom-project");
    await kv.set(KV.memories, "custom", memory({ project: "custom-project", title: "Custom project title" }));
    await kv.set(KV.memories, "other", memory());
    expect((await sync()).success).toBe(true);
    const content = readFileSync(config.memoryFilePath, "utf8");
    expect(content).toContain("Custom project title");
    expect(content).not.toContain("Auth pattern");
  });

  it("refuses to export without a configured project", async () => {
    config.projectPath = "";
    expect(await sync()).toMatchObject({ success: false, error: "Claude bridge not configured" });
    expect(existsSync(config.memoryFilePath)).toBe(false);
  });

  it.each(["read", "sync"])("returns an error when the bridge is disabled (%s)", async (direction) => {
    config.enabled = false;
    expect(await sdk.trigger(`mem::claude-bridge-${direction}`)).toMatchObject({
      success: false, error: "Claude bridge not configured",
    });
  });
});
