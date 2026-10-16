import { createHash, randomUUID } from "node:crypto";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { IIIClient } from "iii-sdk";
import type { GraphEdge, GraphNode } from "../types.js";
import { safeAudit } from "../functions/audit.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { getGraphGeneration, pinGraphState } from "./graph-generation.js";
import { withKeyedLock } from "./keyed-mutex.js";
import { withoutGraphRecovery } from "./graph-consistency.js";
import {
  GRAPH_INDEX_MAX_ID_BYTES,
  GraphIndexError,
  finishGraphIndexBuild,
  getGraphIndexStatus,
  initializeGraphIndex,
  reconcileGraphIndexRecord,
  recoverGraphIndex,
} from "./graph-retrieval-index.js";

export const GRAPH_INDEX_MIGRATION_KEY = "current";
export const GRAPH_INDEX_MANIFEST_MAX_IDS = 128;
export const GRAPH_INDEX_MANIFEST_MAX_BYTES = 32 * 1024;
const PHASES = ["nodes", "edges", "history"] as const;
type Phase = (typeof PHASES)[number];
const SCOPES = { nodes: KV.graphNodes, edges: KV.graphEdges, history: KV.graphEdgeHistory };
const KINDS = { nodes: "node", edges: "edge", history: "history" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface GraphIndexMigration {
  schema: 1;
  jobId: string;
  buildId: string;
  generation: string | null;
  state: "discovering" | "building" | "paused" | "ready" | "superseded";
  sealed: boolean;
  phase: Phase;
  page: number;
  offset: number;
  processed: number;
  totals: Record<Phase, number>;
  pages: Record<Phase, number>;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface GraphIndexManifestPage {
  schema: 1;
  jobId: string;
  phase: Phase;
  page: number;
  ids: string[];
  checksum: string;
}

export interface GraphIndexMigrationStatus {
  state: GraphIndexMigration["state"] | "needs-migration" | "unavailable";
  ready: boolean;
  coverage: "complete" | "partial" | "unknown";
  generation?: string | null;
  jobId?: string;
  buildId?: string;
  processed?: number;
  total?: number;
  sealed?: boolean;
  phase?: Phase;
  nodes?: number;
  edges?: number;
  historyEdges?: number;
  incompleteRecords?: number;
  error?: string;
  action?: string;
}

export class GraphIndexMigrationError extends Error {
  constructor(public readonly code: "consent-required" | "no-job" | "invalid-state" | "invalid-request", message: string) {
    super(message);
  }
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= GRAPH_INDEX_MAX_ID_BYTES;
}

function readJob(value: unknown): GraphIndexMigration | null {
  if (value === null || value === undefined) return null;
  const job = value as GraphIndexMigration;
  if (!job || typeof job !== "object" || Buffer.byteLength(JSON.stringify(job)) > 8192 || job.schema !== 1 ||
    typeof job.jobId !== "string" || !UUID.test(job.jobId) || typeof job.buildId !== "string" || !UUID.test(job.buildId) ||
    (job.generation !== null && (typeof job.generation !== "string" || !UUID.test(job.generation))) ||
    !["discovering", "building", "paused", "ready", "superseded"].includes(job.state) || typeof job.sealed !== "boolean" ||
    !PHASES.includes(job.phase) || !integer(job.page) || !integer(job.offset) || job.offset > GRAPH_INDEX_MANIFEST_MAX_IDS ||
    !integer(job.processed) || !job.totals || !job.pages ||
    !PHASES.every((phase) => integer(job.totals[phase]) && integer(job.pages[phase])) ||
    !Number.isFinite(Date.parse(job.startedAt)) || !Number.isFinite(Date.parse(job.updatedAt)) ||
    (job.error !== undefined && (typeof job.error !== "string" || job.error.length > 512))) {
    throw new GraphIndexMigrationError("invalid-state", "Graph index migration state is invalid; restore its saved metadata before resuming.");
  }
  const total = PHASES.reduce((sum, phase) => sum + job.totals[phase], 0);
  if (!integer(total) || job.processed > total || (job.sealed && (job.page > job.pages[job.phase] ||
    !PHASES.every((phase) => (job.totals[phase] === 0) === (job.pages[phase] === 0))))) {
    throw new GraphIndexMigrationError("invalid-state", "Graph index migration progress is inconsistent; restore its saved metadata before resuming.");
  }
  return job;
}

function checksum(ids: string[]): string {
  return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

export function graphIndexManifestKey(jobId: string, phase: Phase, page: number): string {
  return `${jobId}:${phase}:${page}`;
}

function readPage(value: unknown, job: GraphIndexMigration): GraphIndexManifestPage {
  const page = value as GraphIndexManifestPage;
  if (!page || page.schema !== 1 || page.jobId !== job.jobId || page.phase !== job.phase || page.page !== job.page ||
    !Array.isArray(page.ids) || page.ids.length === 0 || page.ids.length > GRAPH_INDEX_MANIFEST_MAX_IDS ||
    !page.ids.every(validId) || page.checksum !== checksum(page.ids) ||
    Buffer.byteLength(JSON.stringify(page)) > GRAPH_INDEX_MANIFEST_MAX_BYTES || job.offset > page.ids.length) {
    throw new GraphIndexMigrationError("invalid-state", "Graph index migration manifest is missing or corrupt; restore the manifest before resuming.");
  }
  return page;
}

function errorMessage(error: unknown): string {
  return error instanceof GraphIndexMigrationError || error instanceof GraphIndexError
    ? error.message
    : "Graph index migration stopped after a storage failure. Check the server and resume when storage is available.";
}

export async function getGraphIndexMigrationStatus(kv: StateKV): Promise<GraphIndexMigrationStatus> {
  try {
    const state = await pinGraphState(kv);
    const generation = await getGraphGeneration(state);
    const [control, stored] = await Promise.all([
      getGraphIndexStatus(state), state.get<unknown>(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY),
    ]);
    const job = readJob(stored);
    if ((await kv.get(KV.graphControl, "generation") ?? null) !== generation) {
      return { state: "unavailable", ready: false, coverage: "unknown", action: "Graph generation changed. Read status again." };
    }
    const matching = job?.generation === generation && job?.buildId === control?.buildId ? job : null;
    const blocked = control?.status === "paused" || control?.batchPending || matching?.state === "paused" || Boolean(matching?.error);
    const active = !blocked && (matching?.state === "discovering" || matching?.state === "building");
    const ready = control?.status === "ready" && !control.pending && !blocked;
    const result: GraphIndexMigrationStatus = {
      state: ready ? "ready" : blocked || (control?.pending && !active) ? "paused" : matching?.state ?? "needs-migration",
      ready,
      coverage: ready ? control.incompleteRecords > 0 ? "partial" : "complete" : "unknown",
      generation,
      ...(control ? { buildId: control.buildId, nodes: control.nodes, edges: control.edges, historyEdges: control.historyEdges, incompleteRecords: control.incompleteRecords } : {}),
      ...(matching ? { jobId: matching.jobId, processed: matching.processed, total: PHASES.reduce((sum, phase) => sum + matching.totals[phase], 0), sealed: matching.sealed, phase: matching.phase, ...(matching.error ? { error: matching.error } : {}) } : {}),
    };
    if (!ready && active) result.action = matching?.state === "discovering"
      ? "Discovery may still be in progress. If it was interrupted, run agentmemory graph-index resume --allow-legacy-scan during maintenance."
      : "Migration is in progress. Check graph-index status again for updated progress.";
    else if (!ready) result.action = matching?.sealed && control?.status !== "paused" && !matching.error?.includes("new build")
      ? "Run agentmemory graph-index resume to continue the saved migration."
      : "Run agentmemory graph-index migrate --allow-legacy-scan during maintenance; initial discovery reads complete legacy graph scopes.";
    else if (control.incompleteRecords > 0) result.action = "Some records exceed graph index limits. Canonical data is retained; graph results report partial coverage.";
    return result;
  } catch (error) {
    return { state: "unavailable", ready: false, coverage: "unknown", error: errorMessage(error) };
  }
}

export class GraphIndexMigrationController {
  private running: { jobId: string; generation: string | null; promise: Promise<void> } | null = null;
  private stopped = false;

  constructor(private readonly kv: StateKV) {}

  status(): Promise<GraphIndexMigrationStatus> { return getGraphIndexMigrationStatus(this.kv); }

  start(options: { resume?: boolean; allowLegacyScan?: boolean } = {}): Promise<GraphIndexMigrationStatus> {
    return this.accept(options, true);
  }

  private async accept(options: { resume?: boolean; allowLegacyScan?: boolean }, allowSnapshotRecovery: boolean): Promise<GraphIndexMigrationStatus> {
    if (typeof options !== "object" || options === null ||
      (options.resume !== undefined && typeof options.resume !== "boolean") ||
      (options.allowLegacyScan !== undefined && typeof options.allowLegacyScan !== "boolean")) {
      throw new GraphIndexMigrationError("invalid-request", "resume and allowLegacyScan must be booleans");
    }
    const state = await pinGraphState(this.kv);
    const generation = await getGraphGeneration(state);
    let accepted: GraphIndexMigration | null = null;
    await withKeyedLock("graph:persist", async () => {
      if ((await this.kv.get(KV.graphControl, "generation") ?? null) !== generation) {
        throw new GraphIndexMigrationError("invalid-state", "Graph generation changed. Retry the command.");
      }
      if (this.running?.generation === generation) return;
      let control: Awaited<ReturnType<typeof getGraphIndexStatus>>;
      let replaceCorruptControl = false;
      try { control = await getGraphIndexStatus(state); }
      catch (error) {
        if (!(error instanceof GraphIndexError) || options.resume || !options.allowLegacyScan) throw error;
        control = null; replaceCorruptControl = true;
      }
      let job = readJob(await state.get(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY));
      if (job?.generation !== generation) job = null;
      const unfinishedCheckpoint = job?.buildId === control?.buildId && (job?.state === "paused" || Boolean(job?.error));
      if (control?.status === "ready" && !control.pending && !control.batchPending && !unfinishedCheckpoint) return;
      if (options.resume && !job) throw new GraphIndexMigrationError("no-job", "No graph index migration exists. Run graph-index migrate --allow-legacy-scan first.");
      if (options.resume && job?.sealed && !control) throw new GraphIndexMigrationError("invalid-state", "The sealed build control is missing. Start a new build with graph-index migrate --allow-legacy-scan.");
      if (options.resume && control?.status === "paused") throw new GraphIndexMigrationError("invalid-state", "The index requires a new build. Run graph-index migrate --allow-legacy-scan after fixing the reported data.");
      if (!job || replaceCorruptControl || (!control && job.sealed) || control?.status === "paused" || (control && control.buildId !== job.buildId) ||
        (!options.resume && options.allowLegacyScan && control?.batchPending)) {
        if (options.resume) throw new GraphIndexMigrationError("invalid-state", "The graph index build changed. Start an explicit migration again.");
        if (!options.allowLegacyScan) throw new GraphIndexMigrationError("consent-required", "Initial discovery requires allowLegacyScan: true; complete legacy graph scopes are read during maintenance.");
        const now = new Date().toISOString();
        job = { schema: 1, jobId: randomUUID(), buildId: randomUUID(), generation, state: "discovering", sealed: false,
          phase: "nodes", page: 0, offset: 0, processed: 0, totals: { nodes: 0, edges: 0, history: 0 }, pages: { nodes: 0, edges: 0, history: 0 }, startedAt: now, updatedAt: now };
        await state.set(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY, job);
        await initializeGraphIndex(state, { buildId: job.buildId, status: "building" });
      } else {
        if (!job.sealed && !options.allowLegacyScan) throw new GraphIndexMigrationError("consent-required", "Discovery did not finish. Resume with --allow-legacy-scan to authorize another complete legacy scan.");
        if (!control) {
          // A previous control write may have been lost after other index writes succeeded.
          job = { ...job, buildId: randomUUID() };
          await this.save(state, job);
          await initializeGraphIndex(state, { buildId: job.buildId, status: "building" });
        }
        job = { ...job, state: job.sealed ? "building" : "discovering", error: undefined, updatedAt: new Date().toISOString() };
        await state.set(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY, job);
      }
      accepted = job;
      this.stopped = false;
      const entry = { jobId: job.jobId, generation, promise: Promise.resolve() };
      this.running = entry;
      entry.promise = yieldToEventLoop().then(() => this.run(state, job!, allowSnapshotRecovery)).finally(() => {
        if (this.running === entry) this.running = null;
      });
    });
    if (accepted) void safeAudit(this.kv, "graph_index_migrate", "mem::graph-index-migrate", [], {
      jobId: (accepted as GraphIndexMigration).jobId, resume: options.resume === true, allowLegacyScan: options.allowLegacyScan === true,
    });
    return this.status();
  }

  async resumeOnBoot(): Promise<void> {
    const state = await pinGraphState(this.kv);
    const job = readJob(await state.get(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY));
    if (!job || !job.sealed || job.state === "ready" || job.state === "superseded") return;
    await this.accept({ resume: true }, false);
  }

  async stop(): Promise<void> { this.stopped = true; await this.waitForIdle(); }
  async waitForIdle(): Promise<void> { await this.running?.promise; }

  private async assertActive(state: StateKV, job: GraphIndexMigration): Promise<void> {
    if (this.stopped) throw new GraphIndexMigrationError("invalid-state", "Migration paused during shutdown; resume continues from its saved cursor.");
    if ((await this.kv.get(KV.graphControl, "generation") ?? null) !== job.generation) {
      job.state = "superseded";
      throw new GraphIndexMigrationError("invalid-state", "Migration superseded by a graph reset or replacement.");
    }
    const control = await getGraphIndexStatus(state);
    if (control?.buildId !== job.buildId || control.status === "paused") {
      throw new GraphIndexMigrationError("invalid-state", "Graph index build is unavailable or paused; start an explicit migration after resolving its data error.");
    }
  }

  private async save(state: StateKV, job: GraphIndexMigration): Promise<void> {
    job.updatedAt = new Date().toISOString();
    await state.set(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY, job);
  }

  private async discover(state: StateKV, job: GraphIndexMigration): Promise<void> {
    job.totals = { nodes: 0, edges: 0, history: 0 };
    job.pages = { nodes: 0, edges: 0, history: 0 };
    job.processed = 0; job.page = 0; job.offset = 0;
    for (const phase of PHASES) {
      job.phase = phase;
      await this.assertActive(state, job);
      await this.save(state, job);
      const rows = await state.list<{ id?: unknown }>(SCOPES[phase]);
      await this.assertActive(state, job);
      let ids: string[] = [];
      const flush = async () => {
        if (!ids.length) return;
        const page: GraphIndexManifestPage = { schema: 1, jobId: job.jobId, phase, page: job.pages[phase], ids, checksum: checksum(ids) };
        await state.set(KV.graphIndexManifest, graphIndexManifestKey(job.jobId, phase, page.page), page);
        job.pages[phase]++; job.totals[phase] += ids.length; ids = [];
      };
      for (const row of rows) {
        if (!row || !validId(row.id)) throw new GraphIndexMigrationError("invalid-state", "A legacy graph record has an invalid or oversized ID; repair it before migrating.");
        if (ids.length >= GRAPH_INDEX_MANIFEST_MAX_IDS || Buffer.byteLength(JSON.stringify(ids)) + Buffer.byteLength(JSON.stringify(row.id)) + 256 > GRAPH_INDEX_MANIFEST_MAX_BYTES) {
          await flush(); await this.assertActive(state, job); await yieldToEventLoop();
        }
        ids.push(row.id);
      }
      await flush();
    }
    await withKeyedLock("graph:persist", async () => {
      await this.assertActive(state, job);
      job.sealed = true; job.state = "building"; job.phase = "nodes"; job.page = 0; job.offset = 0;
      await this.save(state, job);
    });
  }

  private async run(state: StateKV, job: GraphIndexMigration, allowSnapshotRecovery: boolean): Promise<void> {
    try {
      if (!job.sealed) await this.discover(state, job);
      await recoverGraphIndex(state, { allowSnapshotRecovery });
      if ((await getGraphIndexStatus(state))?.batchPending) {
        throw new GraphIndexMigrationError("invalid-state", allowSnapshotRecovery
          ? "The legacy graph transaction cannot be recovered. Start a new build with graph-index migrate --allow-legacy-scan."
          : "Legacy graph transaction recovery requires an explicit graph-index resume command.");
      }
      for (const phase of PHASES) {
        if (PHASES.indexOf(phase) < PHASES.indexOf(job.phase)) continue;
        job.phase = phase;
        while (job.page < job.pages[phase]) {
          await this.assertActive(state, job);
          const page = readPage(await state.get(KV.graphIndexManifest, graphIndexManifestKey(job.jobId, phase, job.page)), job);
          while (job.offset < page.ids.length) {
            await withKeyedLock("graph:persist", async () => {
              await this.assertActive(state, job);
              const id = page.ids[job.offset]!;
              if ((await getGraphIndexStatus(state))?.batchPending) {
                throw new GraphIndexMigrationError("invalid-state", "A graph transaction interrupted migration. Run graph-index resume explicitly.");
              }
              const row = await withoutGraphRecovery(() => state.get<GraphNode | GraphEdge>(SCOPES[phase], id));
              if (row !== null && row.id !== id) throw new GraphIndexMigrationError("invalid-state", "A canonical graph record does not match its manifest ID; repair it before resuming.");
              await reconcileGraphIndexRecord(state, KINDS[phase], id, row, { readCanonical: true });
              job.offset++; job.processed++;
              await this.save(state, job);
            });
            await yieldToEventLoop();
          }
          job.page++; job.offset = 0; await this.save(state, job);
        }
        const next = PHASES[PHASES.indexOf(phase) + 1];
        if (next) { job.phase = next; job.page = 0; job.offset = 0; await this.save(state, job); }
      }
      await withKeyedLock("graph:persist", async () => {
        await this.assertActive(state, job);
        if (job.processed !== PHASES.reduce((sum, phase) => sum + job.totals[phase], 0)) throw new GraphIndexMigrationError("invalid-state", "Graph index migration counts do not match its manifest.");
        await finishGraphIndexBuild(state, job.buildId);
        job.state = "ready"; job.error = undefined; await this.save(state, job);
      });
    } catch (error) {
      if (job.state !== "superseded") job.state = "paused";
      job.error = errorMessage(error);
      await this.save(state, job).catch(() => {});
    }
  }
}

export function registerGraphIndexMigrationFunctions(sdk: IIIClient, kv: StateKV): GraphIndexMigrationController {
  const controller = new GraphIndexMigrationController(kv);
  sdk.registerFunction("mem::graph-index-status", () => controller.status());
  const mutate = (resume: boolean) => async (data: { allowLegacyScan?: unknown }) => {
      try {
        if (!data || typeof data !== "object" || (data.allowLegacyScan !== undefined && typeof data.allowLegacyScan !== "boolean")) {
          throw new GraphIndexMigrationError("invalid-request", "allowLegacyScan must be a boolean");
        }
        return { success: true, ...await controller.start({ resume, allowLegacyScan: data.allowLegacyScan as boolean | undefined }) };
      } catch (error) {
        return { success: false, code: error instanceof GraphIndexMigrationError ? error.code : "storage-unavailable", error: errorMessage(error) };
      }
  };
  sdk.registerFunction("mem::graph-index-migrate", mutate(false));
  sdk.registerFunction("mem::graph-index-resume", mutate(true));
  return controller;
}
