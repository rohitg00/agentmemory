import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  getMaxBytes: vi.fn(),
  deleteImage: vi.fn(),
  getImageRefCount: vi.fn(),
  voidAction: vi.fn(() => ({ type: "void" })),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readdir: mocks.readdir,
  stat: mocks.stat,
}));

vi.mock("../src/utils/image-store.js", () => ({
  IMAGES_DIR: "/images",
  getMaxBytes: mocks.getMaxBytes,
  deleteImage: mocks.deleteImage,
}));

vi.mock("../src/functions/image-refs.js", () => ({
  getImageRefCount: mocks.getImageRefCount,
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: async <T>(_key: string, fn: () => Promise<T>): Promise<T> => fn(),
}));

vi.mock("../src/logger.js", () => ({
  logger: { info: mocks.loggerInfo, warn: vi.fn(), error: mocks.loggerError },
}));

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: mocks.voidAction,
    },
  };
});

import { registerImageQuotaCleanup } from "../src/functions/image-quota-cleanup.js";
import { mockKV } from "./helpers/mocks.js";

function fileStat(size: number, mtimeMs: number, isFile = true) {
  return { size, mtimeMs, isFile: () => isFile };
}

function registerCleanup() {
  const functions = new Map<string, (payload: unknown) => Promise<unknown>>();
  const sdk = {
    registerFunction: (id: string, handler: (payload: unknown) => Promise<unknown>) => {
      functions.set(id, handler);
    },
    trigger: vi.fn(async (
      input: string | { function_id: string; payload: unknown },
      payload?: unknown,
    ) => {
      const id = typeof input === "string" ? input : input.function_id;
      const data = typeof input === "string" ? payload : input.payload;
      const handler = functions.get(id);
      return handler ? handler(data) : undefined;
    }),
  };
  const kv = mockKV();
  registerImageQuotaCleanup(sdk as never, kv as never);
  return { sdk, kv };
}

describe("mem::image-quota-cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.getMaxBytes.mockReturnValue(100);
    mocks.readdir.mockResolvedValue([]);
    mocks.stat.mockResolvedValue(fileStat(0, 0));
    mocks.deleteImage.mockResolvedValue({ deletedBytes: 0 });
    mocks.getImageRefCount.mockResolvedValue(0);
  });

  it("treats a missing image directory as already clean", async () => {
    mocks.readdir.mockRejectedValueOnce(new Error("ENOENT"));
    const { sdk } = registerCleanup();

    const result = await sdk.trigger("mem::image-quota-cleanup", {});

    expect(result).toEqual({ success: true, evicted: 0, freedBytes: 0 });
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it("ignores dotfiles and directories while checking quota", async () => {
    mocks.readdir.mockResolvedValueOnce(["a.png", ".DS_Store", "nested"]);
    mocks.stat.mockImplementation(async (filePath: string) => {
      if (filePath === "/images/a.png") return fileStat(40, 1);
      return fileStat(20, 1, false);
    });
    const { sdk } = registerCleanup();

    const result = await sdk.trigger("mem::image-quota-cleanup", {});

    expect(result).toEqual({
      success: true,
      evicted: 0,
      freedBytes: 0,
      underQuota: true,
    });
    expect(mocks.stat).toHaveBeenCalledTimes(2);
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it("evicts old unreferenced images and emits disk deltas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00Z"));
    mocks.readdir.mockResolvedValueOnce(["old.png", "referenced.png", "recent.png"]);
    mocks.stat.mockImplementation(async (filePath: string) => {
      if (filePath === "/images/old.png") return fileStat(120, 1);
      if (filePath === "/images/referenced.png") return fileStat(90, 2);
      return fileStat(30, Date.now() - 1_000);
    });
    mocks.getImageRefCount.mockImplementation(async (_kv: unknown, filePath: string) =>
      filePath === "/images/referenced.png" ? 1 : 0,
    );
    mocks.deleteImage.mockImplementation(async (filePath: string) => ({
      deletedBytes: filePath === "/images/old.png" ? 120 : 0,
    }));
    const { sdk } = registerCleanup();

    const result = await sdk.trigger("mem::image-quota-cleanup", {});

    expect(result).toEqual({ success: true, evicted: 1, freedBytes: 120 });
    expect(mocks.deleteImage).toHaveBeenCalledWith("/images/old.png");
    expect(mocks.deleteImage).not.toHaveBeenCalledWith("/images/referenced.png");
    expect(mocks.deleteImage).not.toHaveBeenCalledWith("/images/recent.png");
    expect(mocks.voidAction).toHaveBeenCalled();
  });

  it("fails closed when refcount lookup fails", async () => {
    mocks.readdir.mockResolvedValueOnce(["old.png"]);
    mocks.stat.mockResolvedValueOnce(fileStat(200, 1));
    mocks.getImageRefCount.mockRejectedValueOnce(new Error("kv unavailable"));
    const { sdk } = registerCleanup();

    const result = await sdk.trigger("mem::image-quota-cleanup", {});

    expect(result).toEqual({ success: true, evicted: 0, freedBytes: 0 });
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Failed to read refCount; skipping eviction",
      expect.objectContaining({
        filePath: "/images/old.png",
        error: "kv unavailable",
      }),
    );
  });
});
