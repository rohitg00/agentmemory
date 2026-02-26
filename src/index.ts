import { init } from "iii-sdk";
import { loadConfig, getEnvVar } from "./config.js";
import { createProvider } from "./providers/index.js";
import { StateKV } from "./state/kv.js";
import { registerPrivacyFunction } from "./functions/privacy.js";
import { registerObserveFunction } from "./functions/observe.js";
import { registerCompressFunction } from "./functions/compress.js";
import { registerSearchFunction, rebuildIndex } from "./functions/search.js";
import { registerContextFunction } from "./functions/context.js";
import { registerSummarizeFunction } from "./functions/summarize.js";
import { registerMigrateFunction } from "./functions/migrate.js";
import { registerFileIndexFunction } from "./functions/file-index.js";
import { registerConsolidateFunction } from "./functions/consolidate.js";
import { registerPatternsFunction } from "./functions/patterns.js";
import { registerRememberFunction } from "./functions/remember.js";
import { registerEvictFunction } from "./functions/evict.js";
import { registerApiTriggers } from "./triggers/api.js";
import { registerEventTriggers } from "./triggers/events.js";
import { registerMcpEndpoints } from "./mcp/server.js";
import { MetricsStore } from "./eval/metrics-store.js";
import { DedupMap } from "./functions/dedup.js";
import { ObservationQueue } from "./health/recovery.js";
import { registerHealthMonitor, getLatestHealth } from "./health/monitor.js";
import { initMetrics, OTEL_CONFIG } from "./telemetry/setup.js";

async function main() {
  const config = loadConfig();
  const provider = createProvider(config.provider);

  console.log(`[agentmemory] Starting worker v0.2.0...`);
  console.log(`[agentmemory] Engine: ${config.engineUrl}`);
  console.log(
    `[agentmemory] Provider: ${config.provider.provider} (${config.provider.model})`,
  );
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
  const observationQueue = new ObservationQueue();

  const { counters, histograms } = initMetrics(
    typeof sdk.getMeter === "function" ? sdk.getMeter.bind(sdk) : undefined,
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

  registerApiTriggers(sdk, kv, secret, metricsStore, provider);
  registerEventTriggers(sdk, kv);
  registerMcpEndpoints(sdk, kv, secret);

  const healthMonitor = registerHealthMonitor(sdk, kv);

  const indexCount = await rebuildIndex(kv).catch(() => 0);
  if (indexCount > 0) {
    console.log(`[agentmemory] Search index: ${indexCount} observations`);
  }

  console.log(`[agentmemory] Ready. Endpoints:`);
  console.log(
    `  POST /agentmemory/session/start   - Start session + get context`,
  );
  console.log(`  POST /agentmemory/observe          - Capture observation`);
  console.log(`  POST /agentmemory/context           - Generate context`);
  console.log(`  POST /agentmemory/search            - Search observations`);
  console.log(`  POST /agentmemory/summarize         - Summarize session`);
  console.log(
    `  POST /agentmemory/remember          - Save to long-term memory`,
  );
  console.log(`  POST /agentmemory/forget            - Delete memory data`);
  console.log(`  POST /agentmemory/file-context      - File history context`);
  console.log(`  POST /agentmemory/consolidate       - Consolidate memories`);
  console.log(`  POST /agentmemory/patterns          - Detect patterns`);
  console.log(`  POST /agentmemory/evict             - Evict stale memories`);
  console.log(`  GET  /agentmemory/sessions          - List sessions`);
  console.log(
    `  GET  /agentmemory/observations      - Get session observations`,
  );
  console.log(`  GET  /agentmemory/health            - Health + metrics`);
  console.log(`  GET  /agentmemory/viewer            - Web viewer`);
  console.log(
    `  POST /agentmemory/generate-rules     - Generate rules from patterns`,
  );
  console.log(`  POST /agentmemory/migrate           - Import from SQLite`);
  console.log(`  GET  /agentmemory/mcp/tools         - MCP tool listing`);
  console.log(`  POST /agentmemory/mcp/call          - MCP tool execution`);

  const shutdown = async () => {
    console.log(`\n[agentmemory] Shutting down...`);
    healthMonitor.stop();
    dedupMap.stop();
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
