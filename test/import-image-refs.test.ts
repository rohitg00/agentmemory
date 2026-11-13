import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, ExportData, Memory } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE3sAAAAASUVORK5CYII=";
const SESSION = "ses_import_images";
let home: string;

beforeEach(() => {
  vi.resetModules();
  home = mkdtempSync(join(tmpdir(), "am-import-images-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
  vi.stubEnv("AGENTMEMORY_IMAGE_EMBEDDINGS", "false");
  vi.stubEnv("AGENTMEMORY_IMAGE_STORE_MAX_BYTES", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

function age(path: string) {
  const old = new Date(Date.now() - 90_000);
  utimesSync(path, old, old);
}

async function fixture(owners = 1) {
  const images = await import("../src/utils/image-store.js");
  expect(images.IMAGES_DIR.startsWith(home + sep)).toBe(true);
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerExportImportFunction } = await import("../src/functions/export-import.js");
  const { registerImageQuotaCleanup } = await import("../src/functions/image-quota-cleanup.js");
  const { getImageRefCount } = await import("../src/functions/image-refs.js");
  const sourceKv = mockKV();
  const sourceSdk = mockSdk({ looseTrigger: true });
  registerObserveFunction(sourceSdk as never, sourceKv as never);
  registerExportImportFunction(sourceSdk as never, sourceKv as never);
  for (let i = 0; i < owners; i++) {
    await sourceSdk.trigger("mem::observe", {
      sessionId: SESSION, project: "image-import", cwd: "/work/image-import",
      hookType: "post_tool_use", timestamp: new Date().toISOString(),
      data: { tool_name: "Screenshot", tool_input: { index: i }, image_data: `data:image/png;base64,${PNG}` },
    });
  }
  const data = await sourceSdk.trigger("mem::export", {}) as ExportData;
  const path = data.observations[SESSION][0].imageData!;
  expect(path.startsWith(images.IMAGES_DIR + sep)).toBe(true);
  expect(await getImageRefCount(sourceKv as never, path)).toBe(owners);
  age(path);
  const kv = mockKV();
  const sdk = mockSdk({ looseTrigger: true });
  registerExportImportFunction(sdk as never, kv as never);
  registerImageQuotaCleanup(sdk as never, kv as never);
  return {
    kv, path, data,
    import: (input = data, strategy: "merge" | "replace" | "skip" = "merge") =>
      sdk.trigger("mem::import", { exportData: structuredClone(input), strategy }),
    cleanup: () => sdk.trigger("mem::image-quota-cleanup", {}),
    count: (image = path) => getImageRefCount(kv as never, image),
    rows: () => kv.list<CompressedObservation>(KV.observations(SESSION)),
    replacement: async () => (await images.saveImageToDisk(`data:image/png;base64,${PNG}\n`)).filePath,
  };
}

it.each(["merge", "replace"] as const)("protects restored images from cleanup after %s import", async (strategy) => {
  const f = await fixture();
  expect(await f.import(f.data, strategy)).toMatchObject({ success: true, observations: 1 });
  expect(await f.count()).toBe(1);
  age(f.path);
  expect(await f.cleanup()).toMatchObject({ evicted: 0 });
  expect(existsSync(f.path)).toBe(true);
  expect((await f.rows())[0].imageData).toBe(f.path);
});

it("counts shared images per owner and does not count duplicate image fields twice", async () => {
  const f = await fixture(2);
  for (const row of f.data.observations[SESSION]) row.imageRef = row.imageData;
  await f.import();
  expect(await f.count()).toBe(2);
});

it("does not double-count repeated merge or skipped records", async () => {
  const f = await fixture();
  await f.import();
  await f.import();
  const skipped = await f.import(f.data, "skip");
  expect(skipped).toMatchObject({ observations: 0 });
  expect(await f.count()).toBe(1);
});

it("preserves files reused by a replace import", async () => {
  const f = await fixture(2);
  await f.import();
  await f.import(f.data, "replace");
  expect(await f.count()).toBe(2);
  expect(existsSync(f.path)).toBe(true);
});

it("accounts for imported memories sharing an observation's image", async () => {
  const f = await fixture();
  const memory: Memory = {
    id: "mem_import_image", type: "fact", title: "Screenshot", content: "Screenshot",
    concepts: [], files: [], sessionIds: [SESSION], strength: 5, version: 1, isLatest: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), imageRef: f.path,
  };
  f.data.memories = [memory];
  await f.import();
  await f.import(f.data, "replace");
  await f.import(f.data, "skip");
  expect(await f.count()).toBe(2);
  expect(existsSync(f.path)).toBe(true);
});

it("releases the previous image only after its owner is replaced", async () => {
  const f = await fixture();
  await f.import();
  const next = await f.replacement();
  const changed = structuredClone(f.data);
  changed.observations[SESSION][0].imageData = next;
  await f.import(changed);
  expect(await f.count()).toBe(0);
  expect(existsSync(f.path)).toBe(false);
  expect(await f.count(next)).toBe(1);
  expect(existsSync(next)).toBe(true);
});

it("releases images belonging only to records removed by replace", async () => {
  const f = await fixture();
  await f.import();
  const empty = { ...f.data, sessions: [], observations: {}, memories: [], summaries: [] };
  await f.import(empty, "replace");
  expect(await f.count()).toBe(0);
  expect(existsSync(f.path)).toBe(false);
});

it.each([false, true])("preserves retained files and counts on a failed write (existing: %s)", async (existing) => {
  const f = await fixture();
  if (existing) await f.import();
  const next = existing ? await f.replacement() : f.path;
  const changed = structuredClone(f.data);
  changed.observations[SESSION][0].imageData = next;
  const set = f.kv.set;
  f.kv.set = async (scope, key, row) => {
    if (scope === KV.observations(SESSION)) throw new Error("observation write failed");
    return set(scope, key, row);
  };
  await expect(f.import(changed)).rejects.toThrow("observation write failed");
  expect(await f.count(next)).toBe(0);
  expect(existsSync(next)).toBe(true);
  expect(await f.count()).toBe(existing ? 1 : 0);
  expect(existsSync(f.path)).toBe(true);
  expect(await f.rows()).toHaveLength(existing ? 1 : 0);
});

it("keeps image ownership when replace cannot delete an old row", async () => {
  const f = await fixture();
  await f.import();
  const remove = f.kv.delete;
  f.kv.delete = async (scope, key) => {
    if (scope === KV.observations(SESSION)) throw new Error("observation delete failed");
    return remove(scope, key);
  };
  await expect(f.import(f.data, "replace")).rejects.toThrow("observation delete failed");
  expect(await f.count()).toBe(1);
  expect(existsSync(f.path)).toBe(true);
  expect(await f.rows()).toHaveLength(1);
});

it("does not overwrite an owner whose previous image references could not be read", async () => {
  const f = await fixture();
  await f.import();
  const get = f.kv.get;
  f.kv.get = async (scope, key) => {
    if (scope === KV.observations(SESSION)) throw new Error("observation read failed");
    return get(scope, key);
  };
  await expect(f.import()).rejects.toThrow("observation read failed");
  expect(await f.count()).toBe(1);
  expect(existsSync(f.path)).toBe(true);
});

it("protects images from cleanup while their imported owner is being written", async () => {
  const f = await fixture();
  const set = f.kv.set;
  f.kv.set = async (scope, key, row) => {
    if (scope === KV.observations(SESSION)) {
      age(f.path);
      expect(await f.cleanup()).toMatchObject({ evicted: 0 });
      expect(existsSync(f.path)).toBe(true);
    }
    return set(scope, key, row);
  };
  await f.import();
  expect(await f.count()).toBe(1);
});

it("serializes duplicate owner IDs within the same import batch", async () => {
  const f = await fixture();
  const next = await f.replacement();
  const duplicate = { ...f.data.observations[SESSION][0], imageData: next };
  f.data.observations[SESSION].push(duplicate);
  await f.import();
  expect(await f.rows()).toHaveLength(1);
  expect((await f.rows())[0].imageData).toBe(next);
  expect(await f.count()).toBe(0);
  expect(await f.count(next)).toBe(1);
});
