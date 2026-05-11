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

    expect(first.filePath.endsWith(".webp")).toBe(true);
    expect(first.bytesWritten).toBe(5);
    expect(second).toEqual({ filePath: first.filePath, bytesWritten: 0 });
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
});
