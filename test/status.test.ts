import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateStatus,
  markLlmFunctions,
  describeHealthAlert,
  prefersHtml,
  renderStatusHtml,
  singleFlight,
  type StatusInputs,
} from "../src/functions/status.js";

function inputs(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return {
    now: new Date("2026-09-24T12:00:00.000Z"),
    version: "0.9.29",
    engineVersion: "0.22.1",
    uptimeSeconds: 125,
    stateBackend: "file",
    ports: { rest: 3111, streams: 3112, viewer: 3113 },
    health: { status: "healthy", alerts: [], notes: [], connectionState: "connected" },
    circuitBreaker: { state: "closed", failures: 0 },
    functionMetrics: [],
    provider: "llm",
    embeddingProvider: "embeddings",
    flags: [],
    index: {
      bm25Documents: 117,
      vectorDocuments: 117,
      observationsIndexed: 110,
      missingObservations: 0,
      sessions: 95,
      bm25Incomplete: false,
      pendingVectorBackfill: 0,
    },
    graph: {
      totalNodes: 55,
      totalEdges: 1,
      fromSnapshot: true,
      updatedAt: "2026-09-24T11:59:00.000Z",
    },
    graphExtractionEnabled: true,
    auditLegacy: null,
    ...overrides,
  };
}

function codes(report: ReturnType<typeof evaluateStatus>): string[] {
  return report.problems.map((p) => p.code);
}

describe("evaluateStatus", () => {
  it("holds the missing-observations warning while the keyword index rebuilds", () => {
    const report = evaluateStatus(
      inputs({ index: { ...inputs().index, missingObservations: 7, keywordRebuildRunning: true } }),
    );
    expect(codes(report)).not.toContain("index-missing-observations");
    expect(codes(report)).toContain("keyword-index-rebuilding");
  });

  it("reports ok with no problems on a healthy install", () => {
    const report = evaluateStatus(inputs());
    expect(report.status).toBe("ok");
    expect(report.problems).toEqual([]);
    expect(report.graph?.ageSeconds).toBe(60);
    expect(report.service.engineVersion).toBe("0.22.1");
  });

  it("surfaces the active state backend, never the URL", () => {
    const report = evaluateStatus(inputs({ stateBackend: "redis" }));
    expect(report.service.stateBackend).toBe("redis");
    expect(JSON.stringify(report)).not.toMatch(/redis:\/\//);
  });

  it("flags a function failing at least 20% of 5+ calls with a provider-specific fix", () => {
    const report = evaluateStatus(
      inputs({
        functionMetrics: [
          { functionId: "mem::summarize", totalCalls: 56, successCount: 20, failureCount: 36, avgLatencyMs: 38324 },
          { functionId: "mem::observe", totalCalls: 4, successCount: 1, failureCount: 3, avgLatencyMs: 5 },
          { functionId: "mem::search", totalCalls: 100, successCount: 90, failureCount: 10, avgLatencyMs: 5 },
        ],
      }),
    );
    expect(report.status).toBe("warn");
    const failing = report.problems.filter((p) => p.code === "function-failing");
    expect(failing).toHaveLength(1);
    expect(failing[0].message).toBe("mem::summarize failed 36 of 56 calls (64%).");
    expect(failing[0].fix).toMatch(/LLM provider/);
  });

  it("escalates to error when the provider circuit breaker is open or health is critical", () => {
    expect(evaluateStatus(inputs({ circuitBreaker: { state: "open", failures: 5 } })).status).toBe("error");
    expect(codes(evaluateStatus(inputs({ circuitBreaker: { state: "open", failures: 5 } })))).toContain(
      "provider-circuit-open",
    );
    const critical = evaluateStatus(inputs({ health: { status: "critical", alerts: ["kv unreachable"] } }));
    expect(critical.status).toBe("error");
    expect(codes(critical)).toEqual(["health-alert"]);
    const bare = evaluateStatus(inputs({ health: { status: "critical", alerts: [] } }));
    expect(codes(bare)).toEqual(["health-critical"]);
  });

  it("warns about observations missing from the search index and says how to fix it", () => {
    const report = evaluateStatus(inputs({ index: { ...inputs().index, missingObservations: 15 } }));
    expect(report.status).toBe("warn");
    const problem = report.problems.find((p) => p.code === "index-missing-observations");
    expect(problem?.message).toMatch(/^15 stored observations/);
    expect(problem?.fix).toMatch(/Restart agentmemory/);
  });

  it("notes when the index check timed out instead of claiming the index is fine", () => {
    const report = evaluateStatus(inputs({ index: { ...inputs().index, missingObservations: null, sessions: null } }));
    expect(codes(report)).toEqual(["index-check-unavailable"]);
    expect(report.status).toBe("info");
  });

  it("reports an incomplete BM25 rebuild as an error", () => {
    const report = evaluateStatus(inputs({ index: { ...inputs().index, bm25Incomplete: true } }));
    expect(report.status).toBe("error");
    expect(codes(report)).toContain("bm25-rebuild-incomplete");
  });

  it("notes a pending vector backfill without raising the overall status", () => {
    const report = evaluateStatus(inputs({ index: { ...inputs().index, pendingVectorBackfill: 42 } }));
    expect(report.status).toBe("info");
    const problem = report.problems.find((p) => p.code === "index-vector-backfill-pending");
    expect(problem?.message).toBe("42 documents are waiting for a vector embedding.");
  });

  it("reports a vector count shortfall from the last save as a warning", () => {
    const report = evaluateStatus(
      inputs({ indexPersistence: { saveIntervalMs: 600_000, saving: false, buckets: 3, pendingChanges: 0, vector: null, vectorCountShortfall: { expected: 100, loaded: 40 } } }),
    );
    expect(report.status).toBe("warn");
    const problem = report.problems.find((p) => p.code === "index-vector-count-shortfall");
    expect(problem?.message).toContain("40 of 100 vectors");
  });

  it("reports absent and partial vector recovery as paused until explicitly opted in", () => {
    const report = evaluateStatus(inputs({
      index: { ...inputs().index, pendingVectorBackfill: 60, vectorBackfillState: "waiting-for-opt-in" },
      indexPersistence: { saveIntervalMs: 600_000, saving: false, buckets: 3, pendingChanges: 0, vector: null, vectorCountShortfall: { expected: 100, loaded: 40 } },
    }));
    for (const problem of report.problems) {
      expect(problem.fix).toContain("Backfill is paused.");
      expect(problem.fix).toContain("AGENTMEMORY_VECTOR_BACKFILL=all");
      expect(problem.fix).not.toContain("running in the background");
      expect(problem.message).not.toContain("re-embeds the rest");
    }
    expect(report.index.vectorBackfillState).toBe("waiting-for-opt-in");
    expect(renderStatusHtml(report, "n")).toContain("paused, waiting for opt-in");
  });

  it("only describes vector recovery as running when the worker reports an active backfill", () => {
    const active = evaluateStatus(inputs({ index: { ...inputs().index, pendingVectorBackfill: 42, vectorBackfillState: "running" } }));
    expect(active.problems[0].fix).toContain("Backfill is running in the background");
    const idle = evaluateStatus(inputs({ index: { ...inputs().index, pendingVectorBackfill: 42, vectorBackfillState: "idle" } }));
    expect(idle.problems[0].fix).toContain("Backfill is not running");
  });

  it("checks snapshot presence when extraction is on, and snapshot age whenever a snapshot exists", () => {
    const noSnapshot = { totalNodes: 0, totalEdges: 0, fromSnapshot: false };
    expect(codes(evaluateStatus(inputs({ graph: noSnapshot })))).toEqual(["graph-no-snapshot"]);
    expect(codes(evaluateStatus(inputs({ graph: noSnapshot, graphExtractionEnabled: false })))).toEqual([]);
    const old = { ...inputs().graph, updatedAt: "2026-09-20T12:00:00.000Z" };
    expect(evaluateStatus(inputs({ graph: old })).problems[0].message).toMatch(/4 days old/);
    const dayOld = { ...inputs().graph, updatedAt: "2026-09-23T06:00:00.000Z" };
    expect(evaluateStatus(inputs({ graph: dayOld })).problems[0].message).toMatch(/30 hours old/);
    expect(codes(evaluateStatus(inputs({ graph: old, graphExtractionEnabled: false })))).toEqual([
      "graph-snapshot-stale",
    ]);
    expect(codes(evaluateStatus(inputs({ graph: { ...inputs().graph, dirty: true } })))).toEqual([
      "graph-snapshot-dirty",
    ]);
  });

  it("tells keyless installs what they are missing without calling it a failure", () => {
    const report = evaluateStatus(inputs({ provider: "noop" }));
    expect(report.status).toBe("info");
    expect(report.problems[0].code).toBe("no-llm-provider");
  });

  it("reports a frozen legacy audit log only when the migration left it in place", () => {
    expect(codes(evaluateStatus(inputs({ auditLegacy: { status: "too-large", sizeBytes: 1 } })))).toContain(
      "audit-legacy-frozen",
    );
    expect(codes(evaluateStatus(inputs({ auditLegacy: { status: "unreadable" } })))).toContain(
      "audit-legacy-frozen",
    );
    expect(codes(evaluateStatus(inputs({ auditLegacy: { status: "copied", sizeBytes: 1 } })))).not.toContain(
      "audit-legacy-frozen",
    );
    expect(codes(evaluateStatus(inputs({ auditLegacy: { status: "done" } })))).not.toContain(
      "audit-legacy-frozen",
    );
  });
});

describe("status without an LLM provider", () => {
  const llmFlag = {
    key: "CONSOLIDATION_ENABLED",
    label: "Memory consolidation",
    enabled: true,
    needsLlm: true,
    enableHow: "Set CONSOLIDATION_ENABLED=true",
  };
  const plainFlag = {
    key: "AGENTMEMORY_REFLECT",
    label: "Reflect",
    enabled: true,
    needsLlm: false,
    enableHow: "Set AGENTMEMORY_REFLECT=true",
  };

  it("shows LLM functions as off instead of failing and raises no failure warning", () => {
    const report = evaluateStatus(
      inputs({
        provider: "noop",
        functionMetrics: [
          { functionId: "mem::summarize", totalCalls: 12, successCount: 0, failureCount: 12, avgLatencyMs: 3 },
          { functionId: "mem::search", totalCalls: 10, successCount: 2, failureCount: 8, avgLatencyMs: 3 },
        ],
      }),
    );
    const summarize = report.functions.find((f) => f.functionId === "mem::summarize");
    expect(summarize?.offWithoutLlm).toBe(true);
    const failing = report.problems.filter((p) => p.code === "function-failing");
    expect(failing.map((p) => p.message)).toEqual(["mem::search failed 8 of 10 calls (80%)."]);
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("off, no LLM provider");
  });

  it("marks an enabled feature that needs an LLM as inactive, not simply on", () => {
    const report = evaluateStatus(inputs({ provider: "noop", flags: [llmFlag, plainFlag] }));
    expect(report.flags[0].inactiveReason).toBe("needs an LLM provider, none is configured");
    expect(report.flags[1].inactiveReason).toBeUndefined();
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("on, inactive: needs an LLM provider, none is configured");
    expect(html).not.toMatch(/<td>Memory consolidation<\/td><td>on<\/td>/);
  });

  it("keeps enabled LLM features plainly on when a provider exists", () => {
    const report = evaluateStatus(inputs({ flags: [llmFlag] }));
    expect(report.flags[0].inactiveReason).toBeUndefined();
    expect(renderStatusHtml(report, "n")).toMatch(/<td>Memory consolidation<\/td><td><code>CONSOLIDATION_ENABLED<\/code><\/td><td>on<\/td><td>Set CONSOLIDATION_ENABLED=false and restart to turn it off.<\/td>/);
  });
});

describe("status page wording", () => {
  it("explains why the BM25 count differs from observations", () => {
    const report = evaluateStatus(
      inputs({ index: { ...inputs().index, bm25Documents: 211, observationsIndexed: 185, memoriesIndexed: 26, lessonsIndexed: 2 } }),
    );
    expect(renderStatusHtml(report, "n")).toContain("211 (183 observations, 26 memories, 2 lessons)");
  });

  it("pluralizes counts and drops the manual refresh link", () => {
    const report = evaluateStatus(
      inputs({
        indexPersistence: {
          saveIntervalMs: 600000,
          saving: false,
          buckets: 1,
          pendingChanges: 1,
          vector: { lastSavedAt: "2026-09-24T11:59:00.000Z", dirtySince: null, lastError: null, lastErrorAt: null },
          vectorCountShortfall: null,
        },
      }),
    );
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("1 bucket, 1 unsaved change");
    expect(html).not.toContain(">refresh</a>");
  });

  it("does not show a bare healthy process next to a warning badge", () => {
    const report = evaluateStatus(inputs({ index: { ...inputs().index, missingObservations: 3 } }));
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("<th>Process health</th><td>healthy (memory, CPU and engine checks only;");
  });
});

describe("missing health snapshot", () => {
  it("says the health check was not run instead of reporting ok", () => {
    const report = evaluateStatus(inputs({ health: null }));
    expect(report.status).toBe("info");
    expect(codes(report)).toEqual(["health-check-unavailable"]);
  });
});

describe("singleFlight", () => {
  it("shares one run between overlapping callers and reuses the result inside the window", async () => {
    let clock = 0;
    let runs = 0;
    let finish: (v: number) => void = () => undefined;
    const shared = singleFlight(
      () => {
        runs++;
        return new Promise<number>((resolve) => {
          finish = resolve;
        });
      },
      30_000,
      () => clock,
    );
    const a = shared();
    const b = shared();
    expect(a).toBe(b);
    finish(7);
    await expect(a).resolves.toBe(7);
    clock = 29_000;
    await expect(shared()).resolves.toBe(7);
    expect(runs).toBe(1);
    clock = 31_000;
    const c = shared();
    finish(8);
    await expect(c).resolves.toBe(8);
    expect(runs).toBe(2);
  });

  it("starts a fresh run after a failure", async () => {
    let runs = 0;
    const shared = singleFlight(() => {
      runs++;
      return runs === 1 ? Promise.reject(new Error("store timeout")) : Promise.resolve("ok");
    }, 30_000);
    await expect(shared()).rejects.toThrow("store timeout");
    await expect(shared()).resolves.toBe("ok");
    expect(runs).toBe(2);
  });
});

describe("renderStatusHtml", () => {
  it("escapes every server-provided string and carries no script", () => {
    const report = evaluateStatus(
      inputs({
        health: { status: "degraded", alerts: ['<img src=x onerror="alert(1)">'], connectionState: "connected" },
      }),
    );
    const html = renderStatusHtml(report, "n0nce");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('<style nonce="n0nce">');
    expect(html).toContain('class="badge warn"');
  });

  it("shows the problems, the fix text and the core sections", () => {
    const html = renderStatusHtml(
      evaluateStatus(inputs({ index: { ...inputs().index, missingObservations: 3 } })),
      "n",
    );
    expect(html).toContain("3 stored observations are not in the search index");
    expect(html).toContain("boot reconcile re-indexes");
    for (const heading of ["Problems", "Engine and connection", "LLM and embeddings", "Search index", "Knowledge graph", "Features", "Process", "Functions"]) {
      expect(html).toContain(`<h2>${heading}</h2>`);
    }
  });
});

describe("status for beginners", () => {
  it("turns health alert slugs into sentences with a fix", () => {
    const report = evaluateStatus(
      inputs({ health: { status: "degraded", alerts: ["event_loop_lag_warn_240ms"], connectionState: "connected" } }),
    );
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatchObject({ level: "warn", code: "health-alert" });
    expect(report.problems[0].message).toMatch(/240 ms behind/);
    expect(report.problems[0].fix).toMatch(/restart agentmemory/);
    expect(describeHealthAlert("memory_critical_97%_rss900mb").level).toBe("error");
    expect(describeHealthAlert("connection_disconnected").message).toMatch(/iii engine is disconnected/);
  });

  it("gives every problem a fix", () => {
    const report = evaluateStatus(
      inputs({
        health: null,
        provider: "noop",
        circuitBreaker: { state: "open", failures: 3 },
        index: { ...inputs().index, missingObservations: null, bm25Incomplete: true, pendingVectorBackfill: 4 },
        graph: { totalNodes: 1, totalEdges: 0, fromSnapshot: true, updatedAt: "2026-09-20T00:00:00.000Z", dirty: true },
      }),
    );
    expect(report.problems.length).toBeGreaterThan(5);
    for (const p of report.problems) expect(p.fix, p.code).toBeTruthy();
  });

  it("states the verdict in one plain sentence", () => {
    expect(evaluateStatus(inputs()).headline).toMatch(/^Every check passed/);
    expect(evaluateStatus(inputs({ provider: "noop" })).headline).toBe("Working normally. 1 note below about features that are off or checks that did not run.");
    const report = evaluateStatus(inputs({ provider: "noop", index: { ...inputs().index, missingObservations: 2 } }));
    expect(report.status).toBe("warn");
    expect(report.headline).toMatch(/^Working, but needs attention: 2 stored observations are not in the search index/);
    expect(report.headline).toMatch(/1 more item below/);
  });

  it("breaks the keyword index down and lists what is off without an LLM", () => {
    const report = evaluateStatus(
      inputs({
        provider: "noop",
        index: { ...inputs().index, bm25Documents: 211, observationsIndexed: 185, memoriesIndexed: 26, lessonsIndexed: 2 },
      }),
    );
    expect(report.index.breakdown).toEqual({ observations: 183, memories: 26, lessons: 2 });
    expect(report.provider.offWithoutLlm).toContain("session summaries");
    expect(evaluateStatus(inputs()).provider.offWithoutLlm).toEqual([]);
  });

  it("links to the live viewer page, shows the curl call and explains the process numbers", () => {
    const report = evaluateStatus(
      inputs({
        health: {
          status: "healthy",
          alerts: [],
          connectionState: "connected",
          memory: { heapUsed: 50 * 1048576, heapTotal: 80 * 1048576, heapLimit: 4096 * 1048576, rss: 140 * 1048576 },
          eventLoopLagMs: 1.25,
        },
      }),
    );
    const html = renderStatusHtml(report, "n", { viewerUrl: "http://127.0.0.1:3113/#health" });
    expect(html).toContain('<a href="http://127.0.0.1:3113/#health">Open the live version in the viewer');
    expect(html).toContain("curl -s http://localhost:3111/agentmemory/status");
    expect(html).toContain("50 MB of 4096 MB (1%)");
    expect(html).toContain("1.3 ms");
    expect(renderStatusHtml(report, "n")).toContain('href="/agentmemory/viewer#health"');
  });
});

describe("prefersHtml", () => {
  it("serves HTML to browsers and JSON to everything else", () => {
    expect(prefersHtml("text/html,application/xhtml+xml,*/*;q=0.8", undefined)).toBe(true);
    expect(prefersHtml("application/json", undefined)).toBe(false);
    expect(prefersHtml(undefined, undefined)).toBe(false);
    expect(prefersHtml("*/*", undefined)).toBe(false);
    expect(prefersHtml("text/html", "json")).toBe(false);
    expect(prefersHtml("application/json", "html")).toBe(true);
  });
});

describe("status wiring", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");
  const viewer = readFileSync("src/viewer/index.html", "utf-8");
  const index = readFileSync("src/index.ts", "utf-8");

  it("registers GET /agentmemory/status behind the same auth check as the other endpoints", () => {
    expect(api).toMatch(/registerFunction\("api::status",\s*async \(req: HttpRequest\): Promise<Response> => \{\s*const authErr = checkAuth\(req, secret\);/);
    expect(api).toMatch(/api_path: "\/agentmemory\/status", http_method: "GET"/);
    expect(api).toMatch(/default-src 'none'; style-src 'nonce-\$\{nonce\}'/);
  });

  it("time-boxes every status probe so a slow store cannot hang the page", () => {
    const reporter = api.slice(api.indexOf("export function createStatusReporter"), api.indexOf("export function createConsolidationStatusReader"));
    expect(reporter.match(/valueWithin\(/g)?.length).toBe(5);
    expect(reporter).toMatch(/valueWithin\(scan\.run\(\), STATUS_CHECK_TIMEOUT_MS\)/);
    expect(api).toMatch(/run: singleFlight\(async \(\) => \{\s*const value = await findUnindexedObservations\(kv\);/);
    const handler = api.slice(api.indexOf('registerFunction("api::status"'), api.indexOf('function_id: "api::status"'));
    expect(reporter).toMatch(/valueWithin\(\s*kv\.get<AuditMigrationState>\(KV\.auditMonths, AUDIT_MIGRATION_STATE_KEY\),\s*STATUS_CHECK_TIMEOUT_MS,\s*\)/);
    expect(handler).toContain("const report = await statusReport();");
  });

  it("streams the same report to the viewer on every health tick and in the snapshot", () => {
    const streams = readFileSync("src/triggers/viewer-streams.ts", "utf-8");
    expect(streams).toMatch(/statusReport\(\{ health: snapshot, scanMaxAgeMs \}\)/);
    expect(streams).toContain("healthPayload(payload.new_value ?? null, HEALTH_TICK_SCAN_MAX_AGE_MS)");
    expect(streams).toContain("healthPayload(health ?? null, UNINDEXED_SCAN_REUSE_MS)");
  });

  it("names the embedding provider instead of a generic label", () => {
    expect(api).not.toContain('? "embeddings" : "none"');
    expect(api.match(/describeEmbeddingProvider\(\)/g)?.length).toBe(3);
  });

  it("config flags and status share one flag list", () => {
    expect(api.match(/buildConfigFlags\(\)(?! \{)/g)?.length).toBe(2);
    expect(api.match(/key: "GRAPH_EXTRACTION_ENABLED"/g)?.length).toBe(1);
  });

  it("reports the active state backend from config, not a hardcoded value", () => {
    expect(api).toMatch(/stateBackend: kv.backend === "redis" \? "redis" : "file"/);
    expect(index).toMatch(/new StateKV\(sdk, \{ backend: stateBackend \}\)/);
  });

  it("the viewer has a Health tab that reads the status report", () => {
    expect(viewer).toMatch(/<button type="button" role="tab" data-tab="health"[^>]*>Health<\/button>/);
    expect(viewer).toContain('<div id="view-health" class="view" role="tabpanel" aria-label="Health"></div>');
    expect(viewer).toMatch(/'activity', 'profile', 'health', 'audit'\];/);
    expect(viewer).toMatch(/case 'health': renderHealth\(\); break;/);
    expect(viewer).toContain("s.report = data.report;");
    expect(viewer).not.toMatch(/if \(tab === 'health'\) ensureStatusReport\(\);/);
    expect(viewer).toMatch(/api\('status', \{ headers: \{ Accept: 'application\/json' \} \}\)/);
  });
});

describe("markLlmFunctions", () => {
  const metrics = [
    { functionId: "mem::summarize", totalCalls: 12, successCount: 0, failureCount: 12, avgLatencyMs: 1 },
    { functionId: "mem::observe", totalCalls: 40, successCount: 40, failureCount: 0, avgLatencyMs: 2 },
  ];

  it("marks LLM functions off when no provider is configured", () => {
    const marked = markLlmFunctions(metrics, "noop");
    expect(marked.map((m) => m.offWithoutLlm)).toEqual([true, false]);
    expect(marked[0].failureCount).toBe(12);
  });

  it("leaves every function on when an LLM provider is configured", () => {
    expect(markLlmFunctions(metrics, "llm").some((m) => m.offWithoutLlm)).toBe(false);
  });
});
