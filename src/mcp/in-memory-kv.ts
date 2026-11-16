import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, openSync, closeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

type Store = Map<string, Map<string, unknown>>;
type Mutation = { kind: "set"; value: unknown } | { kind: "delete" };

function readStore(path: string): Store {
  if (!existsSync(path)) return new Map();
  const data: unknown = JSON.parse(readFileSync(path, "utf-8"));
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isRecord(data)) throw new Error("Fallback store must contain a JSON object");
  const store: Store = new Map();
  for (const [scope, entries] of Object.entries(data)) {
    if (!isRecord(entries)) throw new Error(`Fallback scope ${scope} must contain a JSON object`);
    store.set(scope, new Map(Object.entries(entries)));
  }
  return store;
}

export class InMemoryKV {
  private store: Store = new Map();
  private pending = new Map<string, Map<string, Mutation>>();

  constructor(private persistPath?: string) {
    this.refresh();
  }

  private applyPending(store: Store): void {
    for (const [scope, changes] of this.pending) {
      if (!store.has(scope)) store.set(scope, new Map());
      const entries = store.get(scope)!;
      for (const [key, change] of changes) {
        if (change.kind === "delete") entries.delete(key);
        else entries.set(key, change.value);
      }
    }
  }

  private refresh(): void {
    if (!this.persistPath) return;
    try {
      const latest = readStore(this.persistPath);
      this.applyPending(latest);
      this.store = latest;
    } catch {}
  }

  private record(scope: string, key: string, change: Mutation): void {
    if (!this.persistPath) return;
    if (!this.pending.has(scope)) this.pending.set(scope, new Map());
    this.pending.get(scope)!.set(key, change);
  }

  async get<T = unknown>(scope: string, key: string): Promise<T | null> {
    this.refresh();
    return (this.store.get(scope)?.get(key) as T) ?? null;
  }

  async set<T = unknown>(scope: string, key: string, data: T): Promise<T> {
    if (!this.store.has(scope)) this.store.set(scope, new Map());
    this.store.get(scope)!.set(key, data);
    this.record(scope, key, { kind: "set", value: data });
    return data;
  }

  async delete(scope: string, key: string): Promise<void> {
    this.store.get(scope)?.delete(key);
    this.record(scope, key, { kind: "delete" });
  }

  async list<T = unknown>(scope: string): Promise<T[]> {
    this.refresh();
    const entries = this.store.get(scope);
    return entries ? (Array.from(entries.values()) as T[]) : [];
  }

  persist(): boolean {
    if (!this.persistPath) return false;
    const lockPath = `${this.persistPath}.lock`;
    let lockFd: number | undefined;
    let tmpPath: string | undefined;
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      for (let attempt = 0; attempt <= 50; attempt++) {
        try {
          lockFd = openSync(lockPath, "wx", 0o600);
          break;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
          if (attempt < 50) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
      }
      if (lockFd === undefined) {
        throw new Error(`Fallback store is busy. Retry the save. If no MCP process is writing, remove ${lockPath}`);
      }
      writeFileSync(lockFd, `${process.pid}\n`, "utf-8");
      const latest = readStore(this.persistPath);
      this.applyPending(latest);
      const data = Object.fromEntries([...latest].map(([scope, entries]) => [scope, Object.fromEntries(entries)]));
      tmpPath = `${this.persistPath}.${process.pid}.${randomUUID()}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(data), { encoding: "utf-8", mode: 0o600 });
      renameSync(tmpPath, this.persistPath);
      this.store = latest;
      this.pending.clear();
      return true;
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] Persist failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return false;
    } finally {
      if (tmpPath) {
        try { rmSync(tmpPath, { force: true }); } catch {}
      }
      if (lockFd !== undefined) {
        try { closeSync(lockFd); } catch {}
        try { rmSync(lockPath, { force: true }); } catch (err) {
          process.stderr.write(`[@agentmemory/mcp] Could not release fallback lock: ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
    }
  }
}
