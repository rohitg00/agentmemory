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
});
