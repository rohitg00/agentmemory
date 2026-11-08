import type { IIIClient } from "iii-sdk";
import type { HttpRequest } from "@iii-dev/helpers/http";
import type { StateKV } from "../state/kv.js";
import { isLegacyGraphState, setGraphGenerationListener } from "../state/graph-generation.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { KV } from "../state/schema.js";
import type {
  Action,
  Crystal,
  GraphSnapshot,
  HealthSnapshot,
  Lesson,
  ProceduralMemory,
  SemanticMemory,
} from "../types.js";
import type { MetricsStore } from "../eval/metrics-store.js";
import type { ResilientProvider } from "../providers/resilient.js";
import { VERSION } from "../version.js";
import { getLatestHealth } from "../health/monitor.js";
import { UNINDEXED_SCAN_REUSE_MS, markLlmFunctions } from "../functions/status.js";
import { CONSOLIDATION_LAST_RUN_KEY, type ConsolidationRunRecord } from "../functions/consolidation-status.js";
import {
  getEmbeddingProvider,
  getIndexPersistenceStatus,
  getPendingVectorBackfillCount,
  getSearchIndex,
  getVectorIndex,
} from "../functions/search.js";
import {
  getViewerCounts,
  invalidateViewerCounts,
  noteGraphStats,
  readViewerGraphMetadata,
  noteRowChange,
  setViewerCountsEmitter,
  type CountedKind,
  type ViewerCounts,
} from "../state/viewer-counts.js";
import { detectLlmProviderKind, loadConfig } from "../config.js";
import { getLiveEventsStats } from "../viewer/live-events.js";
import { getBoundViewerPort, getViewerSkipped } from "../viewer/server.js";
import { buildConfigFlags, checkAuth, createConsolidationStatusReader, createStatusReporter } from "./api.js";
import { isStateDelete, sendViewerEvent } from "./events.js";
import { setAuditRecordedListener } from "../functions/audit.js";

type Response = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

type StatePayload<T> = {
  key: string;
  event_type: string;
  old_value?: T | null;
  new_value?: T | null;
};

const GRAPH_SNAPSHOT_KEY = "current";
const HEALTH_LATEST_KEY = "latest";
const GRAPH_ITEMS_COALESCE_MS = 1000;
const HEALTH_TICK_SCAN_MAX_AGE_MS = 2 * 60_000;

export interface ViewerStreamDeps {
  secret?: string;
  metricsStore?: MetricsStore;
  provider?: ResilientProvider | { circuitState?: unknown };
}

function eventId(prefix: string, key: string): string {
  return `${prefix}-${key}-${Date.now()}`;
}

function indexStats() {
  return {
    bm25Documents: getSearchIndex().size,
    vectorDocuments: getVectorIndex()?.size ?? 0,
    pendingVectorBackfill: getPendingVectorBackfillCount(),
    persistence: getIndexPersistenceStatus(),
  };
}

export function registerViewerStreamTriggers(
  sdk: IIIClient,
  kv: StateKV,
  deps: ViewerStreamDeps = {},
): void {
  const circuitBreaker = () =>
    deps.provider && "circuitState" in deps.provider ? deps.provider.circuitState ?? null : null;

  const statusReport = createStatusReporter(sdk, kv, { metricsStore: deps.metricsStore, provider: deps.provider });
  const consolidationStatus = createConsolidationStatusReader(kv);

  async function healthPayload(snapshot: HealthSnapshot | null, scanMaxAgeMs: number) {
    const [functionMetrics, counts, report] = await Promise.all([
      deps.metricsStore ? deps.metricsStore.getAll().catch(() => []) : Promise.resolve([]),
      getViewerCounts(kv),
      statusReport({ health: snapshot, scanMaxAgeMs }).catch(() => null),
    ]);
    return {
      status: snapshot?.status ?? "healthy",
      health: snapshot,
      liveEvents: getLiveEventsStats(),
      circuitBreaker: circuitBreaker(),
      functionMetrics: markLlmFunctions(functionMetrics, detectLlmProviderKind()),
      counts,
      indexes: indexStats(),
      report,
      generatedAt: new Date().toISOString(),
    };
  }

  setViewerCountsEmitter((counts: ViewerCounts) => {
    void sendViewerEvent(sdk, eventId("counts", "all"), "counts.changed", { counts }).catch(() => {});
  });

  function registerRowStream<T extends { id?: string }>(options: {
    functionId: string;
    scope: string;
    entity: string;
    countKind?: CountedKind;
  }): void {
    sdk.registerFunction(options.functionId, async (payload: StatePayload<T>) => {
      const deleted = isStateDelete(payload);
      const row = deleted ? null : payload.new_value ?? null;
      if (options.countKind) noteRowChange(options.countKind, payload.old_value, row);
      let type = `${options.entity}.updated`;
      if (deleted) type = `${options.entity}.deleted`;
      else if (!payload.old_value) type = `${options.entity}.created`;
      await sendViewerEvent(sdk, eventId(options.entity, payload.key), type, {
        id: payload.key,
        [options.entity]: row,
      });
      return { emitted: true };
    });
    sdk.registerTrigger({
      type: "state",
      function_id: options.functionId,
      config: { scope: options.scope },
    });
  }

  registerRowStream<Lesson>({ functionId: "event::viewer::lesson-changed", scope: KV.lessons, entity: "lesson", countKind: "lessons" });
  registerRowStream<Action>({ functionId: "event::viewer::action-changed", scope: KV.actions, entity: "action", countKind: "actions" });
  registerRowStream<Crystal>({ functionId: "event::viewer::crystal-changed", scope: KV.crystals, entity: "crystal", countKind: "crystals" });
  registerRowStream<SemanticMemory>({ functionId: "event::viewer::semantic-changed", scope: KV.semantic, entity: "semantic", countKind: "semantic" });
  registerRowStream<ProceduralMemory>({ functionId: "event::viewer::procedural-changed", scope: KV.procedural, entity: "procedural", countKind: "procedural" });
  setAuditRecordedListener((entry) => {
    void sendViewerEvent(sdk, eventId("audit", entry.id), "audit.created", { id: entry.id, audit: entry }).catch(() => {});
  });

  let lastGraphSnapshotEventAt = Number.NEGATIVE_INFINITY;
  let lastGraphGeneration: string | null | undefined;

  async function publishGraphMetadata(reset = false): Promise<void> {
    let graph: Awaited<ReturnType<typeof readViewerGraphMetadata>>;
    try {
      graph = await readViewerGraphMetadata(kv);
    } catch (error) {
      invalidateViewerCounts();
      lastGraphSnapshotEventAt = Number.NEGATIVE_INFINITY;
      await sendViewerEvent(sdk, eventId("graph", "invalidation"), "graph.changed", {
        source: "items", coveredBySnapshot: false, ...(reset ? { reset: true } : {}),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
      throw error;
    }
    reset ||= lastGraphGeneration !== undefined && lastGraphGeneration !== graph.generation;
    noteGraphStats(graph.stats);
    try {
      await sendViewerEvent(sdk, eventId("graph", "index"), "graph.changed", {
        source: "snapshot", ...graph, reset, delta: null,
      });
      lastGraphSnapshotEventAt = Date.now();
      lastGraphGeneration = graph.generation;
    } catch (error) {
      lastGraphSnapshotEventAt = Number.NEGATIVE_INFINITY;
      throw error;
    }
  }
  sdk.registerFunction(
    "event::viewer::graph-snapshot-changed",
    async (payload: StatePayload<GraphSnapshot>) => withKeyedLock("graph:viewer-events", async () => {
      if (payload.key !== GRAPH_SNAPSHOT_KEY) return { emitted: false };
      if (!await isLegacyGraphState(kv)) return { emitted: false };
      const snapshot = isStateDelete(payload) ? null : payload.new_value ?? null;
      if (snapshot?.pendingMutation) return { emitted: false };
      await publishGraphMetadata();
      return { emitted: true };
    }),
  );
  sdk.registerTrigger({
    type: "state",
    function_id: "event::viewer::graph-snapshot-changed",
    config: { scope: KV.graphSnapshot },
  });

  const pendingGraphItems = { nodes: 0, edges: 0, since: 0 };
  let graphItemsTimer: ReturnType<typeof setTimeout> | null = null;
  async function flushGraphItems(): Promise<void> {
    graphItemsTimer = null;
    const nodesChanged = pendingGraphItems.nodes;
    const edgesChanged = pendingGraphItems.edges;
    const coveredBySnapshot = lastGraphSnapshotEventAt >= pendingGraphItems.since - GRAPH_ITEMS_COALESCE_MS;
    pendingGraphItems.nodes = 0;
    pendingGraphItems.edges = 0;
    if (nodesChanged === 0 && edgesChanged === 0) return;
    noteGraphStats((await readViewerGraphMetadata(kv).catch(() => null))?.stats);
    await sendViewerEvent(sdk, eventId("graph", "items"), "graph.changed", {
      source: "items",
      nodesChanged,
      edgesChanged,
      coveredBySnapshot,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }
  function noteGraphItem(kind: "nodes" | "edges"): void {
    pendingGraphItems[kind] += 1;
    if (graphItemsTimer) return;
    pendingGraphItems.since = Date.now();
    graphItemsTimer = setTimeout(() => { void flushGraphItems(); }, GRAPH_ITEMS_COALESCE_MS);
    if (typeof graphItemsTimer === "object" && "unref" in graphItemsTimer) graphItemsTimer.unref();
  }
  for (const [kind, scope] of [["nodes", KV.graphNodes], ["edges", KV.graphEdges]] as const) {
    const functionId = `event::viewer::graph-${kind}-changed`;
    sdk.registerFunction(functionId, async () => withKeyedLock("graph:viewer-events", async () => {
      if (!await isLegacyGraphState(kv)) return { emitted: false };
      noteGraphItem(kind);
      return { emitted: true };
    }));
    sdk.registerTrigger({ type: "state", function_id: functionId, config: { scope } });
  }

  setGraphGenerationListener(async (kind) => withKeyedLock("graph:viewer-events", async () => {
    if (kind === "nodes" || kind === "edges") {
      noteGraphItem(kind);
      return;
    }
    if (kind === "reset") {
      if (graphItemsTimer) clearTimeout(graphItemsTimer);
      graphItemsTimer = null;
      pendingGraphItems.nodes = 0;
      pendingGraphItems.edges = 0;
    }
    await publishGraphMetadata(kind === "reset");
  }));

  sdk.registerFunction(
    "event::viewer::consolidation-changed",
    async (payload: StatePayload<ConsolidationRunRecord>) => {
      if (payload.key !== CONSOLIDATION_LAST_RUN_KEY || isStateDelete(payload)) {
        return { emitted: false };
      }
      const lastRun = payload.new_value ?? null;
      await sendViewerEvent(sdk, eventId("consolidation", "run"), "consolidation.run", {
        lastRun,
        status: await consolidationStatus({ lastRun }).catch(() => null),
      });
      return { emitted: true };
    },
  );
  sdk.registerTrigger({
    type: "state",
    function_id: "event::viewer::consolidation-changed",
    config: { scope: KV.config },
  });

  sdk.registerFunction(
    "event::viewer::health-changed",
    async (payload: StatePayload<HealthSnapshot>) => {
      if (payload.key !== HEALTH_LATEST_KEY || isStateDelete(payload)) {
        return { emitted: false };
      }
      await sendViewerEvent(
        sdk,
        eventId("health", "latest"),
        "health",
        await healthPayload(payload.new_value ?? null, HEALTH_TICK_SCAN_MAX_AGE_MS),
      );
      return { emitted: true };
    },
  );
  sdk.registerTrigger({
    type: "state",
    function_id: "event::viewer::health-changed",
    config: { scope: KV.health },
  });

  const { restPort } = loadConfig();

  sdk.registerFunction("api::viewer-snapshot",
    async (req: HttpRequest): Promise<Response> => {
      const authErr = checkAuth(req, deps.secret);
      if (authErr) return authErr;
      const [health, graph, lastRun] = await Promise.all([
        getLatestHealth(kv).catch(() => null),
        readViewerGraphMetadata(kv).catch(() => null),
        kv.get<ConsolidationRunRecord>(KV.config, CONSOLIDATION_LAST_RUN_KEY).catch(() => null),
      ]);
      return {
        status_code: 200,
        body: {
          version: VERSION,
          service: "agentmemory",
          viewerPort: getBoundViewerPort(),
          viewerSkipped: getViewerSkipped(),
          restPort,
          provider: detectLlmProviderKind(),
          embeddingProvider: getEmbeddingProvider()?.name ?? "none",
          flags: buildConfigFlags(),
          graph,
          consolidation: {
            lastRun: lastRun ?? null,
            status: await consolidationStatus({ lastRun: lastRun ?? null }).catch(() => null),
          },
          ...(await healthPayload(health ?? null, UNINDEXED_SCAN_REUSE_MS)),
        },
      };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::viewer-snapshot",
    config: {
      api_path: "/agentmemory/viewer/snapshot",
      http_method: "GET",
      middleware_function_ids: ["middleware::api-auth"],
    },
  });

  sdk.registerFunction("api::counts",
    async (req: HttpRequest): Promise<Response> => {
      const authErr = checkAuth(req, deps.secret);
      if (authErr) return authErr;
      return { status_code: 200, body: { counts: await getViewerCounts(kv) } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::counts",
    config: {
      api_path: "/agentmemory/counts",
      http_method: "GET",
      middleware_function_ids: ["middleware::api-auth"],
    },
  });
}
