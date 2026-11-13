import { pinGraphState } from "../state/graph-generation.js";
import { persistGraphRecords, validateGraphRecords } from "../state/graph-ingestion.js";
import { MAX_IMPORT_OBS_PER_SESSION } from "../config.js";
import type { IIIClient } from "iii-sdk";
import { markCaptureEventDeleted } from "../capture/event-record.js";
import type {
  Session,
  CompressedObservation,
  Memory,
  SessionSummary,
  ProjectProfile,
  ExportData,
  Action,
  ActionEdge,
  Routine,
  Signal,
  Checkpoint,
  Sentinel,
  Sketch,
  Crystal,
  Facet,
  Lesson,
  Insight,
  AccessLogExport,
  MemoryRelation,
  RelationExport,
} from "../types.js";
import { importOrigin } from "../types.js";
import { normalizeAccessLog } from "./access-tracker.js";
import { memoryImagePaths, observationImagePaths, withImageRefBatch, type ImageRefReservation } from "./image-refs.js";
import { KV, fingerprintId, UNSESSIONED_OBSERVATION_SCOPE } from "../state/schema.js";
import { checkPayloadFrameSize, oversizedPayloadError, payloadByteLength, SAFE_PAYLOAD_BYTES } from "../state/frame-guard.js";
import { StateKV, collectAll } from "../state/kv.js";
import {
  addSessionToProjectIndex,
  removeSessionFromProjectIndex,
} from "../state/session-index.js";
import {
  indexObservationSession,
  unindexObservationSession,
} from "../state/obs-index.js";
import { withKeyedLock, withKeyedLocks } from "../state/keyed-mutex.js";
import { VERSION } from "../version.js";
import { recordAudit } from "./audit.js";
import {
  indexRecords,
  getSearchIndex,
  vectorIndexRemove,
  flushIndexSave,
} from "./search.js";
import { resetLessonIndex } from "./lessons.js";
import { logger } from "../logger.js";
import { budgetImportedObservationSources } from "./observation-source-budget.js";

// Bounded-concurrency chunk size for the import delete/write loops. A
// "replace" or "merge" of a large export (up to MAX_TOTAL_OBSERVATIONS,
// ~500k) would otherwise issue hundreds of thousands of sequential state
// round-trips and blow the 180s function timeout, leaving partial state.
// 20 keeps per-chunk fan-out low enough not to overwhelm the state
// backend while collapsing wallclock by ~20x versus the serial path.
const IMPORT_CHUNK_SIZE = 20;

// Run `fn` over `items` in fixed-size chunks, awaiting each chunk before
// starting the next. Preserves ordering guarantees across chunks (chunk N
// fully settles before chunk N+1 begins) while parallelizing within a
// chunk. Settle sibling writes before propagating a failure so mutation
// locks are not released while state writes are still pending.
async function runChunked<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = items.slice(i, i + IMPORT_CHUNK_SIZE);
    const results = await Promise.allSettled(chunk.map(fn));
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}

const EXPORT_OVERSIZE_HINT =
  "narrow the range with ?maxSessions / ?offset, page the rest with ?collectionLimit / ?collectionOffset, or ask for a subset with ?collections=";

const EXPORT_COLLECTIONS: ReadonlyArray<readonly [keyof ExportData, string]> = [
  ["graphNodes", KV.graphNodes],
  ["graphEdges", KV.graphEdges],
  ["semanticMemories", KV.semantic],
  ["proceduralMemories", KV.procedural],
  ["actions", KV.actions],
  ["actionEdges", KV.actionEdges],
  ["sentinels", KV.sentinels],
  ["sketches", KV.sketches],
  ["crystals", KV.crystals],
  ["facets", KV.facets],
  ["lessons", KV.lessons],
  ["insights", KV.insights],
  ["routines", KV.routines],
  ["signals", KV.signals],
  ["checkpoints", KV.checkpoints],
  ["accessLogs", KV.accessLog],
  ["relations", KV.relations],
];

const EXPORT_COLLECTION_NAMES: ReadonlySet<string> = new Set([
  "sessions",
  "memories",
  "summaries",
  ...EXPORT_COLLECTIONS.map(([field]) => field),
]);

function parseCollections(raw: unknown): ReadonlySet<string> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const names = Array.isArray(raw) ? raw : String(raw).split(",");
  return new Set(
    names
      .map((name) => String(name).trim())
      .filter((name) => EXPORT_COLLECTION_NAMES.has(name)),
  );
}

async function collectRelationsWithKeys(kv: StateKV): Promise<RelationExport[]> {
  const keys = await kv.listKeys(KV.relations);
  const rows: Array<RelationExport | null> = new Array(keys.length).fill(null);
  await runChunked(
    keys.map((key, index) => ({ key, index })),
    async ({ key, index }) => {
      const rel = await kv.get<MemoryRelation>(KV.relations, key);
      if (rel) rows[index] = { ...rel, storageKey: key };
    },
  );
  return rows.filter((row): row is RelationExport => row !== null);
}

export class ExportBudget {
  bytes = 0;

  constructor(private readonly limit = SAFE_PAYLOAD_BYTES) {}

  fits(items: readonly unknown[], key = ""): boolean {
    this.bytes += key.length + 6;
    for (const item of items) {
      this.bytes += payloadByteLength(item) + 1;
      if (this.bytes > this.limit) return false;
    }
    return this.bytes <= this.limit;
  }
}

export function registerExportImportFunction(sdk: IIIClient, state: StateKV): void {
  sdk.registerFunction("mem::export",
    async (data?: {
      maxSessions?: number;
      offset?: number;
      collectionLimit?: number;
      collectionOffset?: number;
      collections?: string[] | string;
    }) => {
      const kv = await pinGraphState(state);
      const rawMax = Number(data?.maxSessions);
      const maxSessions = Number.isFinite(rawMax) && rawMax > 0 ? Math.min(Math.floor(rawMax), 1000) : undefined;
      const rawOffset = Number(data?.offset);
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
      const rawCollectionLimit = Number(data?.collectionLimit);
      const collectionLimit =
        Number.isFinite(rawCollectionLimit) && rawCollectionLimit > 0
          ? Math.floor(rawCollectionLimit)
          : undefined;
      const rawCollectionOffset = Number(data?.collectionOffset);
      const collectionOffset =
        Number.isFinite(rawCollectionOffset) && rawCollectionOffset >= 0
          ? Math.floor(rawCollectionOffset)
          : 0;

      const selection = parseCollections(data?.collections);
      const isSelected = (name: string): boolean =>
        selection === undefined || selection.has(name);

      const collectionTotals: Record<string, number> = {};
      const sliceCollection = <T>(name: string, rows: T[]): T[] => {
        collectionTotals[name] = rows.length;
        if (!isSelected(name)) return [];
        if (collectionLimit === undefined) return rows;
        return rows.slice(collectionOffset, collectionOffset + collectionLimit);
      };

      const budget = new ExportBudget();
      const refuse = (collection: string) => {
        logger.warn("Export exceeds transport message limit", {
          bytesSoFar: budget.bytes,
          collection,
        });
        return {
          ...oversizedPayloadError(budget.bytes, EXPORT_OVERSIZE_HINT),
          stoppedAt: collection,
        };
      };
      const allSessions = await kv.list<Session>(KV.sessions);
      const sessionWindow = maxSessions !== undefined
        ? allSessions.slice(offset, offset + maxSessions)
        : allSessions;
      const paginatedSessions = isSelected("sessions") ? sessionWindow : [];
      if (!budget.fits(paginatedSessions)) return refuse("sessions");

      const memories = sliceCollection("memories", await collectAll<Memory>(kv, KV.memories));
      if (!budget.fits(memories)) return refuse("memories");

      const summaries = sliceCollection(
        "summaries",
        await kv.list<SessionSummary>(KV.summaries),
      );
      if (!budget.fits(summaries)) return refuse("summaries");

      const observations: Record<string, CompressedObservation[]> = {};
      for (const session of paginatedSessions) {
        const obs = await collectAll<CompressedObservation>(kv, KV.observations(session.id));
        if (obs.length === 0) continue;
        if (!budget.fits(obs, session.id)) return refuse("observations");
        observations[session.id] = obs;
      }
      if (isSelected("sessions")) {
        const migrated = await collectAll<CompressedObservation>(
          kv,
          KV.observations(UNSESSIONED_OBSERVATION_SCOPE),
        );
        if (migrated.length > 0) {
          if (!budget.fits(migrated, UNSESSIONED_OBSERVATION_SCOPE)) {
            return refuse("observations");
          }
          observations[UNSESSIONED_OBSERVATION_SCOPE] = migrated;
        }
      }

      const profiles: ProjectProfile[] = [];
      const uniqueProjects = [...new Set(paginatedSessions.map((s) => s.project))];
      const profileResults = await Promise.all(
        uniqueProjects.map((project) =>
          kv.get<ProjectProfile>(KV.profiles, project).catch(() => null),
        ),
      );
      for (const profile of profileResults) {
        if (profile) profiles.push(profile);
      }
      if (!budget.fits(profiles)) return refuse("profiles");

      const partial = collectionLimit !== undefined || selection !== undefined;
      const exportedMemoryIds = new Set(memories.map((m) => m.id));
      const accessLogsFor = (rows: AccessLogExport[]): AccessLogExport[] => {
        collectionTotals["accessLogs"] = rows.length;
        if (!isSelected("accessLogs")) return [];
        return rows.filter((row) => exportedMemoryIds.has(row.memoryId));
      };
      const collections: Partial<ExportData> = {};
      for (const [field, scope] of EXPORT_COLLECTIONS) {
        const rows =
          field === "relations"
            ? await collectRelationsWithKeys(kv)
            : await collectAll<unknown>(kv, scope);
        const items =
          field === "accessLogs" && partial
            ? accessLogsFor(rows as AccessLogExport[])
            : sliceCollection(field, rows);
        if (items.length === 0) continue;
        if (!budget.fits(items, field)) return refuse(field);
        (collections as Record<string, unknown>)[field] = items;
      }

      const exportData: ExportData = {
        version: VERSION,
        exportedAt: new Date().toISOString(),
        sessions: paginatedSessions,
        observations,
        memories,
        summaries,
        profiles: profiles.length > 0 ? profiles : undefined,
        ...collections,
      };

      if (maxSessions !== undefined) {
        exportData.pagination = {
          offset,
          limit: maxSessions,
          total: allSessions.length,
          hasMore: offset + maxSessions < allSessions.length,
        };
      }

      if (partial) {
        exportData.collectionPagination = {
          offset: collectionOffset,
          ...(collectionLimit !== undefined ? { limit: collectionLimit } : {}),
          ...(selection !== undefined ? { collections: [...selection] } : {}),
          totals: collectionTotals,
          hasMore:
            collectionLimit !== undefined &&
            Object.entries(collectionTotals).some(
              ([name, total]) =>
                name !== "accessLogs" &&
                isSelected(name) &&
                collectionOffset + collectionLimit < total,
            ),
        };
      }

      const oversized = checkPayloadFrameSize(exportData, EXPORT_OVERSIZE_HINT);
      if (oversized) {
        logger.warn("Export exceeds transport message limit", {
          bytes: oversized.bytes,
        });
        return oversized;
      }

      const totalObs = Object.values(observations).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );
      logger.info("Export complete", {
        sessions: paginatedSessions.length,
        totalSessions: allSessions.length,
        observations: totalObs,
        memories: memories.length,
        summaries: summaries.length,
        collections: selection && [...selection],
      });

      return exportData;
    },
  );

  sdk.registerFunction("mem::import", 
    async (data: {
      exportData: ExportData;
      strategy?: "merge" | "replace" | "skip";
    }) => {
      const kv = await pinGraphState(state);
      if (
        !data?.exportData ||
        typeof data.exportData !== "object" ||
        typeof (data.exportData as { version?: unknown }).version !== "string"
      ) {
        return { success: false, error: "exportData with string version is required" };
      }
      const strategy = data.strategy || "merge";
      const importData = data.exportData;

      const supportedVersions = new Set(["0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.6.1", "0.7.0", "0.7.2", "0.7.3", "0.7.4", "0.7.5", "0.7.6", "0.7.7", "0.7.9", "0.8.0", "0.8.1", "0.8.2", "0.8.3", "0.8.4", "0.8.5", "0.8.6", "0.8.7", "0.8.8", "0.8.9", "0.8.10", "0.8.11", "0.8.12", "0.8.13", "0.9.0", "0.9.1", "0.9.2", "0.9.3", "0.9.4", "0.9.5", "0.9.6", "0.9.7", "0.9.8", "0.9.9", "0.9.10", "0.9.11", "0.9.12", "0.9.13", "0.9.14", "0.9.15", "0.9.16", "0.9.17", "0.9.18", "0.9.19", "0.9.20", "0.9.21", "0.9.22", "0.9.23", "0.9.24", "0.9.25", "0.9.26", "0.9.27", "0.9.28", "0.9.29", "0.9.30", "0.9.31", "0.9.32", "0.9.33"]);
      if (!supportedVersions.has(importData.version)) {
        return {
          success: false,
          error: `Unsupported export version: ${importData.version}`,
        };
      }
      const sessionPage = importData.pagination;
      const partialSessions =
        sessionPage !== undefined &&
        ((sessionPage.offset ?? 0) > 0 || sessionPage.hasMore === true);
      if (strategy === "replace" && (importData.collectionPagination || partialSessions)) {
        return {
          success: false,
          error:
            "replace needs a complete export; this one is a page or a selection of collections",
        };
      }

      const MAX_SESSIONS = 10_000;
      const MAX_MEMORIES = 50_000;
      const MAX_SUMMARIES = 10_000;
      const MAX_TOTAL_OBSERVATIONS = 500_000;
      const MAX_ACCESS_LOGS = 50_000;

      if (!Array.isArray(importData.sessions)) {
        return { success: false, error: "sessions must be an array" };
      }
      if (!Array.isArray(importData.memories)) {
        return { success: false, error: "memories must be an array" };
      }
      if (!Array.isArray(importData.summaries)) {
        return { success: false, error: "summaries must be an array" };
      }
      if (
        typeof importData.observations !== "object" ||
        importData.observations === null ||
        Array.isArray(importData.observations)
      ) {
        return { success: false, error: "observations must be an object" };
      }

      if (importData.sessions.length > MAX_SESSIONS) {
        return {
          success: false,
          error: `Too many sessions (max ${MAX_SESSIONS})`,
        };
      }
      if (importData.memories.length > MAX_MEMORIES) {
        return {
          success: false,
          error: `Too many memories (max ${MAX_MEMORIES})`,
        };
      }
      if (importData.summaries.length > MAX_SUMMARIES) {
        return {
          success: false,
          error: `Too many summaries (max ${MAX_SUMMARIES})`,
        };
      }
      const MAX_OBS_BUCKETS = 10_000;
      const obsBuckets = Object.keys(importData.observations);
      if (obsBuckets.length > MAX_OBS_BUCKETS) {
        return {
          success: false,
          error: `Too many observation buckets (max ${MAX_OBS_BUCKETS})`,
        };
      }

      let totalObservations = 0;
      for (const [sessionId, obs] of Object.entries(importData.observations)) {
        if (!Array.isArray(obs)) {
          return { success: false, error: "observation values must be arrays" };
        }
        if (sessionId !== UNSESSIONED_OBSERVATION_SCOPE && obs.length > MAX_IMPORT_OBS_PER_SESSION) {
          return {
            success: false,
            error:
              `Too many observations in session ${sessionId}: ${obs.length} ` +
              `(max ${MAX_IMPORT_OBS_PER_SESSION}). MAX_OBS_PER_SESSION may be ` +
              `configured above this import ceiling; lower it to at most ` +
              `${MAX_IMPORT_OBS_PER_SESSION} or split the session before exporting.`,
          };
        }
        totalObservations += obs.length;
      }
      if (totalObservations > MAX_TOTAL_OBSERVATIONS) {
        return {
          success: false,
          error: `Too many total observations (max ${MAX_TOTAL_OBSERVATIONS})`,
        };
      }
      try {
        validateGraphRecords(importData.graphNodes ?? [], importData.graphEdges ?? []);
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
      const badRow = (rows: readonly unknown[], key: string) =>
        rows.findIndex((row) => {
          const id = row && typeof row === "object" ? (row as Record<string, unknown>)[key] : undefined;
          return typeof id !== "string" || id.length === 0;
        });
      for (const [sessionId, obs] of Object.entries(importData.observations)) {
        const index = badRow(obs, "id");
        if (index >= 0) {
          return { success: false, error: `observations.${sessionId}[${index}] must be an object with a string id` };
        }
        const seenObs = new Set<string>();
        const duplicate = obs.findIndex((o) => seenObs.has(o.id) || !seenObs.add(o.id));
        if (duplicate >= 0) {
          return { success: false, error: `observations.${sessionId}[${duplicate}] has a duplicate id` };
        }
      }
      const rowKeys: Record<string, string> = { summaries: "sessionId", profiles: "project", accessLogs: "memoryId" };
      for (const section of ["sessions", "memories", "summaries", "profiles", ...EXPORT_COLLECTIONS.map(([field]) => field)] as const) {
        const rows = importData[section];
        if (rows !== undefined && !Array.isArray(rows)) {
          return { success: false, error: `${section} must be an array` };
        }
        if (section === "relations") {
          const index = (importData.relations ?? []).findIndex(
            (rel) =>
              !rel || typeof rel !== "object" ||
              [rel.sourceId, rel.targetId, rel.type].some(
                (v) => typeof v !== "string" || v.length === 0,
              ) ||
              (rel.storageKey !== undefined &&
                (typeof rel.storageKey !== "string" || rel.storageKey.length === 0)),
          );
          if (index >= 0) {
            return { success: false, error: `relations[${index}] must be an object with string sourceId, targetId, and type` };
          }
          const seenKeys = new Set<string>();
          const duplicateIndex = (importData.relations ?? []).findIndex(
            (rel) =>
              rel.storageKey !== undefined &&
              (seenKeys.has(rel.storageKey) || !seenKeys.add(rel.storageKey)),
          );
          if (duplicateIndex >= 0) {
            return { success: false, error: `relations[${duplicateIndex}] has a duplicate storageKey` };
          }
          continue;
        }
        const key = rowKeys[section] ?? "id";
        const index = badRow(rows ?? [], key);
        if (index >= 0) {
          return { success: false, error: `${section}[${index}] must be an object with a string ${key}` };
        }
      }
      const seenMemories = new Set<string>();
      const duplicateMemory = importData.memories.findIndex(
        (m) => seenMemories.has(m.id) || !seenMemories.add(m.id),
      );
      if (duplicateMemory >= 0) {
        return { success: false, error: `memories[${duplicateMemory}] has a duplicate id` };
      }
      if ((importData.accessLogs?.length ?? 0) > MAX_ACCESS_LOGS) {
        return {
          success: false,
          error: `Too many access logs (max ${MAX_ACCESS_LOGS})`,
        };
      }

      const stats = {
        sessions: 0,
        observations: 0,
        memories: 0,
        summaries: 0,
        skipped: 0,
        sourceTruncated: 0,
        sourceOmitted: 0,
      };

      const replaceSessions = strategy === "replace" ? await kv.list<Session>(KV.sessions) : [];
      const sessionKeys = [...obsBuckets, ...importData.sessions.map((session) => session.id),
        ...importData.summaries.map((summary) => summary.sessionId), ...replaceSessions.map((session) => session.id),
        ...(strategy === "replace" ? [UNSESSIONED_OBSERVATION_SCOPE] : [])]
        .map((id) => `obs:${id}`);
      const indexObs: CompressedObservation[] = [];
      const indexMems: Memory[] = [];
      const importError = await withImageRefBatch(kv, sdk, async (batch) => {
        const memoryRows: Array<{ row: Memory; token: ImageRefReservation }> = [];
        const preflightError = await withKeyedLocks(sessionKeys, async () => {
          const plannedObservations = new Map<string, CompressedObservation[]>();
          for (const [sessionId, observations] of Object.entries(importData.observations)) {
            const existing = strategy === "replace" ? [] : await kv.list<CompressedObservation>(KV.observations(sessionId));
            const planned = budgetImportedObservationSources(observations.map((row) => ({
              ...row, origin: importOrigin(row.origin, row.timestamp),
            })), existing, strategy);
            if (!planned.success) return planned;
            plannedObservations.set(sessionId, planned.observations);
            stats.sourceTruncated += planned.sourceTruncated;
            stats.sourceOmitted += planned.sourceOmitted;
          }

          const deleteScan = {
            sessionDeletes: [] as Session[],
            obsDeletes: [] as Array<{ sessionId: string; obsId: string; captureKey?: string; imagePaths: string[] }>,
            memories: [] as Memory[],
            summaries: [] as SessionSummary[],
            actions: [] as Action[],
            actionEdges: [] as ActionEdge[],
            routines: [] as Routine[],
            signals: [] as Signal[],
            checkpoints: [] as Checkpoint[],
            sentinels: [] as Sentinel[],
            sketches: [] as Sketch[],
            crystals: [] as Crystal[],
            facets: [] as Facet[],
            lessons: [] as Lesson[],
            insights: [] as Insight[],
            semanticRows: [] as Array<{ id: string }>,
            proceduralRows: [] as Array<{ id: string }>,
            profiles: [] as ProjectProfile[],
            accessLogs: [] as AccessLogExport[],
            relationKeys: [] as string[],
          };
          if (strategy === "replace") {
            const obsBySession: Array<{ session: Session; obs: CompressedObservation[] }> = [];
            for (let i = 0; i < replaceSessions.length; i += IMPORT_CHUNK_SIZE) {
              const chunk = replaceSessions.slice(i, i + IMPORT_CHUNK_SIZE);
              obsBySession.push(...(await Promise.all(chunk.map(async (session) => ({
                session,
                obs: await collectAll<CompressedObservation>(kv, KV.observations(session.id)),
              })))));
            }
            const sessionlessObs = await collectAll<CompressedObservation>(
              kv,
              KV.observations(UNSESSIONED_OBSERVATION_SCOPE),
            );
            deleteScan.sessionDeletes = obsBySession.map((entry) => entry.session);
            deleteScan.obsDeletes = [
              ...sessionlessObs.map((o) => ({ sessionId: UNSESSIONED_OBSERVATION_SCOPE, obsId: o.id, captureKey: o.captureKey, imagePaths: observationImagePaths(o) })),
              ...obsBySession.flatMap(({ session, obs }) =>
                obs.map((o) => ({ sessionId: session.id, obsId: o.id, captureKey: o.captureKey, imagePaths: observationImagePaths(o) }))),
            ];
            deleteScan.memories = await collectAll<Memory>(kv, KV.memories);
            deleteScan.summaries = await kv.list<SessionSummary>(KV.summaries);
            deleteScan.actions = await kv.list<Action>(KV.actions);
            deleteScan.actionEdges = await kv.list<ActionEdge>(KV.actionEdges);
            deleteScan.routines = await kv.list<Routine>(KV.routines);
            deleteScan.signals = await kv.list<Signal>(KV.signals);
            deleteScan.checkpoints = await kv.list<Checkpoint>(KV.checkpoints);
            deleteScan.sentinels = await kv.list<Sentinel>(KV.sentinels);
            deleteScan.sketches = await kv.list<Sketch>(KV.sketches);
            deleteScan.crystals = await kv.list<Crystal>(KV.crystals);
            deleteScan.facets = await kv.list<Facet>(KV.facets);
            deleteScan.lessons = await kv.list<Lesson>(KV.lessons);
            deleteScan.insights = await collectAll<Insight>(kv, KV.insights);
            deleteScan.semanticRows = await collectAll<{ id: string }>(kv, KV.semantic);
            deleteScan.proceduralRows = await collectAll<{ id: string }>(kv, KV.procedural);
            deleteScan.profiles = await kv.list<ProjectProfile>(KV.profiles);
            deleteScan.accessLogs = await kv.list<AccessLogExport>(KV.accessLog);
            deleteScan.relationKeys = await kv.listKeys(KV.relations);
          }

          const plannedRows = new Map<string, Array<{ row: CompressedObservation; token: ImageRefReservation }>>();
          for (const [sessionId, rows] of plannedObservations) {
            const tokens = await batch.reserveAll(rows.map(observationImagePaths));
            plannedRows.set(
              sessionId,
              rows.map((row, i) => ({ row, token: tokens[i] })),
            );
          }
          const memoryTokens = await batch.reserveAll(importData.memories.map(memoryImagePaths));
          for (let i = 0; i < importData.memories.length; i++) {
            memoryRows.push({ row: importData.memories[i], token: memoryTokens[i] });
          }

          if (strategy === "replace") {
            await runChunked(deleteScan.sessionDeletes, async (session) => {
              await kv.delete(KV.sessions, session.id);
              await kv.delete(KV.summaryRepairs, session.id);
              await removeSessionFromProjectIndex(
                kv,
                session.project,
                session.id,
              ).catch(() => {});
            });
            const obsDeletes = deleteScan.obsDeletes;
            await runChunked(obsDeletes, async (d) => {
              await markCaptureEventDeleted(kv, { id: d.obsId, sessionId: d.sessionId, captureKey: d.captureKey });
              await kv.delete(KV.observations(d.sessionId), d.obsId);
              batch.deleted(d.imagePaths);
              await unindexObservationSession(kv, d.obsId).catch(() => {});
              getSearchIndex().remove(d.obsId);
              vectorIndexRemove(d.obsId);
            });
            await runChunked(deleteScan.memories, async (m) => {
              await kv.delete(KV.memories, m.id);
              batch.deleted(memoryImagePaths(m));
              getSearchIndex().remove(m.id);
              vectorIndexRemove(m.id);
            });
            await flushIndexSave();
            await runChunked(deleteScan.summaries, (s) => kv.delete(KV.summaries, s.sessionId));
            await runChunked(deleteScan.actions, (a) =>
              kv.delete(KV.actions, a.id),
            );
            await runChunked(deleteScan.actionEdges, (e) =>
              kv.delete(KV.actionEdges, e.id),
            );
            await runChunked(deleteScan.routines, (r) =>
              kv.delete(KV.routines, r.id),
            );
            await runChunked(deleteScan.signals, (s) =>
              kv.delete(KV.signals, s.id),
            );
            await runChunked(deleteScan.checkpoints, (c) =>
              kv.delete(KV.checkpoints, c.id),
            );
            await runChunked(deleteScan.sentinels, (s) =>
              kv.delete(KV.sentinels, s.id),
            );
            await runChunked(deleteScan.sketches, (s) =>
              kv.delete(KV.sketches, s.id),
            );
            await runChunked(deleteScan.crystals, (c) =>
              kv.delete(KV.crystals, c.id),
            );
            await runChunked(deleteScan.facets, (f) =>
              kv.delete(KV.facets, f.id),
            );
            await runChunked(deleteScan.lessons, (l) =>
              kv.delete(KV.lessons, l.id),
            );
            resetLessonIndex();
            await runChunked(deleteScan.insights, (i) =>
              kv.delete(KV.insights, i.id),
            );
            await runChunked(deleteScan.semanticRows, (s) =>
              kv.delete(KV.semantic, s.id),
            );
            await runChunked(deleteScan.proceduralRows, (p) =>
              kv.delete(KV.procedural, p.id),
            );
            await runChunked(deleteScan.profiles, (profile) =>
              kv.delete(KV.profiles, profile.project),
            );
            await runChunked(deleteScan.accessLogs, (a) =>
              kv.delete(KV.accessLog, a.memoryId),
            );
            await runChunked(deleteScan.relationKeys, (key) =>
              kv.delete(KV.relations, key),
            );
          }

          await runChunked(importData.sessions, async (session) => {
            if (strategy === "skip") {
              const existing = await kv.get<Session>(KV.sessions, session.id).catch(() => null);
              if (existing) {
                stats.skipped++;
                return;
              }
            }
            await kv.set(KV.sessions, session.id, session);
            stats.sessions++;
            await addSessionToProjectIndex(kv, session.project, {
              id: session.id,
              startedAt: session.startedAt,
              ...(session.agentId ? { agentId: session.agentId } : {}),
            }).catch(() => {});
          });

          for (const [sessionId, rows] of plannedRows) {
            await runChunked(rows, async ({ row: o, token }) => {
              if (strategy === "skip") {
                const existing = await kv.get<CompressedObservation>(KV.observations(sessionId), o.id);
                if (existing) {
                  stats.skipped++;
                  return;
                }
              }
              const previous = strategy === "merge"
                ? await kv.get<CompressedObservation>(KV.observations(sessionId), o.id)
                : null;
              await kv.set(KV.observations(sessionId), o.id, o);
              batch.written(token, observationImagePaths(previous));
              await indexObservationSession(kv, o.id, sessionId).catch(() => {});
              stats.observations++;
              indexObs.push(o);
            });
          }

          await runChunked(importData.summaries, async (summary) => {
            if (strategy === "skip") {
              const existing = await kv
                .get<SessionSummary>(KV.summaries, summary.sessionId)
                .catch(() => null);
              if (existing) {
                stats.skipped++;
                return;
              }
            }
            await kv.set(KV.summaries, summary.sessionId, summary);
            stats.summaries++;
          });

          return null;
        });
        if (preflightError) return preflightError;

        await runChunked(memoryRows, async ({ row: memory, token }) => {
          await withKeyedLock(`mem:${memory.id}`, async () => {
            if (strategy === "skip") {
              const existing = await kv.get<Memory>(KV.memories, memory.id);
              if (existing) {
                stats.skipped++;
                return;
              }
            }
            // Older exports + hand-edited dumps can omit this field.
            if (!Array.isArray(memory.sessionIds)) {
              memory.sessionIds = [];
            }
            memory.origin = importOrigin(memory.origin, memory.createdAt);
            const previous = strategy === "merge"
              ? await kv.get<Memory>(KV.memories, memory.id)
              : null;
            await kv.set(KV.memories, memory.id, memory);
            batch.written(token, memoryImagePaths(previous));
            stats.memories++;
            indexMems.push(memory);
          });
        });

        return null;
      });
      if (importError) return importError;

      if (strategy === "replace" || importData.graphNodes || importData.graphEdges) {
        const graph = await persistGraphRecords(kv, importData.graphNodes ?? [], importData.graphEdges ?? [], {
          mode: strategy === "skip" ? "skip" : "merge",
          replace: strategy === "replace",
        });
        stats.skipped += graph.nodesSkipped + graph.edgesSkipped;
      }
      if (importData.semanticMemories) {
        await runChunked(importData.semanticMemories, async (sem) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.semantic, sem.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.semantic, sem.id, sem);
        });
      }
      if (importData.proceduralMemories) {
        await runChunked(importData.proceduralMemories, async (proc) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.procedural, proc.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.procedural, proc.id, proc);
        });
      }
      if (importData.profiles) {
        await runChunked(importData.profiles, async (profile) => {
          if (strategy === "skip") {
            const existing = await kv
              .get<ProjectProfile>(KV.profiles, profile.project)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              return;
            }
          }
          await kv.set(KV.profiles, profile.project, profile);
        });
      }

      if (importData.actions) {
        await runChunked(importData.actions, async (action) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.actions, action.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.actions, action.id, action);
        });
      }
      if (importData.actionEdges) {
        await runChunked(importData.actionEdges, async (edge) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.actionEdges, edge.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.actionEdges, edge.id, edge);
        });
      }
      if (importData.routines) {
        await runChunked(importData.routines, async (routine) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.routines, routine.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.routines, routine.id, routine);
        });
      }
      if (importData.signals) {
        await runChunked(importData.signals, async (signal) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.signals, signal.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.signals, signal.id, signal);
        });
      }
      if (importData.checkpoints) {
        await runChunked(importData.checkpoints, async (checkpoint) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.checkpoints, checkpoint.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.checkpoints, checkpoint.id, checkpoint);
        });
      }
      if (importData.sentinels) {
        await runChunked(importData.sentinels, async (sentinel) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.sentinels, sentinel.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.sentinels, sentinel.id, sentinel);
        });
      }
      if (importData.sketches) {
        await runChunked(importData.sketches, async (sketch) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.sketches, sketch.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.sketches, sketch.id, sketch);
        });
      }
      if (importData.crystals) {
        await runChunked(importData.crystals, async (crystal) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.crystals, crystal.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.crystals, crystal.id, crystal);
        });
      }
      if (importData.facets) {
        await runChunked(importData.facets, async (facet) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.facets, facet.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.facets, facet.id, facet);
        });
      }
      if (importData.lessons) {
        await runChunked(importData.lessons, async (lesson) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.lessons, lesson.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.lessons, lesson.id, lesson);
        });
        resetLessonIndex();
      }
      if (importData.insights) {
        await runChunked(importData.insights, async (insight) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.insights, insight.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.insights, insight.id, insight);
        });
      }
      if (importData.accessLogs) {
        const memoryIds = new Set<string>(
          importData.memories.map((m) => m.id),
        );
        await runChunked(importData.accessLogs, async (raw) => {
          const log = normalizeAccessLog(raw);
          if (!log.memoryId || !memoryIds.has(log.memoryId)) return;
          if (strategy === "skip") {
            const existing = await kv
              .get(KV.accessLog, log.memoryId)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              return;
            }
          }
          await kv.set(KV.accessLog, log.memoryId, log);
        });
      }
      if (importData.relations) {
        const identityOf = (rel: MemoryRelation): string =>
          JSON.stringify([rel.sourceId, rel.targetId, rel.type, rel.createdAt, rel.confidence ?? null]);
        const storedKeys = await kv.listKeys(KV.relations);
        const storedRows: Array<{ key: string; rel: MemoryRelation }> = [];
        await runChunked(storedKeys, async (key) => {
          const rel = await kv.get<MemoryRelation>(KV.relations, key);
          if (rel) storedRows.push({ key, rel });
        });
        const storedKeySet = new Set(storedKeys);
        const explicitKeys = new Set(
          importData.relations
            .map((rel) => rel.storageKey)
            .filter((key): key is string => key !== undefined),
        );
        const identityQueues = new Map<string, string[]>();
        for (const { key, rel } of storedRows) {
          if (explicitKeys.has(key)) continue;
          const identity = identityOf(rel);
          const queue = identityQueues.get(identity);
          if (queue) queue.push(key);
          else identityQueues.set(identity, [key]);
        }
        const usedKeys = new Set(explicitKeys);
        const occurrences = new Map<string, number>();
        const plannedRelations = importData.relations.map((rel) => {
          const { storageKey, ...stored } = rel;
          if (storageKey !== undefined) {
            usedKeys.add(storageKey);
            return { key: storageKey, rel: stored as MemoryRelation };
          }
          const identity = identityOf(stored);
          const queue = identityQueues.get(identity);
          let key = queue && queue.length > 0 ? queue.shift()! : undefined;
          if (!key) {
            let occurrence = occurrences.get(identity) ?? 0;
            let candidate = fingerprintId("rel", `${identity}:${occurrence}`);
            while (usedKeys.has(candidate) || storedKeySet.has(candidate)) {
              occurrence++;
              candidate = fingerprintId("rel", `${identity}:${occurrence}`);
            }
            occurrences.set(identity, occurrence + 1);
            key = candidate;
          }
          usedKeys.add(key);
          return { key, rel: stored as MemoryRelation };
        });
        await runChunked(plannedRelations, async ({ key, rel }) => {
          if (strategy === "skip" && storedKeySet.has(key)) {
            stats.skipped++;
            return;
          }
          await kv.set(KV.relations, key, rel);
        });
      }

      // Imported rows are now in KV but invisible to search: the boot
      // rebuild gate only fires when BM25 is empty, so on any existing
      // install (non-empty persisted index) imported observations and
      // memories never surface via mem::search / smart-search until a
      // manual rebuild. Add them to BM25 (synchronous) and enqueue the
      // vector embeddings in batches (one embedBatch call per chunk)
      // rather than one giant Promise.all over 500k docs. Indexing
      // failures are logged, not fatal — the KV writes already committed
      // and the restart rebuild is the backstop.
      try {
        await indexRecords(indexObs, indexMems);
      } catch (err) {
        logger.warn("Import indexing failed; restart rebuild will recover", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      logger.info("Import complete", { strategy, ...stats });
      await recordAudit(kv, "import", "mem::import", [], {
        strategy,
        stats,
      });
      return { success: true, strategy, ...stats };
    },
  );
}
