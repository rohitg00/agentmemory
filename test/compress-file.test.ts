import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type MockStatData = {
  dev: number;
  ino: number;
  isFile?: boolean;
};

const ALLOWED_ROOT = "/workspace/project";
const fileStore = new Map<string, string>();
const directoryStore = new Set<string>();
const symlinkPaths = new Set<string>();
const openEloopPaths = new Set<string>();
const realpathAliases = new Map<string, string>();
const realpathSequences = new Map<string, string[]>();
const fileStats = new Map<string, MockStatData>();
const openStatOverrides = new Map<string, MockStatData[]>();
const openHandlePathOverrides = new Map<string, string[]>();
const fdRealpaths = new Map<number, string>();
let nextIno = 1;
let nextFd = 100;

function makeStat(data: MockStatData, symlink = false) {
  return {
    dev: data.dev,
    ino: data.ino,
    isFile: () => data.isFile ?? true,
    isSymbolicLink: () => symlink,
  };
}

function ensureFileStat(path: string): MockStatData {
  const existing = fileStats.get(path);
  if (existing) return existing;
  const data = { dev: 1, ino: nextIno++ };
  fileStats.set(path, data);
  return data;
}

function setFile(path: string, content: string, stat?: Partial<MockStatData>) {
  fileStore.set(path, content);
  fileStats.set(path, {
    dev: stat?.dev ?? 1,
    ino: stat?.ino ?? nextIno++,
    isFile: stat?.isFile,
  });
}

function hasPathForRealpath(path: string): boolean {
  return (
    fileStore.has(path) ||
    directoryStore.has(path) ||
    Array.from(fileStore.keys()).some((filePath) =>
      filePath.startsWith(path.endsWith("/") ? path : `${path}/`),
    )
  );
}

vi.mock("node:fs/promises", () => ({
  lstat: vi.fn(async (path: string) => {
    if (symlinkPaths.has(path)) {
      return makeStat({ dev: 1, ino: nextIno++ }, true);
    }
    if (!fileStore.has(path)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, lstat '${path}'`), {
        code: "ENOENT",
      });
    }
    return makeStat(ensureFileStat(path));
  }),
  open: vi.fn(async (path: string) => {
    if (openEloopPaths.has(path)) {
      throw Object.assign(new Error("ELOOP: too many levels of symbolic links"), {
        code: "ELOOP",
      });
    }
    if (!fileStore.has(path)) {
      setFile(path, "");
    }
    const overrides = openStatOverrides.get(path);
    const stat = overrides?.shift() ?? ensureFileStat(path);
    const fd = nextFd++;
    const handlePath = openHandlePathOverrides.get(path)?.shift() ?? path;
    fdRealpaths.set(fd, handlePath);
    return {
      fd,
      stat: vi.fn(async () => makeStat(stat)),
      readFile: vi.fn(async () => {
        const value = fileStore.get(path);
        if (value === undefined) throw new Error("ENOENT");
        return value;
      }),
      writeFile: vi.fn(async (content: string) => {
        fileStore.set(path, content);
      }),
      truncate: vi.fn(async (length = 0) => {
        fileStore.set(path, fileStore.get(path)?.slice(0, length) ?? "");
      }),
      close: vi.fn(async () => {}),
    };
  }),
  readFile: vi.fn(async (path: string) => {
    const value = fileStore.get(path);
    if (value === undefined) throw new Error("ENOENT");
    return value;
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    fileStore.set(path, content);
  }),
  realpath: vi.fn(async (path: string) => {
    const fdMatch = path.match(/^\/(?:proc\/self\/fd|dev\/fd)\/(\d+)$/);
    if (fdMatch) {
      const targetPath = fdRealpaths.get(Number(fdMatch[1]));
      if (targetPath) return targetPath;
    }
    const sequence = realpathSequences.get(path);
    if (sequence && sequence.length > 0) return sequence.shift()!;
    const aliased = realpathAliases.get(path);
    if (aliased) return aliased;
    if (hasPathForRealpath(path)) return path;
    throw Object.assign(new Error(`ENOENT: no such file or directory, realpath '${path}'`), {
      code: "ENOENT",
    });
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
    fileStore.clear();
    directoryStore.clear();
    symlinkPaths.clear();
    openEloopPaths.clear();
    realpathAliases.clear();
    realpathSequences.clear();
    fileStats.clear();
    openStatOverrides.clear();
    openHandlePathOverrides.clear();
    fdRealpaths.clear();
    nextIno = 1;
    nextFd = 100;
    directoryStore.add(ALLOWED_ROOT);
    sdk = mockSdk();
    kv = mockKV();
    summarize = vi.fn();
    registerCompressFileFunction(
      sdk as never,
      kv as never,
      { name: "test-provider", summarize, compress: summarize } as never,
      { allowedRoots: [ALLOWED_ROOT], cwd: ALLOWED_ROOT } as never,
    );
  });

  it("rejects symlinks", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    symlinkPaths.add(path);
    realpathAliases.set(path, path);
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("symlink");
    expect(summarize).not.toHaveBeenCalled();
    expect(fileStore.size).toBe(0);
  });

  it("rejects TOCTOU symlink swap at write time via O_NOFOLLOW", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(
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

  it("rejects non-markdown paths", async () => {
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: `${ALLOWED_ROOT}/readme.txt`,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(".md");
  });

  it("returns file not found for missing paths", async () => {
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: `${ALLOWED_ROOT}/nonexistent.md`,
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects markdown outside allowed roots before provider use", async () => {
    setFile("/outside/notes.md", "# Outside\n\nDo not send this to a provider.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: "/outside/notes.md",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
    expect(fileStore.get("/outside/notes.original.md")).toBeUndefined();
    expect(fileStore.get("/outside/notes.md")).toContain("Do not send this");
  });

  it("rejects missing outside-root paths with uniform root denial", async () => {
    const result = (await sdk.trigger("mem::compress-file", {
      filePath: "/outside/missing.md",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects outside-root symlink paths with uniform root denial", async () => {
    symlinkPaths.add("/outside/notes.md");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: "/outside/notes.md",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects prefix-trap paths outside allowed roots", async () => {
    const path = "/workspace/project-evil/notes.md";
    setFile(path, "# Prefix Trap\n\nLooks similar but is outside.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects sensitive-looking paths inside allowed roots before provider use", async () => {
    const path = `${ALLOWED_ROOT}/token-notes.md`;
    setFile(path, "# Token Notes\n\nSensitive material.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("sensitive-looking");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects safe-looking aliases that resolve to sensitive-looking paths", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nSensitive material.");
    realpathAliases.set(path, `${ALLOWED_ROOT}/token-notes.md`);
    summarize.mockResolvedValue("# Title\n\nShort.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("sensitive-looking");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects paths whose real path escapes the allowed root", async () => {
    const path = `${ALLOWED_ROOT}/linked/notes.md`;
    setFile(path, "# Linked\n\nEscapes through a parent symlink.");
    realpathAliases.set(path, "/outside/notes.md");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects files swapped between lstat and read before provider use", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nOriginal body.", { dev: 1, ino: 10 });
    openStatOverrides.set(path, [{ dev: 1, ino: 99 }]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("changed during compression");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("rejects parent directory swaps before reading from the opened file", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nThis must not be sent to a provider.", { dev: 1, ino: 10 });
    realpathSequences.set(path, [path, "/outside/notes.md"]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
    expect(fileStore.get(path)).toContain("This must not be sent");
  });

  it("rejects opened read handles that resolve outside the allowed root", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nThis must not be sent to a provider.", { dev: 1, ino: 10 });
    openHandlePathOverrides.set(path, ["/outside/notes.md"]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(summarize).not.toHaveBeenCalled();
    expect(fileStore.get(path)).toContain("This must not be sent");
  });

  it("compresses markdown and writes .original.md backup", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(
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
    expect(result.backupPath).toBe(`${ALLOWED_ROOT}/notes.original.md`);
    expect(fileStore.get(`${ALLOWED_ROOT}/notes.original.md`)).toContain("Some long explanation.");
    expect(fileStore.get(path)).toContain("Short explanation.");
    expect(result.compressedChars).toBeLessThan(result.originalChars);
  });

  it("overwrites an existing regular backup on repeat compression", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    const backupPath = `${ALLOWED_ROOT}/notes.original.md`;
    setFile(path, "# Title\n\nNew original body.");
    setFile(backupPath, "# Title\n\nPrevious backup body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; backupPath: string };

    expect(result.success).toBe(true);
    expect(result.backupPath).toBe(backupPath);
    expect(fileStore.get(backupPath)).toBe("# Title\n\nNew original body.");
    expect(fileStore.get(path)).toBe("# Title\n\nShort body.");
  });

  it("allows markdown under AGENTMEMORY_COMPRESS_FILE_ROOTS opt-in roots", async () => {
    const optInRoot = "/external/notes";
    const path = `${optInRoot}/notes.md`;
    const envSdk = mockSdk();
    const envSummarize = vi.fn().mockResolvedValue("# Title\n\nShort body.");
    directoryStore.add(optInRoot);
    setFile(path, "# Title\n\nLong original body.");

    const previousRoots = process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS;
    process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS = optInRoot;
    try {
      registerCompressFileFunction(
        envSdk as never,
        kv as never,
        { name: "test-provider", summarize: envSummarize, compress: envSummarize } as never,
      );

      const result = (await envSdk.trigger("mem::compress-file", {
        filePath: path,
      })) as { success: boolean; backupPath: string };

      expect(result.success).toBe(true);
      expect(result.backupPath).toBe(`${optInRoot}/notes.original.md`);
      expect(fileStore.get(path)).toBe("# Title\n\nShort body.");
    } finally {
      if (previousRoots === undefined) {
        delete process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS;
      } else {
        process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS = previousRoots;
      }
    }
  });

  it("keeps the safe daemon cwd root when extra env roots are configured", async () => {
    const optInRoot = "/external/notes";
    const path = `${ALLOWED_ROOT}/notes.md`;
    const envSdk = mockSdk();
    const envSummarize = vi.fn().mockResolvedValue("# Title\n\nShort body.");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(ALLOWED_ROOT);
    directoryStore.add(optInRoot);
    setFile(path, "# Title\n\nLong original body.");

    const previousRoots = process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS;
    process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS = optInRoot;
    try {
      registerCompressFileFunction(
        envSdk as never,
        kv as never,
        { name: "test-provider", summarize: envSummarize, compress: envSummarize } as never,
      );

      const result = (await envSdk.trigger("mem::compress-file", {
        filePath: "notes.md",
      })) as { success: boolean; backupPath: string };

      expect(result.success).toBe(true);
      expect(result.backupPath).toBe(`${ALLOWED_ROOT}/notes.original.md`);
      expect(fileStore.get(path)).toBe("# Title\n\nShort body.");
    } finally {
      cwdSpy.mockRestore();
      if (previousRoots === undefined) {
        delete process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS;
      } else {
        process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS = previousRoots;
      }
    }
  });

  it("rejects configured roots whose real path is too broad", async () => {
    const rootLink = "/external/root-link";
    const path = "/outside/notes.md";
    const envSdk = mockSdk();
    const envSummarize = vi.fn().mockResolvedValue("# Title\n\nShort body.");
    directoryStore.add(rootLink);
    setFile(path, "# Title\n\nThis must not be sent to a provider.");
    realpathAliases.set(rootLink, "/");

    const previousRoots = process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS;
    process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS = rootLink;
    try {
      registerCompressFileFunction(
        envSdk as never,
        kv as never,
        { name: "test-provider", summarize: envSummarize, compress: envSummarize } as never,
      );

      const result = (await envSdk.trigger("mem::compress-file", {
        filePath: path,
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("allowed compress-file root");
      expect(envSummarize).not.toHaveBeenCalled();
      expect(fileStore.get(path)).toContain("This must not be sent");
    } finally {
      if (previousRoots === undefined) {
        delete process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS;
      } else {
        process.env.AGENTMEMORY_COMPRESS_FILE_ROOTS = previousRoots;
      }
    }
  });

  it("fails validation when URLs change", async () => {
    const path = `${ALLOWED_ROOT}/guide.md`;
    setFile(path, "# Guide\n\nhttps://example.com\n");
    summarize.mockResolvedValue("# Guide\n\nhttps://different.example.com\n");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string; details: string[] };

    expect(result.success).toBe(false);
    expect(result.error).toContain("validation");
    expect(result.details.some((d) => d.includes("url"))).toBe(true);
    expect(fileStore.get(`${ALLOWED_ROOT}/guide.original.md`)).toBeUndefined();
  });

  it("rejects symlinked backup paths before overwriting the original", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    const backupPath = `${ALLOWED_ROOT}/notes.original.md`;
    setFile(path, "# Title\n\nLong original body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");
    openEloopPaths.add(backupPath);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("symlink");
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("rejects backup writes when the canonical backup parent escapes the allowed root", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nLong original body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");
    realpathSequences.set(ALLOWED_ROOT, [ALLOWED_ROOT, "/outside"]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(fileStore.get(`${ALLOWED_ROOT}/notes.original.md`)).toBeUndefined();
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("rejects backup writes when the opened backup path escapes the allowed root", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    const backupPath = `${ALLOWED_ROOT}/notes.original.md`;
    setFile(path, "# Title\n\nLong original body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");
    realpathAliases.set(backupPath, "/outside/notes.original.md");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(fileStore.get(backupPath)).not.toContain("Long original body.");
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("rejects opened backup handles that resolve outside the allowed root", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    const backupPath = `${ALLOWED_ROOT}/notes.original.md`;
    setFile(path, "# Title\n\nLong original body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");
    openHandlePathOverrides.set(backupPath, ["/outside/notes.original.md"]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(fileStore.get(backupPath)).not.toContain("Long original body.");
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("rejects files swapped before final write without truncating the replacement", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nLong original body.", { dev: 1, ino: 10 });
    summarize.mockResolvedValue("# Title\n\nShort body.");
    openStatOverrides.set(path, [
      { dev: 1, ino: 10 },
      { dev: 1, ino: 99 },
    ]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("changed during compression");
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("rejects parent directory swaps before writing compressed output", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nLong original body.", { dev: 1, ino: 10 });
    summarize.mockResolvedValue("# Title\n\nShort body.");
    realpathSequences.set(path, [path, path, "/outside/notes.md"]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(fileStore.get(`${ALLOWED_ROOT}/notes.original.md`)).toContain(
      "Long original body.",
    );
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("rejects opened final-write handles that resolve outside the allowed root", async () => {
    const path = `${ALLOWED_ROOT}/notes.md`;
    setFile(path, "# Title\n\nLong original body.", { dev: 1, ino: 10 });
    summarize.mockResolvedValue("# Title\n\nShort body.");
    openHandlePathOverrides.set(path, [path, "/outside/notes.md"]);

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("allowed compress-file root");
    expect(fileStore.get(`${ALLOWED_ROOT}/notes.original.md`)).toContain(
      "Long original body.",
    );
    expect(fileStore.get(path)).toBe("# Title\n\nLong original body.");
  });

  it("uses a distinct backup path for *.original.md inputs", async () => {
    const path = `${ALLOWED_ROOT}/notes.original.md`;
    setFile(path, "# Title\n\nLong original body.");
    summarize.mockResolvedValue("# Title\n\nShort body.");

    const result = (await sdk.trigger("mem::compress-file", {
      filePath: path,
    })) as { success: boolean; backupPath: string };

    expect(result.success).toBe(true);
    expect(result.backupPath).toBe(`${ALLOWED_ROOT}/notes.original.backup.md`);
    expect(fileStore.get(`${ALLOWED_ROOT}/notes.original.backup.md`)).toBe(
      "# Title\n\nLong original body.",
    );
    expect(fileStore.get(path)).toBe("# Title\n\nShort body.");
  });
});
