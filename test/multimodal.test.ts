import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { existsSync, rmSync } from "node:fs";

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    getContext: () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    }),
  };
});

vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({
    add: vi.fn(),
  }),
}));

const mockTriggerVoid = vi.fn();
const mockTrigger = vi.fn().mockResolvedValue(undefined);
const mockSdk = { triggerVoid: mockTriggerVoid, trigger: mockTrigger } as any;

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
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
    getStore: () => store,
  };
}

const kv = mockKV() as any;

import { registerObserveFunction } from "../src/functions/observe.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import type { RawObservation, CompressedObservation, MemoryProvider } from "../src/types.js";

const VALID_COMPRESS_XML = `<type>image</type>
<title>Screenshot of Red Dot</title>
<subtitle>Test image observation</subtitle>
<facts><fact>Image shows a single red pixel on white background</fact></facts>
<narrative>A vision model described a screenshot showing a red dot on a white background</narrative>
<concepts><concept>testing</concept><concept>screenshot</concept></concepts>
<files></files>
<importance>5</importance>`;

describe("End-to-End Multimodal Flow", () => {
  let savedImagePath: string | undefined;

  afterAll(() => {
    if (savedImagePath && existsSync(savedImagePath)) {
      rmSync(savedImagePath);
      console.log(`Cleanup: Removed test image at ${savedImagePath}`);
    }
  });

  beforeEach(() => {
    mockTriggerVoid.mockClear();
  });

  it("Step 1: Agent image should be successfully saved to hard drive", async () => {
    let observeCallback: any = null;
    const sdkMocker = { ...mockSdk, registerFunction: vi.fn((id, cb) => { if (id === "mem::observe") observeCallback = cb; }) };
    registerObserveFunction(sdkMocker, kv);

    const fakeIncomingData = {
      hookType: "post_tool_use",
      sessionId: "test-session",
      timestamp: new Date().toISOString(),
      data: {
        tool_name: "screenshot",
        tool_output: {
          image_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg=="
        }
      }
    };

    const res = await observeCallback(fakeIncomingData);
    expect(res.observationId).toBeDefined();

    const obsList = await kv.list("mem:obs:test-session");
    expect(obsList.length).toBe(1);

    const raw = obsList[0] as RawObservation;
    expect(raw.modality).toBe("mixed");

    expect(raw.imageData).toBeDefined();
    expect(typeof raw.imageData).toBe("string");
    expect(existsSync(raw.imageData!)).toBe(true);

    savedImagePath = raw.imageData;

    const deltaCalls = mockTriggerVoid.mock.calls.filter(
      (c: any[]) => c[0] === "mem::disk-size-delta"
    );
    expect(deltaCalls.length).toBe(1);
    expect(deltaCalls[0][1].deltaBytes).toBeGreaterThan(0);
  });

  it("Step 2 & 3: mem::compress should call the vision model and store compressed observation in KV", async () => {
    const mockProvider: MemoryProvider = {
      name: "mock-vision",
      compress: async (_systemPrompt, userPrompt) => {
        expect(userPrompt).toContain("TEST_VISION_RESULT: I see a red dot");
        return VALID_COMPRESS_XML;
      },
      summarize: async () => "",
      describeImage: async (_base64, _mimeType, _prompt) => {
        return "TEST_VISION_RESULT: I see a red dot";
      },
    };

    let compressCallback: any = null;
    const sdkMocker = {
      ...mockSdk,
      registerFunction: vi.fn((id, cb) => {
        if (id === "mem::compress") compressCallback = cb;
      }),
    };
    registerCompressFunction(sdkMocker, kv, mockProvider);

    expect(compressCallback).not.toBeNull();

    const rawObsList = await kv.list("mem:obs:test-session");
    const raw = rawObsList[0] as RawObservation;

    expect(raw.modality).toBeDefined();
    expect(raw.imageData).toBe(savedImagePath);

    const result = await compressCallback({
      observationId: raw.id,
      sessionId: raw.sessionId,
      raw,
    });

    expect(result.success).toBe(true);
    expect(result.compressed).toBeDefined();

    const compressed = result.compressed as CompressedObservation;
    expect(compressed.imageDescription).toBe("TEST_VISION_RESULT: I see a red dot");
    expect(compressed.imageRef).toBe(savedImagePath);
    expect(compressed.modality).toBe("mixed");
    expect(compressed.title).toBe("Screenshot of Red Dot");
    expect(compressed.narrative).toContain("red dot");

    const stored = await kv.get("mem:obs:test-session", raw.id!) as CompressedObservation | null;
    expect(stored).not.toBeNull();
    expect(stored!.imageDescription).toBe("TEST_VISION_RESULT: I see a red dot");
    expect(stored!.imageRef).toBe(savedImagePath);
  });
});

describe("Disk Size Manager", () => {
  it("should increment disk size and trigger cleanup when over quota", async () => {
    const localKv = mockKV() as any;
    const localTriggerVoid = vi.fn();
    const localSdk = { triggerVoid: localTriggerVoid } as any;

    let managerCallback: any = null;
    const sdkMocker = {
      ...localSdk,
      registerFunction: vi.fn((id: string, cb: any) => {
        if (id === "mem::disk-size-delta") managerCallback = cb;
      }),
    };

    const { registerDiskSizeManager } = await import("../src/functions/disk-size-manager.js");
    registerDiskSizeManager(sdkMocker, localKv);

    expect(managerCallback).not.toBeNull();

    const res1 = await managerCallback({ deltaBytes: 1000 });
    expect(res1.success).toBe(true);
    expect(res1.currentTotal).toBe(1000);

    const res2 = await managerCallback({ deltaBytes: 2000 });
    expect(res2.success).toBe(true);
    expect(res2.currentTotal).toBe(3000);

    expect(localTriggerVoid).not.toHaveBeenCalled();
  });

  it("should trigger cleanup when total exceeds max bytes", async () => {
    const originalEnv = process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES;
    try {
      process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES = "5000";

      const localKv = mockKV() as any;
      const localTriggerVoid = vi.fn();
      const localSdk = { triggerVoid: localTriggerVoid } as any;

      let managerCallback: any = null;
      const sdkMocker = {
        ...localSdk,
        registerFunction: vi.fn((id: string, cb: any) => {
          if (id === "mem::disk-size-delta") managerCallback = cb;
        }),
      };

      const { registerDiskSizeManager } = await import("../src/functions/disk-size-manager.js");
      registerDiskSizeManager(sdkMocker, localKv);

      await managerCallback({ deltaBytes: 3000 });
      expect(localTriggerVoid).not.toHaveBeenCalled();

      await managerCallback({ deltaBytes: 3000 });
      expect(localTriggerVoid).toHaveBeenCalledWith("mem::image-quota-cleanup", {});
    } finally {
      if (originalEnv === undefined) {
        delete process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES;
      } else {
        process.env.AGENTMEMORY_IMAGE_STORE_MAX_BYTES = originalEnv;
      }
    }
  });

  it("should clamp negative totals to zero", async () => {
    const localKv = mockKV() as any;
    const localSdk = { triggerVoid: vi.fn() } as any;

    let managerCallback: any = null;
    const sdkMocker = {
      ...localSdk,
      registerFunction: vi.fn((id: string, cb: any) => {
        if (id === "mem::disk-size-delta") managerCallback = cb;
      }),
    };

    const { registerDiskSizeManager } = await import("../src/functions/disk-size-manager.js");
    registerDiskSizeManager(sdkMocker, localKv);

    const res = await managerCallback({ deltaBytes: -99999 });
    expect(res.currentTotal).toBe(0);
  });

  it("should reject invalid deltaBytes", async () => {
    const localKv = mockKV() as any;
    const localSdk = { triggerVoid: vi.fn() } as any;

    let managerCallback: any = null;
    const sdkMocker = {
      ...localSdk,
      registerFunction: vi.fn((id: string, cb: any) => {
        if (id === "mem::disk-size-delta") managerCallback = cb;
      }),
    };

    const { registerDiskSizeManager } = await import("../src/functions/disk-size-manager.js");
    registerDiskSizeManager(sdkMocker, localKv);

    const res = await managerCallback({ deltaBytes: "not-a-number" });
    expect(res.success).toBe(false);
  });
});

describe("Image Refs", () => {
  it("should increment and decrement ref counts correctly with deletion parity", async () => {
    const localKv = mockKV() as any;
    const localTriggerVoid = vi.fn();
    const localSdk = { triggerVoid: localTriggerVoid } as any;

    const { saveImageToDisk } = await import("../src/utils/image-store.js");
    const { incrementImageRef, decrementImageRef, getImageRefCount } = await import("../src/functions/image-refs.js");

    const result = await saveImageToDisk(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg=="
    );
    const testFile = result.filePath;
    
    expect(existsSync(testFile)).toBe(true);

    // Initial state
    expect(await getImageRefCount(localKv, testFile)).toBe(0);

    // Increment to 1
    await incrementImageRef(localKv, testFile);
    expect(await getImageRefCount(localKv, testFile)).toBe(1);

    // Increment to 2 (shared image)
    await incrementImageRef(localKv, testFile);
    expect(await getImageRefCount(localKv, testFile)).toBe(2);

    // Decrement from 2 to 1
    await decrementImageRef(localKv, localSdk, testFile);
    expect(await getImageRefCount(localKv, testFile)).toBe(1);
    
    // (c) shared image with refcount >= 2 is NOT deleted when one decrements
    expect(existsSync(testFile)).toBe(true);
    expect(localTriggerVoid).not.toHaveBeenCalled();

    // (a) decrementing to zero triggers image file deletion and negative delta
    await decrementImageRef(localKv, localSdk, testFile);
    expect(await getImageRefCount(localKv, testFile)).toBe(0);
    expect(existsSync(testFile)).toBe(false);
    
    const deltaCalls = localTriggerVoid.mock.calls.filter(
      (c: any[]) => c[0] === "mem::disk-size-delta"
    );
    expect(deltaCalls.length).toBe(1);
    expect(deltaCalls[0][1].deltaBytes).toBeLessThan(0);

    // (b) decrementing an already-zero/unknown ref is a no-op
    localTriggerVoid.mockClear();
    await decrementImageRef(localKv, localSdk, "/fake/unknown/path.png");
    expect(await getImageRefCount(localKv, "/fake/unknown/path.png")).toBe(0);
    const noOpDeltaCalls = localTriggerVoid.mock.calls.filter(
      (c: any[]) => c[0] === "mem::disk-size-delta"
    );
    expect(noOpDeltaCalls.length).toBe(0);
  });
});

describe("Image Store", () => {
  let testFilePath: string | undefined;

  afterAll(() => {
    if (testFilePath && existsSync(testFilePath)) {
      rmSync(testFilePath);
    }
  });

  it("saveImageToDisk should return filePath and bytesWritten", async () => {
    const { saveImageToDisk } = await import("../src/utils/image-store.js");
    const result = await saveImageToDisk(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg=="
    );

    expect(result.filePath).toBeDefined();
    expect(typeof result.filePath).toBe("string");
    expect(result.filePath.length).toBeGreaterThan(0);
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(existsSync(result.filePath)).toBe(true);

    testFilePath = result.filePath;
  });

  it("deleteImage should return deletedBytes after successful deletion", async () => {
    const { deleteImage } = await import("../src/utils/image-store.js");

    expect(testFilePath).toBeDefined();
    expect(existsSync(testFilePath!)).toBe(true);

    const result = await deleteImage(testFilePath!);
    expect(result.deletedBytes).toBeGreaterThan(0);
    expect(existsSync(testFilePath!)).toBe(false);

    testFilePath = undefined;
  });

  it("deleteImage should return 0 for non-existent files", async () => {
    const { deleteImage } = await import("../src/utils/image-store.js");
    const result = await deleteImage("/non/existent/file.png");
    expect(result.deletedBytes).toBe(0);
  });

  it("saveImageToDisk should return empty for empty input", async () => {
    const { saveImageToDisk } = await import("../src/utils/image-store.js");
    const result = await saveImageToDisk("");
    expect(result.filePath).toBe("");
    expect(result.bytesWritten).toBe(0);
  });
});
