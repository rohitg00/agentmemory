import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Memory } from "../src/types.js";

const index = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), size: 0, search: () => [] }));
vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => index, getVectorIndex: () => null, isMemoryIndexReady: () => false,
  scheduleIndexSave: vi.fn(), flushIndexSave: async () => {},
  vectorIndexAddGuarded: async () => {}, vectorIndexRemove: vi.fn(),
}));
vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { registerObsidianImportFunction, type ObsidianImportResult } from "../src/functions/obsidian-import.js";
import { registerObsidianExportFunction } from "../src/functions/obsidian-export.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerRelationsFunction } from "../src/functions/relations.js";
import { withWriteScrubbing } from "../src/functions/privacy.js";

const ORIGINAL = "Synthetic release window is Tuesday.\n\n## Concepts\nThis user-written heading must stay.\n\n## Related\nThis paragraph is original memory content.";
const CORRECTED = ORIGINAL.replace("Tuesday", "Thursday");
const BASE: Memory = {
  id: "mem_fixture_1743", type: "pattern", title: "Synthetic release window", content: ORIGINAL,
  createdAt: "2026-11-14T00:00:00.000Z", updatedAt: "2026-11-14T00:00:00.000Z", version: 1, isLatest: true,
  strength: 5, concepts: ["fixture", "release window"], files: ["synthetic-release.ts"], sessionIds: [],
  project: "fixture-project-1743", agentId: "fixture-agent-1743", relatedIds: ["mem_related_fixture"], supersedes: ["mem_older_fixture"],
};

async function world(root: string, memory: Memory = BASE, name = "vault") {
  const store = new Map<string, Map<string, unknown>>();
  const functions = new Map<string, (data: never) => unknown>();
  const calls: string[] = [];
  let beforeEvolve: (() => Promise<void>) | undefined;
  const kv = {
    get: async <T>(scope: string, key: string): Promise<T | null> => structuredClone(store.get(scope)?.get(key) ?? null) as T | null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(value)); return value;
    },
    delete: async (scope: string, key: string) => { store.get(scope)?.delete(key); },
    list: async <T>(scope: string): Promise<T[]> => structuredClone([...(store.get(scope)?.values() ?? [])]) as T[],
  };
  const sdk = {
    registerFunction: (id: string | { id: string }, handler: (data: never) => unknown) => functions.set(typeof id === "string" ? id : id.id, handler),
    registerTrigger: () => {},
    trigger: async (input: string | { function_id: string; payload: unknown }, data?: unknown): Promise<unknown> => {
      const id = typeof input === "string" ? input : input.function_id;
      const payload = typeof input === "string" ? data : input.payload;
      calls.push(id);
      if (id === "mem::evolve" && beforeEvolve) { const hook = beforeEvolve; beforeEvolve = undefined; await hook(); }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No registered function: ${id}`);
      return fn(payload as never);
    },
  };
  const scrubbed = withWriteScrubbing(sdk);
  registerRememberFunction(scrubbed as never, kv as never);
  registerRelationsFunction(scrubbed as never, kv as never);
  registerObsidianExportFunction(scrubbed as never, kv as never);
  registerObsidianImportFunction(scrubbed as never, kv as never);
  sdk.registerFunction("mem::cascade-update", async () => ({ success: true }));
  await kv.set("mem:memories", memory.id, memory);
  const vault = join(root, name);
  const exportVault = async () => sdk.trigger("mem::obsidian-export", { vaultDir: vault, types: ["memories"] });
  await mkdir(join(vault, "memories"), { recursive: true });
  await writeFile(join(vault, "memories", memory.id + ".md"), await readFile(new URL("./fixtures/obsidian-memory-cf9.md", import.meta.url)));
  const note = join(vault, "memories", memory.id + ".md");
  const importVault = async (extra: Record<string, unknown> = {}) => sdk.trigger("mem::obsidian-import", { vaultDir: vault, ...extra }) as Promise<ObsidianImportResult>;
  const memories = () => kv.list<Memory>("mem:memories");
  const latest = async () => (await memories()).filter(m => m.isLatest);
  const snapshot = () => JSON.stringify([...store].map(([scope, rows]) => [scope, [...rows]]));
  return { kv, sdk, store, calls, vault, note, importVault, exportVault, memories, latest, snapshot,
    beforeEvolve: (fn: () => Promise<void>) => { beforeEvolve = fn; },
    edit: async (from = ORIGINAL, to = CORRECTED) => writeFile(note, (await readFile(note, "utf8")).replace(from, to)),
    evolve: async (content: string) => sdk.trigger("mem::evolve", { memoryId: memory.id, newContent: content }),
  };
}

describe("preserved cf9 notes without export context", () => {
  let temp: string;
  beforeEach(async () => { temp = await mkdtemp(join(tmpdir(), "obsidian-legacy-cf9-")); vi.stubEnv("AGENTMEMORY_EXPORT_ROOT", temp); vi.clearAllMocks(); });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(temp, { recursive: true, force: true }); });
  it("imports Thursday after actual evolve to Friday without re-exporting the cf9 note", async () => {
    const w = await world(temp);
    expect(await w.kv.list("mem:obsidian:notes")).toEqual([]);
    expect(createHash("sha256").update(await readFile(w.note)).digest("hex")).toBe("aa58bb5694adf17eb677ed5d815258413f5106dc9c53a4a200564ecdc845a2af");
    await w.evolve(ORIGINAL.replace("Tuesday", "Friday")); await w.edit();
    const result = await w.importVault();
    expect(w.calls).not.toContain("mem::obsidian-export");
    expect(result.success).toBe(true); expect(result.applied.updated).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect((await w.latest())[0]).toMatchObject({ content: CORRECTED, version: 3 });
  });
  it("imports an existing legacy memory whose isLatest flag is absent", async () => {
    const legacy = structuredClone(BASE); delete (legacy as Partial<Memory>).isLatest;
    const w = await world(temp, legacy); await w.edit();
    expect(await w.kv.list("mem:obsidian:notes")).toEqual([]);
    const result = await w.importVault();
    expect(w.calls).not.toContain("mem::obsidian-export");
    expect(result.success).toBe(true); expect(result.applied.updated).toBe(1);
    expect((await w.latest())[0]).toMatchObject({ content: CORRECTED, version: 2 });
  });
  it("reports unverifiable mutable fields and preserves current store values", async () => {
    const w = await world(temp);
    await w.kv.set("mem:memories", BASE.id, { ...BASE, strength: 3, updatedAt: "2026-11-14T05:00:00.000Z" });
    await w.edit("strength: 5", "strength: 9"); await w.edit();
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied.updated).toBe(1);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "legacy_export_context", mutableFields: ["updated", "strength"] })]);
    expect((await w.latest())[0]).toMatchObject({ content: CORRECTED, strength: 3 });
  });
  it("does not import unsupported immutable legacy metadata changes", async () => {
    const w = await world(temp); await w.edit("version: 1", "version: 99"); await w.edit();
    const before = w.snapshot(); const result = await w.importVault();
    expect(result.success).toBe(false); expect(result.applied.updated).toBe(0); expect(w.snapshot()).toBe(before);
  });
  it("keeps a preferred store correction with no export context or journal writes", async () => {
    const w = await world(temp); await w.evolve(ORIGINAL.replace("Tuesday", "Friday")); await w.edit();
    const before = w.snapshot(); const result = await w.importVault({ prefer: "store" });
    expect(result.success).toBe(true); expect(result.conflicts).toHaveLength(1);
    expect(result.applied.updated).toBe(0); expect(w.snapshot()).toBe(before);
    expect((await w.latest())[0].content).toContain("Friday");
  });
  it("repeats a successful legacy import without changing KV or note bytes", async () => {
    const w = await world(temp); await w.edit(); await w.importVault();
    const before = w.snapshot(), bytes = await readFile(w.note);
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied.updated).toBe(0);
    expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(bytes);
  });
  it("retains a genuine legacy import-only baseline when its note moves after a store edit", async () => {
    const w = await world(temp), moved = join(w.vault, "memories", "moved-legacy.md");
    expect(await w.kv.list("mem:obsidian:notes")).toEqual([]);
    expect(createHash("sha256").update(await readFile(w.note)).digest("hex")).toBe("aa58bb5694adf17eb677ed5d815258413f5106dc9c53a4a200564ecdc845a2af");
    await w.edit(); expect((await w.importVault()).applied.updated).toBe(1);
    const contexts = await w.kv.list<{ exported?: unknown; imported?: { rawId?: string } }>("mem:obsidian:notes");
    expect(contexts).toHaveLength(1); expect(contexts[0].exported).toBeUndefined(); expect(contexts[0].imported?.rawId).toBe(BASE.id);
    const saved = (await w.latest())[0], friday = ORIGINAL.replace("Tuesday", "Friday");
    expect((await w.sdk.trigger("mem::evolve", { memoryId: saved.id, newContent: friday }) as { success: boolean }).success).toBe(true);
    await rename(w.note, moved);
    const before = w.snapshot(), bytes = await readFile(moved), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect((await w.latest())[0].content).toBe(friday); expect(await readFile(moved)).toEqual(bytes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    expect(w.calls).not.toContain("mem::obsidian-export");
  });
});
