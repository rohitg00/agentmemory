import { init } from "iii-sdk";
import {
  loadConfig,
  getEnvVar,
  loadEmbeddingConfig,
  loadFallbackConfig,
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
import { registerApiTriggers } from "./triggers/api.js";
import { registerEventTriggers } from "./triggers/events.js";
import { registerMcpEndpoints } from "./mcp/server.js";
import { MetricsStore } from "./eval/metrics-store.js";
import { DedupMap } from "./functions/dedup.js";
import { registerHealthMonitor } from "./health/monitor.js";
import { initMetrics, OTEL_CONFIG } from "./telemetry/setup.js";

async function main() {
  const config = loadConfig();
  const embeddingConfig = loadEmbeddingConfig();
  const fallbackConfig = loadFallbackConfig();

  const provider =
    fallbackConfig.providers.length > 0
      ? createFallbackProvider(config.provider, fallbackConfig)
      : createProvider(config.provider);

  const embeddingProvider = createEmbeddingProvider();

  console.log(`[agentmemory] Starting worker v0.3.0...`);
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
  registerObserveFunction(sdk, kv, dedupMap);
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

  const bm25Index = getSearchIndex();
  const hybridSearch = new HybridSearch(
    bm25Index,
    vectorIndex,
    embeddingProvider,
    kv,
    embeddingConfig.bm25Weight,
    embeddingConfig.vectorWeight,
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
  if (loaded?.bm25) {
    const restoredCount = loaded.bm25.size;
    if (restoredCount > 0) {
      console.log(
        `[agentmemory] Loaded persisted BM25 index (${restoredCount} docs)`,
      );
    }
  }

  const needsRebuild =
    !loaded?.bm25 ||
    loaded.bm25.size === 0 ||
    (embeddingProvider && vectorIndex && vectorIndex.size === 0);

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
    `[agentmemory] Ready. ${embeddingProvider ? "Hybrid" : "BM25"} search active.`,
  );
  console.log(`[agentmemory] Endpoints: 28 REST + 10 MCP tools + 21 functions`);

  const shutdown = async () => {
    console.log(`\n[agentmemory] Shutting down...`);
    healthMonitor.stop();
    dedupMap.stop();
    indexPersistence.stop();
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
