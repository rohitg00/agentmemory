import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Memory, ObsidianVaultNote } from "../src/types.js";

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
import { registerApiTriggers } from "../src/triggers/api.js";
import { withWriteScrubbing } from "../src/functions/privacy.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { KV } from "../src/state/schema.js";

const execute = promisify(execFile);
const SECRET = "synthetic-obsidian-import-auth";
const BASE: Memory = {
  id: "mem_import_boundaries", type: "fact", title: "Synthetic shipping day", content: "Synthetic shipment leaves Tuesday.",
  createdAt: "2026-11-14T00:00:00.000Z", updatedAt: "2026-11-14T00:00:00.000Z", version: 1,
  isLatest: true, strength: 5, concepts: [], files: [], sessionIds: [],
};

async function setup(root: string) {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data: never) => unknown>();
  const routes: Array<{ type: string; function_id: string; config: { api_path: string; http_method: string } }> = [];
  const calls: Array<{ id: string; payload: unknown }> = [];
  let onEvolve: (() => void) | undefined;
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
    registerFunction: (id: string | { id: string }, fn: (data: never) => unknown) => handlers.set(typeof id === "string" ? id : id.id, fn),
    registerTrigger: (route: typeof routes[number]) => { routes.push(route); },
    on: () => {},
    trigger: async (input: string | { function_id: string; payload: unknown }, data?: unknown): Promise<unknown> => {
      const id = typeof input === "string" ? input : input.function_id;
      const payload = typeof input === "string" ? data : input.payload;
      calls.push({ id, payload });
      if (id === "mem::evolve") onEvolve?.();
      const fn = handlers.get(id);
      if (!fn) throw new Error(`Function not registered: ${id}`);
      return fn(payload as never);
    },
  };
  const scrubbed = withWriteScrubbing(sdk);
  registerRememberFunction(scrubbed as never, kv as never);
  registerRelationsFunction(scrubbed as never, kv as never);
  registerObsidianExportFunction(scrubbed as never, kv as never);
  registerObsidianImportFunction(scrubbed as never, kv as never);
  registerApiTriggers(scrubbed as never, kv as never, SECRET);
  sdk.registerFunction("mem::cascade-update", async () => ({ success: true }));
  await kv.set(KV.memories, BASE.id, BASE);
  const vault = join(root, "vault");
  const exportVault = () => sdk.trigger("mem::obsidian-export", { vaultDir: vault, types: ["memories"] });
  await exportVault();
  const note = join(vault, "memories", BASE.id + ".md");
  const edit = async (from = "Tuesday", to = "Thursday", path = note) => writeFile(path, (await readFile(path, "utf8")).replace(from, to));
  const importVault = (extra: Record<string, unknown> = {}) => sdk.trigger("mem::obsidian-import", { vaultDir: vault, ...extra }) as Promise<ObsidianImportResult>;
  const snapshot = () => JSON.stringify([...store].map(([scope, rows]) => [scope, [...rows]]));
  const latest = async () => (await kv.list<Memory>(KV.memories)).filter(m => m.isLatest);
  return { sdk, kv, vault, note, edit, importVault, exportVault, snapshot, latest, calls, routes,
    onEvolve: (fn: () => void) => { onEvolve = fn; },
  };
}

describe("Obsidian import production boundaries", () => {
  let temp: string, w: Awaited<ReturnType<typeof setup>>, server: Server | undefined, base: string;
  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), "obsidian-import-boundary-"));
    vi.stubEnv("AGENTMEMORY_EXPORT_ROOT", temp);
    vi.clearAllMocks(); w = await setup(temp);
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
    vi.unstubAllEnvs(); await rm(temp, { recursive: true, force: true });
  });

  async function listen() {
    server = createServer(async (request, response) => {
      try {
        let body = "";
        for await (const part of request) body += String(part);
        const route = w.routes.find(r => r.type === "http" && r.config.http_method === request.method && r.config.api_path === request.url);
        if (!route) { response.writeHead(404).end(); return; }
        const result = await w.sdk.trigger(route.function_id, {
          method: request.method, headers: request.headers, body: body ? JSON.parse(body) : undefined, query_params: {},
        }) as { status_code: number; body: unknown };
        response.writeHead(result.status_code, { "Content-Type": "application/json" }).end(JSON.stringify(result.body));
      } catch { response.writeHead(500).end(JSON.stringify({ error: "fixture route failed" })); }
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test HTTP address");
    base = `http://127.0.0.1:${address.port}`;
  }

  async function post(body: unknown, secret: string | undefined = SECRET) {
    return fetch(`${base}/agentmemory/obsidian/import`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body),
    });
  }

  it.each([null, {}, [], { vaultDir: "" }, { vaultDir: " " }])("rejects direct empty input %j without mutations", async input => {
    const before = w.snapshot();
    expect((await w.sdk.trigger("mem::obsidian-import", input) as ObsidianImportResult).success).toBe(false);
    expect(w.snapshot()).toBe(before);
  });

  it("does not import the MOC or lessons, crystals and sessions", async () => {
    for (const folder of ["lessons", "crystals", "sessions"]) {
      await writeFile(join(w.vault, folder, "support.md"), "# Not a memory\n\nSynthetic support material.");
    }
    const before = w.snapshot();
    expect((await w.importVault()).applied).toEqual({ created: 0, updated: 0 });
    expect(w.snapshot()).toBe(before);
  });

  it("keeps both changed files in a lineage and refuses to choose their ordering", async () => {
    const evolved = await w.sdk.trigger("mem::evolve", { memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Friday") }) as { memory: Memory };
    await w.exportVault(); await w.edit();
    await w.edit("Friday", "Saturday", join(w.vault, "memories", evolved.memory.id + ".md"));
    const before = w.snapshot(), oldBytes = await readFile(w.note);
    const result = await w.importVault();
    expect(result.errors.some(e => e.error.includes("same memory lineage"))).toBe(true);
    expect(result.applied).toEqual({ created: 0, updated: 0 });
    expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(oldBytes);
  });

  it("preserves current store metadata while accepting a body edit based on original export context", async () => {
    await w.kv.set(KV.memories, BASE.id, { ...BASE, strength: 3, updatedAt: "2026-11-14T05:00:00.000Z" });
    await w.edit(); const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied.updated).toBe(1);
    expect((await w.latest())[0]).toMatchObject({ content: BASE.content.replace("Tuesday", "Thursday"), strength: 3 });
  });

  it("does not guess a head through supersedes links without a parent lineage", async () => {
    await w.kv.set(KV.memories, BASE.id, { ...BASE, isLatest: false });
    await w.kv.set(KV.memories, "mem_unproven", { ...BASE, id: "mem_unproven", supersedes: [BASE.id] });
    await w.edit(); const before = w.snapshot();
    expect((await w.importVault()).success).toBe(false); expect(w.snapshot()).toBe(before);
  });

  it("rechecks the expected state after actual evolve waits for the writer lock", async () => {
    await w.edit();
    let held!: () => void, release!: () => void, reached!: () => void;
    const acquired = new Promise<void>(resolve => { held = resolve; });
    const unblock = new Promise<void>(resolve => { release = resolve; });
    const planned = new Promise<void>(resolve => { reached = resolve; });
    w.onEvolve(reached);
    let afterStoreWrite = "";
    const writer = withKeyedLock("mem:remember", async () => {
      held(); await unblock;
      await w.kv.set(KV.memories, BASE.id, { ...BASE, content: BASE.content.replace("Tuesday", "Friday"), updatedAt: "2099-01-01T00:00:00.000Z" });
      afterStoreWrite = w.snapshot();
    });
    await acquired;
    const pending = w.importVault();
    try { await planned; } finally { release(); }
    await writer;
    const result = await pending;
    expect(result.applied.updated).toBe(0); expect(result.errors.length).toBeGreaterThan(0);
    expect(w.snapshot()).toBe(afterStoreWrite);
    expect((await w.latest())[0].content).toContain("Friday");
  });

  it("scrubs new body/title text and stores hashes instead of raw vault text or paths", async () => {
    const token = "api_key=" + "Z".repeat(32);
    await writeFile(join(w.vault, "memories", "new-secret.md"), `# ${token}\n\nAn independent note ${token}\n<private>private synthetic marker</private>`);
    expect((await w.importVault()).applied.created).toBe(1);
    const created = (await w.latest()).find(m => m.id !== BASE.id)!;
    expect(created.title).toContain("REDACTED"); expect(created.content).toContain("REDACTED");
    expect(w.snapshot()).not.toContain("Z".repeat(32)); expect(w.snapshot()).not.toContain("private synthetic marker");
    const provenance = await w.kv.list<ObsidianVaultNote>(KV.obsidianNotes);
    expect(JSON.stringify(provenance)).not.toContain(temp); expect(JSON.stringify(provenance)).not.toContain(created.content);
  });

  it("preserves an untouched multiline title and refuses an ambiguous title edit", async () => {
    await w.kv.set(KV.memories, BASE.id, { ...BASE, title: "Synthetic\n\nshipping day" });
    await w.exportVault(); await w.edit();
    expect((await w.importVault()).applied.updated).toBe(1);
    expect((await w.latest())[0].title).toBe("Synthetic\n\nshipping day");
    await w.edit("# Synthetic", "# Edited"); const before = w.snapshot();
    const result = await w.importVault();
    expect(result.errors.some(e => e.error.includes("multiline"))).toBe(true);
    expect(result.applied.updated).toBe(0); expect(w.snapshot()).toBe(before);
  });

  it("reports a confirmed memory ID when post-write note provenance fails, without retrying", async () => {
    await writeFile(join(w.vault, "memories", "new.md"), "# New bounded fact\n\nIndependent boundary provenance failure fixture.");
    const set = w.kv.set;
    const spy = vi.spyOn(w.kv, "set").mockImplementation(async (scope, key, value) => {
      if (scope === KV.obsidianNotes) throw new Error("synthetic provenance failure");
      return set(scope, key, value);
    });
    try {
      const result = await w.importVault();
      expect(result.success).toBe(false); expect(result.applied.created).toBe(1);
      const created = (await w.latest()).find(m => m.id !== BASE.id)!;
      expect(result.errors).toEqual([expect.objectContaining({ memoryId: created.id, error: expect.stringContaining("was saved") })]);
      expect(result.files.find(f => f.file.endsWith("new.md"))?.appliedMemoryId).toBe(created.id);
      expect(w.calls.filter(c => c.id === "mem::remember")).toHaveLength(1);
    } finally { spy.mockRestore(); }
  });

  it("reports an uncertain write response separately from confirmed applied counts and never retries it", async () => {
    await writeFile(join(w.vault, "memories", "new.md"), "# New lost-response fact\n\nIndependent boundary lost-response fixture.");
    const trigger = w.sdk.trigger;
    const spy = vi.spyOn(w.sdk, "trigger").mockImplementation(async (input, data) => {
      const value = await trigger(input, data);
      if ((typeof input === "string" ? input : input.function_id) === "mem::remember") throw new Error("synthetic lost response after confirmed test write");
      return value;
    });
    try {
      const result = await w.importVault();
      expect(result.success).toBe(false); expect(result.applied.created).toBe(0);
      expect(result.errors).toEqual([expect.objectContaining({ writeOutcomeUncertain: true })]);
      expect(await w.latest()).toHaveLength(2);
      expect(w.calls.filter(c => c.id === "mem::remember")).toHaveLength(1);
    } finally { spy.mockRestore(); }
  });

  it("runs actual REST auth and validates payloads before import dispatch", async () => {
    await listen(); await w.edit(); const before = w.snapshot();
    expect((await post({ vaultDir: w.vault }, "")).status).toBe(401);
    expect((await post({ vaultDir: w.vault }, "wrong-synthetic-secret")).status).toBe(401);
    for (const body of [null, [], {}, { vaultDir: w.vault, dryRun: "true" }, { vaultDir: w.vault, prefer: "newest" }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(w.calls.filter(c => c.id === "mem::obsidian-import")).toHaveLength(0);
    expect(w.snapshot()).toBe(before);
    const response = await post({ vaultDir: w.vault, dryRun: true, prefer: "store", agentId: "do-not-forward", unsafe: true });
    const result = await response.json() as ObsidianImportResult;
    expect(response.status).toBe(200); expect(result.planned.updates).toBe(1);
    expect(w.calls.filter(c => c.id === "mem::obsidian-import").at(-1)!.payload).toEqual({ vaultDir: w.vault, dryRun: true, prefer: "store" });
    expect(w.snapshot()).toBe(before);
  });

  it("uses the built CLI over authenticated HTTP for dry-run, actual update and repeat", async () => {
    await listen(); await w.edit();
    const cliHome = join(temp, "cli-home"); await mkdir(cliHome);
    const env = { PATH: process.env.PATH, HOME: cliHome, USERPROFILE: cliHome,
      AGENTMEMORY_URL: base, AGENTMEMORY_SECRET: SECRET, NO_COLOR: "1" };
    const run = async (...args: string[]) => {
      const { stdout } = await execute(process.execPath, [join(process.cwd(), "dist/cli.mjs"), "obsidian-import", "--vault-dir", w.vault, ...args], { env, timeout: 20_000 });
      return JSON.parse(stdout) as ObsidianImportResult;
    };
    const before = w.snapshot(); const planned = await run("--dry-run");
    expect(planned.planned.updates).toBe(1); expect(planned.applied.updated).toBe(0); expect(w.snapshot()).toBe(before);
    expect((await run()).applied.updated).toBe(1);
    expect((await w.latest())[0].content).toContain("Thursday");
    const after = w.snapshot(); expect((await run()).applied.updated).toBe(0); expect(w.snapshot()).toBe(after);
    expect(await readFile(w.note, "utf8")).toContain("Thursday");
    expect(w.calls.filter(c => c.id === "mem::obsidian-import")).toHaveLength(3);
  }, 30_000);

  it.each([["--prefer", "newest"], ["--dry-run=true"], ["--unknown"], ["--vault-dir"]].map(flags => ({ flags })))(
    "rejects built CLI invalid flags before HTTP or engine setup: %j", async ({ flags }) => {
      await listen();
      const cliHome = join(temp, "invalid-cli-home"); await mkdir(cliHome);
      const before = w.snapshot();
      let code: number | string | undefined;
      try {
        await execute(process.execPath, [join(process.cwd(), "dist/cli.mjs"), "obsidian-import", "--vault-dir", w.vault, ...flags], {
          env: { PATH: process.env.PATH, HOME: cliHome, USERPROFILE: cliHome, AGENTMEMORY_URL: base, AGENTMEMORY_SECRET: SECRET, NO_COLOR: "1" }, timeout: 10_000,
        });
      } catch (error) { code = (error as { code?: number | string }).code; }
      expect(code).toBe(2); expect(w.calls.filter(c => c.id === "mem::obsidian-import")).toHaveLength(0);
      expect(w.snapshot()).toBe(before);
      expect(await readdir(cliHome)).toEqual([]);
    },
  );
  it.each([{ order: "export-only-first" }, { order: "imported-first" }])("does not replay a moved note over a store correction %j", async ({ order }) => {
    const b = join(w.vault, "memories", "moved-b.md"), c = join(w.vault, "memories", "moved-c.md");
    await rename(w.note, b); await w.edit("Tuesday", "Thursday", b);
    expect((await w.importVault()).applied.updated).toBe(1);
    const saved = (await w.latest())[0];
    const friday = saved.content.replace("Thursday", "Friday");
    expect((await w.sdk.trigger("mem::evolve", { memoryId: saved.id, newContent: friday }) as { success: boolean }).success).toBe(true);
    await rename(b, c);
    const list = w.kv.list;
    const spy = vi.spyOn(w.kv, "list").mockImplementation(async scope => {
      const values = await list(scope); return scope === KV.obsidianNotes && order === "imported-first" ? values.reverse() : values;
    });
    try {
      const before = w.snapshot(), bytes = await readFile(c);
      const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
      const result = await w.importVault();
      expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
      expect((await w.latest())[0].content).toBe(friday); expect(await readFile(c)).toEqual(bytes);
      expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
      if (!result.success) expect(result.errors.some(e => e.error.includes("ambiguous"))).toBe(true);
    } finally { spy.mockRestore(); }
  });
  it("imports a real new-note H1 followed by one newline as its title", async () => {
    await writeFile(join(w.vault, "memories", "new.md"), "# Correct title\nA wholly independent fact.");
    const result = await w.importVault(); expect(result.success).toBe(true); expect(result.applied.created).toBe(1);
    const created = (await w.latest()).find(m => m.id !== BASE.id)!;
    expect(created.title).toBe("Correct title"); expect(created.content).toBe("A wholly independent fact.");
    const before = w.snapshot(); const noteBytes = await readFile(join(w.vault, "memories", "new.md"));
    expect((await w.importVault()).applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect(await readFile(join(w.vault, "memories", "new.md"))).toEqual(noteBytes);
  });
  it("does not replay an imported correction after moving back to its original path", async () => {
    const moved = join(w.vault, "memories", "moved.md");
    await rename(w.note, moved); await w.edit("Tuesday", "Thursday", moved);
    expect((await w.importVault()).applied.updated).toBe(1);
    const saved = (await w.latest())[0], friday = saved.content.replace("Thursday", "Friday");
    expect((await w.sdk.trigger("mem::evolve", { memoryId: saved.id, newContent: friday }) as { success: boolean }).success).toBe(true);
    await rename(moved, w.note);
    const before = w.snapshot(), bytes = await readFile(w.note);
    const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const result = await w.importVault();
    expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect((await w.latest())[0].content).toBe(friday); expect(await readFile(w.note)).toEqual(bytes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    if (!result.success) expect(result.errors.some(e => e.error.includes("ambiguous"))).toBe(true);
  });
  it("does not replay when returning to a path with a stale nonempty imported baseline", async () => {
    const moved = join(w.vault, "memories", "moved.md");
    await w.edit(); expect((await w.importVault()).applied.updated).toBe(1);
    await rename(w.note, moved); await w.edit("Thursday", "Saturday", moved);
    expect((await w.importVault()).applied.updated).toBe(1);
    const saved = (await w.latest())[0], sunday = saved.content.replace("Saturday", "Sunday");
    expect((await w.sdk.trigger("mem::evolve", { memoryId: saved.id, newContent: sunday }) as { success: boolean }).success).toBe(true);
    await rename(moved, w.note);
    const before = w.snapshot(), bytes = await readFile(w.note), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const result = await w.importVault();
    expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect((await w.latest())[0].content).toBe(sunday); expect(await readFile(w.note)).toEqual(bytes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    if (!result.success) expect(result.errors.some(e => e.error.includes("ambiguous"))).toBe(true);
  });
  it("successfully repeats an unchanged currently mapped moved note despite its older export context", async () => {
    const moved = join(w.vault, "memories", "moved.md");
    await rename(w.note, moved); await w.edit("Tuesday", "Thursday", moved);
    expect((await w.importVault()).applied.updated).toBe(1);
    const saved = (await w.latest())[0], friday = saved.content.replace("Thursday", "Friday");
    expect((await w.sdk.trigger("mem::evolve", { memoryId: saved.id, newContent: friday }) as { success: boolean }).success).toBe(true);
    const before = w.snapshot(), bytes = await readFile(moved), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect((await w.latest())[0].content).toBe(friday); expect(await readFile(moved)).toEqual(bytes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
  });
});

describe("published upstream review regressions", () => {
  let temp: string;
  beforeEach(async () => { temp = await mkdtemp(join(tmpdir(), "obsidian-upstream-review-")); vi.stubEnv("AGENTMEMORY_EXPORT_ROOT", temp); vi.clearAllMocks(); });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(temp, { recursive: true, force: true }); });

  it("does not replay a changed note accepted by matching the actual store", async () => {
    const w = await setup(temp);
    await w.edit();
    const thursday = await w.sdk.trigger("mem::evolve", { memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Thursday") }) as { success: boolean; memory: Memory };
    expect(thursday.success).toBe(true);
    const beforeFirstMemories = await w.kv.list<Memory>(KV.memories);
    const beforeFirstAdd = index.add.mock.calls.length, beforeFirstRemove = index.remove.mock.calls.length;
    const accepted = await w.importVault();
    expect(accepted.success).toBe(true); expect(accepted.applied).toEqual({ created: 0, updated: 0 });
    expect(await w.kv.list(KV.memories)).toEqual(beforeFirstMemories);
    expect(index.add).toHaveBeenCalledTimes(beforeFirstAdd); expect(index.remove).toHaveBeenCalledTimes(beforeFirstRemove);
    const friday = await w.sdk.trigger("mem::evolve", { memoryId: thursday.memory.id, newContent: thursday.memory.content.replace("Thursday", "Friday") }) as { success: boolean; memory: Memory };
    expect(friday.success).toBe(true);
    const before = w.snapshot(), bytes = await readFile(w.note);
    const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const repeated = await w.importVault();
    expect.soft(repeated.success).toBe(true);
    expect.soft(repeated.applied).toEqual({ created: 0, updated: 0 });
    expect.soft(w.snapshot()).toBe(before);
    expect.soft((await w.latest())[0].id).toBe(friday.memory.id);
    expect.soft((await w.latest())[0].content).toBe(friday.memory.content);
    expect.soft(index.add).toHaveBeenCalledTimes(additions); expect.soft(index.remove).toHaveBeenCalledTimes(removals);
    expect.soft(await readFile(w.note)).toEqual(bytes);
  });

  it("accepts one editor final newline after an exact generated tail without trimming literal body text", async () => {
    const w = await setup(temp);
    const body = BASE.content + "\n\n## Concepts\nLiteral user concept heading stays.\n";
    await w.kv.set(KV.memories, BASE.id, { ...BASE, content: body, concepts: ["synthetic-shipping"] });
    await w.exportVault();
    const original = await readFile(w.note, "utf8");
    expect(original.endsWith("\n")).toBe(false); expect(original.endsWith("\n\n## Concepts\n#synthetic-shipping")).toBe(true);
    const edited = original.replace("Tuesday", "Thursday") + "\n";
    await writeFile(w.note, edited);
    const result = await w.importVault();
    expect.soft(result.success).toBe(true); expect.soft(result.applied).toEqual({ created: 0, updated: 1 });
    expect.soft((await w.latest())[0].content).toBe(body.replace("Tuesday", "Thursday"));
    expect.soft(await readFile(w.note, "utf8")).toBe(edited);
  });

  it("imports a real new note with an empty frontmatter mapping", async () => {
    const w = await setup(temp), path = join(w.vault, "memories", "empty-frontmatter.md");
    const text = "---\n---\n\n# Synthetic zero metadata\n\nA wholly independent fact.";
    await writeFile(path, text);
    const result = await w.importVault();
    expect.soft(result.success).toBe(true); expect.soft(result.applied).toEqual({ created: 1, updated: 0 });
    const memory = (await w.latest()).find(m => m.id !== BASE.id);
    expect.soft(memory?.title).toBe("Synthetic zero metadata"); expect.soft(memory?.content).toBe("A wholly independent fact.");
    expect.soft(await readFile(path, "utf8")).toBe(text);
  });

  it("accepts a second changed edit at the current moved path with the newest proven accepted history", async () => {
    const w = await setup(temp), moved = join(w.vault, "memories", "moved.md");
    await rename(w.note, moved); await w.edit("Tuesday", "Thursday", moved);
    expect((await w.importVault()).applied.updated).toBe(1);
    const first = (await w.latest())[0];
    await w.edit("Thursday", "Saturday", moved);
    const result = await w.importVault();
    expect.soft(result.success).toBe(true); expect.soft(result.applied).toEqual({ created: 0, updated: 1 });
    expect.soft((await w.latest())[0].content).toBe(first.content.replace("Thursday", "Saturday"));
    expect.soft((await w.latest())[0].parentId).toBe(first.id);
  });

  it("does not refresh provenance for an original unchanged input after a store-only edit", async () => {
    const w = await setup(temp);
    expect((await w.sdk.trigger("mem::evolve", { memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Friday") }) as { success: boolean }).success).toBe(true);
    const before = w.snapshot(), bytes = await readFile(w.note), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    for (let i = 0; i < 2; i++) {
      const result = await w.importVault();
      expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 0 });
      expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(bytes);
      expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    }
  });

  it("keeps a matching-store dry run free of provenance, memory, index and file writes", async () => {
    const w = await setup(temp); await w.edit();
    expect((await w.sdk.trigger("mem::evolve", { memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Thursday") }) as { success: boolean }).success).toBe(true);
    const before = w.snapshot(), bytes = await readFile(w.note), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const result = await w.importVault({ dryRun: true });
    expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 0 });
    expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(bytes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
  });
});

describe("Obsidian acknowledgement and recorded-history authority", () => {
  let temp: string;
  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), "obsidian-acknowledgement-"));
    vi.stubEnv("AGENTMEMORY_EXPORT_ROOT", temp);
    vi.clearAllMocks();
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(temp, { recursive: true, force: true }); });

  function gate() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  }

  async function waitForPlanning(planned: Promise<void>, pending: Promise<ObsidianImportResult>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        planned,
        pending.then(() => { throw new Error("import completed before the planning barrier"); }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("planning barrier was not reached")), 3000);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  it("records one matching-store acknowledgement and keeps immediate repeats free of every write", async () => {
    const w = await setup(temp); await w.edit();
    const evolved = await w.sdk.trigger("mem::evolve", {
      memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Thursday"),
    }) as { success: boolean; memory: Memory };
    expect(evolved.success).toBe(true);
    const exported = (await w.kv.list<ObsidianVaultNote>(KV.obsidianNotes))[0].exported;
    const outsideJournal = () => JSON.stringify((JSON.parse(w.snapshot()) as Array<[string, unknown]>).filter(([scope]) => scope !== KV.obsidianNotes));
    const before = outsideJournal(), bytes = await readFile(w.note);
    const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const writes = w.calls.filter(c => c.id === "mem::remember" || c.id === "mem::evolve").length;
    const journalWrites: Array<{ scope: string; key: string }> = [];
    const set = w.kv.set;
    w.kv.set = async <T>(scope: string, key: string, value: T): Promise<T> => {
      journalWrites.push({ scope, key }); return set(scope, key, value);
    };
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.errors).toEqual([]);
    expect(result.applied).toEqual({ created: 0, updated: 0 });
    expect(result.files).toEqual([{ file: `memories/${BASE.id}.md`, action: "unchanged", memoryId: evolved.memory.id }]);
    const contexts = await w.kv.list<ObsidianVaultNote>(KV.obsidianNotes);
    expect(contexts).toHaveLength(1); expect(contexts[0].exported).toEqual(exported);
    expect(contexts[0].imported).toMatchObject({ memoryId: evolved.memory.id, rawId: BASE.id });
    expect(contexts[0].imported?.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(contexts[0].imported?.stateDigest).toBe(contexts[0].imported?.inputDigest);
    expect(journalWrites).toEqual([{ scope: KV.obsidianNotes, key: expect.any(String) }]);
    expect(outsideJournal()).toBe(before); expect(await readFile(w.note)).toEqual(bytes);
    expect(w.calls.filter(c => c.id === "mem::remember" || c.id === "mem::evolve")).toHaveLength(writes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    const acknowledged = w.snapshot();
    for (let i = 0; i < 2; i++) {
      const repeated = await w.importVault();
      expect(repeated.success).toBe(true); expect(repeated.applied).toEqual({ created: 0, updated: 0 });
      expect(w.snapshot()).toBe(acknowledged); expect(journalWrites).toHaveLength(1);
      expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
      expect(await readFile(w.note)).toEqual(bytes);
    }
  });

  it("does not acknowledge a stale plan queued behind an actual store evolution", async () => {
    const w = await setup(temp); await w.edit();
    const thursday = await w.sdk.trigger("mem::evolve", {
      memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Thursday"),
    }) as { success: boolean; memory: Memory };
    expect(thursday.success).toBe(true);
    const contexts = await w.kv.list(KV.obsidianNotes), bytes = await readFile(w.note);
    const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const held = gate(), release = gate(), planned = gate();
    const get = w.kv.get;
    w.kv.get = async <T>(scope: string, key: string): Promise<T | null> => {
      const value = await get<T>(scope, key); if (scope === KV.obsidianNotes) planned.resolve(); return value;
    };
    const holder = withKeyedLock("mem:remember", async () => { held.resolve(); await release.promise; });
    await held.promise;
    try {
      const evolving = w.sdk.trigger("mem::evolve", {
        memoryId: thursday.memory.id, newContent: thursday.memory.content.replace("Thursday", "Friday"),
      }) as Promise<{ success: boolean; memory: Memory }>;
      const importing = w.importVault();
      await waitForPlanning(planned.promise, importing); release.resolve();
      const friday = await evolving, result = await importing;
      expect(friday.success).toBe(true); expect(result.success).toBe(false);
      expect(result.applied).toEqual({ created: 0, updated: 0 });
      expect(result.errors).toEqual([{ file: `memories/${BASE.id}.md`, error: "note or store changed since import planning; nothing was acknowledged", memoryId: thursday.memory.id }]);
      expect(await w.kv.list(KV.obsidianNotes)).toEqual(contexts);
      expect((await w.latest())[0].id).toBe(friday.memory.id);
      expect((await w.latest())[0].content).toBe(friday.memory.content);
      expect(await w.kv.list(KV.memories)).toHaveLength(3);
      expect(index.add).toHaveBeenCalledTimes(additions + 1); expect(index.remove).toHaveBeenCalledTimes(removals + 1);
      expect(w.calls.filter(c => c.id === "mem::evolve")).toHaveLength(2);
      expect(await readFile(w.note)).toEqual(bytes);
    } finally { release.resolve(); await holder; w.kv.get = get; }
  });

  it("re-reads the note under the writer lock before acknowledging its planned input", async () => {
    const w = await setup(temp); await w.edit();
    const thursday = await w.sdk.trigger("mem::evolve", {
      memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Thursday"),
    }) as { success: boolean; memory: Memory };
    expect(thursday.success).toBe(true);
    const before = w.snapshot(), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const held = gate(), release = gate(), planned = gate();
    const get = w.kv.get;
    w.kv.get = async <T>(scope: string, key: string): Promise<T | null> => {
      const value = await get<T>(scope, key); if (scope === KV.obsidianNotes) planned.resolve(); return value;
    };
    const holder = withKeyedLock("mem:remember", async () => { held.resolve(); await release.promise; });
    await held.promise;
    try {
      const importing = w.importVault(); await waitForPlanning(planned.promise, importing);
      await w.edit("Thursday", "Saturday"); const edited = await readFile(w.note); release.resolve();
      const result = await importing;
      expect(result.success).toBe(false); expect(result.applied).toEqual({ created: 0, updated: 0 });
      expect(result.errors).toEqual([{ file: `memories/${BASE.id}.md`, error: "note or store changed since import planning; nothing was acknowledged", memoryId: thursday.memory.id }]);
      expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(edited);
      expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
      expect(w.calls.filter(c => c.id === "mem::evolve")).toHaveLength(1);
    } finally { release.resolve(); await holder; w.kv.get = get; }
  });

  it("reports an acknowledgement journal failure with its actual store ID and zero memory writes", async () => {
    const w = await setup(temp); await w.edit();
    const thursday = await w.sdk.trigger("mem::evolve", {
      memoryId: BASE.id, newContent: BASE.content.replace("Tuesday", "Thursday"),
    }) as { success: boolean; memory: Memory };
    expect(thursday.success).toBe(true);
    const before = w.snapshot(), bytes = await readFile(w.note);
    const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const set = w.kv.set;
    w.kv.set = async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (scope === KV.obsidianNotes) throw new Error("injected journal failure");
      return set(scope, key, value);
    };
    const result = await w.importVault();
    expect(result.success).toBe(false); expect(result.applied).toEqual({ created: 0, updated: 0 });
    expect(result.errors).toEqual([{ file: `memories/${BASE.id}.md`, error: "store matched but note acknowledgement failed; inspect its provenance before retrying", memoryId: thursday.memory.id }]);
    expect(result.files[0].appliedMemoryId).toBeUndefined();
    expect(w.snapshot()).toBe(before); expect(await readFile(w.note)).toEqual(bytes);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    expect(w.calls.filter(c => c.id === "mem::evolve")).toHaveLength(1);
  });

  it("accepts CRLF normalization and one terminal newline while preserving literal generated-looking body text", async () => {
    const w = await setup(temp);
    const body = BASE.content + "\n\n## Related\nLiteral user section.\n";
    await w.kv.set(KV.memories, BASE.id, { ...BASE, content: body, concepts: ["synthetic-shipping"] });
    await w.exportVault();
    const edited = ((await readFile(w.note, "utf8")).replace("Tuesday", "Thursday") + "\n").replace(/\n/g, "\r\n");
    await writeFile(w.note, edited);
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 1 });
    expect((await w.latest())[0].content).toBe(body.replace("Tuesday", "Thursday"));
    expect(await readFile(w.note, "utf8")).toBe(edited);
    const before = w.snapshot(); expect((await w.importVault()).applied).toEqual({ created: 0, updated: 0 });
    expect(w.snapshot()).toBe(before);
  });

  it.each(["changed tail", "two final newlines"])("refuses %s despite an editor final newline", async kind => {
    const w = await setup(temp);
    await w.kv.set(KV.memories, BASE.id, { ...BASE, concepts: ["synthetic-shipping"] });
    await w.exportVault();
    const original = (await readFile(w.note, "utf8")).replace("Tuesday", "Thursday");
    const edited = kind === "changed tail" ? original.replace("#synthetic-shipping", "#changed-tail") + "\n" : original + "\n\n";
    await writeFile(w.note, edited);
    const before = w.snapshot(), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const result = await w.importVault();
    expect(result.success).toBe(false); expect(result.errors.some(e => e.error.includes("generated trailing sections"))).toBe(true);
    expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
    expect(await readFile(w.note, "utf8")).toBe(edited);
  });

  it("plans empty-frontmatter notes without writes and creates them only once", async () => {
    const w = await setup(temp), path = join(w.vault, "memories", "empty-repeat.md");
    const text = "---\n---\n\n# Synthetic empty mapping\n\nA distinct synthetic assertion.";
    await writeFile(path, text); const before = w.snapshot();
    const dry = await w.importVault({ dryRun: true });
    expect(dry.success).toBe(true); expect(dry.planned.creates).toBe(1);
    expect(dry.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
    expect((await w.importVault()).applied).toEqual({ created: 1, updated: 0 });
    const after = w.snapshot(), additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
    const repeated = await w.importVault();
    expect(repeated.success).toBe(true); expect(repeated.applied).toEqual({ created: 0, updated: 0 });
    expect(w.snapshot()).toBe(after); expect(await readFile(path, "utf8")).toBe(text);
    expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
  });

  it("accepts another current-path edit after a store-only correction using the proven newest journal", async () => {
    const w = await setup(temp); await w.edit();
    expect((await w.importVault()).applied.updated).toBe(1);
    const moved = join(w.vault, "memories", "moved.md"); await rename(w.note, moved);
    await w.edit("Thursday", "Saturday", moved); expect((await w.importVault()).applied.updated).toBe(1);
    const saturday = (await w.latest())[0];
    const sunday = await w.sdk.trigger("mem::evolve", { memoryId: saturday.id, newContent: saturday.content.replace("Saturday", "Sunday") }) as { success: boolean; memory: Memory };
    expect(sunday.success).toBe(true); await w.edit("Saturday", "Monday", moved);
    const result = await w.importVault();
    expect(result.success).toBe(true); expect(result.applied).toEqual({ created: 0, updated: 1 });
    expect(result.conflicts).toHaveLength(1);
    expect((await w.latest())[0].content).toBe(saturday.content.replace("Saturday", "Monday"));
    expect((await w.latest())[0].parentId).toBe(sunday.memory.id);
  });

  it.each(["missing other tip", "changed other version", "forked other tip", "equal conflicting tips", "cyclic ancestry", "changed current version"])(
    "refuses an ambiguous moved-path edit with %s", async fault => {
      const w = await setup(temp); await w.edit();
      expect((await w.importVault()).applied.updated).toBe(1);
      const moved = join(w.vault, "memories", "moved.md"); await rename(w.note, moved);
      await w.edit("Thursday", "Saturday", moved); expect((await w.importVault()).applied.updated).toBe(1);
      const saturday = (await w.latest())[0];
      const { noteIdentity, noteStateDigest } = await import("../src/functions/obsidian-vault.js");
      const oldKey = noteIdentity(w.vault, `memories/${BASE.id}.md`).key;
      const currentKey = noteIdentity(w.vault, "memories/moved.md").key;
      const old = (await w.kv.get<ObsidianVaultNote>(KV.obsidianNotes, oldKey))!;
      const current = (await w.kv.get<ObsidianVaultNote>(KV.obsidianNotes, currentKey))!;
      expect(old.imported).toBeDefined(); expect(current.imported?.memoryId).toBe(saturday.id);
      if (fault === "missing other tip") old.imported!.memoryId = "mem_missing_history_tip";
      else if (fault === "changed other version") old.imported!.stateDigest = "0".repeat(64);
      else if (fault === "forked other tip") {
        const separate = await w.sdk.trigger("mem::remember", { content: "An independent synthetic branch.", type: "fact" }) as { success: boolean; memory: Memory };
        expect(separate.success).toBe(true); expect(separate.memory.parentId).toBeUndefined();
        old.imported!.memoryId = separate.memory.id; old.imported!.stateDigest = noteStateDigest(separate.memory);
      } else if (fault === "equal conflicting tips") {
        old.imported!.memoryId = saturday.id; old.imported!.stateDigest = noteStateDigest(saturday);
        expect(old.imported!.inputDigest).not.toBe(current.imported!.inputDigest);
      } else if (fault === "cyclic ancestry") {
        const original = (await w.kv.get<Memory>(KV.memories, BASE.id))!;
        await w.kv.set(KV.memories, BASE.id, { ...original, parentId: saturday.id });
      } else current.imported!.stateDigest = "0".repeat(64);
      await w.kv.set(KV.obsidianNotes, oldKey, old); await w.kv.set(KV.obsidianNotes, currentKey, current);
      await w.edit("Saturday", "Monday", moved);
      const before = w.snapshot(), bytes = await readFile(moved);
      const additions = index.add.mock.calls.length, removals = index.remove.mock.calls.length;
      const result = await w.importVault();
      expect(result.success).toBe(false); expect(result.errors.some(e => e.error.includes("ambiguous"))).toBe(true);
      expect(result.applied).toEqual({ created: 0, updated: 0 }); expect(w.snapshot()).toBe(before);
      expect((await w.latest()).find(m => m.id === saturday.id)?.content).toBe(saturday.content);
      expect(index.add).toHaveBeenCalledTimes(additions); expect(index.remove).toHaveBeenCalledTimes(removals);
      expect(await readFile(moved)).toEqual(bytes);
    },
  );
});
