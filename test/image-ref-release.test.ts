import { describe, it, expect, vi, beforeEach } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn, error: vi.fn() },
}));

import { releaseImageRef } from "../src/functions/image-refs.js";
import { KV } from "../src/state/schema.js";

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
