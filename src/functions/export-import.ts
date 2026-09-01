import type { ISdk } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  Memory,
  SessionSummary,
  ProjectProfile,
  ExportData,
  GraphNode,
  GraphEdge,
  SemanticMemory,
  ProceduralMemory,
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
  ExportPagination,
  AccessLogExport,
} from "../types.js";
import { importOrigin } from "../types.js";
import { normalizeAccessLog } from "./access-tracker.js";
import { KV } from "../state/schema.js";
import { checkPayloadFrameSize } from "../state/frame-guard.js";
import { StateKV } from "../state/kv.js";
import { VERSION } from "../version.js";
import { recordAudit } from "./audit.js";
import { indexRecords } from "./search.js";
import { resetLessonIndex } from "./lessons.js";
import { deleteGraphExtractMarks } from "./graph.js";
import { logger } from "../logger.js";

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
// chunk. Errors propagate — a failing item rejects the whole import, same
// as the original serial loops.
async function runChunked<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = items.slice(i, i + IMPORT_CHUNK_SIZE);
    await Promise.all(chunk.map(fn));
  }
}

export function registerExportImportFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::export", 
    async (data?: { maxSessions?: number; offset?: number }) => {
      const rawMax = Number(data?.maxSessions);
      const maxSessions = Number.isFinite(rawMax) && rawMax > 0 ? Math.min(Math.floor(rawMax), 1000) : undefined;
      const rawOffset = Number(data?.offset);
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

      const allSessions = await kv.list<Session>(KV.sessions);
      const paginatedSessions = maxSessions !== undefined
        ? allSessions.slice(offset, offset + maxSessions)
        : allSessions;
      const memories = await kv.list<Memory>(KV.memories);
      const summaries = await kv.list<SessionSummary>(KV.summaries);

      const observations: Record<string, CompressedObservation[]> = {};
      const obsResults = await Promise.all(
        paginatedSessions.map((session) =>
          kv
            .list<CompressedObservation>(KV.observations(session.id))
            .catch(() => [] as CompressedObservation[])
            .then((obs) => ({ sessionId: session.id, obs })),
        ),
      );
      for (const { sessionId, obs } of obsResults) {
        if (obs.length > 0) {
          observations[sessionId] = obs;
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

      const [
        graphNodes,
        graphEdges,
        semanticMemories,
        proceduralMemories,
        actions,
        actionEdges,
        sentinels,
        sketches,
        crystals,
        facets,
        lessons,
        insights,
        routines,
        signals,
        checkpoints,
        accessLogs,
      ] = await Promise.all([
        kv.list<GraphNode>(KV.graphNodes).catch(() => []),
        kv.list<GraphEdge>(KV.graphEdges).catch(() => []),
        kv.list<SemanticMemory>(KV.semantic).catch(() => []),
        kv.list<ProceduralMemory>(KV.procedural).catch(() => []),
        kv.list<Action>(KV.actions).catch(() => []),
        kv.list<ActionEdge>(KV.actionEdges).catch(() => []),
        kv.list<Sentinel>(KV.sentinels).catch(() => []),
        kv.list<Sketch>(KV.sketches).catch(() => []),
        kv.list<Crystal>(KV.crystals).catch(() => []),
        kv.list<Facet>(KV.facets).catch(() => []),
        kv.list<Lesson>(KV.lessons).catch(() => []),
        kv.list<Insight>(KV.insights).catch(() => []),
        kv.list<Routine>(KV.routines).catch(() => []),
        kv.list<Signal>(KV.signals).catch(() => []),
        kv.list<Checkpoint>(KV.checkpoints).catch(() => []),
        kv.list<AccessLogExport>(KV.accessLog).catch(() => []),
      ]);

      const exportData: ExportData = {
        version: VERSION,
        exportedAt: new Date().toISOString(),
        sessions: paginatedSessions,
        observations,
        memories,
        summaries,
        profiles: profiles.length > 0 ? profiles : undefined,
        graphNodes: graphNodes.length > 0 ? graphNodes : undefined,
        graphEdges: graphEdges.length > 0 ? graphEdges : undefined,
        semanticMemories:
          semanticMemories.length > 0 ? semanticMemories : undefined,
        proceduralMemories:
          proceduralMemories.length > 0 ? proceduralMemories : undefined,
        actions: actions.length > 0 ? actions : undefined,
        actionEdges: actionEdges.length > 0 ? actionEdges : undefined,
        sentinels: sentinels.length > 0 ? sentinels : undefined,
        sketches: sketches.length > 0 ? sketches : undefined,
        crystals: crystals.length > 0 ? crystals : undefined,
        facets: facets.length > 0 ? facets : undefined,
        lessons: lessons.length > 0 ? lessons : undefined,
        insights: insights.length > 0 ? insights : undefined,
        routines: routines.length > 0 ? routines : undefined,
        signals: signals.length > 0 ? signals : undefined,
        checkpoints: checkpoints.length > 0 ? checkpoints : undefined,
        accessLogs: accessLogs.length > 0 ? accessLogs : undefined,
      };

      if (maxSessions !== undefined) {
        exportData.pagination = {
          offset,
          limit: maxSessions,
          total: allSessions.length,
          hasMore: offset + maxSessions < allSessions.length,
        };
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
      });

      // Only session collections page on ?maxSessions/?offset, so a large
      // store can exceed the transport cap even at ?maxSessions=1.
      const oversized = checkPayloadFrameSize(
        exportData,
        "narrow the range with ?maxSessions / ?offset, or export fewer collections; the non-session collections (memories, graph, semantic, actions, lessons, ...) are not yet paginated",
      );
      if (oversized) {
        logger.warn("Export exceeds transport frame limit", {
          bytes: oversized.bytes,
        });
        return oversized;
      }

      return exportData;
    },
  );

  sdk.registerFunction("mem::import", 
    async (data: {
      exportData: ExportData;
      strategy?: "merge" | "replace" | "skip";
    }) => {
      if (
        !data?.exportData ||
        typeof data.exportData !== "object" ||
        typeof (data.exportData as { version?: unknown }).version !== "string"
      ) {
        return { success: false, error: "exportData with string version is required" };
      }
      const strategy = data.strategy || "merge";
      const importData = data.exportData;

      const supportedVersions = new Set(["0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.6.1", "0.7.0", "0.7.2", "0.7.3", "0.7.4", "0.7.5", "0.7.6", "0.7.7", "0.7.9", "0.8.0", "0.8.1", "0.8.2", "0.8.3", "0.8.4", "0.8.5", "0.8.6", "0.8.7", "0.8.8", "0.8.9", "0.8.10", "0.8.11", "0.8.12", "0.8.13", "0.9.0", "0.9.1", "0.9.2", "0.9.3", "0.9.4", "0.9.5", "0.9.6", "0.9.7", "0.9.8", "0.9.9", "0.9.10", "0.9.11", "0.9.12", "0.9.13", "0.9.14", "0.9.15", "0.9.16", "0.9.17", "0.9.18", "0.9.19", "0.9.20", "0.9.21", "0.9.22", "0.9.23", "0.9.24", "0.9.25", "0.9.26", "0.9.27", "0.9.28", "0.9.29"]);
      if (!supportedVersions.has(importData.version)) {
        return {
          success: false,
          error: `Unsupported export version: ${importData.version}`,
        };
      }

      const MAX_SESSIONS = 10_000;
      const MAX_MEMORIES = 50_000;
      const MAX_SUMMARIES = 10_000;
      const MAX_OBS_PER_SESSION = 5_000;
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
      for (const [, obs] of Object.entries(importData.observations)) {
        if (!Array.isArray(obs)) {
          return { success: false, error: "observation values must be arrays" };
        }
        if (obs.length > MAX_OBS_PER_SESSION) {
          return {
            success: false,
            error: `Too many observations per session (max ${MAX_OBS_PER_SESSION})`,
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

      const stats = {
        sessions: 0,
        observations: 0,
        memories: 0,
        summaries: 0,
        skipped: 0,
      };

      if (strategy === "replace") {
        const existing = await kv.list<Session>(KV.sessions);
        // Collect observation deletes across all sessions, then run them in
        // one bounded pass: a runChunked nested inside a runChunked callback
        // multiplies in-flight deletes to chunk-size squared.
        const obsDeletes: Array<{ sessionId: string; obsId: string }> = [];
        await runChunked(existing, async (session) => {
          await kv.delete(KV.sessions, session.id);
          await deleteGraphExtractMarks(kv, session.id);
          const obs = await kv
            .list<CompressedObservation>(KV.observations(session.id))
            .catch(() => []);
          for (const o of obs) {
            obsDeletes.push({ sessionId: session.id, obsId: o.id });
          }
        });
        await runChunked(obsDeletes, (d) =>
          kv.delete(KV.observations(d.sessionId), d.obsId),
        );
        await runChunked(await kv.list<Memory>(KV.memories), (m) =>
          kv.delete(KV.memories, m.id),
        );
        await runChunked(
          await kv.list<SessionSummary>(KV.summaries),
          (s) => kv.delete(KV.summaries, s.sessionId),
        );
        await runChunked(await kv.list<Action>(KV.actions).catch(() => []), (a) =>
          kv.delete(KV.actions, a.id),
        );
        await runChunked(
          await kv.list<ActionEdge>(KV.actionEdges).catch(() => []),
          (e) => kv.delete(KV.actionEdges, e.id),
        );
        await runChunked(
          await kv.list<Routine>(KV.routines).catch(() => []),
          (r) => kv.delete(KV.routines, r.id),
        );
        await runChunked(
          await kv.list<Signal>(KV.signals).catch(() => []),
          (s) => kv.delete(KV.signals, s.id),
        );
        await runChunked(
          await kv.list<Checkpoint>(KV.checkpoints).catch(() => []),
          (c) => kv.delete(KV.checkpoints, c.id),
        );
        await runChunked(
          await kv.list<Sentinel>(KV.sentinels).catch(() => []),
          (s) => kv.delete(KV.sentinels, s.id),
        );
        await runChunked(
          await kv.list<Sketch>(KV.sketches).catch(() => []),
          (s) => kv.delete(KV.sketches, s.id),
        );
        await runChunked(
          await kv.list<Crystal>(KV.crystals).catch(() => []),
          (c) => kv.delete(KV.crystals, c.id),
        );
        await runChunked(
          await kv.list<Facet>(KV.facets).catch(() => []),
          (f) => kv.delete(KV.facets, f.id),
        );
        await runChunked(
          await kv.list<Lesson>(KV.lessons).catch(() => []),
          (l) => kv.delete(KV.lessons, l.id),
        );
        resetLessonIndex();
        await runChunked(
          await kv.list<Insight>(KV.insights).catch(() => []),
          (i) => kv.delete(KV.insights, i.id),
        );
        await runChunked(
          await kv.list<{ id: string }>(KV.graphNodes).catch(() => []),
          (n) => kv.delete(KV.graphNodes, n.id),
        );
        await runChunked(
          await kv.list<{ id: string }>(KV.graphEdges).catch(() => []),
          (e) => kv.delete(KV.graphEdges, e.id),
        );
        await runChunked(
          await kv.list<{ id: string }>(KV.semantic).catch(() => []),
          (s) => kv.delete(KV.semantic, s.id),
        );
        await runChunked(
          await kv.list<{ id: string }>(KV.procedural).catch(() => []),
          (p) => kv.delete(KV.procedural, p.id),
        );
        await runChunked(
          await kv.list<ProjectProfile>(KV.profiles).catch(() => []),
          (profile) => kv.delete(KV.profiles, profile.project),
        );
        await runChunked(
          await kv.list<AccessLogExport>(KV.accessLog).catch(() => []),
          (a) => kv.delete(KV.accessLog, a.memoryId),
        );
      }

      // Records actually written this run, accumulated for search
      // indexing after the KV writes settle. Skipped (already-present)
      // and merge-overwritten rows are already in the index or will be
      // re-added below, so re-indexing them is harmless; we only skip the
      // ones the "skip" strategy declined to write.
      const indexObs: CompressedObservation[] = [];
      const indexMems: Memory[] = [];

      await runChunked(importData.sessions, async (session) => {
        if (strategy === "skip") {
          const existing = await kv
            .get<Session>(KV.sessions, session.id)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            return;
          }
        }
        await kv.set(KV.sessions, session.id, session);
        stats.sessions++;
      });

      for (const [sessionId, obs] of Object.entries(importData.observations)) {
        await runChunked(obs, async (o) => {
          if (strategy === "skip") {
            const existing = await kv
              .get<CompressedObservation>(KV.observations(sessionId), o.id)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              return;
            }
          }
          o.origin = importOrigin(o.origin, o.timestamp);
          await kv.set(KV.observations(sessionId), o.id, o);
          stats.observations++;
          indexObs.push(o);
        });
      }

      await runChunked(importData.memories, async (memory) => {
        if (strategy === "skip") {
          const existing = await kv
            .get<Memory>(KV.memories, memory.id)
            .catch(() => null);
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
        await kv.set(KV.memories, memory.id, memory);
        stats.memories++;
        indexMems.push(memory);
      });

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

      if (importData.graphNodes) {
        await runChunked(importData.graphNodes, async (node) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.graphNodes, node.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.graphNodes, node.id, node);
        });
      }
      if (importData.graphEdges) {
        await runChunked(importData.graphEdges, async (edge) => {
          if (strategy === "skip") {
            const existing = await kv.get(KV.graphEdges, edge.id).catch(() => null);
            if (existing) { stats.skipped++; return; }
          }
          await kv.set(KV.graphEdges, edge.id, edge);
        });
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
        if (!Array.isArray(importData.accessLogs)) {
          return { success: false, error: "accessLogs must be an array" };
        }
        if (importData.accessLogs.length > MAX_ACCESS_LOGS) {
          return {
            success: false,
            error: `Too many access logs (max ${MAX_ACCESS_LOGS})`,
          };
        }
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
