import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };
});

describe("MCP fallback persistence", () => {
  let home: string;
  let path: string;
  const children: ChildProcess[] = [];

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-fallback-persist-"));
    path = join(home, "standalone.json");
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(async () => {
    await Promise.all(children.splice(0).map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.disconnect();
      await exited;
    }));
    vi.restoreAllMocks();
    rmSync(home, { recursive: true, force: true });
  });

  function saved() {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, Record<string, unknown>>;
  }

  async function bootChild() {
    const script = `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const path = process.env.STORE_PATH;
      const read = fs.readFileSync;
      fs.readFileSync = (target, ...args) => {
        const result = read(target, ...args);
        if (target === path) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        return result;
      };
      syncBuiltinESMExports();
      const { InMemoryKV } = await import(${JSON.stringify(new URL("../src/mcp/in-memory-kv.ts", import.meta.url).href)});
      const kv = new InMemoryKV(path);
      process.on("message", async ({ operation, keys }) => {
        try {
          for (const key of keys) {
            if (operation === "delete") await kv.delete("memories", key);
            else await kv.set("memories", key, key);
          }
          process.send({ persisted: kv.persist() });
        } catch (error) {
          process.send({ error: error.message });
        }
      });
      process.on("disconnect", () => process.exit(0));
      process.send({ ready: true });
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, STORE_PATH: path },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    children.push(child);
    const [message] = await once(child, "message");
    expect(message).toEqual({ ready: true });
    return child;
  }

  async function mutate(child: ChildProcess, operation: string, keys: string[]) {
    const reply = once(child, "message");
    child.send({ operation, keys });
    const [message] = await reply;
    expect(message).toEqual({ persisted: true });
  }

  it("retains acknowledged saves from two separate processes", async () => {
    const a = await bootChild();
    const b = await bootChild();
    await mutate(a, "save", ["a"]);
    await mutate(b, "save", ["b"]);
    expect(saved()).toEqual({ memories: { a: "a", b: "b" } });
  });

  it("keeps a deletion when a stale process later saves", async () => {
    const a = await bootChild();
    await mutate(a, "save", ["deleted"]);
    const b = await bootChild();
    await mutate(a, "delete", ["deleted"]);
    await mutate(b, "save", ["new"]);
    expect(saved()).toEqual({ memories: { new: "new" } });
  });

  it("serializes overlapping read-modify-write operations in separate processes", async () => {
    writeFileSync(path, "{}");
    const a = await bootChild();
    const b = await bootChild();
    const left = Array.from({ length: 20 }, (_, i) => `a${i}`);
    const right = Array.from({ length: 20 }, (_, i) => `b${i}`);
    await Promise.all([mutate(a, "save", left), mutate(b, "save", right)]);
    expect(Object.keys(saved().memories).sort()).toEqual([...left, ...right].sort());
  });

  it("merges two instances' pending mutations instead of replacing stale snapshots", async () => {
    const a = new InMemoryKV(path);
    const b = new InMemoryKV(path);
    await a.set("memories", "a", "first");
    expect(a.persist()).toBe(true);
    await b.set("memories", "b", "second");
    expect(b.persist()).toBe(true);
    expect(saved()).toEqual({ memories: { a: "first", b: "second" } });
    expect(await a.get("memories", "b")).toBe("second");
  });

  it("does not resurrect a deletion when a stale instance saves another key", async () => {
    const a = new InMemoryKV(path);
    await a.set("memories", "deleted", "old");
    expect(a.persist()).toBe(true);
    const b = new InMemoryKV(path);
    await a.delete("memories", "deleted");
    expect(a.persist()).toBe(true);
    await b.set("memories", "new", "kept");
    expect(b.persist()).toBe(true);
    expect(saved()).toEqual({ memories: { new: "kept" } });
  });

  it("deletes a key added after the deleting instance was constructed", async () => {
    const stale = new InMemoryKV(path);
    const writer = new InMemoryKV(path);
    await writer.set("scope", "key", "new");
    expect(writer.persist()).toBe(true);
    await stale.delete("scope", "key");
    expect(stale.persist()).toBe(true);
    expect(saved()).toEqual({ scope: {} });
  });

  it("does not replay committed values over another writer's newer value", async () => {
    const a = new InMemoryKV(path);
    const b = new InMemoryKV(path);
    await a.set("scope", "key", "old");
    expect(a.persist()).toBe(true);
    await b.set("scope", "key", "new");
    expect(b.persist()).toBe(true);
    await a.set("scope", "other", "kept");
    expect(a.persist()).toBe(true);
    expect(saved()).toEqual({ scope: { key: "new", other: "kept" } });
  });

  it("refreshes reads while preserving this instance's pending changes", async () => {
    const a = new InMemoryKV(path);
    const b = new InMemoryKV(path);
    await a.set("scope", "pending", "local");
    await b.set("scope", "remote", "persisted");
    expect(b.persist()).toBe(true);
    expect(await a.list("scope")).toEqual(["persisted", "local"]);
    expect(a.persist()).toBe(true);
    expect(saved().scope).toEqual({ remote: "persisted", pending: "local" });
  });

  it("keeps pending mutations after a failed rename and releases its lock", async () => {
    writeFileSync(path, '{"scope":{"original":"kept"}}');
    const a = new InMemoryKV(path);
    await a.set("scope", "pending", "retry");
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error("rename denied"); });
    expect(a.persist()).toBe(false);
    expect(saved()).toEqual({ scope: { original: "kept" } });
    expect(readdirSync(home)).toEqual(["standalone.json"]);
    const b = new InMemoryKV(path);
    await b.set("scope", "other", "new");
    expect(b.persist()).toBe(true);
    expect(a.persist()).toBe(true);
    expect(saved().scope).toEqual({ original: "kept", other: "new", pending: "retry" });
  });

  it("does not steal an existing lock and can retry without losing changes", async () => {
    const a = new InMemoryKV(path);
    await a.set("scope", "pending", "retry");
    writeFileSync(`${path}.lock`, "another writer\n");
    expect(a.persist()).toBe(false);
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(`${path}.lock`, "utf-8")).toBe("another writer\n");
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("Fallback store is busy"));
    rmSync(`${path}.lock`);
    expect(a.persist()).toBe(true);
    expect(saved()).toEqual({ scope: { pending: "retry" } });
  });

  it("retains pending changes and releases the lock after serialization fails", async () => {
    const kv = new InMemoryKV(path);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await kv.set("scope", "kept", "pending");
    await kv.set("scope", "broken", circular);
    expect(kv.persist()).toBe(false);
    expect(readdirSync(home)).toEqual([]);
    await kv.set("scope", "broken", "fixed");
    expect(kv.persist()).toBe(true);
    expect(saved()).toEqual({ scope: { kept: "pending", broken: "fixed" } });
  });

  it.each(["{broken", "[]", '{"scope":null}', '{"scope":[]}'])(
    "does not overwrite unreadable store contents: %s",
    async (contents) => {
      writeFileSync(path, contents);
      const kv = new InMemoryKV(path);
      await kv.set("scope", "pending", "retry");
      expect(kv.persist()).toBe(false);
      expect(readFileSync(path, "utf-8")).toBe(contents);
      expect(readdirSync(home)).toEqual(["standalone.json"]);
      writeFileSync(path, "{}");
      expect(kv.persist()).toBe(true);
      expect(saved()).toEqual({ scope: { pending: "retry" } });
    },
  );

  it("preserves an unreadable path instead of replacing it", async () => {
    mkdirSync(path);
    writeFileSync(join(path, "keep"), "untouched");
    const kv = new InMemoryKV(path);
    await kv.set("scope", "pending", "retry");
    expect(kv.persist()).toBe(false);
    expect(readFileSync(join(path, "keep"), "utf-8")).toBe("untouched");
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("handles scope and key names that are object prototype properties", async () => {
    const kv = new InMemoryKV(path);
    await kv.set("__proto__", "__proto__", "kept");
    expect(kv.persist()).toBe(true);
    expect(await new InMemoryKV(path).get("__proto__", "__proto__")).toBe("kept");
  });
});
