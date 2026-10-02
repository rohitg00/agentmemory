import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fileStore = new Map<string, string>();
const symlinkPaths = new Set<string>();
const openEloopPaths = new Set<string>();
const failWritePaths = new Set<string>();
const matches = (set: Set<string>, path: string) =>
  [...set].some((p) => path === p || path.startsWith(p.replace(/[^/]+$/, (name) => `.${name}.`)));

const { constants: fsConstants } = await vi.importActual<typeof import("node:fs")>("node:fs");

vi.mock("node:fs/promises", () => ({
  realpath: vi.fn(async (path: string) => path),
  lstat: vi.fn(async (path: string) => {
    if (symlinkPaths.has(path)) {
      return { isSymbolicLink: () => true };
    }
    if (!fileStore.has(path)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, lstat '${path}'`), {
        code: "ENOENT",
      });
    }
    return { isSymbolicLink: () => false, mode: 0o644 };
  }),
  open: vi.fn(async (path: string, flags?: number) => {
    if (typeof flags === "number" && (flags & fsConstants.O_TRUNC) && fileStore.has(path)) fileStore.set(path, "");
    if (matches(openEloopPaths, path)) {
      throw Object.assign(new Error("ELOOP: too many levels of symbolic links"), {
        code: "ELOOP",
      });
    }
    return {
      writeFile: vi.fn(async (content: string) => {
        if (matches(failWritePaths, path)) {
          throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
        }
        fileStore.set(path, content);
      }),
      close: vi.fn(async () => {}),
    };
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const value = fileStore.get(from);
    if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    fileStore.set(to, value);
    fileStore.delete(from);
  }),
  rm: vi.fn(async (path: string) => {
    fileStore.delete(path);
  }),
  readFile: vi.fn(async (path: string) => {
    const value = fileStore.get(path);
    if (value === undefined) throw new Error("ENOENT");
    return value;
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    fileStore.set(path, content);
  }),
}));

import { registerCompressFileFunction } from "../src/functions/compress-file.js";

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
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

describe("mem::compress-file", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let summarize: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.AGENTMEMORY_IMPORT_ROOT = "/tmp";
    fileStore.clear();
    symlinkPaths.clear();
    openEloopPaths.clear();
    failWritePaths.clear();
    sdk = mockSdk();
    kv = mockKV();
    summarize = vi.fn();
    registerCompressFileFunction(
      sdk as never,
      kv as never,
      { name: "test-provider", summarize, compress: summarize } as never,
    );
  });

  it("rejects symlinks", async () => {
    symlinkPaths.add("/tmp/notes.md");
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: "/tmp/notes.md",
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("symlink");
    expect(summarize).not.toHaveBeenCalled();
    expect(fileStore.size).toBe(0);
  });

  it("rejects TOCTOU symlink swap at write time via O_NOFOLLOW", async () => {
    const path = "/tmp/notes.md";
    fileStore.set(
      path,
      "# Title\n\nVisit https://example.com\n\n```ts\nconst x = 1;\n```\n\nContent.",
    );
    summarize.mockResolvedValue(
      "# Title\n\nVisit https://example.com\n\n```ts\nconst x = 1;\n```\n\nShort.",
    );
    openEloopPaths.add(path);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("symlink");
  });

  it("keeps the original file when writing the compressed version fails", async () => {
    const path = "/tmp/notes.md";
    const original = "# Title\n\nVisit https://example.com\n\n```ts\nconst x = 1;\n```\n\nContent.";
    fileStore.set(path, original);
    summarize.mockResolvedValue("# Title\n\nVisit https://example.com\n\n```ts\nconst x = 1;\n```\n\nShort.");
    failWritePaths.add(path);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean };
    expect(result.success).toBe(false);
    expect(fileStore.get(path)).toBe(original);
    expect([...fileStore.keys()].filter((k) => k.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects non-markdown paths", async () => {
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: "/tmp/readme.txt",
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(".md");
  });

  it("returns file not found for missing paths", async () => {
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: "/tmp/nonexistent.md",
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("compresses markdown and writes .original.md backup", async () => {
    const path = "/tmp/notes.md";
    fileStore.set(
      path,
      "# Title\n\nVisit https://example.com\n\n```ts\nconst x = 1;\n```\n\nSome long explanation.",
    );

    summarize.mockResolvedValue(
      "# Title\n\nVisit https://example.com\n\n```ts\nconst x = 1;\n```\n\nShort explanation.",
    );

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as {
      success: boolean;
      backupPath: string;
      compressedChars: number;
      originalChars: number;
    };

    expect(result.success).toBe(true);
    expect(result.backupPath).toBe("/tmp/notes.original.md");
    expect(fileStore.get("/tmp/notes.original.md")).toContain("Some long explanation.");
    expect(fileStore.get(path)).toContain("Short explanation.");
    expect(result.compressedChars).toBeLessThan(result.originalChars);
  });

  it("fails validation when URLs change", async () => {
    const path = "/tmp/guide.md";
    fileStore.set(path, "# Guide\n\nhttps://example.com\n");
    summarize.mockResolvedValue("# Guide\n\nhttps://different.example.com\n");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string; details: string[] };

    expect(result.success).toBe(false);
    expect(result.error).toContain("validation");
    expect(result.details.some((d) => d.includes("url"))).toBe(true);
    expect(fileStore.get("/tmp/guide.original.md")).toBeUndefined();
  });

  it("uses a distinct backup path for *.original.md inputs", async () => {
    const path = "/tmp/notes.original.md";
    fileStore.set(path, "# Title\n\nLong original body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; backupPath: string };

    expect(result.success).toBe(true);
    expect(result.backupPath).toBe("/tmp/notes.original.backup.md");
    expect(fileStore.get("/tmp/notes.original.backup.md")).toBe(
      "# Title\n\nLong original body.",
    );
    expect(fileStore.get(path)).toBe("# Title\n\nShort body.");
  });
});
