import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const writtenFiles = new Map<string, string>();
const createdDirs = new Set<string>();

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async (dir: string) => {
    createdDirs.add(dir);
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    writtenFiles.set(path, content);
  }),
}));

import { registerObsidianExportFunction } from "../src/functions/obsidian-export.js";
import type { Memory, Lesson, Crystal, Session } from "../src/types.js";

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

function makeLesson(id: string): Lesson {
  return {
    id,
    content: `Lesson ${id}`,
    context: "Test context",
    confidence: 0.8,
    reinforcements: 2,
    source: "manual",
    sourceIds: [],
    project: "/test",
    tags: ["testing"],
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    decayRate: 0.05,
  };
}

function makeCrystal(id: string): Crystal {
  return {
    id,
    narrative: `Crystal narrative ${id}`,
    keyOutcomes: ["Outcome 1"],
    filesAffected: ["src/test.ts"],
    lessons: ["Learned something"],
    sourceActionIds: ["act_1"],
    sessionId: "ses_1",
    project: "/test",
    createdAt: "2026-04-01T00:00:00Z",
  };
}

function makeSession(id: string): Session {
  return {
    id,
    project: "/test",
    cwd: "/Users/test/project",
    startedAt: "2026-04-01T00:00:00Z",
    endedAt: "2026-04-01T01:00:00Z",
    status: "completed",
    observationCount: 15,
  };
}

describe("Obsidian Export", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const exportRoot = "/tmp/agentmemory-export-root";

  beforeEach(() => {
    process.env.AGENTMEMORY_EXPORT_ROOT = exportRoot;
    sdk = mockSdk();
    kv = mockKV();
    writtenFiles.clear();
    createdDirs.clear();
    registerObsidianExportFunction(sdk as never, kv as never);
  });

  it("creates directories and MOC.md with empty data", async () => {
    const result = (await sdk.trigger("mem::obsidian-export", {})) as {
      success: boolean;
      exported: Record<string, number>;
      vaultDir: string;
    };

    expect(result.success).toBe(true);
    expect(result.exported.memories).toBe(0);
    expect(result.exported.lessons).toBe(0);
    expect(result.exported.crystals).toBe(0);
    expect(result.exported.sessions).toBe(0);
    expect(createdDirs.size).toBe(4);

    const mocPath = [...writtenFiles.keys()].find((k) => k.endsWith("MOC.md"));
    expect(mocPath).toBeDefined();
    const moc = writtenFiles.get(mocPath!);
    expect(moc).toContain("# agentmemory vault");
    expect(moc).toContain("## Memories (0)");
  });

  it("exports memories with YAML frontmatter", async () => {
    const mem = makeMemory("mem_001");
    await kv.set("mem:memories", mem.id, mem);

    const result = (await sdk.trigger("mem::obsidian-export", {})) as {
      exported: Record<string, number>;
    };

    expect(result.exported.memories).toBe(1);

    const memFile = [...writtenFiles.entries()].find(([k]) =>
      k.includes("memories/mem_001.md"),
    );
    expect(memFile).toBeDefined();
    const content = memFile![1];
    expect(content).toContain("---");
    expect(content).toContain('id: "mem_001"');
    expect(content).toContain('type: "pattern"');
    expect(content).toContain("# Memory mem_001");
    expect(content).toContain("#testing");
  });

  it("exports lessons with confidence and source", async () => {
    const lesson = makeLesson("lsn_001");
    await kv.set("mem:lessons", lesson.id, lesson);

    const result = (await sdk.trigger("mem::obsidian-export", {})) as {
      exported: Record<string, number>;
    };

    expect(result.exported.lessons).toBe(1);

    const lsnFile = [...writtenFiles.entries()].find(([k]) =>
      k.includes("lessons/lsn_001.md"),
    );
    expect(lsnFile).toBeDefined();
    const content = lsnFile![1];
    expect(content).toContain("confidence: 0.8");
    expect(content).toContain("reinforcements: 2");
    expect(content).toContain('source: "manual"');
  });

  it("exports crystals with wikilinks to source actions", async () => {
    const crystal = makeCrystal("crys_001");
    await kv.set("mem:crystals", crystal.id, crystal);

    await sdk.trigger("mem::obsidian-export", {});

    const crysFile = [...writtenFiles.entries()].find(([k]) =>
      k.includes("crystals/crys_001.md"),
    );
    expect(crysFile).toBeDefined();
    expect(crysFile![1]).toContain("[[act_1]]");
    expect(crysFile![1]).toContain("Outcome 1");
  });

  it("respects types filter", async () => {
    await kv.set("mem:memories", "mem_001", makeMemory("mem_001"));
    await kv.set("mem:lessons", "lsn_001", makeLesson("lsn_001"));

    const result = (await sdk.trigger("mem::obsidian-export", {
      types: ["lessons"],
    })) as { exported: Record<string, number> };

    expect(result.exported.lessons).toBe(1);
    expect(result.exported.memories).toBe(0);
  });

  it("respects custom vaultDir", async () => {
    await sdk.trigger("mem::obsidian-export", {
      vaultDir: "/tmp/agentmemory-export-root/test-vault",
    });

    const hasCustomPath = [...createdDirs].some((d) =>
      d.startsWith("/tmp/agentmemory-export-root/test-vault"),
    );
    expect(hasCustomPath).toBe(true);
  });

  it("rejects vaultDir outside the export root", async () => {
    const result = (await sdk.trigger("mem::obsidian-export", {
      vaultDir: "/tmp/outside-root",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain(exportRoot);
  });

  it("skips deleted lessons", async () => {
    const lesson = makeLesson("lsn_deleted");
    (lesson as any).deleted = true;
    await kv.set("mem:lessons", lesson.id, lesson);

    const result = (await sdk.trigger("mem::obsidian-export", {})) as {
      exported: Record<string, number>;
    };

    expect(result.exported.lessons).toBe(0);
  });

  it("skips non-latest memories", async () => {
    const mem = makeMemory("mem_old");
    mem.isLatest = false;
    await kv.set("mem:memories", mem.id, mem);

    const result = (await sdk.trigger("mem::obsidian-export", {})) as {
      exported: Record<string, number>;
    };

    expect(result.exported.memories).toBe(0);
  });

  it("MOC groups entries by type", async () => {
    await kv.set("mem:memories", "mem_001", makeMemory("mem_001"));
    await kv.set("mem:lessons", "lsn_001", makeLesson("lsn_001"));
    await kv.set("mem:crystals", "crys_001", makeCrystal("crys_001"));
    await kv.set("mem:sessions", "ses_001", makeSession("ses_001"));

    await sdk.trigger("mem::obsidian-export", {});

    const mocPath = [...writtenFiles.keys()].find((k) => k.endsWith("MOC.md"));
    const moc = writtenFiles.get(mocPath!)!;

    expect(moc).toContain("## Memories (1)");
    expect(moc).toContain("## Lessons (1)");
    expect(moc).toContain("## Crystals (1)");
    expect(moc).toContain("## Sessions (1)");
    expect(moc).toContain("[[memories/mem_001|");
    expect(moc).toContain("[[lessons/lsn_001|");
    expect(moc).toContain("[[crystals/crys_001|");
    expect(moc).toContain("[[sessions/ses_001|");
  });

  it("returns undefined errors on success", async () => {
    await kv.set("mem:memories", "mem_001", makeMemory("mem_001"));

    const result = (await sdk.trigger("mem::obsidian-export", {})) as {
      success: boolean;
      errors?: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });
});
