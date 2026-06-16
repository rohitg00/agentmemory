import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerObsidianExportFunction } from "../src/functions/obsidian-export.js";
import type { Memory } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function makeMemory(id: string): Memory {
  return {
    id,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    type: "pattern",
    title: `Memory ${id}`,
    content: `Content for ${id}`,
    concepts: ["testing"],
    files: ["src/test.ts"],
    sessionIds: ["ses_1"],
    strength: 7,
    version: 1,
    isLatest: true,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("Obsidian Export symlink containment", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let sandbox: string;
  let oldExportRoot: string | undefined;

  beforeEach(async () => {
    oldExportRoot = process.env.AGENTMEMORY_EXPORT_ROOT;
    sandbox = await mkdtemp(join(tmpdir(), "agentmemory-obsidian-symlink-"));
    sdk = mockSdk();
    kv = mockKV();
    registerObsidianExportFunction(sdk as never, kv as never);
  });

  afterEach(async () => {
    if (oldExportRoot === undefined) {
      delete process.env.AGENTMEMORY_EXPORT_ROOT;
    } else {
      process.env.AGENTMEMORY_EXPORT_ROOT = oldExportRoot;
    }
    await rm(sandbox, { recursive: true, force: true });
  });

  it("exports normally into a real vault under the export root", async () => {
    const exportRoot = join(sandbox, "root");
    const vaultDir = join(exportRoot, "vault");
    process.env.AGENTMEMORY_EXPORT_ROOT = exportRoot;
    await kv.set("mem:memories", "mem_real", makeMemory("mem_real"));

    const result = (await sdk.trigger("mem::obsidian-export", {
      vaultDir,
      types: ["memories"],
    })) as { success: boolean; exported: { memories: number } };

    expect(result.success).toBe(true);
    expect(result.exported.memories).toBe(1);
    const content = await readFile(join(vaultDir, "memories", "mem_real.md"), "utf-8");
    expect(content).toContain("# Memory mem_real");
  });

  it("rejects a symlinked vaultDir that points outside the export root", async () => {
    const exportRoot = join(sandbox, "root");
    const outside = join(sandbox, "outside");
    const vaultDir = join(exportRoot, "vault");
    process.env.AGENTMEMORY_EXPORT_ROOT = exportRoot;
    await mkdir(exportRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, vaultDir, "dir");
    await kv.set("mem:memories", "mem_escape", makeMemory("mem_escape"));

    const result = (await sdk.trigger("mem::obsidian-export", {
      vaultDir,
      types: ["memories"],
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/symlink|inside|real directory/i);
    await expect(readdir(outside)).resolves.toEqual([]);
    expect(await pathExists(join(outside, "memories", "mem_escape.md"))).toBe(false);
  });

  it("rejects a symlinked export subdirectory that points outside the export root", async () => {
    const exportRoot = join(sandbox, "root");
    const vaultDir = join(exportRoot, "vault");
    const outside = join(sandbox, "outside");
    process.env.AGENTMEMORY_EXPORT_ROOT = exportRoot;
    await mkdir(vaultDir, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(vaultDir, "memories"), "dir");
    await kv.set("mem:memories", "mem_subdir", makeMemory("mem_subdir"));

    const result = (await sdk.trigger("mem::obsidian-export", {
      vaultDir,
      types: ["memories"],
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/symlink|inside|real directory/i);
    await expect(readdir(outside)).resolves.toEqual([]);
    await expect(readdir(vaultDir)).resolves.toEqual(["memories"]);
    expect(await pathExists(join(outside, "mem_subdir.md"))).toBe(false);
  });

  it("does not follow a final markdown-file symlink", async () => {
    const exportRoot = join(sandbox, "root");
    const vaultDir = join(exportRoot, "vault");
    const outside = join(sandbox, "outside");
    const outsideTarget = join(outside, "target.md");
    process.env.AGENTMEMORY_EXPORT_ROOT = exportRoot;
    await mkdir(join(vaultDir, "memories"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(outsideTarget, "keep me");
    await symlink(outsideTarget, join(vaultDir, "memories", "mem_link.md"));
    await kv.set("mem:memories", "mem_link", makeMemory("mem_link"));

    const result = (await sdk.trigger("mem::obsidian-export", {
      vaultDir,
      types: ["memories"],
    })) as { success: boolean; exported: { memories: number }; errors?: Array<{ id: string; path: string }> };

    expect(result.success).toBe(true);
    expect(result.exported.memories).toBe(0);
    expect(result.errors?.some((error) => error.id === "mem_link" && error.path.endsWith("mem_link.md"))).toBe(
      true,
    );
    await expect(readFile(outsideTarget, "utf-8")).resolves.toBe("keep me");
  });
});
