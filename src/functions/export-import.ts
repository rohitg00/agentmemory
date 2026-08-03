import type { ISdk } from "iii-sdk";
import { isDeepStrictEqual } from "node:util";
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
  ActionCollectionState,
  ActionEvent,
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
import { normalizeAccessLog } from "./access-tracker.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { VERSION } from "../version.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";
import {
  ACTION_SCHEMA_VERSION,
  normalizeActionV2,
} from "./action-model.js";
import {
  readActionStoreSnapshot,
  withActionStoreLock,
} from "./action-store.js";
import {
  isLessonRecallable,
  normalizeLesson,
  parseImportedLesson,
  sameLessonContradictionScope,
  sameLessonScope,
} from "./lesson-model.js";
import { withLessonMutationLock } from "./lesson-locks.js";

interface ImportedLessonCandidate {
  lesson: Lesson;
  sourceId: string;
  canonicalized: boolean;
}

interface LessonLifecycleTransition {
  lessonId: string;
  before?: string;
  after?: string;
}

const MAX_LESSON_STATE_DIAGNOSTIC_DETAIL_LENGTH = 256;

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
        actionStore,
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
        readActionStoreSnapshot(kv, { includeEvents: true }),
        kv.list<Sentinel>(KV.sentinels).catch(() => []),
        kv.list<Sketch>(KV.sketches).catch(() => []),
        kv.list<Crystal>(KV.crystals).catch(() => []),
        kv.list<Facet>(KV.facets).catch(() => []),
        kv.list<Lesson>(KV.lessons).catch((error) => {
          throw new Error(
            `Lesson export failed closed: authoritative lesson state read failed (${boundedLessonStateDiagnosticDetail(error)})`,
          );
        }),
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
        actions:
          actionStore.actions.length > 0 ? actionStore.actions : undefined,
        actionEdges:
          actionStore.edges.length > 0 ? actionStore.edges : undefined,
        actionEvents:
          actionStore.events.length > 0 ? actionStore.events : undefined,
        actionSnapshot: {
          schemaVersion: ACTION_SCHEMA_VERSION,
          revision: actionStore.state.revision,
          actionCount: actionStore.actions.length,
          edgeCount: actionStore.edges.length,
          eventCount: actionStore.events.length,
        },
        sentinels: sentinels.length > 0 ? sentinels : undefined,
        sketches: sketches.length > 0 ? sketches : undefined,
        crystals: crystals.length > 0 ? crystals : undefined,
        facets: facets.length > 0 ? facets : undefined,
        lessons:
          lessons.length > 0
            ? lessons.map((lesson) => normalizeLesson(lesson))
            : undefined,
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
      const requestedStrategy = (data as { strategy?: unknown }).strategy;
      if (
        requestedStrategy !== undefined &&
        requestedStrategy !== "merge" &&
        requestedStrategy !== "replace" &&
        requestedStrategy !== "skip"
      ) {
        return {
          success: false,
          error: "strategy must be merge, replace, or skip",
        };
      }
      const strategy = requestedStrategy ?? "merge";
      const importData = data.exportData;

      const supportedVersions = new Set(["0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.6.1", "0.7.0", "0.7.2", "0.7.3", "0.7.4", "0.7.5", "0.7.6", "0.7.7", "0.7.9", "0.8.0", "0.8.1", "0.8.2", "0.8.3", "0.8.4", "0.8.5", "0.8.6", "0.8.7", "0.8.8", "0.8.9", "0.8.10", "0.8.11", "0.8.12", "0.8.13", "0.9.0", "0.9.1", "0.9.2", "0.9.3", "0.9.4", "0.9.5", "0.9.6", "0.9.7", "0.9.8", "0.9.9", "0.9.10", "0.9.11", "0.9.12", "0.9.13", "0.9.14", "0.9.15", "0.9.16", "0.9.17", "0.9.18", "0.9.19", "0.9.20", "0.9.21", "0.9.22", "0.9.23", "0.9.24", "0.9.25", "0.9.26", "0.9.27"]);
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
      const MAX_ACTIONS = 100_000;
      const MAX_ACTION_EDGES = 250_000;
      const MAX_ACTION_EVENTS = 500_000;
      const MAX_LESSONS = 100_000;

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

      const importedLessons = importData.lessons ?? [];
      if (!Array.isArray(importedLessons)) {
        return { success: false, error: "lessons must be an array" };
      }
      if (importedLessons.length > MAX_LESSONS) {
        return {
          success: false,
          error: `Too many lessons (max ${MAX_LESSONS})`,
        };
      }
      const normalizedImportedLessons: ImportedLessonCandidate[] = [];
      const importedLessonIds = new Set<string>();
      const importedLessonAliases = new Map<string, string>();
      for (const lesson of importedLessons) {
        const parsed = parseImportedLesson(lesson);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid lesson: ${parsed.error}`,
          };
        }
        if (importedLessonIds.has(parsed.lesson.id)) {
          return {
            success: false,
            error: `Duplicate lesson: ${parsed.lesson.id}`,
          };
        }
        importedLessonIds.add(parsed.lesson.id);
        for (const alias of [
          parsed.sourceId,
          ...(parsed.lesson.idAliases ?? []),
          parsed.lesson.id,
        ]) {
          const claimedBy = importedLessonAliases.get(alias);
          if (claimedBy && claimedBy !== parsed.lesson.id) {
            return {
              success: false,
              error: `Duplicate lesson identity alias ${alias}: ${claimedBy}, ${parsed.lesson.id}`,
            };
          }
          importedLessonAliases.set(alias, parsed.lesson.id);
        }
        normalizedImportedLessons.push(parsed);
      }

      const importedActions = Array.isArray(importData.actions)
        ? importData.actions
        : [];
      if (importedActions.length > MAX_ACTIONS) {
        return {
          success: false,
          error: `Too many actions (max ${MAX_ACTIONS})`,
        };
      }
      const normalizedImportedActions: Action[] = [];
      const actionIds = new Set<string>();
      for (const action of importedActions) {
        if (!isImportableAction(action)) {
          return { success: false, error: "Invalid action" };
        }
        if (actionIds.has(action.id)) {
          return { success: false, error: `Duplicate action: ${action.id}` };
        }
        actionIds.add(action.id);
      }
      const importedActionEdges = importData.actionEdges ?? [];
      if (!Array.isArray(importedActionEdges)) {
        return { success: false, error: "actionEdges must be an array" };
      }
      if (importedActionEdges.length > MAX_ACTION_EDGES) {
        return {
          success: false,
          error: `Too many action edges (max ${MAX_ACTION_EDGES})`,
        };
      }
      const edgeIds = new Set<string>();
      for (const edge of importedActionEdges) {
        if (!isImportableActionEdge(edge)) {
          return { success: false, error: "Invalid action edge" };
        }
        if (edgeIds.has(edge.id)) {
          return { success: false, error: `Duplicate action edge: ${edge.id}` };
        }
        edgeIds.add(edge.id);
      }
      const importedActionsWithDerivedBlockers =
        collectImportedActionsWithDerivedBlockers(
          importedActions,
          importedActionEdges,
          Array.isArray(importData.checkpoints) ? importData.checkpoints : [],
          Array.isArray(importData.sentinels) ? importData.sentinels : [],
        );
      for (const action of importedActions) {
        const normalized = normalizeActionV2(action, {
          hasDerivedBlockers: importedActionsWithDerivedBlockers.has(action.id),
        });
        if (normalized.conflicts.length > 0) {
          return {
            success: false,
            error: `Invalid action ${action.id}: ${normalized.conflicts.join(", ")}`,
          };
        }
        normalizedImportedActions.push(normalized.action);
      }
      const importedActionEvents = importData.actionEvents ?? [];
      if (!Array.isArray(importedActionEvents)) {
        return { success: false, error: "actionEvents must be an array" };
      }
      if (importedActionEvents.length > MAX_ACTION_EVENTS) {
        return {
          success: false,
          error: `Too many action events (max ${MAX_ACTION_EVENTS})`,
        };
      }
      const eventIds = new Set<string>();
      const validActionEventTypes = new Set([
        "created",
        "fields_changed",
        "lifecycle_changed",
        "result_recorded",
        "corrected",
        "migrated",
        "deleted",
        "edge_created",
        "edge_deleted",
      ]);
      for (const event of importedActionEvents) {
        if (
          !event ||
          event.schemaVersion !== ACTION_SCHEMA_VERSION ||
          typeof event.id !== "string" ||
          !event.id ||
          typeof event.actionId !== "string" ||
          !event.actionId ||
          (event.entityType !== "action" && event.entityType !== "edge") ||
          !validActionEventTypes.has(event.type) ||
          typeof event.actor !== "string" ||
          !event.actor ||
          typeof event.timestamp !== "string" ||
          Number.isNaN(Date.parse(event.timestamp)) ||
          !Number.isInteger(event.revision) ||
          event.revision < 1
        ) {
          return { success: false, error: "Invalid action event" };
        }
        if (eventIds.has(event.id)) {
          return { success: false, error: `Duplicate action event: ${event.id}` };
        }
        eventIds.add(event.id);
        if (!isValidActionEventImage(event)) {
          return { success: false, error: `Invalid action event image: ${event.id}` };
        }
      }
      const importedActionSnapshot = importData.actionSnapshot;
      if (importedActionSnapshot) {
        if (
          importedActionSnapshot.schemaVersion !== ACTION_SCHEMA_VERSION ||
          importedActionSnapshot.actionCount !== normalizedImportedActions.length ||
          importedActionSnapshot.edgeCount !== importedActionEdges.length ||
          importedActionSnapshot.eventCount !== importedActionEvents.length ||
          !Number.isInteger(importedActionSnapshot.revision) ||
          importedActionSnapshot.revision < 0 ||
          importedActionSnapshot.revision <
            Math.max(
              0,
              ...normalizedImportedActions.map(
                (action) => action.revision ?? 0,
              ),
              ...importedActionEvents.map((event) => event.revision),
            )
        ) {
          return { success: false, error: "Action snapshot counts or revision are invalid" };
        }
      }
      if (strategy === "merge" || strategy === "skip") {
        for (const event of importedActionEvents) {
          const existing = await kv
            .get<ActionEvent>(KV.actionEvents, event.id)
            .catch(() => null);
          if (
            existing &&
            JSON.stringify(existing) !== JSON.stringify(event)
          ) {
            return {
              success: false,
              error: `Action event ID conflict: ${event.id}`,
            };
          }
        }
      }
      if (
        importData.accessLogs !== undefined &&
        !Array.isArray(importData.accessLogs)
      ) {
        return { success: false, error: "accessLogs must be an array" };
      }
      if (
        Array.isArray(importData.accessLogs) &&
        importData.accessLogs.length > MAX_ACCESS_LOGS
      ) {
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
        actions: 0,
        actionEdges: 0,
        actionEvents: 0,
        lessons: 0,
        skipped: 0,
      };

      const lessonImport = await withLessonMutationLock(() =>
        applyImportedLessonBatch(
          kv,
          normalizedImportedLessons,
          strategy,
        ),
      );
      if (!lessonImport.success) {
        return { success: false, error: lessonImport.error };
      }
      stats.lessons = lessonImport.written;
      stats.skipped += lessonImport.skipped;

      if (strategy === "replace") {
        const existing = await kv.list<Session>(KV.sessions);
        for (const session of existing) {
          await kv.delete(KV.sessions, session.id);
          const obs = await kv
            .list<CompressedObservation>(KV.observations(session.id))
            .catch(() => []);
          for (const o of obs) {
            await kv.delete(KV.observations(session.id), o.id);
          }
        }
        const existingMem = await kv.list<Memory>(KV.memories);
        for (const m of existingMem) {
          await kv.delete(KV.memories, m.id);
        }
        const existingSummaries = await kv.list<SessionSummary>(KV.summaries);
        for (const s of existingSummaries) {
          await kv.delete(KV.summaries, s.sessionId);
        }
        for (const r of await kv.list<Routine>(KV.routines).catch(() => [])) {
          await kv.delete(KV.routines, r.id);
        }
        for (const s of await kv.list<Signal>(KV.signals).catch(() => [])) {
          await kv.delete(KV.signals, s.id);
        }
        for (const c of await kv.list<Checkpoint>(KV.checkpoints).catch(() => [])) {
          await kv.delete(KV.checkpoints, c.id);
        }
        for (const s of await kv.list<Sentinel>(KV.sentinels).catch(() => [])) {
          await kv.delete(KV.sentinels, s.id);
        }
        for (const s of await kv.list<Sketch>(KV.sketches).catch(() => [])) {
          await kv.delete(KV.sketches, s.id);
        }
        for (const c of await kv.list<Crystal>(KV.crystals).catch(() => [])) {
          await kv.delete(KV.crystals, c.id);
        }
        for (const f of await kv.list<Facet>(KV.facets).catch(() => [])) {
          await kv.delete(KV.facets, f.id);
        }
        for (const i of await kv.list<Insight>(KV.insights).catch(() => [])) {
          await kv.delete(KV.insights, i.id);
        }
        for (const n of await kv.list<{ id: string }>(KV.graphNodes).catch(() => [])) {
          await kv.delete(KV.graphNodes, n.id);
        }
        for (const e of await kv.list<{ id: string }>(KV.graphEdges).catch(() => [])) {
          await kv.delete(KV.graphEdges, e.id);
        }
        for (const s of await kv.list<{ id: string }>(KV.semantic).catch(() => [])) {
          await kv.delete(KV.semantic, s.id);
        }
        for (const p of await kv.list<{ id: string }>(KV.procedural).catch(() => [])) {
          await kv.delete(KV.procedural, p.id);
        }
        for (const profile of await kv.list<ProjectProfile>(KV.profiles).catch(() => [])) {
          await kv.delete(KV.profiles, profile.project);
        }
        for (const a of await kv.list<AccessLogExport>(KV.accessLog).catch(() => [])) {
          await kv.delete(KV.accessLog, a.memoryId);
        }
      }

      for (const session of importData.sessions) {
        if (strategy === "skip") {
          const existing = await kv
            .get<Session>(KV.sessions, session.id)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            continue;
          }
        }
        await kv.set(KV.sessions, session.id, session);
        stats.sessions++;
      }

      for (const [sessionId, obs] of Object.entries(importData.observations)) {
        for (const o of obs) {
          if (strategy === "skip") {
            const existing = await kv
              .get<CompressedObservation>(KV.observations(sessionId), o.id)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.observations(sessionId), o.id, o);
          stats.observations++;
        }
      }

      for (const memory of importData.memories) {
        if (strategy === "skip") {
          const existing = await kv
            .get<Memory>(KV.memories, memory.id)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            continue;
          }
        }
        // Older exports + hand-edited dumps can omit this field.
        if (!Array.isArray(memory.sessionIds)) {
          memory.sessionIds = [];
        }
        await kv.set(KV.memories, memory.id, memory);
        stats.memories++;
      }

      for (const summary of importData.summaries) {
        if (strategy === "skip") {
          const existing = await kv
            .get<SessionSummary>(KV.summaries, summary.sessionId)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            continue;
          }
        }
        await kv.set(KV.summaries, summary.sessionId, summary);
        stats.summaries++;
      }

      if (importData.graphNodes) {
        for (const node of importData.graphNodes) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.graphNodes, node.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.graphNodes, node.id, node);
        }
      }
      if (importData.graphEdges) {
        for (const edge of importData.graphEdges) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.graphEdges, edge.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.graphEdges, edge.id, edge);
        }
      }
      if (importData.semanticMemories) {
        for (const sem of importData.semanticMemories) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.semantic, sem.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.semantic, sem.id, sem);
        }
      }
      if (importData.proceduralMemories) {
        for (const proc of importData.proceduralMemories) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.procedural, proc.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.procedural, proc.id, proc);
        }
      }
      if (importData.profiles) {
        for (const profile of importData.profiles) {
          if (strategy === "skip") {
            const existing = await kv
              .get<ProjectProfile>(KV.profiles, profile.project)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.profiles, profile.project, profile);
        }
      }

      await withActionStoreLock(async () => {
        const priorActionState = await kv
          .get<ActionCollectionState>(KV.actionState, "current")
          .catch(() => null);
        let replacedExistingActionData = false;
        if (strategy === "replace") {
          const existingActions = await kv.list<Action>(KV.actions).catch(() => []);
          const existingEdges = await kv
            .list<ActionEdge>(KV.actionEdges)
            .catch(() => []);
          const existingEvents = await kv
            .list<ActionEvent>(KV.actionEvents)
            .catch(() => []);
          replacedExistingActionData = Boolean(
            priorActionState ||
              existingActions.length ||
              existingEdges.length ||
              existingEvents.length,
          );
          for (const action of existingActions) {
            await kv.delete(KV.actions, action.id);
          }
          for (const edge of existingEdges) {
            await kv.delete(KV.actionEdges, edge.id);
          }
          for (const event of existingEvents) {
            await kv.delete(KV.actionEvents, event.id);
          }
          await kv.delete(KV.actionState, "current").catch(() => {});
        }

        for (const action of normalizedImportedActions) {
          if (strategy === "skip") {
            const existing = await kv
              .get(KV.actions, action.id)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.actions, action.id, action);
          stats.actions++;
        }
        for (const edge of importedActionEdges) {
          if (strategy === "skip") {
            const existing = await kv
              .get(KV.actionEdges, edge.id)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.actionEdges, edge.id, edge);
          stats.actionEdges++;
        }
        for (const event of importedActionEvents) {
          if (strategy === "skip" || strategy === "merge") {
            const existing = await kv
              .get<ActionEvent>(KV.actionEvents, event.id)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.actionEvents, event.id, event);
          stats.actionEvents++;
        }

        const actionDataChanged =
          stats.actions > 0 ||
          stats.actionEdges > 0 ||
          stats.actionEvents > 0 ||
          replacedExistingActionData ||
          (strategy === "replace" &&
            (normalizedImportedActions.length > 0 ||
              importedActionEdges.length > 0 ||
              importedActionEvents.length > 0));
        if (actionDataChanged || importedActionSnapshot) {
          const currentActionState = await kv
            .get<ActionCollectionState>(KV.actionState, "current")
            .catch(() => null);
          const importedRevision = Math.max(
            importedActionSnapshot?.revision ?? 0,
            ...normalizedImportedActions.map((action) => action.revision ?? 0),
            ...importedActionEvents.map((event) => event.revision),
          );
          const revision =
            strategy === "replace"
              ? replacedExistingActionData
                ? Math.max(priorActionState?.revision ?? 0, importedRevision) +
                  1
                : importedRevision
              : Math.max(currentActionState?.revision ?? 0, importedRevision) + 1;
          const nextActionState: ActionCollectionState = {
            schemaVersion: ACTION_SCHEMA_VERSION,
            revision,
            updatedAt: new Date().toISOString(),
          };
          await kv.set(KV.actionState, "current", nextActionState);
        }
      });
      if (importData.routines) {
        for (const routine of importData.routines) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.routines, routine.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.routines, routine.id, routine);
        }
      }
      if (importData.signals) {
        for (const signal of importData.signals) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.signals, signal.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.signals, signal.id, signal);
        }
      }
      if (importData.checkpoints) {
        for (const checkpoint of importData.checkpoints) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.checkpoints, checkpoint.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.checkpoints, checkpoint.id, checkpoint);
        }
      }
      if (importData.sentinels) {
        for (const sentinel of importData.sentinels) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.sentinels, sentinel.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.sentinels, sentinel.id, sentinel);
        }
      }
      if (importData.sketches) {
        for (const sketch of importData.sketches) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.sketches, sketch.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.sketches, sketch.id, sketch);
        }
      }
      if (importData.crystals) {
        for (const crystal of importData.crystals) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.crystals, crystal.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.crystals, crystal.id, crystal);
        }
      }
      if (importData.facets) {
        for (const facet of importData.facets) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.facets, facet.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.facets, facet.id, facet);
        }
      }
      if (importData.insights) {
        for (const insight of importData.insights) {
          if (strategy === "skip") {
            const existing = await kv.get(KV.insights, insight.id).catch(() => null);
            if (existing) { stats.skipped++; continue; }
          }
          await kv.set(KV.insights, insight.id, insight);
        }
      }
      if (importData.accessLogs) {
        const memoryIds = new Set<string>(
          importData.memories.map((m) => m.id),
        );
        for (const raw of importData.accessLogs) {
          const log = normalizeAccessLog(raw);
          if (!log.memoryId || !memoryIds.has(log.memoryId)) continue;
          if (strategy === "skip") {
            const existing = await kv
              .get(KV.accessLog, log.memoryId)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.accessLog, log.memoryId, log);
        }
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

async function applyImportedLessonBatch(
  kv: StateKV,
  imported: ImportedLessonCandidate[],
  strategy: "merge" | "replace" | "skip",
): Promise<
  | { success: true; written: number; skipped: number }
  | { success: false; error: string }
> {
  let existingRows: Lesson[];
  try {
    existingRows = await kv.list<Lesson>(KV.lessons);
  } catch (error) {
    return {
      success: false,
      error: `Lesson import failed closed: authoritative lesson state read failed (${boundedLessonStateDiagnosticDetail(error)})`,
    };
  }
  const preimage = new Map(
    existingRows.map((lesson) => [lesson.id, lesson] as const),
  );
  const existing = new Map<string, Lesson>();
  const existingAliases = new Map<string, string>();
  for (const row of existingRows) {
    let normalized: Lesson;
    try {
      normalized = normalizeLesson(row);
    } catch (error) {
      return {
        success: false,
        error: `Invalid existing structured lesson ${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    existing.set(normalized.id, normalized);
    for (const alias of [
      normalized.id,
      ...(normalized.idAliases ?? []),
    ]) {
      const claimedBy = existingAliases.get(alias);
      if (claimedBy && claimedBy !== normalized.id) {
        return {
          success: false,
          error: `Existing lesson identity alias conflict ${alias}: ${claimedBy}, ${normalized.id}`,
        };
      }
      existingAliases.set(alias, normalized.id);
    }
  }

  const incomingAliases = new Map<string, string>();
  for (const candidate of imported) {
    for (const alias of [
      candidate.sourceId,
      candidate.lesson.id,
      ...(candidate.lesson.idAliases ?? []),
    ]) {
      const claimedBy = incomingAliases.get(alias);
      if (claimedBy && claimedBy !== candidate.lesson.id) {
        return {
          success: false,
          error: `Imported lesson identity alias conflict ${alias}: ${claimedBy}, ${candidate.lesson.id}`,
        };
      }
      const existingOwner = existingAliases.get(alias);
      if (
        strategy !== "replace" &&
        existingOwner &&
        existingOwner !== candidate.lesson.id
      ) {
        return {
          success: false,
          error: `Imported lesson identity ${alias} conflicts with existing lesson ${existingOwner}`,
        };
      }
      incomingAliases.set(alias, candidate.lesson.id);
    }
  }

  const resolveRelationId = (id: string): string =>
    incomingAliases.get(id) ?? existingAliases.get(id) ?? id;
  const incoming = new Map<string, Lesson>();
  for (const candidate of imported) {
    const rewritten = normalizeLesson({
      ...candidate.lesson,
      supersededByLessonId: candidate.lesson.supersededByLessonId
        ? resolveRelationId(candidate.lesson.supersededByLessonId)
        : undefined,
      contradictedByLessonIds: (
        candidate.lesson.contradictedByLessonIds ?? []
      )
        .map(resolveRelationId)
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .sort(),
    });
    incoming.set(rewritten.id, rewritten);
  }

  const finalLessons =
    strategy === "replace"
      ? new Map(incoming)
      : new Map(existing);
  let skipped = 0;
  for (const [id, lesson] of incoming) {
    const current = existing.get(id);
    if (strategy === "skip" && current) {
      skipped++;
      continue;
    }
    if (
      strategy === "merge" &&
      current &&
      (current.lifecycle === "retracted" ||
        current.lifecycle === "superseded") &&
      lesson.lifecycle !== current.lifecycle
    ) {
      return {
        success: false,
        error: `Merge import cannot replace terminal ${current.lifecycle} lesson ${id} with ${lesson.lifecycle}; use replace import for an explicit audited restore`,
      };
    }
    finalLessons.set(id, lesson);
  }

  const graphError = validateLessonGraph(finalLessons);
  if (graphError) return { success: false, error: graphError };

  const writes = [...incoming.values()].filter(
    (lesson) => strategy !== "skip" || !existing.has(lesson.id),
  );
  const deletes =
    strategy === "replace"
      ? [...existing.keys()].filter((id) => !incoming.has(id))
      : [];
  const transitions: LessonLifecycleTransition[] = [];
  for (const lesson of writes) {
    transitions.push({
      lessonId: lesson.id,
      before: existing.get(lesson.id)?.lifecycle,
      after: normalizeLesson(lesson).lifecycle,
    });
  }
  for (const id of deletes) {
    transitions.push({
      lessonId: id,
      before: existing.get(id)?.lifecycle,
      after: undefined,
    });
  }

  const affectedIds = transitions.map((transition) => transition.lessonId);
  const auditDetails = {
    strategy,
    canonicalizedIds: imported
      .filter((candidate) => candidate.canonicalized)
      .map((candidate) => ({
        sourceId: candidate.sourceId,
        lessonId: candidate.lesson.id,
      })),
    lifecycleTransitions: transitions,
  };
  try {
    for (const id of deletes) {
      await kv.delete(KV.lessons, id);
    }
    for (const lesson of writes) {
      await kv.set(KV.lessons, lesson.id, lesson);
    }
    if (affectedIds.length > 0) {
      await recordAudit(
        kv,
        "import",
        "mem::import:lessons",
        affectedIds,
        auditDetails,
      );
    }
  } catch (error) {
    const rollback = await restoreLessonPreimage(
      kv,
      affectedIds,
      preimage,
    );
    let auditError: string | undefined;
    try {
      await recordAudit(
        kv,
        "import",
        "mem::import:lessons-rollback",
        affectedIds,
        {
          ...auditDetails,
          applyError: error instanceof Error ? error.message : String(error),
          rollback,
        },
      );
    } catch (rollbackAuditError) {
      auditError =
        rollbackAuditError instanceof Error
          ? rollbackAuditError.message
          : String(rollbackAuditError);
    }
    const applyError = error instanceof Error ? error.message : String(error);
    if (!rollback.success) {
      return {
        success: false,
        error: `Lesson import failed (${applyError}); rollback failed: ${rollback.errors.join("; ")}${auditError ? `; rollback audit failed: ${auditError}` : ""}`,
      };
    }
    return {
      success: false,
      error: `Lesson import failed (${applyError}); exact preimage restored${auditError ? `; rollback audit failed: ${auditError}` : ""}`,
    };
  }
  return { success: true, written: writes.length, skipped };
}

function boundedLessonStateDiagnosticDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.replace(/\s+/g, " ").trim() || "unknown error";
  if (normalized.length <= MAX_LESSON_STATE_DIAGNOSTIC_DETAIL_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_LESSON_STATE_DIAGNOSTIC_DETAIL_LENGTH - 3)}...`;
}

async function restoreLessonPreimage(
  kv: StateKV,
  affectedIds: string[],
  preimage: Map<string, Lesson>,
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  for (const id of [...new Set(affectedIds)].reverse()) {
    try {
      const before = preimage.get(id);
      if (before) {
        await kv.set(KV.lessons, id, before);
      } else {
        await kv.delete(KV.lessons, id);
      }
    } catch (error) {
      errors.push(
        `${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  for (const id of new Set(affectedIds)) {
    try {
      const actual = await kv.get<Lesson>(KV.lessons, id);
      const expected = preimage.get(id) ?? null;
      if (!isDeepStrictEqual(actual, expected)) {
        errors.push(`${id}: preimage verification mismatch`);
      }
    } catch (error) {
      errors.push(
        `${id}: verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return { success: errors.length === 0, errors };
}

function validateLessonGraph(lessons: Map<string, Lesson>): string | null {
  for (const lesson of lessons.values()) {
    const normalized = normalizeLesson(lesson);
    const supersededBy = normalized.supersededByLessonId;
    if (supersededBy) {
      if (supersededBy === normalized.id) {
        return `Lesson ${normalized.id} cannot supersede itself`;
      }
      const target = lessons.get(supersededBy);
      if (!target) {
        return `Lesson ${normalized.id} has dangling supersession target ${supersededBy}`;
      }
      if (!isLessonRecallable(target)) {
        return `Lesson ${normalized.id} supersession target ${supersededBy} must be active`;
      }
      if (!sameLessonScope(normalized, target)) {
        return `Lesson ${normalized.id} supersession target ${supersededBy} crosses durable scope`;
      }
    }
    for (const contradictionId of normalized.contradictedByLessonIds) {
      if (contradictionId === normalized.id) {
        return `Lesson ${normalized.id} cannot contradict itself`;
      }
      const target = lessons.get(contradictionId);
      if (!target) {
        return `Lesson ${normalized.id} has dangling contradiction target ${contradictionId}`;
      }
      if (!isLessonRecallable(target)) {
        return `Lesson ${normalized.id} contradiction target ${contradictionId} must be active`;
      }
      if (!sameLessonContradictionScope(normalized, target)) {
        return `Lesson ${normalized.id} contradiction target ${contradictionId} crosses durable scope or project`;
      }
    }
  }
  return null;
}

function collectImportedActionsWithDerivedBlockers(
  actions: Action[],
  edges: ActionEdge[],
  checkpoints: Checkpoint[],
  sentinels: Sentinel[],
): Set<string> {
  const actionMap = new Map(actions.map((action) => [action.id, action]));
  const checkpointMap = new Map(
    checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
  );
  const sentinelMap = new Map(
    sentinels.map((sentinel) => [sentinel.id, sentinel]),
  );
  const unresolved = new Set<string>();
  for (const edge of edges) {
    if (edge.type === "requires") {
      const dependency = actionMap.get(edge.targetActionId);
      if ((dependency?.lifecycle ?? dependency?.status) !== "done") {
        unresolved.add(edge.sourceActionId);
      }
      continue;
    }
    if (edge.type === "gated_by") {
      if (
        checkpointMap.get(edge.targetActionId)?.status !== "passed" &&
        sentinelMap.get(edge.targetActionId)?.status !== "triggered"
      ) {
        unresolved.add(edge.sourceActionId);
      }
    }
  }
  return unresolved;
}

function isValidActionEventImage(event: ActionEvent): boolean {
  const isDeletion = event.type === "deleted" || event.type === "edge_deleted";
  if (isDeletion ? !event.before || event.after : !event.after) return false;
  if (
    event.entityType === "action" &&
    (event.type === "edge_created" || event.type === "edge_deleted")
  ) {
    return false;
  }
  if (
    event.entityType === "edge" &&
    event.type !== "edge_created" &&
    event.type !== "edge_deleted" &&
    event.type !== "fields_changed"
  ) {
    return false;
  }
  for (const image of [event.before, event.after]) {
    if (!image || typeof image !== "object") continue;
    if (event.entityType === "action") {
      if ((image as Action).id !== event.actionId) return false;
      continue;
    }
    const edge = image as ActionEdge;
    if (
      typeof edge.id !== "string" ||
      !edge.id ||
      edge.sourceActionId !== event.actionId ||
      typeof edge.targetActionId !== "string" ||
      !edge.targetActionId
    ) {
      return false;
    }
  }
  return true;
}

function isImportableAction(value: unknown): value is Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Partial<Action>;
  return (
    typeof action.id === "string" &&
    Boolean(action.id) &&
    typeof action.title === "string" &&
    typeof action.description === "string" &&
    ["pending", "active", "done", "blocked", "cancelled"].includes(
      String(action.status),
    ) &&
    typeof action.priority === "number" &&
    Number.isFinite(action.priority) &&
    typeof action.createdAt === "string" &&
    !Number.isNaN(Date.parse(action.createdAt)) &&
    typeof action.updatedAt === "string" &&
    !Number.isNaN(Date.parse(action.updatedAt)) &&
    typeof action.createdBy === "string"
  );
}

function isImportableActionEdge(value: unknown): value is ActionEdge {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const edge = value as Partial<ActionEdge>;
  return (
    typeof edge.id === "string" &&
    Boolean(edge.id) &&
    [
      "requires",
      "unlocks",
      "spawned_by",
      "gated_by",
      "conflicts_with",
    ].includes(String(edge.type)) &&
    typeof edge.sourceActionId === "string" &&
    Boolean(edge.sourceActionId) &&
    typeof edge.targetActionId === "string" &&
    Boolean(edge.targetActionId) &&
    typeof edge.createdAt === "string" &&
    !Number.isNaN(Date.parse(edge.createdAt))
  );
}
