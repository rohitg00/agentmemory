import { describe, it, expect, vi, beforeAll } from "vitest";
import { engine } from "./helpers/fake-engine.js";
import { bootMain } from "./helpers/boot-main.js";
import { getVectorIndex, rebuildKeywordIndex } from "../src/functions/search.js";

// Boots the real src/index.ts main() with a matching (8-dimension) vector
// checkpoint that cannot be read at boot, then makes it readable again.

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  const { engine: fake } = await import("./helpers/fake-engine.js");
  return { ...actual, registerWorker: () => fake.client };
});

vi.mock("../src/providers/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/providers/index.js")>();
  return {
    ...actual,
    createEmbeddingProvider: () => ({
      name: "fake-8d",
      dimensions: 8,
      embed: async () => new Float32Array(8),
      embedBatch: async (texts: string[]) => texts.map(() => new Float32Array(8)),
    }),
  };
});

vi.mock("../src/functions/search.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/functions/search.js")>();
  return { ...actual, rebuildKeywordIndex: vi.fn(actual.rebuildKeywordIndex) };
});

let main: Awaited<ReturnType<typeof bootMain>>;

beforeAll(async () => {
  main = await bootMain({ checkpointDims: 8, checkpointUnreadableAtBoot: true });
}, 60_000);

describe("real main() checkpoint retry", () => {
  it("restores a checkpoint that becomes readable again and rebuilds the index once", async () => {
    expect(getVectorIndex()?.has("obs_old")).toBe(false);
    await main.tick(30_000);
    await main.tick(30_000);
    engine.failGet = null;
    const rebuildsBefore = vi.mocked(rebuildKeywordIndex).mock.calls.length;
    for (let i = 0; i < 4; i++) await main.tick(30_000);
    expect(getVectorIndex()?.has("obs_old")).toBe(true);
    expect(vi.mocked(rebuildKeywordIndex).mock.calls.length - rebuildsBefore).toBe(1);
    const loadsAfterRestore = main.loadSpy.mock.calls.length;
    for (let i = 0; i < 4; i++) await main.tick(3_600_000);
    expect(main.loadSpy.mock.calls.length).toBe(loadsAfterRestore);
  });
});
