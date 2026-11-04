import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeRkyvJsonScope, hasPersistedVectorFixture, isVectorLogAcknowledged } from "../scripts/release-gate/recovery.mjs";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function archiveScope(value: unknown) {
  const json = Buffer.from(JSON.stringify(value));
  if (json.length <= 8) {
    const bytes = Buffer.alloc(8, 0xff);
    json.copy(bytes);
    return bytes;
  }
  const root = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(root + 8);
  json.copy(bytes);
  bytes.writeUInt32LE((json.length & 0x3f) | 0x80 | ((json.length >>> 6) << 8), root);
  bytes.writeInt32LE(-root, root + 4);
  return bytes;
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vector-durability-"));
  dirs.push(dir);
  mkdirSync(join(dir, "state_store.db"));
  const rows = Object.fromEntries(["checkpoint", "pending"].map((id) => [id, {
    id, s: "session", e: Buffer.from(new Float32Array([1, 2, 3]).buffer).toString("base64"), q: 1,
  }]));
  const scopes: Record<string, unknown> = {
    "mem:sessions": { session: { id: "session" } },
    "mem:index:bm25": { "vectors:meta": { v: 3, count: 1, bucketCount: 1 } },
    "mem:index:bm25:vec:0000": { checkpoint: rows.checkpoint },
    "mem:index:vec-pending": { pending: rows.pending },
    "mem:obs:session": { checkpoint: { id: "checkpoint" }, pending: { id: "pending" } },
  };
  const write = (scope: string, value: unknown) => writeFileSync(join(dir, "state_store.db", `${encodeURIComponent(scope)}.bin`), archiveScope(value));
  const check = () => hasPersistedVectorFixture(dir, "session", "checkpoint", ["pending"], 3);
  return { dir, scopes, rows, write, check };
}

describe("release gate vector durability", () => {
  it("decodes a scope captured from the pinned engine", () => {
    const bytes = Buffer.from("7b22766563746f72733a6d657461223a7b226275636b6574436f756e74223a312c22636f756e74223a32302c2273617665644174223a22323032362d31302d31305430393a32363a31372e3836345a222c2276223a337d7d98010000a8ffffff", "hex");
    expect(decodeRkyvJsonScope(bytes)).toEqual({
      "vectors:meta": { bucketCount: 1, count: 20, savedAt: "2026-10-10T09:26:17.864Z", v: 3 },
    });
    expect(decodeRkyvJsonScope(Buffer.from("7b7dffffffffffff", "hex"))).toEqual({});
  });

  it.each([
    (bytes: Buffer) => bytes.subarray(0, bytes.length - 1),
    (bytes: Buffer) => { bytes.writeInt32LE(-1, bytes.length - 4); return bytes; },
    (bytes: Buffer) => { bytes.writeUInt32LE(0xffffffbf, bytes.length - 8); return bytes; },
    (bytes: Buffer) => { bytes[0] = 0xff; return bytes; },
    () => archiveScope([]),
    () => Buffer.from("7b7dff00ffffffff", "hex"),
  ])("rejects invalid archive boundaries, UTF-8 and scope values", (corrupt) => {
    expect(() => decodeRkyvJsonScope(corrupt(archiveScope({ pending: { q: 1 } })))).toThrow(SyntaxError);
  });

  it("requires successful acknowledgments rather than the pending count", () => {
    const status = {
      index: { vectorDocuments: 20 },
      indexPersistence: { saving: false, pendingChanges: 19, pendingLog: 19, pendingLogAcknowledged: 0, pendingLogError: null as string | null },
    };
    expect(isVectorLogAcknowledged(status, 20, 1)).toBe(false);
    status.indexPersistence.pendingLogAcknowledged = 18;
    expect(isVectorLogAcknowledged(status, 20, 1)).toBe(false);
    status.indexPersistence.pendingLogAcknowledged = 19;
    expect(isVectorLogAcknowledged(status, 20, 1)).toBe(true);
    status.indexPersistence.pendingLogError = "write refused";
    expect(isVectorLogAcknowledged(status, 20, 1)).toBe(false);
  });

  it("waits for the actual checkpoint and every pending row to reach disk", () => {
    const { scopes, write, check } = fixture();
    expect(check()).toBe(false);
    for (const scope of ["mem:index:bm25", "mem:index:bm25:vec:0000", "mem:obs:session"]) write(scope, scopes[scope]);
    expect(check()).toBe(false);
    write("mem:index:vec-pending", {});
    expect(check()).toBe(false);
    write("mem:index:vec-pending", scopes["mem:index:vec-pending"]);
    expect(check()).toBe(false);
    write("mem:sessions", scopes["mem:sessions"]);
    expect(check()).toBe(true);
  });

  it("retries a file observed during a partial rewrite", () => {
    const { dir, scopes, write, check } = fixture();
    for (const [scope, value] of Object.entries(scopes)) write(scope, value);
    writeFileSync(join(dir, "state_store.db", "mem%3Aindex%3Avec-pending.bin"), '{"pending":');
    expect(check()).toBe(false);
    write("mem:index:vec-pending", scopes["mem:index:vec-pending"]);
    expect(check()).toBe(true);
  });

  it.each([
    ["mem:sessions", {}],
    ["mem:index:bm25", { "vectors:meta": { v: 3, count: 0, bucketCount: 1 } }],
    ["mem:index:bm25:vec:0000", {}],
    ["mem:obs:session", { checkpoint: { id: "checkpoint" } }],
  ])("rejects incomplete persisted scope %s", (scope, value) => {
    const { scopes, write, check } = fixture();
    for (const [name, row] of Object.entries(scopes)) write(name, row);
    write(scope as string, value);
    expect(check()).toBe(false);
  });

  it.each([{ s: "another-session" }, { id: "another-id" }, { e: "AA==" }, { q: null }, { t: 1 }, { c: 1 }])(
    "rejects mismatched or incomplete pending rows: %o",
    (override) => {
      const { scopes, rows, write, check } = fixture();
      for (const [scope, value] of Object.entries(scopes)) write(scope, value);
      write("mem:index:vec-pending", { pending: { ...rows.pending, ...override } });
      expect(check()).toBe(false);
    },
  );
});
