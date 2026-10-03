import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSpool,
  drainSpool,
  parseSentMark,
  reconcileSent,
  retainSent,
  spoolPaths,
  spoolPolicy,
  spoolSummary,
  spoolTargetName,
  type SpoolPolicy,
  type SpoolRecord,
} from "../src/capture/spool.js";

const URL = "http://localhost:4811";

function body(marker: string, extra: Record<string, unknown> = {}) {
  return {
    hookType: "post_tool_use",
    sessionId: "ses_spool",
    project: "proj",
    cwd: "/work/proj",
    timestamp: new Date().toISOString(),
    data: { tool_name: "Bash", tool_input: { command: `echo ${marker}` }, tool_output: marker, ...extra },
  };
}

function lines(path: string): SpoolRecord[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as SpoolRecord);
}

describe("capture spool", () => {
  let dir: string;
  const policy: SpoolPolicy = { enabled: true, maxBytes: 64 * 1024, maxAgeMs: 3600_000, maxRecordBytes: 16 * 1024 };

  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), "am-spool-")), "capture-spool");
  });

  it("names the spool by host and port and treats loopback names alike", () => {
    expect(spoolTargetName("http://localhost:3111")).toBe("local-3111");
    expect(spoolTargetName("http://127.0.0.1:3111/")).toBe("local-3111");
    expect(spoolTargetName("https://mem.example.com")).toBe("mem.example.com-443");
  });

  it("appends records to a private file in a private folder", () => {
    expect(appendSpool(URL, "evc_aaaaaaaaaaaa", body("m1"), "unreachable", { dir, policy }).spooled).toBe(true);
    const paths = spoolPaths(URL, dir);
    expect(statSync(paths.file).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    const [rec] = lines(paths.file);
    expect(rec!.eventId).toBe("evc_aaaaaaaaaaaa");
    expect(rec!.reason).toBe("unreachable");
    expect((rec!.body.data as Record<string, unknown>).tool_output).toBe("m1");
  });

  it("redacts secrets before they reach disk", () => {
    const secret = "sk-ant-" + "a".repeat(30);
    appendSpool(URL, "evc_bbbbbbbbbbbb", body(`token ${secret}`), "timeout", { dir, policy });
    const text = readFileSync(spoolPaths(URL, dir).file, "utf-8");
    expect(text).not.toContain(secret);
    expect(text).toContain("[REDACTED_SECRET]");
  });

  it("drops image data before dropping an oversized record, and counts drops", () => {
    const image = "data:image/png;base64," + "A".repeat(20 * 1024);
    expect(appendSpool(URL, "evc_cccccccccccc", body("img", { image_data: image }), "timeout", { dir, policy }).spooled).toBe(true);
    const [rec] = lines(spoolPaths(URL, dir).file);
    expect((rec!.body.data as Record<string, unknown>).image_data).toBe("[image dropped from capture spool]");
    const huge = appendSpool(URL, "evc_dddddddddddd", body("x".repeat(20 * 1024)), "timeout", { dir, policy });
    expect(huge).toEqual({ spooled: false, dropped: "too-large" });
    expect(spoolSummary(URL, { dir, policy }).stats.dropped).toBe(1);
  });

  it("stops at the byte limit and reports the overflow", () => {
    let spooled = 0;
    let dropped = 0;
    for (let i = 0; i < 400; i++) {
      const r = appendSpool(URL, `evc_${String(i).padStart(12, "0")}`, body(`m${i}`), "unreachable", { dir, policy });
      if (r.spooled) spooled++;
      else dropped++;
    }
    const summary = spoolSummary(URL, { dir, policy });
    expect(summary.bytes).toBeLessThanOrEqual(policy.maxBytes);
    expect(summary.records).toBe(spooled);
    expect(dropped).toBeGreaterThan(0);
    expect(summary.stats.dropped).toBe(dropped);
    expect(summary.stats.lastDropReason).toBe("full");
  });

  it("does nothing when the spool is disabled", () => {
    const r = appendSpool(URL, "evc_eeeeeeeeeeee", body("off"), "unreachable", { dir, policy: { ...policy, enabled: false } });
    expect(r).toEqual({ spooled: false, dropped: "disabled" });
    expect(existsSync(dir)).toBe(false);
  });

  it("reads its limits from the environment", () => {
    const p = spoolPolicy({ AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES: "1048576", AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS: "2" });
    expect(p).toMatchObject({ enabled: true, maxBytes: 1048576, maxAgeMs: 2 * 3600_000 });
    expect(spoolPolicy({ AGENTMEMORY_CAPTURE_SPOOL: "false" }).enabled).toBe(false);
    expect(spoolPolicy({ AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES: "10" }).maxBytes).toBe(64 * 1024);
  });

  it("drains in order, removes delivered records and keeps the rest after a failure", async () => {
    for (let i = 0; i < 5; i++) appendSpool(URL, `evc_${String(i).padStart(12, "0")}`, body(`m${i}`), "unreachable", { dir, policy });
    const sent: string[] = [];
    const result = await drainSpool(
      URL,
      async (rec) => {
        sent.push(rec.eventId);
        if (sent.length === 3) return "retry";
        return sent.length === 2 ? "duplicate" : "delivered";
      },
      { dir, policy },
    );
    expect(result).toMatchObject({ claimed: 5, delivered: 1, duplicates: 1, remaining: 3 });
    const left = lines(spoolPaths(URL, dir).file);
    expect(left.map((r) => r.eventId)).toEqual(["evc_000000000002", "evc_000000000003", "evc_000000000004"]);
    expect(left[0]!.attempts).toBe(1);
    const second = await drainSpool(URL, async () => "delivered", { dir, policy });
    expect(second).toMatchObject({ claimed: 3, delivered: 3, remaining: 0 });
    expect(spoolSummary(URL, { dir, policy })).toMatchObject({ records: 0 });
    expect(spoolSummary(URL, { dir, policy }).stats.lastDrainDelivered).toBe(3);
  });

  it("sends a spooled event id once even if it was spooled twice", async () => {
    appendSpool(URL, "evc_ffffffffffff", body("dup"), "timeout", { dir, policy });
    appendSpool(URL, "evc_ffffffffffff", body("dup"), "timeout", { dir, policy });
    let calls = 0;
    const result = await drainSpool(URL, async () => (calls++, "delivered"), { dir, policy });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ delivered: 1, duplicates: 1 });
  });

  it("drops records older than the age limit instead of sending them", async () => {
    appendSpool(URL, "evc_gggggggggggg", body("old"), "timeout", { dir, policy });
    const paths = spoolPaths(URL, dir);
    const [rec] = lines(paths.file);
    writeFileSync(paths.file, JSON.stringify({ ...rec, spooledAt: new Date(Date.now() - 2 * 3600_000).toISOString() }) + "\n");
    let calls = 0;
    const result = await drainSpool(URL, async () => (calls++, "delivered"), { dir, policy });
    expect(calls).toBe(0);
    expect(result.expired).toBe(1);
  });

  it("keeps records appended while a drain is running", async () => {
    appendSpool(URL, "evc_hhhhhhhhhhh1", body("first"), "timeout", { dir, policy });
    const result = await drainSpool(
      URL,
      async () => {
        appendSpool(URL, "evc_hhhhhhhhhhh2", body("during"), "timeout", { dir, policy });
        return "retry";
      },
      { dir, policy },
    );
    expect(result.remaining).toBe(1);
    expect(lines(spoolPaths(URL, dir).file).map((r) => r.eventId).sort()).toEqual(["evc_hhhhhhhhhhh1", "evc_hhhhhhhhhhh2"]);
  });

  it("refuses a second concurrent drain", async () => {
    appendSpool(URL, "evc_iiiiiiiiiiii", body("one"), "timeout", { dir, policy });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const first = drainSpool(URL, async () => (await gate, "delivered"), { dir, policy });
    await new Promise((r) => setTimeout(r, 20));
    const second = await drainSpool(URL, async () => "delivered", { dir, policy });
    expect(second.skipped).toBe("locked");
    release();
    expect((await first).delivered).toBe(1);
  });

  it("recovers records from a drain that crashed mid-way", async () => {
    appendSpool(URL, "evc_jjjjjjjjjjjj", body("orphan"), "timeout", { dir, policy });
    const paths = spoolPaths(URL, dir);
    const orphan = join(dir, `${paths.name}.draining-99999-1.jsonl`);
    writeFileSync(orphan, readFileSync(paths.file, "utf-8"));
    writeFileSync(paths.file, "");
    const old = new Date(Date.now() - 10 * 60_000);
    const { utimesSync } = await import("node:fs");
    utimesSync(orphan, old, old);
    const seen: string[] = [];
    await drainSpool(URL, async (rec) => (seen.push(rec.eventId), "delivered"), { dir, policy });
    expect(seen).toEqual(["evc_jjjjjjjjjjjj"]);
    expect(existsSync(orphan)).toBe(false);
  });
});

describe("capture spool retention until durable", () => {
  let dir: string;
  const policy: SpoolPolicy = { enabled: true, maxBytes: 64 * 1024, maxAgeMs: 3600_000, maxRecordBytes: 16 * 1024 };
  const BOOT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const BOOT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), "am-spool-")), "capture-spool");
  });

  function sentFiles(): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.includes(".sent-"));
  }

  it("reads the durability mark from a response and ignores responses without one", () => {
    expect(parseSentMark({ status: "accepted", bootId: BOOT_A, durableAfterMs: 3500 })).toEqual({ bootId: BOOT_A, durableAfterMs: 3500 });
    expect(parseSentMark({ status: "accepted" })).toBeNull();
    expect(parseSentMark({ bootId: "../etc", durableAfterMs: 1 })).toBeNull();
    expect(parseSentMark({ bootId: BOOT_A, durableAfterMs: -1 })).toBeNull();
    expect(parseSentMark({ bootId: BOOT_A, durableAfterMs: 1e12 })!.durableAfterMs).toBe(600_000);
    expect(parseSentMark(null)).toBeNull();
  });

  it("keeps a sent record until the window passes, then releases it without sending", async () => {
    const now = 1_700_000_000_000;
    expect(retainSent(URL, "evc_keep00000001", body("kept"), { bootId: BOOT_A, durableAfterMs: 3500 }, { dir, policy, now })).toBe(true);
    expect(sentFiles()).toHaveLength(1);
    expect(spoolSummary(URL, { dir, policy })).toMatchObject({ records: 0, retained: 1 });
    expect(reconcileSent(URL, BOOT_A, { dir, policy, now: now + 1000 })).toEqual({ released: 0, requeued: 0 });
    expect(sentFiles()).toHaveLength(1);
    expect(reconcileSent(URL, BOOT_A, { dir, policy, now: now + 5000 })).toEqual({ released: 1, requeued: 0 });
    expect(sentFiles()).toHaveLength(0);
    let calls = 0;
    await drainSpool(URL, async () => (calls++, "delivered"), { dir, policy });
    expect(calls).toBe(0);
  });

  it("re-sends a kept record with the same event id once the server restarted", async () => {
    const now = Date.now();
    retainSent(URL, "evc_restart00001", body("before-restart"), { bootId: BOOT_A, durableAfterMs: 60_000 }, { dir, policy, now });
    expect(reconcileSent(URL, BOOT_B, { dir, policy, now })).toEqual({ released: 0, requeued: 1 });
    expect(sentFiles()).toHaveLength(0);
    const sent: SpoolRecord[] = [];
    const result = await drainSpool(URL, async (rec) => (sent.push(rec), "duplicate"), { dir, policy });
    expect(result).toMatchObject({ claimed: 1, duplicates: 1, remaining: 0 });
    expect(sent.map((r) => r.eventId)).toEqual(["evc_restart00001"]);
    expect((sent[0]!.body.data as Record<string, unknown>).tool_output).toBe("before-restart");
  });

  it("does nothing when the spool is disabled", () => {
    const off = { ...policy, enabled: false };
    expect(retainSent(URL, "evc_off000000001", body("off"), { bootId: BOOT_A, durableAfterMs: 0 }, { dir, policy: off })).toBe(false);
    expect(reconcileSent(URL, BOOT_B, { dir, policy: off })).toEqual({ released: 0, requeued: 0 });
    expect(existsSync(dir)).toBe(false);
  });

  it("keeps kept records inside the spool byte limit and gives way to unsent records", () => {
    let retained = 0;
    for (let i = 0; i < 400; i++) {
      if (retainSent(URL, `evc_r${String(i).padStart(11, "0")}`, body(`r${i}`), { bootId: BOOT_A, durableAfterMs: 60_000 }, { dir, policy })) retained++;
    }
    expect(retained).toBeGreaterThan(0);
    expect(retained).toBeLessThan(400);
    const before = spoolSummary(URL, { dir, policy });
    expect(before.retainedBytes).toBeLessThanOrEqual(policy.maxBytes);
    expect(appendSpool(URL, "evc_unsent000001", body("unsent"), "unreachable", { dir, policy }).spooled).toBe(true);
    const after = spoolSummary(URL, { dir, policy });
    expect(after.records).toBe(1);
    expect(after.retained).toBeLessThan(before.retained);
    expect(after.bytes + after.retainedBytes).toBeLessThanOrEqual(policy.maxBytes);
  });
});
