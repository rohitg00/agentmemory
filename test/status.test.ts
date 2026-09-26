import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateStatus,
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
    ...overrides,
  };
}

function codes(report: ReturnType<typeof evaluateStatus>): string[] {
  return report.problems.map((p) => p.code);
}

describe("evaluateStatus", () => {
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
    expect(codes(critical)).toEqual(["health-critical", "health-alert"]);
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
    for (const heading of ["Problems", "Service", "Providers", "Search index", "Knowledge graph", "Functions", "Features"]) {
      expect(html).toContain(`<h2>${heading}</h2>`);
    }
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

  it("registers GET /agentmemory/status behind the same auth check as the other endpoints", () => {
    expect(api).toMatch(/registerFunction\("api::status",\s*async \(req: HttpRequest\): Promise<Response> => \{\s*const authErr = checkAuth\(req, secret\);/);
    expect(api).toMatch(/api_path: "\/agentmemory\/status", http_method: "GET"/);
    expect(api).toMatch(/default-src 'none'; style-src 'nonce-\$\{nonce\}'/);
  });

  it("time-boxes every status probe so a slow store cannot hang the page", () => {
    const handler = api.slice(api.indexOf('registerFunction("api::status"'), api.indexOf('function_id: "api::status"'));
    expect(handler.match(/valueWithin\(/g)?.length).toBe(4);
    expect(handler).toMatch(/valueWithin\(sharedUnindexedScan\(\), STATUS_CHECK_TIMEOUT_MS\)/);
    expect(api).toMatch(/const sharedUnindexedScan = singleFlight\(\(\) => findUnindexedObservations\(kv\), UNINDEXED_SCAN_REUSE_MS\);/);
  });

  it("config flags and status share one flag list", () => {
    expect(api.match(/buildConfigFlags\(\)(?! \{)/g)?.length).toBe(2);
    expect(api.match(/key: "GRAPH_EXTRACTION_ENABLED"/g)?.length).toBe(1);
  });

  it("reports the active state backend from config, not a hardcoded value", () => {
    expect(api).toMatch(/stateBackend: getStateBackend\(\)/);
  });

  it("the viewer has a Health tab that reads the status report", () => {
    expect(viewer).toContain('<button data-tab="health">Health</button>');
    expect(viewer).toContain('<div id="view-health" class="view"></div>');
    expect(viewer).toMatch(/'replay', 'health'\];/);
    expect(viewer).toMatch(/case 'health': await loadHealth\(\); break;/);
    expect(viewer).toMatch(/api\('status', \{ headers: \{ Accept: 'application\/json' \} \}\)/);
  });
});
