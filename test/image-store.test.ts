import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";
import {
  IMAGES_DIR,
  deleteImage,
  getMaxBytes,
  isManagedImagePath,
  saveImageToDisk,
  touchImage,
} from "../src/utils/image-store.js";

const created = new Set<string>();

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES;
  for (const filePath of created) {
    if (existsSync(filePath)) rmSync(filePath, { force: true });
  }
  created.clear();
});

describe("image-store", () => {
  it("uses default and env max byte limits", () => {
    delete process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES;
    expect(getMaxBytes()).toBe(500 * 1024 * 1024);

    process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES = "1234";
    expect(getMaxBytes()).toBe(1234);
  });

  it("recognizes only managed image paths", () => {
    expect(isManagedImagePath(IMAGES_DIR)).toBe(true);
    expect(isManagedImagePath(join(IMAGES_DIR, "x.png"))).toBe(true);
    expect(isManagedImagePath(join(dirname(IMAGES_DIR), "images-other", "x.png"))).toBe(false);
  });

  it("saves data URLs, detects extension, and deduplicates by content", async () => {
    const payload = "data:image/webp;base64,aGVsbG8=";

    const first = await saveImageToDisk(payload);
    created.add(first.filePath);
    const second = await saveImageToDisk(payload);
    const jpeg = await saveImageToDisk("data:image/jpeg;base64,anBlZw==");
    created.add(jpeg.filePath);

    expect(first.filePath.endsWith(".webp")).toBe(true);
    expect(jpeg.filePath.endsWith(".jpg")).toBe(true);
    expect(first.bytesWritten).toBe(5);
    expect(second).toEqual({ filePath: first.filePath, bytesWritten: 0 });
  });

  it("creates the image directory when absent and detects gif metadata", async () => {
    const saved = await saveImageToDisk("data:image/gif;base64,Z2lm");
    created.add(saved.filePath);

    expect(saved.filePath.endsWith(".gif")).toBe(true);
  });

  it("creates the image directory when the store is missing", async () => {
    vi.resetModules();
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const actualFsPromises = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const mkdirMock = vi.fn(actualFsPromises.mkdir);
    vi.doMock("node:fs", () => ({
      ...actualFs,
      existsSync: () => false,
    }));
    vi.doMock("node:fs/promises", () => ({
      ...actualFsPromises,
      mkdir: mkdirMock,
    }));
    const {
      IMAGES_DIR: mockedImagesDir,
      saveImageToDisk: saveWithMissingDir,
    } = await import("../src/utils/image-store.js");

    const saved = await saveWithMissingDir("ZGlyLW1pc3Npbmc=");
    created.add(saved.filePath);

    expect(mkdirMock).toHaveBeenCalledWith(mockedImagesDir, { recursive: true });
    vi.doUnmock("node:fs");
    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("handles empty, jpeg-looking raw base64, and deletion guard paths", async () => {
    await expect(saveImageToDisk("")).resolves.toEqual({ filePath: "", bytesWritten: 0 });

    const saved = await saveImageToDisk("/9j/aGVsbG8=");
    created.add(saved.filePath);
    expect(saved.filePath.endsWith(".jpg")).toBe(true);

    await expect(deleteImage(undefined)).resolves.toEqual({ deletedBytes: 0 });
    await expect(deleteImage("/tmp/not-managed.png")).resolves.toEqual({ deletedBytes: 0 });
    await expect(deleteImage(saved.filePath)).resolves.toEqual({ deletedBytes: saved.bytesWritten });
    expect(existsSync(saved.filePath)).toBe(false);
  });

  it("returns zero when managed image deletion fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteImage(IMAGES_DIR)).resolves.toEqual({ deletedBytes: 0 });
    expect(errorSpy).toHaveBeenCalledWith(
      "[agentmemory] Failed to delete image context:",
      expect.any(Error),
    );
  });

  it("touches managed files and ignores invalid or missing paths", async () => {
    const filePath = join(IMAGES_DIR, "touch-test.txt");
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, "x");
    created.add(filePath);
    const before = stat(filePath).then((s) => s.mtimeMs);

    await touchImage("");
    await touchImage("/tmp/not-managed.png");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await touchImage(filePath);

    const after = await stat(filePath).then((s) => s.mtimeMs);
    expect(after).toBeGreaterThanOrEqual(await before);
  });

  it("ignores touch failures", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs")>()),
      existsSync: () => true,
    }));
    vi.doMock("node:fs/promises", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs/promises")>()),
      utimes: vi.fn().mockRejectedValue(new Error("readonly")),
    }));
    const { touchImage: touchWithFailingUtimes } = await import("../src/utils/image-store.js");

    await expect(touchWithFailingUtimes(join(IMAGES_DIR, "touch-fail.txt"))).resolves.toBeUndefined();
    vi.doUnmock("node:fs");
    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });
});
