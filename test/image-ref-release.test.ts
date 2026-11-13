import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile, stat } from "node:fs/promises";

const { warn, snapshotContent } = vi.hoisted(() => ({
  warn: vi.fn(),
  snapshotContent: vi.fn(() => '{"version":"0.4.0","sessions":[],"memories":[]}'),
}));
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn, error: vi.fn() },
}));

vi.mock("node:util", async () => {
  const actual = (await vi.importActual("node:util")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    promisify: () => async (_file: string, args: string[]) => ({
      stdout: args[0] === "show" ? snapshotContent() : "abc1234\n",
      stderr: "",
    }),
  };
});

import { releaseImageRef } from "../src/functions/image-refs.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerSnapshotFunction } from "../src/functions/snapshot.js";
import { getSearchIndex } from "../src/functions/search.js";
import { IMAGES_DIR } from "../src/utils/image-store.js";
import { KV } from "../src/state/schema.js";
import { VERSION } from "../src/version.js";
import type {
  CompressedObservation,
  ExportData,
  Memory,
  Session,
} from "../src/types.js";

function kvWithFailingWrite(count: number) {
  return {
    get: async (scope: string) => (scope === KV.imageRefs ? count : null),
    set: async () => {
      throw new Error("image ref write failed");
    },
    delete: async () => {},
    list: async () => [],
  };
}

describe("releaseImageRef", () => {
  beforeEach(() => warn.mockClear());

  it("logs a failed image ref write and does not throw", async () => {
    const sdk = { trigger: vi.fn() };
    await expect(releaseImageRef(kvWithFailingWrite(2) as never, sdk as never, "mem_1", "/tmp/img-a.png")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Image reference release failed after delete", {
      ownerId: "mem_1",
      imageRef: "/tmp/img-a.png",
      error: "image ref write failed",
    });
  });

  it("decrements the count when the write succeeds", async () => {
    const writes: Array<[string, string, unknown]> = [];
    const kv = {
      get: async () => 3,
      set: async (scope: string, key: string, value: unknown) => {
        writes.push([scope, key, value]);
        return value;
      },
      delete: async () => {},
      list: async () => [],
    };
    await releaseImageRef(kv as never, { trigger: vi.fn() } as never, "mem_2", "/tmp/img-b.png");
    expect(writes).toEqual([[KV.imageRefs, "/tmp/img-b.png", 2]]);
    expect(warn).not.toHaveBeenCalled();
  });
});

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    listKeys: async (scope: string): Promise<string[]> =>
      Array.from(store.get(scope)?.keys() ?? []),
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  functions.set("mem::disk-size-delta", () => ({ success: true }));
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
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

const testSession = (id: string): Session => ({
  id,
  project: "img-project",
  cwd: "/tmp",
  startedAt: "2026-02-01T00:00:00Z",
  status: "completed",
  observationCount: 1,
});

const obsRow = (id: string, sessionId: string): CompressedObservation => ({
  id,
  sessionId,
  timestamp: "2026-02-01T10:00:00Z",
  type: "file_edit",
  title: `Observation ${id}`,
  facts: ["fact"],
  narrative: "narrative",
  concepts: ["img"],
  files: ["src/x.ts"],
  importance: 5,
});

const memRow = (id: string): Memory => ({
  id,
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  type: "pattern",
  title: `Memory ${id}`,
  content: "content",
  concepts: ["img"],
  files: [],
  sessionIds: [],
  strength: 5,
  version: 1,
  isLatest: true,
});

const imageExport = (rows: Partial<ExportData>): ExportData =>
  ({
    version: VERSION,
    exportedAt: new Date().toISOString(),
    sessions: [],
    observations: {},
    memories: [],
    summaries: [],
    ...rows,
  }) as ExportData;

const importResult = (sdk: ReturnType<typeof mockSdk>, exportData: ExportData, strategy: "merge" | "replace" | "skip") =>
  sdk.trigger("mem::import", { exportData, strategy }) as Promise<{ success: boolean }>;

async function seedManagedImage(name: string): Promise<string> {
  const path = join(IMAGES_DIR, name);
  await mkdir(IMAGES_DIR, { recursive: true });
  await writeFile(path, `png-${name}`);
  return path;
}

describe("mem::import image ref reconciliation", () => {
  beforeEach(() => getSearchIndex().clear());

  it("keeps the file, embedding and count when merge moves an image from an observation to a memory", async () => {
    const path = await seedManagedImage("move.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.sessions, "ses_1", testSession("ses_1"));
    await kv.set(KV.observations("ses_1"), "obs_1", { ...obsRow("obs_1", "ses_1"), imageData: path });
    await kv.set(KV.imageRefs, path, 1);
    await kv.set(KV.imageEmbeddings, path, { dims: 3 });

    const incomingObs = obsRow("obs_1", "ses_1");
    const incomingMem = { ...memRow("mem_1"), imageRef: path };
    const result = await importResult(sdk, imageExport({
      sessions: [testSession("ses_1")],
      observations: { ses_1: [incomingObs] },
      memories: [incomingMem],
    }), "merge");

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, path)).toBe(1);
    expect(await kv.get(KV.imageEmbeddings, path)).toEqual({ dims: 3 });
    await expect(stat(path)).resolves.toBeTruthy();
  });

  it("keeps a shared memory and observation image referenced while an owner is rewritten", async () => {
    const path = await seedManagedImage("shared.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.sessions, "ses_1", testSession("ses_1"));
    await kv.set(KV.observations("ses_1"), "obs_1", { ...obsRow("obs_1", "ses_1"), imageData: path });
    await kv.set(KV.memories, "mem_1", { ...memRow("mem_1"), imageRef: path });
    await kv.set(KV.imageRefs, path, 2);
    await kv.set(KV.imageEmbeddings, path, { dims: 3 });

    const result = await importResult(sdk, imageExport({
      sessions: [testSession("ses_1")],
      observations: { ses_1: [obsRow("obs_1", "ses_1")] },
      memories: [{ ...memRow("mem_1"), imageRef: path }],
    }), "merge");

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, path)).toBe(1);
    expect(await kv.get(KV.imageEmbeddings, path)).toEqual({ dims: 3 });
    await expect(stat(path)).resolves.toBeTruthy();
  });

  it("rolls back earlier reservations when a later reservation write fails, then retries cleanly", async () => {
    const pathA = await seedManagedImage("res-a.png");
    const pathB = await seedManagedImage("res-b.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.imageEmbeddings, pathA, { dims: 3 });
    await kv.set(KV.imageEmbeddings, pathB, { dims: 4 });

    const exportData = imageExport({
      memories: [
        { ...memRow("mem_a"), imageRef: pathA },
        { ...memRow("mem_b"), imageRef: pathB },
      ],
    });
    const realSet = kv.set;
    const setter = vi
      .spyOn(kv, "set")
      .mockImplementation(async (scope: string, key: string, value: never) => {
        if (scope === KV.imageRefs && key === pathB) {
          throw new Error("ref set failed");
        }
        return realSet(scope, key, value);
      });

    const failed = await importResult(sdk, exportData, "merge").catch((err: unknown) => err);

    expect(failed).toBeInstanceOf(Error);
    expect(await kv.get(KV.memories, "mem_a")).toBeNull();
    expect(await kv.get(KV.memories, "mem_b")).toBeNull();
    expect(await kv.get(KV.imageRefs, pathA)).toBeNull();
    expect(await kv.get(KV.imageRefs, pathB)).toBeNull();
    await expect(stat(pathA)).resolves.toBeTruthy();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathA)).toEqual({ dims: 3 });
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 4 });

    setter.mockRestore();
    const retried = await importResult(sdk, exportData, "merge");
    expect(retried.success).toBe(true);
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathB)).toBe(1);
    await expect(stat(pathA)).resolves.toBeTruthy();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathA)).toEqual({ dims: 3 });
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 4 });
  });

  it("reconciles committed writes when a later memory write fails under replace, then retries cleanly", async () => {
    const oldPath = await seedManagedImage("old.png");
    const pathA = await seedManagedImage("new-a.png");
    const pathB = await seedManagedImage("new-b.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_old", { ...memRow("mem_old"), imageRef: oldPath });
    await kv.set(KV.imageRefs, oldPath, 1);
    await kv.set(KV.imageEmbeddings, oldPath, { dims: 3 });

    const exportData = imageExport({
      memories: [
        { ...memRow("mem_a"), imageRef: pathA },
        { ...memRow("mem_b"), imageRef: pathB },
      ],
    });
    await kv.set(KV.imageEmbeddings, pathA, { dims: 5 });
    await kv.set(KV.imageEmbeddings, pathB, { dims: 6 });
    const realSet = kv.set;
    const setter = vi
      .spyOn(kv, "set")
      .mockImplementation(async (scope: string, key: string, value: never) => {
        if (scope === KV.memories && key === "mem_b") {
          throw new Error("owner set failed");
        }
        return realSet(scope, key, value);
      });

    const failed = await importResult(sdk, exportData, "replace").catch((err: unknown) => err);

    expect(failed).toBeInstanceOf(Error);
    expect(await kv.get(KV.memories, "mem_old")).toBeNull();
    expect(await kv.get(KV.memories, "mem_a")).not.toBeNull();
    expect(await kv.get(KV.memories, "mem_b")).toBeNull();
    expect(await kv.get(KV.imageRefs, oldPath)).toBeNull();
    expect(await kv.get(KV.imageEmbeddings, oldPath)).toBeNull();
    await expect(stat(oldPath)).rejects.toBeTruthy();
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathB)).toBeNull();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 6 });

    setter.mockRestore();
    const retried = await importResult(sdk, exportData, "replace");
    expect(retried.success).toBe(true);
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathB)).toBe(1);
    await expect(stat(pathA)).resolves.toBeTruthy();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathA)).toEqual({ dims: 5 });
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 6 });
  });
});

describe("mem::snapshot-restore image ref reconciliation", () => {
  const snapshotDir = "/tmp/agentmemory-snapshots";
  beforeEach(() => {
    getSearchIndex().clear();
    snapshotContent.mockClear();
  });

  it("keeps both files, embeddings and counts when a restore swaps two memories' image refs", async () => {
    const pathA = await seedManagedImage("swap-a.png");
    const pathB = await seedManagedImage("swap-b.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerSnapshotFunction(sdk as never, kv as never, snapshotDir);
    await kv.set(KV.memories, "mem_1", { ...memRow("mem_1"), imageRef: pathA });
    await kv.set(KV.memories, "mem_2", { ...memRow("mem_2"), imageRef: pathB });
    await kv.set(KV.imageRefs, pathA, 1);
    await kv.set(KV.imageRefs, pathB, 1);
    await kv.set(KV.imageEmbeddings, pathA, { dims: 3 });
    await kv.set(KV.imageEmbeddings, pathB, { dims: 4 });

    snapshotContent.mockReturnValueOnce(JSON.stringify({
      version: "0.4.0",
      sessions: [],
      memories: [
        { ...memRow("mem_1"), imageRef: pathB },
        { ...memRow("mem_2"), imageRef: pathA },
      ],
    }));

    const result = (await sdk.trigger("mem::snapshot-restore", {
      commitHash: "abc1234",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathB)).toBe(1);
    expect(await kv.get(KV.imageEmbeddings, pathA)).toEqual({ dims: 3 });
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 4 });
    await expect(stat(pathA)).resolves.toBeTruthy();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get<{ imageRef: string }>(KV.memories, "mem_1")).toMatchObject({ imageRef: pathB });
    expect(await kv.get<{ imageRef: string }>(KV.memories, "mem_2")).toMatchObject({ imageRef: pathA });
  });

  it("leaves owners and refcounts untouched when a previous-owner read fails", async () => {
    const pathA = await seedManagedImage("prev-a.png");
    const pathC = await seedManagedImage("prev-c.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerSnapshotFunction(sdk as never, kv as never, snapshotDir);
    const existing = { ...memRow("mem_1"), imageRef: pathA };
    await kv.set(KV.memories, "mem_1", existing);
    await kv.set(KV.imageRefs, pathA, 1);
    await kv.set(KV.imageEmbeddings, pathC, { dims: 7 });

    snapshotContent.mockReturnValueOnce(JSON.stringify({
      version: "0.4.0",
      sessions: [],
      memories: [{ ...memRow("mem_1"), imageRef: pathC }],
    }));
    const getter = vi
      .spyOn(kv, "get")
      .mockImplementation(async (scope: string, key: string) => {
        if (scope === KV.memories && key === "mem_1") {
          throw new Error("previous owner read failed");
        }
        return null;
      });

    const result = (await sdk.trigger("mem::snapshot-restore", {
      commitHash: "abc1234",
    })) as { success: boolean };

    expect(result.success).toBe(false);
    getter.mockRestore();
    expect(await kv.get(KV.memories, "mem_1")).toEqual(existing);
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathC)).toBeNull();
    await expect(stat(pathC)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathC)).toEqual({ dims: 7 });
  });

  it("reconciles committed owners when a later restore write fails, then retries cleanly", async () => {
    const pathA = await seedManagedImage("late-a.png");
    const pathB = await seedManagedImage("late-b.png");
    const sdk = mockSdk();
    const kv = mockKV();
    registerSnapshotFunction(sdk as never, kv as never, snapshotDir);
    const archive = {
      version: "0.4.0",
      sessions: [],
      memories: [
        { ...memRow("mem_a"), imageRef: pathA },
        { ...memRow("mem_b"), imageRef: pathB },
      ],
    };
    const realSet = kv.set;
    const setter = vi
      .spyOn(kv, "set")
      .mockImplementation(async (scope: string, key: string, value: never) => {
        if (scope === KV.memories && key === "mem_b") {
          throw new Error("restore set failed");
        }
        return realSet(scope, key, value);
      });
    await kv.set(KV.imageEmbeddings, pathA, { dims: 8 });
    await kv.set(KV.imageEmbeddings, pathB, { dims: 9 });
    snapshotContent.mockReturnValueOnce(JSON.stringify(archive));

    const failed = (await sdk.trigger("mem::snapshot-restore", {
      commitHash: "abc1234",
    })) as { success: boolean };

    expect(failed.success).toBe(false);
    expect(await kv.get(KV.memories, "mem_a")).not.toBeNull();
    expect(await kv.get(KV.memories, "mem_b")).toBeNull();
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathB)).toBeNull();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 9 });

    setter.mockRestore();
    snapshotContent.mockReturnValueOnce(JSON.stringify(archive));
    const retried = (await sdk.trigger("mem::snapshot-restore", {
      commitHash: "abc1234",
    })) as { success: boolean };

    expect(retried.success).toBe(true);
    expect(await kv.get(KV.imageRefs, pathA)).toBe(1);
    expect(await kv.get(KV.imageRefs, pathB)).toBe(1);
    await expect(stat(pathA)).resolves.toBeTruthy();
    await expect(stat(pathB)).resolves.toBeTruthy();
    expect(await kv.get(KV.imageEmbeddings, pathA)).toEqual({ dims: 8 });
    expect(await kv.get(KV.imageEmbeddings, pathB)).toEqual({ dims: 9 });
  });
});
