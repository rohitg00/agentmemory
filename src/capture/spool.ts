import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { resolveDataDir } from "../cli-data-dir.js";
import { scrubRecord } from "../functions/privacy.js";

export interface SpoolRecord {
  v: 1;
  eventId: string;
  spooledAt: string;
  reason: string;
  attempts: number;
  body: Record<string, unknown>;
  bootId?: string;
}

export interface SentMark {
  bootId: string;
  durableAfterMs: number;
}

export interface SentReconcile {
  released: number;
  requeued: number;
}

export interface SpoolPolicy {
  enabled: boolean;
  maxBytes: number;
  maxAgeMs: number;
  maxRecordBytes: number;
}

export interface SpoolStats {
  spooled: number;
  dropped: number;
  droppedBytes: number;
  expired: number;
  delivered: number;
  duplicates: number;
  rejected: number;
  lastSpooledAt?: string;
  lastSpoolReason?: string;
  lastDropAt?: string;
  lastDropReason?: string;
  lastDrainAt?: string;
  lastDrainDelivered?: number;
  lastDrainDuplicates?: number;
  lastDrainRejected?: number;
  lastDrainRemaining?: number;
  lastDrainUnreadable?: number;
  lastDrainError?: string;
}

export interface SpoolPaths {
  dir: string;
  name: string;
  file: string;
  lock: string;
  drainLock: string;
  stats: string;
}

export interface SpoolSummary {
  enabled: boolean;
  path: string;
  records: number;
  bytes: number;
  oldestAt: string | null;
  retained: number;
  retainedBytes: number;
  unreadable: number;
  maxBytes: number;
  maxAgeHours: number;
  stats: SpoolStats;
}

export type SendOutcome = "delivered" | "duplicate" | "rejected" | "retry";

export interface DrainResult {
  claimed: number;
  delivered: number;
  duplicates: number;
  rejected: number;
  expired: number;
  corrupt: number;
  unreadable: number;
  remaining: number;
  error?: string;
  skipped?: "locked" | "empty" | "disabled";
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MIN_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_AGE_HOURS = 168;
const LOCK_STALE_MS = 10_000;
const DRAIN_LOCK_STALE_MS = 120_000;
const ORPHAN_CLAIM_MS = 120_000;
const LOCK_WAIT_MS = 500;
const IMAGE_PLACEHOLDER = "[image dropped from capture spool]";
const BOOT_ID_RE = /^[A-Za-z0-9]{8,64}$/;
const SENT_FILE_RE = /^([A-Za-z0-9]{8,64})-(\d+)\.jsonl$/;
const SENT_BUCKET_MS = 1000;
// Cover the maximum one-hour state flush interval plus its safety margin.
const MAX_DURABLE_AFTER_MS = 61 * 60_000;

function emptyStats(): SpoolStats {
  return { spooled: 0, dropped: 0, droppedBytes: 0, expired: 0, delivered: 0, duplicates: 0, rejected: 0 };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return fallback;
  const n = parseInt(raw.trim(), 10);
  return n > 0 ? n : fallback;
}

export function spoolPolicy(env: NodeJS.ProcessEnv = process.env): SpoolPolicy {
  const maxBytes = Math.max(MIN_MAX_BYTES, positiveInt(env["AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES"], DEFAULT_MAX_BYTES));
  const maxAgeHours = positiveInt(env["AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS"], DEFAULT_MAX_AGE_HOURS);
  return {
    enabled: env["AGENTMEMORY_CAPTURE_SPOOL"] !== "false",
    maxBytes,
    maxAgeMs: maxAgeHours * 3600_000,
    maxRecordBytes: Math.min(256 * 1024, Math.floor(maxBytes / 4)),
  };
}

export function spoolDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env["AGENTMEMORY_CAPTURE_SPOOL_DIR"];
  if (explicit && explicit.trim()) return resolve(explicit.trim());
  return join(resolveDataDir({ args: [], env }).dataDir, "capture-spool");
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function spoolTargetName(url: string): string {
  try {
    const u = new URL(url);
    const host = LOOPBACK.has(u.hostname) ? "local" : u.hostname.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `${host}-${port}`;
  } catch {
    return "local-3111";
  }
}

export function spoolPaths(url: string, dir: string = spoolDir()): SpoolPaths {
  const name = spoolTargetName(url);
  return {
    dir,
    name,
    file: join(dir, `${name}.jsonl`),
    lock: join(dir, `${name}.lock`),
    drainLock: join(dir, `${name}.drain.lock`),
    stats: join(dir, `${name}.stats.json`),
  };
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {}
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tryLock(path: string, staleMs: number): boolean {
  try {
    const fd = openSync(path, "wx", 0o600);
    writeSync(fd, `${process.pid}\n`);
    closeSync(fd);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") return false;
    try {
      if (Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path);
    } catch {}
    return false;
  }
}

function releaseLock(path: string): void {
  try {
    unlinkSync(path);
  } catch {}
}

function withLock<T>(path: string, fn: (locked: boolean) => T, waitMs = LOCK_WAIT_MS): T {
  const deadline = Date.now() + waitMs;
  let locked = tryLock(path, LOCK_STALE_MS);
  while (!locked && Date.now() < deadline) {
    sleepSync(5);
    locked = tryLock(path, LOCK_STALE_MS);
  }
  try {
    return fn(locked);
  } finally {
    if (locked) releaseLock(path);
  }
}

export function readSpoolStats(paths: SpoolPaths): SpoolStats {
  try {
    const parsed = JSON.parse(readFileSync(paths.stats, "utf-8")) as Partial<SpoolStats>;
    return { ...emptyStats(), ...parsed };
  } catch {
    return emptyStats();
  }
}

function writeStats(paths: SpoolPaths, patch: (stats: SpoolStats) => void): void {
  try {
    const stats = readSpoolStats(paths);
    patch(stats);
    const tmp = `${paths.stats}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(stats), { mode: 0o600 });
    renameSync(tmp, paths.stats);
  } catch {}
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function withoutImage(body: Record<string, unknown>): Record<string, unknown> {
  const data = body["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) return body;
  const d = data as Record<string, unknown>;
  if (d["image_data"] === undefined) return body;
  return { ...body, data: { ...d, image_data: IMAGE_PLACEHOLDER } };
}

function parseLines(text: string): { records: SpoolRecord[]; corrupt: number } {
  const records: SpoolRecord[] = [];
  let corrupt = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as SpoolRecord;
      if (rec && typeof rec.eventId === "string" && rec.body && typeof rec.body === "object") records.push(rec);
      else corrupt++;
    } catch {
      corrupt++;
    }
  }
  return { records, corrupt };
}

function isExpired(rec: SpoolRecord, policy: SpoolPolicy, now: number): boolean {
  const at = Date.parse(rec.spooledAt);
  return Number.isFinite(at) && now - at > policy.maxAgeMs;
}

function serialize(records: SpoolRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}

function rewriteLocked(paths: SpoolPaths, records: SpoolRecord[]): void {
  const tmp = `${paths.file}.${process.pid}.tmp`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, serialize(records));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, paths.file);
}

function pruneExpiredLocked(paths: SpoolPaths, policy: SpoolPolicy): number {
  if (!existsSync(paths.file)) return 0;
  const { records } = parseLines(readFileSync(paths.file, "utf-8"));
  const now = Date.now();
  const kept = records.filter((r) => !isExpired(r, policy, now));
  const expired = records.length - kept.length;
  if (expired > 0) rewriteLocked(paths, kept);
  return expired;
}

export interface AppendResult {
  spooled: boolean;
  dropped?: "disabled" | "too-large" | "full" | "error";
}

export function appendSpool(
  url: string,
  eventId: string,
  body: Record<string, unknown>,
  reason: string,
  options: { policy?: SpoolPolicy; dir?: string; attempts?: number } = {},
): AppendResult {
  const policy = options.policy ?? spoolPolicy();
  if (!policy.enabled) return { spooled: false, dropped: "disabled" };
  const paths = spoolPaths(url, options.dir);
  const note = (dropReason: NonNullable<AppendResult["dropped"]>, bytes: number) => {
    writeStats(paths, (s) => {
      s.dropped++;
      s.droppedBytes += bytes;
      s.lastDropAt = new Date().toISOString();
      s.lastDropReason = dropReason;
    });
    return { spooled: false, dropped: dropReason } as AppendResult;
  };
  try {
    ensureDir(paths.dir);
    const record: SpoolRecord = {
      v: 1,
      eventId,
      spooledAt: new Date().toISOString(),
      reason,
      attempts: options.attempts ?? 0,
      body: scrubRecord(JSON.parse(JSON.stringify(body)), { scrubKeys: true }),
    };
    let line = JSON.stringify(record) + "\n";
    if (Buffer.byteLength(line) > policy.maxRecordBytes) {
      record.body = withoutImage(record.body);
      line = JSON.stringify(record) + "\n";
    }
    const bytes = Buffer.byteLength(line);
    if (bytes > policy.maxRecordBytes) return note("too-large", bytes);
    return withLock(paths.lock, (locked) => {
      let expired = 0;
      if (locked && fileSize(paths.file) + claimBytes(paths) + bytes > policy.maxBytes) expired = pruneExpiredLocked(paths, policy);
      const over = heldBytes(paths) + bytes - policy.maxBytes;
      if (locked && over > 0 && over <= sentBytes(paths)) evictSent(paths, over);
      if (heldBytes(paths) + bytes > policy.maxBytes) {
        if (expired) writeStats(paths, (s) => void (s.expired += expired));
        return note("full", bytes);
      }
      const fd = openSync(paths.file, "a", 0o600);
      try {
        writeSync(fd, line);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      writeStats(paths, (s) => {
        s.spooled++;
        s.expired += expired;
        s.lastSpooledAt = record.spooledAt;
        s.lastSpoolReason = reason;
      });
      return { spooled: true } as AppendResult;
    });
  } catch {
    return { spooled: false, dropped: "error" };
  }
}

interface SentSegment {
  file: string;
  bootId: string;
  dueAt: number;
  bytes: number;
}

function listSent(paths: SpoolPaths): SentSegment[] {
  const segments: SentSegment[] = [];
  let entries: string[];
  try {
    entries = readdirSync(paths.dir);
  } catch {
    return segments;
  }
  const prefix = `${paths.name}.sent-`;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const match = entry.slice(prefix.length).match(SENT_FILE_RE);
    if (!match) continue;
    const file = join(paths.dir, entry);
    segments.push({ file, bootId: match[1]!, dueAt: Number(match[2]), bytes: fileSize(file) });
  }
  return segments;
}

function sentBytes(paths: SpoolPaths): number {
  return listSent(paths).reduce((n, s) => n + s.bytes, 0);
}

interface ClaimFile {
  file: string;
  bytes: number;
  mtimeMs: number;
}

function listClaims(paths: SpoolPaths): ClaimFile[] {
  const claims: ClaimFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(paths.dir);
  } catch {
    return claims;
  }
  const prefix = `${paths.name}.draining-`;
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".jsonl")) continue;
    const file = join(paths.dir, entry);
    try {
      const stat = statSync(file);
      claims.push({ file, bytes: stat.size, mtimeMs: stat.mtimeMs });
    } catch {}
  }
  return claims;
}

function claimBytes(paths: SpoolPaths): number {
  return listClaims(paths).reduce((n, c) => n + c.bytes, 0);
}

function heldBytes(paths: SpoolPaths): number {
  return fileSize(paths.file) + sentBytes(paths) + claimBytes(paths);
}

function evictSent(paths: SpoolPaths, need: number): void {
  let freed = 0;
  for (const seg of listSent(paths).sort((a, b) => a.dueAt - b.dueAt)) {
    if (freed >= need) return;
    try {
      unlinkSync(seg.file);
      freed += seg.bytes;
    } catch {}
  }
}

export function parseSentMark(body: unknown): SentMark | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const bootId = (body as Record<string, unknown>)["bootId"];
  const after = (body as Record<string, unknown>)["durableAfterMs"];
  if (typeof bootId !== "string" || !BOOT_ID_RE.test(bootId)) return null;
  if (typeof after !== "number" || !Number.isFinite(after) || after < 0) return null;
  return { bootId, durableAfterMs: Math.min(Math.ceil(after), MAX_DURABLE_AFTER_MS) };
}

export function retainSent(
  url: string,
  eventId: string,
  body: Record<string, unknown>,
  mark: SentMark,
  options: { policy?: SpoolPolicy; dir?: string; now?: number } = {},
): boolean {
  const policy = options.policy ?? spoolPolicy();
  if (!policy.enabled || !BOOT_ID_RE.test(mark.bootId)) return false;
  const paths = spoolPaths(url, options.dir);
  const now = options.now ?? Date.now();
  try {
    ensureDir(paths.dir);
    const record: SpoolRecord = {
      v: 1,
      eventId,
      spooledAt: new Date(now).toISOString(),
      reason: "sent",
      attempts: 0,
      body: scrubRecord(JSON.parse(JSON.stringify(body)), { scrubKeys: true }),
      bootId: mark.bootId,
    };
    let line = JSON.stringify(record) + "\n";
    if (Buffer.byteLength(line) > policy.maxRecordBytes) {
      record.body = withoutImage(record.body);
      line = JSON.stringify(record) + "\n";
    }
    const bytes = Buffer.byteLength(line);
    if (bytes > policy.maxRecordBytes) return false;
    const dueAt = Math.ceil((now + mark.durableAfterMs) / SENT_BUCKET_MS) * SENT_BUCKET_MS;
    const file = join(paths.dir, `${paths.name}.sent-${mark.bootId}-${dueAt}.jsonl`);
    return withLock(paths.lock, () => {
      if (fileSize(paths.file) + sentBytes(paths) + bytes > policy.maxBytes) return false;
      const fd = openSync(file, "a", 0o600);
      try {
        writeSync(fd, line);
      } finally {
        closeSync(fd);
      }
      return true;
    });
  } catch {
    return false;
  }
}

export function reconcileSent(
  url: string,
  bootId: string,
  options: { policy?: SpoolPolicy; dir?: string; now?: number } = {},
): SentReconcile {
  const result: SentReconcile = { released: 0, requeued: 0 };
  const policy = options.policy ?? spoolPolicy();
  if (!policy.enabled) return result;
  const paths = spoolPaths(url, options.dir);
  const now = options.now ?? Date.now();
  for (const seg of listSent(paths)) {
    if (seg.bootId === bootId) {
      if (seg.dueAt > now) continue;
      try {
        unlinkSync(seg.file);
        result.released++;
      } catch {}
      continue;
    }
    const target = join(paths.dir, `${paths.name}.draining-${process.pid}-${now}-${result.requeued}.jsonl`);
    try {
      renameSync(seg.file, target);
    } catch {
      continue;
    }
    try {
      utimesSync(target, 0, 0);
    } catch {}
    result.requeued++;
  }
  return result;
}

function claimFiles(paths: SpoolPaths): string[] {
  const claimed = eligibleClaims(paths).map((claim) => claim.file);
  if (fileSize(paths.file) > 0) {
    const target = join(paths.dir, `${paths.name}.draining-${process.pid}-${Date.now()}.jsonl`);
    withLock(paths.lock, (locked) => {
      if (!locked) return;
      try {
        renameSync(paths.file, target);
        claimed.push(target);
      } catch {}
    });
  }
  return claimed;
}

function requeueLocked(paths: SpoolPaths, leftover: SpoolRecord[]): void {
  if (leftover.length === 0) return;
  const existing = existsSync(paths.file) ? parseLines(readFileSync(paths.file, "utf-8")).records : [];
  rewriteLocked(paths, [...leftover, ...existing]);
}

function requeueUnlocked(paths: SpoolPaths, leftover: SpoolRecord[]): void {
  if (leftover.length === 0) return;
  const target = join(paths.dir, `${paths.name}.draining-${process.pid}-${Date.now()}-requeue.jsonl`);
  const fd = openSync(target, "wx", 0o600);
  try {
    writeSync(fd, serialize(leftover));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    utimesSync(target, 0, 0);
  } catch {}
}

function eligibleClaims(paths: SpoolPaths, now = Date.now()): ClaimFile[] {
  return listClaims(paths).filter((claim) => now - claim.mtimeMs > ORPHAN_CLAIM_MS);
}

export function spoolHasRecords(url: string, dir?: string): boolean {
  const paths = spoolPaths(url, dir);
  return fileSize(paths.file) > 0 || eligibleClaims(paths).length > 0;
}

export function drainInProgress(url: string, dir?: string): boolean {
  const paths = spoolPaths(url, dir);
  try {
    return Date.now() - statSync(paths.drainLock).mtimeMs < DRAIN_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

export async function drainSpool(
  url: string,
  send: (record: SpoolRecord) => Promise<SendOutcome>,
  options: { policy?: SpoolPolicy; dir?: string; maxRecords?: number; deadlineMs?: number } = {},
): Promise<DrainResult> {
  const policy = options.policy ?? spoolPolicy();
  const result: DrainResult = { claimed: 0, delivered: 0, duplicates: 0, rejected: 0, expired: 0, corrupt: 0, unreadable: 0, remaining: 0 };
  const paths = spoolPaths(url, options.dir);
  if (!existsSync(paths.dir)) return { ...result, skipped: "empty" };
  try {
    ensureDir(paths.dir);
  } catch {}
  if (!tryLock(paths.drainLock, DRAIN_LOCK_STALE_MS)) return { ...result, skipped: "locked" };
  try {
    const files = claimFiles(paths);
    if (files.length === 0) return { ...result, skipped: "empty" };
    const records: SpoolRecord[] = [];
    const read: string[] = [];
    for (const file of files) {
      try {
        const parsed = parseLines(readFileSync(file, "utf-8"));
        records.push(...parsed.records);
        result.corrupt += parsed.corrupt;
        read.push(file);
      } catch {
        result.unreadable++;
      }
    }
    result.claimed = records.length;
    const seen = new Set<string>();
    const now = Date.now();
    const deadline = options.deadlineMs ? now + options.deadlineMs : Number.POSITIVE_INFINITY;
    const maxRecords = options.maxRecords ?? Number.POSITIVE_INFINITY;
    const leftover: SpoolRecord[] = [];
    let stopped = false;
    let processed = 0;
    for (const rec of records) {
      if (seen.has(rec.eventId)) {
        result.duplicates++;
        continue;
      }
      seen.add(rec.eventId);
      if (isExpired(rec, policy, now)) {
        result.expired++;
        continue;
      }
      if (stopped || processed >= maxRecords || Date.now() > deadline) {
        leftover.push(rec);
        continue;
      }
      processed++;
      let outcome: SendOutcome;
      try {
        outcome = await send(rec);
      } catch (err) {
        outcome = "retry";
        result.error = err instanceof Error ? err.message : String(err);
      }
      if (outcome === "delivered") result.delivered++;
      else if (outcome === "duplicate") result.duplicates++;
      else if (outcome === "rejected") result.rejected++;
      else {
        stopped = true;
        leftover.push({ ...rec, attempts: (rec.attempts ?? 0) + 1 });
      }
    }
    result.remaining = leftover.length;
    withLock(paths.lock, (locked) => (locked ? requeueLocked(paths, leftover) : requeueUnlocked(paths, leftover)), 2000);
    for (const file of read) {
      try {
        unlinkSync(file);
      } catch {}
    }
    writeStats(paths, (s) => {
      s.delivered += result.delivered;
      s.duplicates += result.duplicates;
      s.rejected += result.rejected;
      s.expired += result.expired;
      s.lastDrainAt = new Date().toISOString();
      s.lastDrainDelivered = result.delivered;
      s.lastDrainDuplicates = result.duplicates;
      s.lastDrainRejected = result.rejected;
      s.lastDrainRemaining = result.remaining;
      s.lastDrainUnreadable = result.unreadable;
      if (result.error) s.lastDrainError = result.error;
      else delete s.lastDrainError;
    });
    return result;
  } finally {
    releaseLock(paths.drainLock);
  }
}

export function spoolSummary(url: string, options: { policy?: SpoolPolicy; dir?: string } = {}): SpoolSummary {
  const policy = options.policy ?? spoolPolicy();
  const paths = spoolPaths(url, options.dir);
  let records = 0;
  let bytes = 0;
  let oldestAt: string | null = null;
  let unreadable = 0;
  const files = [...(existsSync(paths.file) ? [paths.file] : []), ...listClaims(paths).map((claim) => claim.file)];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      if (file !== paths.file) unreadable++;
      continue;
    }
    bytes += Buffer.byteLength(text);
    for (const rec of parseLines(text).records) {
      records++;
      if (!oldestAt || rec.spooledAt < oldestAt) oldestAt = rec.spooledAt;
    }
  }
  let retained = 0;
  let retainedBytes = 0;
  for (const seg of listSent(paths)) {
    try {
      const text = readFileSync(seg.file, "utf-8");
      retainedBytes += Buffer.byteLength(text);
      retained += parseLines(text).records.length;
    } catch {}
  }
  return {
    enabled: policy.enabled,
    path: paths.file,
    records,
    bytes,
    oldestAt,
    retained,
    retainedBytes,
    unreadable,
    maxBytes: policy.maxBytes,
    maxAgeHours: Math.round(policy.maxAgeMs / 3600_000),
    stats: readSpoolStats(paths),
  };
}
