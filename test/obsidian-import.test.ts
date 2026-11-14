import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
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
  await exportVault();
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

describe("Obsidian vault edits", () => {
  let temp: string, root: string, w: Awaited<ReturnType<typeof world>>;
  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), "obsidian-import-test-")); root = join(temp, "allowed");
    await mkdir(root); vi.stubEnv("AGENTMEMORY_EXPORT_ROOT", root);
    vi.clearAllMocks(); w = await world(root);
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(temp, { recursive: true, force: true }); });

  it("keeps the actual legacy export bytes frozen", async () => {
    expect(createHash("sha256").update(await readFile(w.note)).digest("hex")).toBe("aa58bb5694adf17eb677ed5d815258413f5106dc9c53a4a200564ecdc845a2af");
  });

  it("imports the corrected body through evolve and retains its prior version and metadata", async () => {
    await w.edit(); const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 1 });
    const [current] = await w.latest();
    expect(current.content).toBe(CORRECTED); expect(current.id).not.toBe(BASE.id);
    expect(current.parentId).toBe(BASE.id); expect(current.version).toBe(2);
    expect(current).toMatchObject({ project: BASE.project, agentId: BASE.agentId, concepts: BASE.concepts, files: BASE.files, strength: BASE.strength });
    expect(await w.kv.get("mem:memories", BASE.id)).toMatchObject({ content: ORIGINAL, isLatest: false });
    expect(index.add).toHaveBeenCalled();
  });

  it("preserves title-only and type-only corrections", async () => {
    await w.edit("# Synthetic release window", "# Corrected title");
    await w.edit('type: "pattern"', 'type: "fact"');
    expect((await w.importVault()).applied.updated).toBe(1);
    expect((await w.latest())[0]).toMatchObject({ title: "Corrected title", type: "fact", content: ORIGINAL });
  });

  it("plans an update without changing KV, audit, indexes or any vault bytes", async () => {
    await w.edit(); const before = w.snapshot(), bytes = await readFile(w.note);
    const result = await w.importVault({ dryRun: true });
    expect(result.planned.updates).toBe(1); expect(result.applied).toEqual({ created: 0, updated: 0 });
    expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(bytes); expect(index.add).not.toHaveBeenCalled();
  });

  it("creates a new note with its title and repeats without another memory or journal write", async () => {
    await writeFile(join(w.vault, "memories", "new-note.md"), "---\ntype: pattern\n---\n\n# New synthetic fact\n\nA wholly independent synthetic body.");
    expect((await w.importVault()).applied.created).toBe(1);
    expect((await w.latest()).find(m => m.id !== BASE.id)).toMatchObject({ title: "New synthetic fact", content: "A wholly independent synthetic body.", type: "pattern" });
    const before = w.snapshot(); expect((await w.importVault()).applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
  });

  it("dry-runs a new note without creating import provenance or a memory", async () => {
    await writeFile(join(w.vault, "memories", "new.md"), "# A new note\n\nAn unrelated new fact.");
    const before = w.snapshot(); const result = await w.importVault({ dryRun: true });
    expect(result.planned.creates).toBe(1); expect(result.applied.created).toBe(0); expect(w.snapshot()).toBe(before);
  });

  it("leaves an unchanged export completely unchanged", async () => {
    const before = w.snapshot(); expect((await w.importVault()).applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
  });

  it("does not evolve the same unchanged edited note twice", async () => {
    await w.edit(); await w.importVault(); const before = w.snapshot(); const bytes = await readFile(w.note);
    expect((await w.importVault()).applied.updated).toBe(0); expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(bytes);
  });

  it("keeps stale and new ID-named files after re-export without importing extra versions", async () => {
    await w.edit(); await w.importVault(); await w.exportVault();
    expect((await readdir(join(w.vault, "memories"))).length).toBe(2);
    const before = w.snapshot(); const result = await w.importVault();
    expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect((await w.latest())[0].content).toBe(CORRECTED);
  });

  it("reports both-side changes and defaults to vault content through the actual latest head", async () => {
    await w.evolve(ORIGINAL.replace("Tuesday", "Friday")); await w.edit();
    const result = await w.importVault(); expect(result.conflicts.length).toBe(1); expect(result.applied.updated).toBe(1);
    expect((await w.latest())[0]).toMatchObject({ content: CORRECTED, version: 3 }); expect((await w.memories()).length).toBe(3);
  });

  it("honors store preference on conflict without changing a record", async () => {
    const friday = ORIGINAL.replace("Tuesday", "Friday"); await w.evolve(friday); await w.edit(); const before = w.snapshot();
    const result = await w.importVault({ prefer: "store" }); expect(result.conflicts.length).toBe(1);
    expect(result.applied.updated).toBe(0); expect(w.snapshot()).toBe(before); expect((await w.latest())[0].content).toBe(friday);
  });

  it("does not overwrite a store-only correction with an untouched old vault note", async () => {
    const friday = ORIGINAL.replace("Tuesday", "Friday"); await w.evolve(friday); const before = w.snapshot();
    expect((await w.importVault()).applied.updated).toBe(0); expect(w.snapshot()).toBe(before); expect((await w.latest())[0].content).toBe(friday);
  });

  it("rejects unknown and duplicate IDs without arbitrary publication", async () => {
    await w.edit('id: "mem_fixture_1743"', 'id: "mem_never_existed"'); let before = w.snapshot();
    expect((await w.importVault()).errors.length).toBeGreaterThan(0); expect(w.snapshot()).toBe(before);
    await writeFile(w.note, (await readFile(w.note, "utf8")).replace("mem_never_existed", BASE.id));
    await w.edit(); await writeFile(join(w.vault, "memories", "duplicate.md"), await readFile(w.note)); before = w.snapshot();
    expect((await w.importVault()).errors.length).toBeGreaterThan(0); expect(w.snapshot()).toBe(before);
  });

  it("rejects malformed YAML and invalid frontmatter types while retaining memory", async () => {
    const before = w.snapshot();
    await writeFile(w.note, "---\nid: [broken\n---\n# Fact\nbody"); expect((await w.importVault()).errors.length).toBeGreaterThan(0);
    await writeFile(w.note, "---\nid: 42\nversion: wrong\n---\n# Fact\nbody"); expect((await w.importVault()).errors.length).toBeGreaterThan(0);
    expect(w.snapshot()).toBe(before);
  });

  it("reports unsupported metadata edits instead of silently dropping them", async () => {
    await w.edit("strength: 5", "strength: 9"); const before = w.snapshot();
    expect((await w.importVault()).errors.length).toBeGreaterThan(0); expect(w.snapshot()).toBe(before);
  });

  it("does not guess a boundary when the old generated tail was edited", async () => {
    await w.edit("- [[mem_related_fixture]]", "- [[a-different-generated-link]]"); const before = w.snapshot();
    expect((await w.importVault()).errors.length).toBeGreaterThan(0); expect(w.snapshot()).toBe(before);
  });

  it("scrubs loaded note text before actual memory/index-facing publication", async () => {
    const raw = "api_key=" + "A".repeat(32); await w.edit(ORIGINAL, CORRECTED + "\n" + raw + "\n<private>do not retain this sentence</private>");
    expect((await w.importVault()).applied.updated).toBe(1);
    const current = (await w.latest())[0]; expect(current.content).toContain("[REDACTED"); expect(current.content).not.toContain("A".repeat(32));
    expect(w.snapshot()).not.toContain("A".repeat(32)); expect(JSON.stringify(index.add.mock.calls)).not.toContain("A".repeat(32));
    expect(current.content).not.toContain("do not retain this sentence");
  });

  it("never deletes memory for a missing note or imports support files", async () => {
    await unlink(w.note); await writeFile(join(w.vault, "MOC.md"), "# Index\nNot a memory");
    await writeFile(join(w.vault, "lessons", "lesson.md"), "# Lesson\nNot a memory"); const before = w.snapshot();
    expect((await w.importVault()).applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect(w.calls).not.toContain("mem::forget");
  });

  it("refuses a vault outside export root even when the separate import root permits it", async () => {
    const outside = join(temp, "outside"); await mkdir(outside); vi.stubEnv("AGENTMEMORY_IMPORT_ROOT", temp); const before = w.snapshot();
    expect((await w.importVault({ vaultDir: outside })).success).toBe(false); expect(w.snapshot()).toBe(before);
  });

  it.skipIf(process.platform === "win32")("rejects outside note links and directory loops without writing their content", async () => {
    const outside = join(temp, "external.md"); await writeFile(outside, "Never import this outside marker");
    await symlink(outside, join(w.vault, "memories", "escape.md")); await symlink(w.vault, join(w.vault, "memories", "loop"));
    const before = w.snapshot(); expect((await w.importVault()).errors.length).toBeGreaterThan(0); expect(w.snapshot()).toBe(before);
    expect(w.snapshot()).not.toContain("Never import this outside marker");
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("retains originals on an actual unreadable note", async () => {
    await chmod(w.note, 0); const before = w.snapshot();
    expect((await w.importVault()).errors.length).toBeGreaterThan(0); expect(w.snapshot()).toBe(before);
    await chmod(w.note, 0o600);
  });

  it("checks concurrent-head preconditions in actual evolve rather than only the import plan", async () => {
    await w.edit(); const friday = ORIGINAL.replace("Tuesday", "Friday");
    w.beforeEvolve(async () => { await w.kv.set("mem:memories", BASE.id, { ...BASE, content: friday, updatedAt: "2099-01-01T00:00:00.000Z" }); });
    const result = await w.importVault(); expect(result.applied.updated).toBe(0);
    expect(result.errors.length + result.conflicts.length).toBeGreaterThan(0); expect((await w.latest())[0].content).toBe(friday);
  });

  it("uses real stored context when identical Markdown has different body/tail meaning", async () => {
    const common = { ...BASE, title: "Same title", concepts: [], files: [], supersedes: [] };
    const a = await world(root, { ...common, content: "body", relatedIds: ["mem_ref"] }, "a");
    const b = await world(root, { ...common, content: "body\n\n## Related\n- [[mem_ref]]", relatedIds: [] }, "b");
    const aText = await readFile(a.note, "utf8"), bText = await readFile(b.note, "utf8"); expect(aText).toBe(bText);
    await a.edit("\n\nbody", "\n\ncorrected body"); await b.edit("\n\nbody", "\n\ncorrected body");
    expect((await a.importVault()).applied.updated).toBe(1); expect((await b.importVault()).applied.updated).toBe(1);
    expect((await a.latest())[0].content).toBe("corrected body");
    expect((await b.latest())[0].content).toBe("corrected body\n\n## Related\n- [[mem_ref]]");
  });

  it.each([{ dryRun: "true" }, { prefer: "newest" }, { vaultDir: 42 }])("rejects invalid input %j without effects", async (input) => {
    const before = w.snapshot(); const result = await w.importVault(input);
    expect(result.success).toBe(false); expect(w.snapshot()).toBe(before);
  });
});
