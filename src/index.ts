import { init } from "iii-sdk";
import {
  loadConfig,
  getEnvVar,
  loadEmbeddingConfig,
  loadFallbackConfig,
  loadClaudeBridgeConfig,
  loadTeamConfig,
  loadSnapshotConfig,
  isGraphExtractionEnabled,
  isConsolidationEnabled,
} from "./config.js";
import {
  createProvider,
  createFallbackProvider,
  createEmbeddingProvider,
} from "./providers/index.js";
import { StateKV } from "./state/kv.js";
import { VectorIndex } from "./state/vector-index.js";
import { HybridSearch } from "./state/hybrid-search.js";
import { IndexPersistence } from "./state/index-persistence.js";
import { registerPrivacyFunction } from "./functions/privacy.js";
import { registerObserveFunction } from "./functions/observe.js";
import { registerCompressFunction } from "./functions/compress.js";
import {
  registerSearchFunction,
  rebuildIndex,
  getSearchIndex,
} from "./functions/search.js";
import { registerContextFunction } from "./functions/context.js";
import { registerSummarizeFunction } from "./functions/summarize.js";
import { registerMigrateFunction } from "./functions/migrate.js";
import { registerFileIndexFunction } from "./functions/file-index.js";
import { registerConsolidateFunction } from "./functions/consolidate.js";
import { registerPatternsFunction } from "./functions/patterns.js";
import { registerRememberFunction } from "./functions/remember.js";
import { registerEvictFunction } from "./functions/evict.js";
import { registerRelationsFunction } from "./functions/relations.js";
import { registerTimelineFunction } from "./functions/timeline.js";
import { registerSmartSearchFunction } from "./functions/smart-search.js";
import { registerProfileFunction } from "./functions/profile.js";
import { registerAutoForgetFunction } from "./functions/auto-forget.js";
import { registerExportImportFunction } from "./functions/export-import.js";
import { registerEnrichFunction } from "./functions/enrich.js";
import { registerClaudeBridgeFunction } from "./functions/claude-bridge.js";
import { registerGraphFunction } from "./functions/graph.js";
import { registerConsolidationPipelineFunction } from "./functions/consolidation-pipeline.js";
import { registerTeamFunction } from "./functions/team.js";
import { registerGovernanceFunction } from "./functions/governance.js";
import { registerSnapshotFunction } from "./functions/snapshot.js";
import { registerActionsFunction } from "./functions/actions.js";
import { registerFrontierFunction } from "./functions/frontier.js";
import { registerLeasesFunction } from "./functions/leases.js";
import { registerRoutinesFunction } from "./functions/routines.js";
import { registerSignalsFunction } from "./functions/signals.js";
import { registerCheckpointsFunction } from "./functions/checkpoints.js";
import { registerFlowCompressFunction } from "./functions/flow-compress.js";
import { registerMeshFunction } from "./functions/mesh.js";
import { registerBranchAwareFunction } from "./functions/branch-aware.js";
import { registerSentinelsFunction } from "./functions/sentinels.js";
import { registerSketchesFunction } from "./functions/sketches.js";
import { registerCrystallizeFunction } from "./functions/crystallize.js";
import { registerDiagnosticsFunction } from "./functions/diagnostics.js";
import { registerFacetsFunction } from "./functions/facets.js";
import { registerVerifyFunction } from "./functions/verify.js";
import { registerCascadeFunction } from "./functions/cascade.js";
import { registerLessonsFunctions } from "./functions/lessons.js";
import { registerObsidianExportFunction } from "./functions/obsidian-export.js";
import { registerSlidingWindowFunction } from "./functions/sliding-window.js";
import { registerQueryExpansionFunction } from "./functions/query-expansion.js";
import { registerTemporalGraphFunctions } from "./functions/temporal-graph.js";
import { registerRetentionFunctions } from "./functions/retention.js";
import { registerApiTriggers } from "./triggers/api.js";
import { registerEventTriggers } from "./triggers/events.js";
import { registerMcpEndpoints } from "./mcp/server.js";
import { startViewerServer } from "./viewer/server.js";
import { MetricsStore } from "./eval/metrics-store.js";
import { DedupMap } from "./functions/dedup.js";
import { registerHealthMonitor } from "./health/monitor.js";
import { initMetrics, OTEL_CONFIG } from "./telemetry/setup.js";
import { VERSION } from "./version.js";

async function main() {
  const config = loadConfig();
  const embeddingConfig = loadEmbeddingConfig();
  const fallbackConfig = loadFallbackConfig();

  const provider =
    fallbackConfig.providers.length > 0
      ? createFallbackProvider(config.provider, fallbackConfig)
      : createProvider(config.provider);

  const embeddingProvider = createEmbeddingProvider();

  console.log(`[agentmemory] Starting worker v${VERSION}...`);
  console.log(`[agentmemory] Engine: ${config.engineUrl}`);
  console.log(
    `[agentmemory] Provider: ${config.provider.provider} (${config.provider.model})`,
  );
  if (embeddingProvider) {
    console.log(
      `[agentmemory] Embedding provider: ${embeddingProvider.name} (${embeddingProvider.dimensions} dims)`,
    );
  } else {
    console.log(`[agentmemory] Embedding provider: none (BM25-only mode)`);
  }
  console.log(
    `[agentmemory] REST API: http://localhost:${config.restPort}/agentmemory/*`,
  );
  console.log(`[agentmemory] Streams: ws://localhost:${config.streamsPort}`);

  const sdk = init(config.engineUrl, {
    workerName: "agentmemory",
    otel: {
      serviceName: OTEL_CONFIG.serviceName,
      serviceVersion: OTEL_CONFIG.serviceVersion,
      metricsExportIntervalMs: OTEL_CONFIG.metricsExportIntervalMs,
    },
  });

  const kv = new StateKV(sdk);
  const secret = getEnvVar("AGENTMEMORY_SECRET");
  const metricsStore = new MetricsStore(kv);
  const dedupMap = new DedupMap();

  const vectorIndex = embeddingProvider ? new VectorIndex() : null;

  initMetrics(
    typeof (sdk as any).getMeter === "function"
      ? (sdk as any).getMeter.bind(sdk)
      : undefined,
  );

  registerPrivacyFunction(sdk);
  registerObserveFunction(sdk, kv, dedupMap, config.maxObservationsPerSession);
  registerCompressFunction(sdk, kv, provider, metricsStore);
  registerSearchFunction(sdk, kv);
  registerContextFunction(sdk, kv, config.tokenBudget);
  registerSummarizeFunction(sdk, kv, provider, metricsStore);
  registerMigrateFunction(sdk, kv);
  registerFileIndexFunction(sdk, kv);
  registerConsolidateFunction(sdk, kv, provider);
  registerPatternsFunction(sdk, kv);
  registerRememberFunction(sdk, kv);
  registerEvictFunction(sdk, kv);

  registerRelationsFunction(sdk, kv);
  registerTimelineFunction(sdk, kv);
  registerProfileFunction(sdk, kv);
  registerAutoForgetFunction(sdk, kv);
  registerExportImportFunction(sdk, kv);
  registerEnrichFunction(sdk, kv);

  const claudeBridgeConfig = loadClaudeBridgeConfig();
  if (claudeBridgeConfig.enabled) {
    registerClaudeBridgeFunction(sdk, kv, claudeBridgeConfig);
    console.log(
      `[agentmemory] Claude bridge: syncing to ${claudeBridgeConfig.memoryFilePath}`,
    );
  }

  if (isGraphExtractionEnabled()) {
    registerGraphFunction(sdk, kv, provider);
    console.log(`[agentmemory] Knowledge graph: extraction enabled`);
  }

  registerConsolidationPipelineFunction(sdk, kv, provider);
  console.log(`[agentmemory] Consolidation pipeline: registered (CONSOLIDATION_ENABLED=${isConsolidationEnabled() ? "true" : "false"})`);

  const teamConfig = loadTeamConfig();
  if (teamConfig) {
    registerTeamFunction(sdk, kv, teamConfig);
    console.log(
      `[agentmemory] Team memory: ${teamConfig.teamId} (${teamConfig.mode})`,
    );
  }

  registerGovernanceFunction(sdk, kv);

  registerActionsFunction(sdk, kv);
  registerFrontierFunction(sdk, kv);
  registerLeasesFunction(sdk, kv);
  registerRoutinesFunction(sdk, kv);
  registerSignalsFunction(sdk, kv);
  registerCheckpointsFunction(sdk, kv);
  registerMeshFunction(sdk, kv);
  registerBranchAwareFunction(sdk, kv);
  registerFlowCompressFunction(sdk, kv, provider);
  registerSentinelsFunction(sdk, kv);
  registerSketchesFunction(sdk, kv);
  registerCrystallizeFunction(sdk, kv, provider);
  registerDiagnosticsFunction(sdk, kv);
  registerFacetsFunction(sdk, kv);
  registerVerifyFunction(sdk, kv);
  registerLessonsFunctions(sdk, kv);
  registerObsidianExportFunction(sdk, kv);
  registerCascadeFunction(sdk, kv);

  registerSlidingWindowFunction(sdk, kv, provider);
  registerQueryExpansionFunction(sdk, provider);
  registerTemporalGraphFunctions(sdk, kv, provider);
  registerRetentionFunctions(sdk, kv);
  console.log(
    `[agentmemory] v0.6 advanced retrieval: sliding-window, query-expansion, temporal-graph, retention-scoring`,
  );
  console.log(
    `[agentmemory] Orchestration layer: actions, frontier, leases, routines, signals, checkpoints, flow-compress, mesh, branch-aware, sentinels, sketches, crystallize, diagnostics, facets`,
  );

  const snapshotConfig = loadSnapshotConfig();
  if (snapshotConfig.enabled) {
    registerSnapshotFunction(sdk, kv, snapshotConfig.dir);
    console.log(
      `[agentmemory] Git snapshots: ${snapshotConfig.dir} (every ${snapshotConfig.interval}s)`,
    );
  }

  const bm25Index = getSearchIndex();
  const graphWeight = parseFloat(getEnvVar("AGENTMEMORY_GRAPH_WEIGHT") || "0.3");
  const hybridSearch = new HybridSearch(
    bm25Index,
    vectorIndex,
    embeddingProvider,
    kv,
    embeddingConfig.bm25Weight,
    embeddingConfig.vectorWeight,
    graphWeight,
  );

  registerSmartSearchFunction(sdk, kv, (query, limit) =>
    hybridSearch.search(query, limit),
  );

  registerApiTriggers(sdk, kv, secret, metricsStore, provider);
  registerEventTriggers(sdk, kv);
  registerMcpEndpoints(sdk, kv, secret);

  const healthMonitor = registerHealthMonitor(sdk, kv);

  const indexPersistence = new IndexPersistence(kv, bm25Index, vectorIndex);

  const loaded = await indexPersistence.load().catch((err) => {
    console.warn(`[agentmemory] Failed to load persisted index:`, err);
    return null;
  });
  if (loaded?.bm25 && loaded.bm25.size > 0) {
    bm25Index.restoreFrom(loaded.bm25);
    console.log(
      `[agentmemory] Loaded persisted BM25 index (${bm25Index.size} docs)`,
    );
  }
  if (loaded?.vector && vectorIndex && loaded.vector.size > 0) {
    vectorIndex.restoreFrom(loaded.vector);
    console.log(
      `[agentmemory] Loaded persisted vector index (${vectorIndex.size} vectors)`,
    );
  }

  const needsRebuild = bm25Index.size === 0;

  if (needsRebuild) {
    const indexCount = await rebuildIndex(kv).catch((err) => {
      console.warn(`[agentmemory] Failed to rebuild search index:`, err);
      return 0;
    });
    if (indexCount > 0) {
      console.log(
        `[agentmemory] Search index rebuilt: ${indexCount} observations`,
      );
      indexPersistence.scheduleSave();
    }
  }

  console.log(
    `[agentmemory] Ready. ${embeddingProvider ? "Triple-stream (BM25+Vector+Graph)" : "BM25+Graph"} search active.`,
  );
  console.log(
    `[agentmemory] Endpoints: 100 REST + 41 MCP tools + 6 MCP resources + 3 MCP prompts`,
  );

  const viewerPort = config.restPort + 2;
  const viewerServer = startViewerServer(
    viewerPort,
    kv,
    sdk,
    secret,
    config.restPort,
  );

  const autoForgetIntervalMs = parseInt(process.env.AUTO_FORGET_INTERVAL_MS || "3600000", 10);
  const consolidationIntervalMs = parseInt(process.env.CONSOLIDATION_INTERVAL_MS || "7200000", 10);

  if (process.env.AUTO_FORGET_ENABLED !== "false") {
    const autoForgetTimer = setInterval(async () => {
      try {
        await sdk.trigger("mem::auto-forget", { dryRun: false });
      } catch {}
    }, autoForgetIntervalMs);
    autoForgetTimer.unref();
    console.log(`[agentmemory] Auto-forget: enabled (every ${autoForgetIntervalMs / 60000}m)`);
  }

  if (process.env.LESSON_DECAY_ENABLED !== "false") {
    const lessonDecayTimer = setInterval(async () => {
      try {
        await sdk.trigger("mem::lesson-decay-sweep", {});
      } catch {}
    }, 86400000);
    lessonDecayTimer.unref();
    console.log(`[agentmemory] Lesson decay sweep: enabled (every 24h)`);
  }

  if (isConsolidationEnabled()) {
    const consolidationTimer = setInterval(async () => {
      try {
        await sdk.trigger("mem::consolidate-pipeline", {});
      } catch {}
    }, consolidationIntervalMs);
    consolidationTimer.unref();
    console.log(`[agentmemory] Auto-consolidation: enabled (every ${consolidationIntervalMs / 60000}m)`);
  }

  const shutdown = async () => {
    console.log(`\n[agentmemory] Shutting down...`);
    healthMonitor.stop();
    dedupMap.stop();
    indexPersistence.stop();
    await new Promise<void>((resolve) => viewerServer.close(() => resolve()));
    await indexPersistence.save().catch((err) => {
      console.warn(`[agentmemory] Failed to save index on shutdown:`, err);
    });
    await sdk.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`[agentmemory] Fatal:`, err);
  process.exit(1);
});
