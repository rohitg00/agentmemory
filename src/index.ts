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
import { registerApiTriggers } from "./triggers/api.js";
import { registerEventTriggers } from "./triggers/events.js";
import { registerMcpEndpoints } from "./mcp/server.js";

async function main() {
  const config = loadConfig();
  const provider = createProvider(config.provider);

  console.log(`[agentmemory] Starting worker...`);
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
  });

  const kv = new StateKV(sdk);
  const secret = getEnvVar("AGENTMEMORY_SECRET");

  registerPrivacyFunction(sdk);
  registerObserveFunction(sdk, kv);
  registerCompressFunction(sdk, kv, provider);
  registerSearchFunction(sdk, kv);
  registerContextFunction(sdk, kv, config.tokenBudget);
  registerSummarizeFunction(sdk, kv, provider);
  registerMigrateFunction(sdk, kv);
  registerFileIndexFunction(sdk, kv);
  registerConsolidateFunction(sdk, kv, provider);
  registerPatternsFunction(sdk, kv);
  registerRememberFunction(sdk, kv);

  registerApiTriggers(sdk, kv, secret);
  registerEventTriggers(sdk, kv);
  registerMcpEndpoints(sdk, kv, secret);

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
  console.log(`  GET  /agentmemory/sessions          - List sessions`);
  console.log(
    `  GET  /agentmemory/observations      - Get session observations`,
  );
  console.log(`  GET  /agentmemory/health            - Health check`);
  console.log(`  GET  /agentmemory/viewer            - Web viewer`);
  console.log(
    `  POST /agentmemory/generate-rules     - Generate rules from patterns`,
  );
  console.log(`  POST /agentmemory/migrate           - Import from SQLite`);
  console.log(`  GET  /agentmemory/mcp/tools         - MCP tool listing`);
  console.log(`  POST /agentmemory/mcp/call          - MCP tool execution`);

  const shutdown = async () => {
    console.log(`\n[agentmemory] Shutting down...`);
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
