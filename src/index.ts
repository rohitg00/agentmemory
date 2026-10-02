import { registerWorker, TriggerAction } from "iii-sdk";
import {
  hydrateProcessEnvFromFile,
  loadConfig,
  getEnvVar,
  loadEmbeddingConfig,
  loadFallbackConfig,
  loadClaudeBridgeConfig,
  loadTeamConfig,
  loadSnapshotConfig,
  isGraphExtractionEnabled,
  isAutoCompressEnabled,
  isConsolidationEnabled,
  getConsolidationIntervalMs,
  isContextInjectionEnabled,
  isDropStaleIndexEnabled,
  getAuditRetentionMonths,
  getStateBackend,
  isSessionSweepEnabled,
  isGraphCompactOnBootEnabled,
  getSessionSweepStaleHours,
} from "./config.js";
import {
  createProvider,
  createFallbackProvider,
  createEmbeddingProvider,
  createImageEmbeddingProvider,
} from "./providers/index.js";
import { StateKV } from "./state/kv.js";
import { VectorIndex } from "./state/vector-index.js";
import { HybridSearch } from "./state/hybrid-search.js";
import { IndexPersistence } from "./state/index-persistence.js";
import { SHUTDOWN_FLUSH_TIMEOUT_MS, SHUTDOWN_HARD_EXIT_MS, settleWithin } from "./shutdown.js";
import { registerPrivacyFunction, withWriteScrubbing } from "./functions/privacy.js";
import { registerObserveFunction } from "./functions/observe.js";
import { registerCaptureFunctions } from "./functions/capture.js";
import { seedViewerStreamTracker } from "./state/viewer-stream.js";
import { registerImageQuotaCleanup } from "./functions/image-quota-cleanup.js";
import { registerVisionSearchFunctions } from "./functions/vision-search.js";
import { registerSlotsFunctions, isSlotsEnabled, isReflectEnabled } from "./functions/slots.js";
import { registerDiskSizeManager } from "./functions/disk-size-manager.js";
import { registerCompressFunction } from "./functions/compress.js";
import {
  registerSearchFunction,
  backfillVectors,
  rebuildKeywordIndex,
  markKeywordRebuildPending,
  getSearchIndex,
  setVectorIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  setHybridRanker,
  setPendingVectorBackfillCount,
  setVectorBackfillState,
} from "./functions/search.js";
import { registerContextFunction } from "./functions/context.js";
import { registerSessionIndexMaintenanceFunction } from "./functions/session-index-maintenance.js";
import { rebuildSessionIndexIfStale } from "./state/session-index.js";
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
import { registerRecentSearchesSweepFunction } from "./functions/recent-searches-sweep.js";
import { registerSessionSweepFunction } from "./functions/session-sweep.js";
import { registerProfileFunction } from "./functions/profile.js";
import { registerAutoForgetFunction } from "./functions/auto-forget.js";
import { registerExportImportFunction } from "./functions/export-import.js";
import { registerEnrichFunction } from "./functions/enrich.js";
import { registerClaudeBridgeFunction } from "./functions/claude-bridge.js";
import { registerGraphFunction } from "./functions/graph.js";
import { GRAPH_COMPACT_BOOT_DELAY_MS, runGraphCompactOnBoot, setGraphCompactBootDisabled } from "./functions/graph-compact-boot.js";
import { registerGraphImportFunction } from "./functions/graph-import.js";
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
import { registerReflectFunctions } from "./functions/reflect.js";
import { registerWorkingMemoryFunctions } from "./functions/working-memory.js";
import { registerSkillExtractFunctions } from "./functions/skill-extract.js";
import { registerSlidingWindowFunction } from "./functions/sliding-window.js";
import { registerQueryExpansionFunction } from "./functions/query-expansion.js";
import { registerTemporalGraphFunctions } from "./functions/temporal-graph.js";
import { registerRetentionFunctions } from "./functions/retention.js";
import { startAuditMigration } from "./functions/audit.js";
import { registerCompressFileFunction } from "./functions/compress-file.js";
import { registerReplayFunctions } from "./functions/replay.js";
import { registerApiTriggers } from "./triggers/api.js";
import { registerEventTriggers } from "./triggers/events.js";
import { registerViewerStreamTriggers } from "./triggers/viewer-streams.js";
import { registerMcpEndpoints } from "./mcp/server.js";
import { getAllTools } from "./mcp/tools-registry.js";
import { startViewerServer } from "./viewer/server.js";
import { MetricsStore } from "./eval/metrics-store.js";
import { DedupMap } from "./functions/dedup.js";
import { registerHealthMonitor } from "./health/monitor.js";
import { createStreamRelayProbe } from "./health/stream-relay-probe.js";
import { initMetrics, OTEL_CONFIG } from "./telemetry/setup.js";
import { VERSION } from "./version.js";
import { bootLog, bootWarn } from "./logger.js";
import { runtimeMetadataPath } from "./runtime-paths.js";
import { ensureServerSecret, explicitSecret, secretFilePath } from "./secret-store.js";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

function workerPidfilePath(): string {
  return runtimeMetadataPath("worker.pid");
}
function writeWorkerPidfile(): void {
  try {
    const p = workerPidfilePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${process.pid}\n`, { encoding: "utf-8" });
  } catch {
    // best-effort; stop still has the engine pidfile + port scan fallback
  }
}
function clearWorkerPidfile(): void {
  try {
    unlinkSync(workerPidfilePath());
  } catch {}
}

function hasGetMeter(
  sdk: unknown,
): sdk is { getMeter: (name: string) => unknown } {
  return (
    typeof sdk === "object" &&
    sdk !== null &&
    "getMeter" in sdk &&
    typeof (sdk as { getMeter?: unknown }).getMeter === "function"
  );
}

// Top-level safety net for iii-engine invocation timeouts (issue #204).
// Under sustained write load (e.g. Claude Code hooks across many
// projects) `state::set` can occasionally exceed the SDK's 30s timeout.
// We don't want one such timeout to terminate the long-lived memory
// service — the rejection is surfaced to the relevant call site via
// .catch() where it matters; everything else is logged-and-continued.
// Throttle logs to avoid spamming on bursts.
let lastUnhandledLogAt = 0;
process.on("unhandledRejection", (reason) => {
  const now = Date.now();
  if (now - lastUnhandledLogAt < 60_000) return;
  lastUnhandledLogAt = now;
  const r = reason as { code?: string; function_id?: string; message?: string };
  console.warn(
    `[agentmemory] unhandledRejection (suppressed):`,
    r?.code ? `${r.code} ${r.function_id ?? ""} ${r.message ?? ""}`.trim() : reason,
  );
});

function resolveWorkerSecret(): string {
  try {
    const { secret, source } = ensureServerSecret();
    if (source === "generated") {
      bootLog(`Generated an API secret at ${secretFilePath()} (mode 0600). Local clients read it automatically.`);
    }
    return secret;
  } catch (err) {
    throw new Error(
      `agentmemory could not create its API secret at ${secretFilePath()}: ${err instanceof Error ? err.message : String(err)}. Set AGENTMEMORY_SECRET explicitly or make the directory writable.`,
    );
  }
}

async function main() {
  // Fold ~/.agentmemory/.env into process.env before anything reads config
  // or raw process.env. Only-if-unset, so real process.env still wins.
  hydrateProcessEnvFromFile();

  const config = loadConfig();
  const embeddingConfig = loadEmbeddingConfig();
  const fallbackConfig = loadFallbackConfig();

  const provider =
    fallbackConfig.providers.length > 0
      ? createFallbackProvider(config.provider, fallbackConfig)
      : createProvider(config.provider);

  const embeddingProvider = createEmbeddingProvider();
  const imageEmbeddingProvider = createImageEmbeddingProvider();

  bootLog(`Starting worker v${VERSION}...`);
  bootLog(`Engine: ${config.engineUrl}`);
  bootLog(
    `Provider: ${config.provider.provider} (${config.provider.model})`,
  );
  if (embeddingProvider) {
    bootLog(
      `Embedding provider: ${embeddingProvider.name} (${embeddingProvider.dimensions} dims)`,
    );
  } else {
    bootLog(`Embedding provider: none (BM25-only mode)`);
  }
  if (imageEmbeddingProvider) {
    bootLog(
      `Image embedding provider: ${imageEmbeddingProvider.name} (${imageEmbeddingProvider.dimensions} dims) — vision-search active`,
    );
  }
  bootLog(
    `REST API: http://localhost:${config.restPort}/agentmemory/*`,
  );
  bootLog(`Streams: ws://localhost:${config.streamsPort}`);

  const sdk = withWriteScrubbing(registerWorker(config.engineUrl, {
    workerName: "agentmemory",
    invocationTimeoutMs: 180000,
    otel: {
      serviceName: OTEL_CONFIG.serviceName,
      serviceVersion: OTEL_CONFIG.serviceVersion,
      metricsExportIntervalMs: OTEL_CONFIG.metricsExportIntervalMs,
    },
    // Explicit worker telemetry metadata. iii-sdk falls back to
    // auto-detection (cwd / package.json name / hostname) when this
    // is omitted, which produces inconsistent values per host —
    // `agentmemory`, `node`, `npm`, occasionally the user's home
    // directory basename. Pinning the value here gives every install
    // the same stable project identifier for downstream attribution
    // and grouping in the engine's metrics + traces output.
    telemetry: {
      project_name: "agentmemory",
      language: "node",
      framework: "iii-sdk",
    },
  }));

  writeWorkerPidfile();

  let stateBackend: "file" | "redis" = "file";
  try {
    stateBackend = getStateBackend();
  } catch {}
  const kv = new StateKV(sdk, { backend: stateBackend });
  const secret = resolveWorkerSecret();
  const metricsStore = new MetricsStore(kv);
  const dedupMap = new DedupMap();

  const vectorIndex = embeddingProvider ? new VectorIndex() : null;

  setVectorIndex(vectorIndex);
  setEmbeddingProvider(embeddingProvider);

  const meterAccessor = hasGetMeter(sdk)
    ? (sdk.getMeter.bind(sdk) as (name: string) => unknown)
    : undefined;

  initMetrics(meterAccessor as ((name: string) => import("@opentelemetry/api").Meter) | undefined);

  registerPrivacyFunction(sdk);
  registerObserveFunction(sdk, kv, dedupMap, config.maxObservationsPerSession);
  const capture = registerCaptureFunctions(sdk, kv, { restPort: config.restPort });
  registerImageQuotaCleanup(sdk, kv);
  registerVisionSearchFunctions(sdk, kv, imageEmbeddingProvider);
  if (isSlotsEnabled()) {
    registerSlotsFunctions(sdk, kv);
  }
  registerDiskSizeManager(sdk, kv);
  registerCompressFunction(sdk, kv, provider, metricsStore);
  registerSearchFunction(sdk, kv);
  registerContextFunction(sdk, kv, config.tokenBudget);
  registerSessionIndexMaintenanceFunction(sdk, kv);
  void rebuildSessionIndexIfStale(kv)
    .then((result) => {
      if (result) {
        bootLog(
          `Session index rebuilt: ${result.projects} projects, ${result.sessions} sessions`,
        );
      }
    })
    .catch((err) => {
      console.warn(`[agentmemory] Failed to rebuild session index at boot:`, err);
    });
  registerSummarizeFunction(sdk, kv, provider, metricsStore);
  registerMigrateFunction(sdk, kv);
  registerFileIndexFunction(sdk, kv);
  registerConsolidateFunction(sdk, kv, provider);
  registerPatternsFunction(sdk, kv);
  registerRememberFunction(sdk, kv);
  registerEvictFunction(sdk, kv);
  registerSessionSweepFunction(sdk, kv);

  registerRelationsFunction(sdk, kv);
  registerTimelineFunction(sdk, kv);
  registerProfileFunction(sdk, kv);
  registerAutoForgetFunction(sdk, kv);
  registerExportImportFunction(sdk, kv);
  registerEnrichFunction(sdk, kv);

  const claudeBridgeConfig = loadClaudeBridgeConfig();
  if (claudeBridgeConfig.enabled) {
    registerClaudeBridgeFunction(sdk, kv, claudeBridgeConfig);
    bootLog(
      `Claude bridge: syncing to ${claudeBridgeConfig.memoryFilePath}`,
    );
  }

  registerGraphFunction(sdk, kv, provider);
  registerGraphImportFunction(sdk, kv);
  bootLog(
    `Knowledge graph: structural extraction on (LLM relations ${isGraphExtractionEnabled() ? "enabled" : "off"})`,
  );

  registerConsolidationPipelineFunction(sdk, kv, provider);
  bootLog(`Consolidation pipeline: registered (CONSOLIDATION_ENABLED=${isConsolidationEnabled() ? "true" : "false"})`);

  if (isAutoCompressEnabled()) {
    bootLog(
      `WARNING: AGENTMEMORY_AUTO_COMPRESS=true — every PostToolUse observation will be sent to your LLM provider for compression. This spends API tokens proportional to your session tool-use frequency. Set AGENTMEMORY_AUTO_COMPRESS=false to disable.`,
    );
  } else {
    bootLog(
      `Auto-compress: OFF (default) — observations indexed via zero-LLM synthetic compression. Set AGENTMEMORY_AUTO_COMPRESS=true to opt-in to LLM-powered summaries (uses your API key).`,
    );
  }

  if (isContextInjectionEnabled()) {
    bootLog(
      `WARNING: AGENTMEMORY_INJECT_CONTEXT=true — the PreToolUse and SessionStart hooks will inject up to ~4000 chars of memory context into every tool turn. On Claude Pro this burns session tokens proportional to your tool-call frequency. Set AGENTMEMORY_INJECT_CONTEXT=false to disable.`,
    );
  } else {
    bootLog(
      `Context injection: OFF (default) — hooks capture observations but do not inject context into Claude Code's conversation. Set AGENTMEMORY_INJECT_CONTEXT=true to opt-in (warning: expect your Claude Pro allocation to drain faster).`,
    );
  }

  const teamConfig = loadTeamConfig();
  if (teamConfig) {
    registerTeamFunction(sdk, kv, teamConfig);
    bootLog(
      `Team memory: ${teamConfig.teamId} (${teamConfig.mode})`,
    );
  }

  registerGovernanceFunction(sdk, kv);

  registerActionsFunction(sdk, kv);
  registerFrontierFunction(sdk, kv);
  registerLeasesFunction(sdk, kv);
  registerRoutinesFunction(sdk, kv);
  registerSignalsFunction(sdk, kv);
  registerCheckpointsFunction(sdk, kv);
  registerMeshFunction(sdk, kv, explicitSecret() || undefined);
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
  registerReflectFunctions(sdk, kv, provider);
  registerWorkingMemoryFunctions(sdk, kv, config.tokenBudget);
  registerSkillExtractFunctions(sdk, kv, provider);
  registerCascadeFunction(sdk, kv);

  registerSlidingWindowFunction(sdk, kv, provider);
  registerQueryExpansionFunction(sdk, provider);
  registerTemporalGraphFunctions(sdk, kv, provider);
  registerRetentionFunctions(sdk, kv);
  registerCompressFileFunction(sdk, kv, provider);
  registerReplayFunctions(sdk, kv);
  bootLog(
    `v0.6 advanced retrieval: sliding-window, query-expansion, temporal-graph, retention-scoring`,
  );
  bootLog(
    `Orchestration layer: actions, frontier, leases, routines, signals, checkpoints, flow-compress, mesh, branch-aware, sentinels, sketches, crystallize, diagnostics, facets`,
  );
  if (isSlotsEnabled()) {
    bootLog(
      `Slots: enabled (pinned editable memory). Reflect on Stop hook: ${isReflectEnabled() ? "on" : "off"}`,
    );
  }

  const snapshotConfig = loadSnapshotConfig();
  if (snapshotConfig.enabled) {
    registerSnapshotFunction(sdk, kv, snapshotConfig.dir);
    // The boot line promised "every <interval>s" but nothing ever fired
    // mem::snapshot-create. Drive it on a periodic timer (unref'd so it
    // never keeps the process alive), mirroring the auto-forget timer.
    // mem::snapshot-create serializes overlapping runs internally (git-lock
    // safety), so the timer can stay a simple fire-and-forget tick.
    const snapshotTimer = setInterval(() => {
      sdk
        .trigger({
          function_id: "mem::snapshot-create",
          payload: {},
          action: TriggerAction.Void(),
        })
        .catch(() => {});
    }, snapshotConfig.interval * 1000);
    snapshotTimer.unref();
    bootLog(
      `Git snapshots: ${snapshotConfig.dir} (every ${snapshotConfig.interval}s)`,
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

  const hybridRanker = (query: string, limit: number) =>
    hybridSearch.search(query, limit);
  registerSmartSearchFunction(sdk, kv, hybridRanker);
  setHybridRanker(hybridRanker);
  registerRecentSearchesSweepFunction(sdk, kv);

  markKeywordRebuildPending();
  registerApiTriggers(sdk, kv, secret, metricsStore, provider);
  registerEventTriggers(sdk, kv);
  registerViewerStreamTriggers(sdk, kv, { secret, metricsStore, provider });
  registerMcpEndpoints(sdk, kv, secret);

  const healthMonitor = registerHealthMonitor(sdk, kv, {
    streamRelayProbe:
      kv.backend === "redis"
        ? createStreamRelayProbe(sdk, { url: `ws://localhost:${config.streamsPort}` })
        : undefined,
  });

  const indexPersistence = new IndexPersistence(kv, vectorIndex);
  setIndexPersistence(indexPersistence);

  const loaded = await indexPersistence.load().catch((err) => {
    console.warn(`[agentmemory] Failed to load persisted vector index:`, err);
    return null;
  });
  if (loaded?.vector && vectorIndex && loaded.vector.size > 0) {
    // Persisted vectors carry whatever dimension the provider had when
    // they were written. If the active provider declares a different
    // dimension — or if the on-disk index contains a mix of dimensions
    // (legacy indexes written before the live-API guard in this PR) —
    // restoring would silently corrupt search: cosineSimilarity returns
    // 0 on cross-dim pairs, so affected observations stop matching
    // anything and recall degrades without an error. Walk every stored
    // vector instead of trusting the first; refuse to load if anything
    // is off.
    const activeDim = embeddingProvider?.dimensions ?? 0;
    const { mismatches, seenDimensions } =
      activeDim > 0
        ? loaded.vector.validateDimensions(activeDim)
        : { mismatches: [], seenDimensions: new Set<number>() };

    if (mismatches.length > 0) {
      const sample = mismatches
        .slice(0, 5)
        .map((m) => `${m.obsId} (dim=${m.dim})`)
        .join(", ");
      const distinct = Array.from(seenDimensions).sort((a, b) => a - b).join(", ");
      const dropStale = isDropStaleIndexEnabled();
      if (dropStale) {
        for (const [obsId] of loaded.vector.entries()) vectorIndex.markRemoved(obsId);
        console.warn(
          `[agentmemory] Persisted vector index has ${mismatches.length} of ` +
            `${loaded.vector.size} vectors with the wrong dimension. Active ` +
            `provider (${embeddingProvider?.name}) declares ${activeDim}; ` +
            `dimensions seen on disk: ${distinct}. ` +
            `AGENTMEMORY_DROP_STALE_INDEX=true is set — discarding the persisted ` +
            `vectors. Live observations will rebuild the index over time.`,
        );
      } else {
        throw new Error(
          `[agentmemory] Refusing to start: persisted vector index has ` +
            `${mismatches.length} of ${loaded.vector.size} vectors with the ` +
            `wrong dimension. Active provider (${embeddingProvider?.name}) ` +
            `declares ${activeDim}; dimensions seen on disk: ${distinct}. ` +
            `First mismatched obsIds: ${sample}. Loading would silently corrupt ` +
            `search (cross-dimension cosine returns 0). Choose one:\n` +
            `  - Re-embed the existing index against the new provider, then start.\n` +
            `  - Set AGENTMEMORY_DROP_STALE_INDEX=true to discard the persisted ` +
            `vectors and rebuild from live observations.\n` +
            `  - Switch the embedding provider back to the one that wrote the index.`,
        );
      }
    } else {
      vectorIndex.restoreFrom(loaded.vector);
      bootLog(
        `Loaded persisted vector index (${vectorIndex.size} vectors)`,
      );
    }
  }

  const auditMigration = startAuditMigration(kv).catch(() => {});

  const vectorCountShortfall =
    Boolean(loaded?.vector) &&
    loaded?.expectedCount !== undefined &&
    loaded.vector!.size < loaded.expectedCount;
  const vectorBackfillSince =
    !loaded || loaded.state === "unavailable"
      ? undefined
      : loaded.state === "none" || vectorCountShortfall
        ? null
        : loaded.savedAt;
  const keywordStart = Date.now();
  try {
    const keyword = await rebuildKeywordIndex(kv, vectorBackfillSince);
    bootLog(
      `Rebuilt BM25 index from stored content (${keyword.documents} docs in ${Date.now() - keywordStart} ms)`,
    );
    setPendingVectorBackfillCount(keyword.vectorJobs.length + keyword.fullBackfillPending);
    setVectorBackfillState(keyword.fullBackfillPending > 0 ? "waiting-for-opt-in" : "idle");
    if (keyword.fullBackfillPending > 0) {
      bootLog(
        `Vector backfill needs ${keyword.fullBackfillPending} embeddings but a full backfill was not started ` +
          `(set AGENTMEMORY_VECTOR_BACKFILL=all to opt in). See /agentmemory/status.`,
      );
    }
    if (keyword.vectorJobs.length > 0) {
      setVectorBackfillState("running");
      bootLog(`Backfilling ${keyword.vectorJobs.length} missing vectors in the background`);
      void backfillVectors(keyword.vectorJobs)
        .then((count) => {
          setPendingVectorBackfillCount(keyword.fullBackfillPending);
          setVectorBackfillState(keyword.fullBackfillPending > 0 ? "waiting-for-opt-in" : "idle");
          if (count > 0) bootLog(`Vector index backfilled: ${count} entries`);
        })
        .catch((err) => {
          setVectorBackfillState("idle");
          console.warn(`[agentmemory] Failed to backfill vectors:`, err);
        });
    }
  } catch (err) {
    console.warn(`[agentmemory] Failed to rebuild the BM25 index:`, err);
  }

  // Ready / Endpoints lines are emitted via `bootLog` so they're
  // buffered in quiet mode and printed verbatim under --verbose. The
  // CLI surfaces a compact summary when it sees the worker reach
  // ready state.
  bootLog(
    `Ready. ${embeddingProvider ? "Triple-stream (BM25+Vector+Graph)" : "BM25+Graph"} search active.`,
  );
  bootLog(
    `REST API: 138 endpoints at http://localhost:${config.restPort}/agentmemory/*`,
  );
  bootLog(
    `MCP surface (opt-in via \`npx @agentmemory/mcp\`): ${getAllTools().length} tools · 6 resources · 3 prompts`,
  );

  void (async () => {
    try {
      const drained = await capture.drainLocalSpool();
      const delivered = drained.reduce((n, r) => n + r.delivered, 0);
      const duplicates = drained.reduce((n, r) => n + r.duplicates, 0);
      const remaining = drained.reduce((n, r) => n + r.remaining, 0);
      if (delivered + duplicates + remaining > 0) {
        bootLog(`Capture spool: ${delivered} recovered, ${duplicates} already stored, ${remaining} still waiting`);
      }
      const swept = await capture.sweep();
      if (swept.processed > 0) {
        bootLog(`Capture inbox: ${swept.recovered} of ${swept.processed} unfinished observations stored after restart`);
      }
      await capture.prune();
    } catch (err) {
      bootWarn(`Capture recovery at boot failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    capture.start();
  })();

  const viewerServer = startViewerServer(
    config.viewerPort,
    kv,
    sdk,
    secret,
    config.restPort,
  );

  if (isGraphCompactOnBootEnabled()) {
    const graphCompactTimer = setTimeout(() => {
      void runGraphCompactOnBoot(kv, { log: bootLog, warn: bootWarn }).catch(() => {});
    }, GRAPH_COMPACT_BOOT_DELAY_MS);
    graphCompactTimer.unref();
  } else {
    setGraphCompactBootDisabled();
  }

  const autoForgetIntervalMs = parseInt(process.env.AUTO_FORGET_INTERVAL_MS || "3600000", 10);
  const consolidationIntervalMs = getConsolidationIntervalMs();

  if (process.env.AUTO_FORGET_ENABLED !== "false") {
    const autoForgetTimer = setInterval(async () => {
      try {
        await sdk.trigger({ function_id: "mem::auto-forget", payload: { dryRun: false } });
      } catch {}
    }, autoForgetIntervalMs);
    autoForgetTimer.unref();
    bootLog(`Auto-forget: enabled (every ${autoForgetIntervalMs / 60000}m)`);
  }

  const auditRetentionMonths = getAuditRetentionMonths();
  if (auditRetentionMonths > 0) {
    const runAuditSweep = async () => {
      try {
        await auditMigration;
        await sdk.trigger({ function_id: "mem::audit-retention-sweep", payload: {} });
      } catch {}
    };
    void runAuditSweep();
    const auditRetentionTimer = setInterval(runAuditSweep, 86400000);
    auditRetentionTimer.unref();
    bootLog(
      `Audit retention sweep: enabled (drop month scopes older than ${auditRetentionMonths}mo, every 24h)`,
    );
  }

  if (process.env.LESSON_DECAY_ENABLED !== "false") {
    const lessonDecayTimer = setInterval(async () => {
      try {
        await sdk.trigger({ function_id: "mem::lesson-decay-sweep", payload: {} });
      } catch {}
    }, 86400000);
    lessonDecayTimer.unref();
    bootLog(`Lesson decay sweep: enabled (every 24h)`);
  }

  if (process.env.INSIGHT_DECAY_ENABLED !== "false") {
    const insightDecayTimer = setInterval(async () => {
      try {
        await sdk.trigger({ function_id: "mem::insight-decay-sweep", payload: {} });
      } catch {}
    }, 86400000);
    insightDecayTimer.unref();
  }

  // #771: hourly TTL sweep for the followup-rate diagnostic. The
  // recent-searches scope only needs the last entry per session;
  // sweeping anything older than the retention window keeps the scope
  // from growing unbounded across long-lived deployments.
  const recentSearchesSweepTimer = setInterval(async () => {
    try {
      await sdk.trigger({
        function_id: "mem::diagnostic::recent-searches-sweep",
        payload: {},
      });
    } catch {}
  }, 60 * 60 * 1000);
  recentSearchesSweepTimer.unref();

  void seedViewerStreamTracker(sdk, { unorderedListing: kv.backend === "redis" }).catch(() => {});

  if (isSessionSweepEnabled()) {
    const sessionSweepTimer = setInterval(async () => {
      try {
        await sdk.trigger({ function_id: "mem::session-sweep", payload: {} });
      } catch (err) {
        bootLog(`Session sweep failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 60 * 60 * 1000);
    sessionSweepTimer.unref();
    bootLog(`Session sweep: enabled (hourly, stale after ${getSessionSweepStaleHours()}h)`);
  }

  if (isConsolidationEnabled()) {
    const consolidationTimer = setInterval(async () => {
      try {
        await sdk.trigger({ function_id: "mem::consolidate-pipeline", payload: {} });
      } catch {}
    }, consolidationIntervalMs);
    consolidationTimer.unref();
    bootLog(`Auto-consolidation: enabled (every ${consolidationIntervalMs / 60000}m)`);
  }

  const shutdown = async () => {
    console.log(`\n[agentmemory] Shutting down...`);
    const hardExit = setTimeout(() => {
      console.warn(
        `[agentmemory] Shutdown still blocked after ${SHUTDOWN_HARD_EXIT_MS}ms; exiting now.`,
      );
      clearWorkerPidfile();
      process.exit(1);
    }, SHUTDOWN_HARD_EXIT_MS);
    hardExit.unref();
    healthMonitor.stop();
    dedupMap.stop();
    capture.stop();
    indexPersistence.stop();
    const viewerClosed = new Promise<void>((resolve) =>
      viewerServer.close(() => resolve()),
    );
    viewerServer.closeAllConnections();
    await viewerClosed;
    const flushed = await settleWithin(
      indexPersistence.save(),
      SHUTDOWN_FLUSH_TIMEOUT_MS,
    );
    if (!flushed) {
      console.warn(
        `[agentmemory] Search index flush did not finish within ${SHUTDOWN_FLUSH_TIMEOUT_MS}ms; the engine is probably gone. Observations are already in the engine's state store and the index reconciles them on the next boot.`,
      );
    }
    await settleWithin(sdk.shutdown(), SHUTDOWN_FLUSH_TIMEOUT_MS).catch((err) => {
      console.warn(`[agentmemory] SDK shutdown failed:`, err);
    });
    clearWorkerPidfile();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`[agentmemory] Fatal:`, err);
  process.exit(1);
});
