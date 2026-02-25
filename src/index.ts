import { init } from 'iii-sdk'
import { loadConfig } from './config.js'
import { createProvider } from './providers/index.js'
import { StateKV } from './state/kv.js'
import { registerPrivacyFunction } from './functions/privacy.js'
import { registerObserveFunction } from './functions/observe.js'
import { registerCompressFunction } from './functions/compress.js'
import { registerSearchFunction, rebuildIndex } from './functions/search.js'
import { registerContextFunction } from './functions/context.js'
import { registerSummarizeFunction } from './functions/summarize.js'
import { registerMigrateFunction } from './functions/migrate.js'
import { registerApiTriggers } from './triggers/api.js'
import { registerEventTriggers } from './triggers/events.js'

async function main() {
  const config = loadConfig()
  const provider = createProvider(config.provider)

  console.log(`[agentmemory] Starting worker...`)
  console.log(`[agentmemory] Engine: ${config.engineUrl}`)
  console.log(`[agentmemory] Provider: ${config.provider.provider} (${config.provider.model})`)
  console.log(`[agentmemory] REST API: http://localhost:${config.restPort}/agentmemory/*`)
  console.log(`[agentmemory] Streams: ws://localhost:${config.streamsPort}`)

  const sdk = init(config.engineUrl, {
    workerName: 'agentmemory',
  })

  const kv = new StateKV(sdk)

  registerPrivacyFunction(sdk)
  registerObserveFunction(sdk, kv)
  registerCompressFunction(sdk, kv, provider)
  registerSearchFunction(sdk, kv)
  registerContextFunction(sdk, kv, config.tokenBudget)
  registerSummarizeFunction(sdk, kv, provider)
  registerMigrateFunction(sdk, kv)

  registerApiTriggers(sdk, kv)
  registerEventTriggers(sdk)

  const indexCount = await rebuildIndex(kv).catch(() => 0)
  if (indexCount > 0) {
    console.log(`[agentmemory] Search index: ${indexCount} observations`)
  }

  console.log(`[agentmemory] Ready. Endpoints:`)
  console.log(`  POST /agentmemory/session/start   - Start session + get context`)
  console.log(`  POST /agentmemory/observe          - Capture observation`)
  console.log(`  POST /agentmemory/context           - Generate context`)
  console.log(`  POST /agentmemory/search            - Search observations`)
  console.log(`  POST /agentmemory/summarize         - Summarize session`)
  console.log(`  GET  /agentmemory/sessions          - List sessions`)
  console.log(`  GET  /agentmemory/observations      - Get session observations`)
  console.log(`  GET  /agentmemory/health            - Health check`)
  console.log(`  GET  /agentmemory/viewer            - Web viewer`)
  console.log(`  POST /agentmemory/migrate           - Import from SQLite`)

  process.on('SIGINT', async () => {
    console.log(`\n[agentmemory] Shutting down...`)
    await sdk.shutdown()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await sdk.shutdown()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(`[agentmemory] Fatal:`, err)
  process.exit(1)
})
