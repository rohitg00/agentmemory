import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import {
  MAX_GRAPH_SOURCE_OBSERVATIONS,
  compactGraphProvenance,
  type GraphCompactResult,
  type GraphCompactScope,
} from "./graph.js";
import { safeAudit } from "./audit.js";

export const GRAPH_COMPACT_BOOT_VERSION = 1;
export const GRAPH_COMPACT_BOOT_KEY = `graph-compact-on-boot:v${GRAPH_COMPACT_BOOT_VERSION}`;
export const GRAPH_COMPACT_BOOT_FUNCTION_ID = "mem::graph-compact-on-boot";
export const GRAPH_COMPACT_BOOT_DELAY_MS = 3000;

const SLICED_SCOPES = ["nodes", "edges", "history"] as const;
type SlicedScope = (typeof SLICED_SCOPES)[number];
type BootPhase = SlicedScope | "snapshot";

export interface GraphCompactBootProgress {
  version: number;
  cap: number;
  status: "running" | "done" | "failed";
  phase: BootPhase;
  offset: number;
  phaseTotal: number | null;
  scanned: number;
  trimmed: number;
  idsRemoved: number;
  pending?: GraphCompactBootSlicePlan;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface GraphCompactBootSlicePlan {
  phase: BootPhase;
  offset: number;
  scanned: number;
  trimmed: number;
  idsRemoved: number;
  nextOffset: number | null;
  total: number | null;
}

export type GraphCompactBootState = "off" | "pending" | "running" | "done" | "failed";

export interface GraphCompactBootStatus {
  state: GraphCompactBootState;
  phase?: BootPhase;
  processed?: number;
  total?: number | null;
  scanned?: number;
  trimmed?: number;
  idsRemoved?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface GraphCompactBootOptions {
  sliceSize?: number;
  pauseMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const DEFAULT_SLICE_SIZE = 100;
const DEFAULT_PAUSE_MS = 200;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;

let current: GraphCompactBootStatus = { state: "pending" };
let running: Promise<GraphCompactBootStatus> | null = null;

export function getGraphCompactBootStatus(): GraphCompactBootStatus {
  return { ...current };
}

export function setGraphCompactBootDisabled(): void {
  current = { state: "off" };
}

export function resetGraphCompactBootStatus(): void {
  current = { state: "pending" };
  running = null;
}

function statusFrom(p: GraphCompactBootProgress): GraphCompactBootStatus {
  return {
    state: p.status,
    phase: p.phase,
    processed: p.offset,
    total: p.phaseTotal,
    scanned: p.scanned,
    trimmed: p.trimmed,
    idsRemoved: p.idsRemoved,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    error: p.error,
  };
}

function isResumable(p: GraphCompactBootProgress | null): p is GraphCompactBootProgress {
  return (
    !!p &&
    p.version === GRAPH_COMPACT_BOOT_VERSION &&
    p.cap === MAX_GRAPH_SOURCE_OBSERVATIONS &&
    (p.phase === "snapshot" || (SLICED_SCOPES as readonly string[]).includes(p.phase)) &&
    Number.isInteger(p.offset) &&
    p.offset >= 0
  );
}

function storedPlan(p: GraphCompactBootProgress, phase: BootPhase): GraphCompactBootSlicePlan | null {
  const plan = p.pending;
  if (!plan || plan.phase !== phase || plan.offset !== p.offset) return null;
  const counts = [plan.scanned, plan.trimmed, plan.idsRemoved];
  return counts.every((n) => Number.isInteger(n) && n >= 0) ? plan : null;
}

function scannedOf(scope: SlicedScope, r: GraphCompactResult): [number, number] {
  if (scope === "nodes") return [r.nodesScanned, r.nodesTrimmed];
  if (scope === "edges") return [r.edgesScanned, r.edgesTrimmed];
  return [r.historyScanned, r.historyTrimmed];
}

export function describeGraphCompactBoot(s: GraphCompactBootStatus): string {
  if (s.state === "off") return "off (AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false)";
  if (s.state === "pending") return "pending";
  const where =
    s.phase === "snapshot" || s.total === null || s.total === undefined
      ? `${s.phase ?? "nodes"}`
      : `${s.phase} ${s.processed ?? 0} of ${s.total}`;
  if (s.state === "running") return `running, ${where}`;
  if (s.state === "failed") return `failed at ${where}: ${s.error ?? "unknown error"}`;
  return `done, ${s.trimmed ?? 0} records trimmed, ${s.idsRemoved ?? 0} ids removed`;
}

export function runGraphCompactOnBoot(
  kv: StateKV,
  opts: GraphCompactBootOptions = {},
): Promise<GraphCompactBootStatus> {
  if (running) return running;
  running = runOnce(kv, opts).finally(() => {
    running = null;
  });
  return running;
}

async function runOnce(kv: StateKV, opts: GraphCompactBootOptions): Promise<GraphCompactBootStatus> {
  const sliceSize = opts.sliceSize ?? DEFAULT_SLICE_SIZE;
  const pauseMs = opts.pauseMs ?? DEFAULT_PAUSE_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const log = opts.log ?? (() => {});
  const warn = opts.warn ?? log;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => new Date());

  const attempt = async <T>(fn: () => Promise<T>): Promise<T> => {
    let lastErr: unknown;
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i < maxAttempts) await sleep(retryDelayMs * i);
      }
    }
    throw lastErr;
  };

  let progress: GraphCompactBootProgress | null = null;
  const save = async () => {
    if (!progress) return;
    progress.updatedAt = now().toISOString();
    current = statusFrom(progress);
    await attempt(() => kv.set(KV.config, GRAPH_COMPACT_BOOT_KEY, progress));
  };

  try {
    const stored = await attempt(() => kv.get<GraphCompactBootProgress>(KV.config, GRAPH_COMPACT_BOOT_KEY));
    if (isResumable(stored) && stored.status === "done") {
      current = statusFrom(stored);
      return getGraphCompactBootStatus();
    }
    const startedAt = now().toISOString();
    if (isResumable(stored)) {
      progress = { ...stored, status: "running", error: undefined };
      log(`Graph provenance compaction: resuming in the background at ${progress.phase} ${progress.offset}`);
    } else {
      progress = {
        version: GRAPH_COMPACT_BOOT_VERSION,
        cap: MAX_GRAPH_SOURCE_OBSERVATIONS,
        status: "running",
        phase: "nodes",
        offset: 0,
        phaseTotal: null,
        scanned: 0,
        trimmed: 0,
        idsRemoved: 0,
        startedAt,
        updatedAt: startedAt,
      };
      log(`Graph provenance compaction: started in the background (cap ${MAX_GRAPH_SOURCE_OBSERVATIONS} ids per record)`);
    }
    await save();

    const p = progress;
    for (const scope of SLICED_SCOPES) {
      if (p.phase === "snapshot") break;
      if (SLICED_SCOPES.indexOf(p.phase) > SLICED_SCOPES.indexOf(scope)) continue;
      p.phase = scope;
      let phaseTrimmed = 0;
      let phaseScanned = 0;
      for (;;) {
        const slice = { scope: scope as GraphCompactScope, offset: p.offset, limit: sliceSize };
        let plan = storedPlan(p, scope);
        if (!plan) {
          const r = await attempt(() => compactGraphProvenance(kv, { ...slice, dryRun: true }));
          const [scanned, trimmed] = scannedOf(scope, r);
          plan = {
            phase: scope,
            offset: p.offset,
            scanned,
            trimmed,
            idsRemoved: r.idsRemoved,
            nextOffset: r.nextOffset,
            total: r.total ?? null,
          };
          if (plan.trimmed > 0) {
            p.pending = plan;
            await save();
          }
        }
        if (plan.trimmed > 0) await attempt(() => compactGraphProvenance(kv, slice));
        phaseScanned += plan.scanned;
        phaseTrimmed += plan.trimmed;
        p.scanned += plan.scanned;
        p.trimmed += plan.trimmed;
        p.idsRemoved += plan.idsRemoved;
        p.pending = undefined;
        p.phaseTotal = plan.total;
        p.offset = plan.nextOffset ?? p.phaseTotal ?? p.offset;
        await save();
        if (plan.nextOffset === null) break;
        if (pauseMs > 0) await sleep(pauseMs);
      }
      log(`Graph provenance compaction: ${scope} done (${phaseScanned} checked, ${phaseTrimmed} trimmed)`);
      const next = SLICED_SCOPES[SLICED_SCOPES.indexOf(scope) + 1];
      p.phase = next ?? "snapshot";
      p.offset = 0;
      p.phaseTotal = null;
      await save();
    }

    let snapPlan = storedPlan(p, "snapshot");
    if (!snapPlan) {
      const dry = await attempt(() => compactGraphProvenance(kv, { scope: "snapshot", dryRun: true }));
      snapPlan = {
        phase: "snapshot",
        offset: p.offset,
        scanned: 0,
        trimmed: dry.snapshotTrimmed ? 1 : 0,
        idsRemoved: 0,
        nextOffset: null,
        total: null,
      };
      if (snapPlan.trimmed > 0) {
        p.pending = snapPlan;
        await save();
      }
    }
    if (snapPlan.trimmed > 0) await attempt(() => compactGraphProvenance(kv, { scope: "snapshot" }));
    const snapshotTrimmed = snapPlan.trimmed > 0;
    p.trimmed += snapPlan.trimmed;
    p.pending = undefined;
    p.status = "done";
    p.completedAt = now().toISOString();
    await save();
    if (p.idsRemoved > 0) {
      await safeAudit(kv, "graph_compact", GRAPH_COMPACT_BOOT_FUNCTION_ID, [], {
        trigger: "boot",
        recordsTrimmed: p.trimmed,
        idsRemoved: p.idsRemoved,
        snapshotTrimmed,
      });
    }
    log(
      `Graph provenance compaction: done (${p.scanned} records checked, ${p.trimmed} trimmed, ${p.idsRemoved} ids removed)`,
    );
    return getGraphCompactBootStatus();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (progress) {
      progress.status = "failed";
      progress.error = msg;
      current = statusFrom(progress);
      try {
        await kv.set(KV.config, GRAPH_COMPACT_BOOT_KEY, { ...progress, updatedAt: now().toISOString() });
      } catch {}
    } else {
      current = { state: "failed", error: msg };
    }
    warn(
      `Graph provenance compaction failed (${describeGraphCompactBoot(current)}). It resumes on the next start; to run it now, POST /agentmemory/graph/compact.`,
    );
    return getGraphCompactBootStatus();
  }
}
