import type { IndexLegStatus, IndexPersistenceStatus } from "../state/index-persistence.js";

export type StatusLevel = "ok" | "info" | "warn" | "error";

export interface StatusProblem {
  level: Exclude<StatusLevel, "ok">;
  code: string;
  message: string;
  fix?: string;
}

export interface FunctionMetricInput {
  functionId: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
}

export interface StatusFlag {
  key: string;
  label: string;
  enabled: boolean;
  needsLlm: boolean;
  enableHow: string;
}

export interface GraphStatsInput {
  totalNodes?: number;
  totalEdges?: number;
  fromSnapshot?: boolean;
  updatedAt?: string;
  dirty?: boolean;
  warning?: string;
}

export interface StatusInputs {
  now: Date;
  version: string;
  engineVersion: string;
  uptimeSeconds: number;
  ports: { rest: number | null; streams: number | null; viewer: number | null };
  health: {
    status?: string;
    alerts?: string[];
    notes?: string[];
    connectionState?: string;
  } | null;
  circuitBreaker: { state?: string; failures?: number } | null;
  functionMetrics: FunctionMetricInput[];
  provider: string;
  embeddingProvider: string;
  flags: StatusFlag[];
  index: {
    bm25Documents: number;
    vectorDocuments: number | null;
    observationsIndexed: number;
    missingObservations: number | null;
    sessions: number | null;
  };
  graph: GraphStatsInput | null;
  graphExtractionEnabled: boolean;
  indexPersistence?: IndexPersistenceStatus | null;
}

export interface StatusReport {
  status: StatusLevel;
  checkedAt: string;
  service: {
    version: string;
    engineVersion: string;
    uptimeSeconds: number;
    ports: StatusInputs["ports"];
  };
  health: StatusInputs["health"];
  provider: { llm: string; embeddings: string; circuitBreaker: StatusInputs["circuitBreaker"] };
  index: StatusInputs["index"];
  indexPersistence: IndexPersistenceStatus | null;
  graph: (GraphStatsInput & { ageSeconds: number | null; extractionEnabled: boolean }) | null;
  functions: Array<FunctionMetricInput & { failureRate: number }>;
  flags: StatusFlag[];
  problems: StatusProblem[];
}

const FAILURE_RATE_THRESHOLD = 0.2;
const FAILURE_MIN_CALLS = 5;
const GRAPH_SNAPSHOT_STALE_SECONDS = 24 * 60 * 60;
const LEVEL_RANK: Record<StatusLevel, number> = { ok: 0, info: 1, warn: 2, error: 3 };

const FUNCTION_FIXES: Record<string, string> = {
  "mem::summarize":
    "Summaries come from your LLM provider. Check the provider key, model name and rate limits in ~/.agentmemory/.env, then look for provider errors in the server log.",
  "mem::compress":
    "Compression calls your LLM provider. Check the provider key and model, or set AGENTMEMORY_AUTO_COMPRESS=false to use zero-LLM compression.",
  "mem::graph-extract":
    "Graph extraction calls your LLM provider. Check the provider key and model, or set GRAPH_EXTRACTION_ENABLED=false.",
};

function secondsBetween(later: Date, earlierIso: string | undefined): number | null {
  if (!earlierIso) return null;
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(earlier)) return null;
  return Math.max(0, Math.round((later.getTime() - earlier) / 1000));
}

export function evaluateStatus(input: StatusInputs): StatusReport {
  const problems: StatusProblem[] = [];

  if (!input.health) {
    problems.push({
      level: "info",
      code: "health-check-unavailable",
      message: "The health monitor has no snapshot yet or did not answer in time, so its state was not checked.",
    });
  }
  const healthStatus = input.health?.status;
  if (healthStatus === "critical") {
    problems.push({ level: "error", code: "health-critical", message: "The health monitor reports a critical state." });
  } else if (healthStatus === "degraded") {
    problems.push({ level: "warn", code: "health-degraded", message: "The health monitor reports a degraded state." });
  }
  for (const alert of input.health?.alerts ?? []) {
    problems.push({ level: "warn", code: "health-alert", message: alert });
  }

  if (input.circuitBreaker?.state === "open") {
    problems.push({
      level: "error",
      code: "provider-circuit-open",
      message: `LLM provider calls are paused after ${input.circuitBreaker.failures ?? 0} consecutive failures.`,
      fix: "Check the provider key and model in ~/.agentmemory/.env. Calls resume automatically once the provider answers again.",
    });
  }

  if (input.provider === "noop") {
    problems.push({
      level: "info",
      code: "no-llm-provider",
      message: "No LLM provider is configured, so summaries, consolidation and graph extraction stay off. Search still works.",
      fix: "Add one provider key (for example ANTHROPIC_API_KEY or OPENAI_API_KEY) to ~/.agentmemory/.env and restart.",
    });
  }

  const functions = input.functionMetrics.map((m) => ({
    ...m,
    failureRate: m.totalCalls > 0 ? m.failureCount / m.totalCalls : 0,
  }));
  for (const fn of functions) {
    if (fn.totalCalls < FAILURE_MIN_CALLS || fn.failureRate < FAILURE_RATE_THRESHOLD) continue;
    problems.push({
      level: "warn",
      code: "function-failing",
      message: `${fn.functionId} failed ${fn.failureCount} of ${fn.totalCalls} calls (${Math.round(fn.failureRate * 100)}%).`,
      fix: FUNCTION_FIXES[fn.functionId] ?? "Look for this function id in the server log to see the error.",
    });
  }

  const missingObservations = input.index.missingObservations;
  if (missingObservations !== null && missingObservations > 0) {
    problems.push({
      level: "warn",
      code: "index-missing-observations",
      message: `${missingObservations} stored observations are not in the search index, so search cannot find them.`,
      fix: "Restart agentmemory: the boot reconcile re-indexes observations missing from the snapshot.",
    });
  }
  if (missingObservations === null) {
    problems.push({
      level: "info",
      code: "index-check-unavailable",
      message: "The session store did not answer in time, so the search index was not checked for missing observations.",
    });
  }

  const persistence = input.indexPersistence ?? null;
  const vectorLeg = persistence?.vector ?? null;
  if (persistence && vectorLeg) {
    if (vectorLeg.lastError) {
      problems.push({
        level: "error",
        code: "index-save-failing",
        message: `The vector index could not be saved: ${vectorLeg.lastError}. Search keeps working from memory, but vectors added since the last save are lost on restart.`,
        fix: "Check the server log for the failing state write. The next save retries automatically.",
      });
    }
    const dirtyAge = secondsBetween(input.now, vectorLeg.dirtySince ?? undefined);
    if (!vectorLeg.lastError && dirtyAge !== null && dirtyAge * 1000 > 2 * persistence.saveIntervalMs) {
      problems.push({
        level: "warn",
        code: "index-save-stale",
        message: `The vector index has unsaved changes from ${formatDuration(dirtyAge)} ago.`,
        fix: "Saves run at most once per AGENTMEMORY_INDEX_SAVE_INTERVAL_MS. Check the server log for save errors or a save that never finishes.",
      });
    }
  }

  let graph: StatusReport["graph"] = null;
  if (input.graph) {
    const ageSeconds = secondsBetween(input.now, input.graph.updatedAt);
    graph = { ...input.graph, ageSeconds, extractionEnabled: input.graphExtractionEnabled };
    if (input.graphExtractionEnabled && !input.graph.fromSnapshot) {
      problems.push({
        level: "warn",
        code: "graph-no-snapshot",
        message: "Graph extraction is on but no graph snapshot exists, so graph counts read as zero.",
        fix: "Use Rebuild Graph in the viewer, or POST /agentmemory/graph/snapshot-rebuild.",
      });
    } else if (input.graph.fromSnapshot && ageSeconds !== null && ageSeconds > GRAPH_SNAPSHOT_STALE_SECONDS) {
      const age = ageSeconds >= 2 * 86400 ? `${Math.floor(ageSeconds / 86400)} days` : `${Math.round(ageSeconds / 3600)} hours`;
      problems.push({
        level: "info",
        code: "graph-snapshot-stale",
        message: `The graph snapshot is ${age} old, so dashboard graph counts can lag the live graph.`,
        fix: "POST /agentmemory/graph/snapshot-rebuild refreshes it.",
      });
    }
    if (input.graph.dirty) {
      problems.push({
        level: "info",
        code: "graph-snapshot-dirty",
        message: "The graph snapshot was read while a write was in flight; counts are eventually consistent.",
      });
    }
  }

  const status = problems.reduce<StatusLevel>(
    (worst, p) => (LEVEL_RANK[p.level] > LEVEL_RANK[worst] ? p.level : worst),
    "ok",
  );

  return {
    status,
    checkedAt: input.now.toISOString(),
    service: {
      version: input.version,
      engineVersion: input.engineVersion,
      uptimeSeconds: input.uptimeSeconds,
      ports: input.ports,
    },
    health: input.health,
    provider: {
      llm: input.provider,
      embeddings: input.embeddingProvider,
      circuitBreaker: input.circuitBreaker,
    },
    index: input.index,
    indexPersistence: persistence,
    graph,
    functions,
    flags: input.flags,
    problems,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function legSummary(report: StatusReport, leg: IndexLegStatus): string {
  if (leg.lastError) return `failing: ${leg.lastError}`;
  const saved = leg.lastSavedAt ? `saved ${formatDuration(secondsBetween(new Date(report.checkedAt), leg.lastSavedAt))} ago` : "not saved since start";
  return leg.dirtySince ? `${saved}, unsaved changes pending` : saved;
}

function indexPersistenceRows(report: StatusReport): string {
  const persistence = report.indexPersistence;
  if (!persistence) return "";
  let rows = row("BM25 index", "rebuilt from stored content at boot");
  if (persistence.vector) {
    rows += row("Vector save", escapeHtml(legSummary(report, persistence.vector)));
    rows += row(
      "Vector storage",
      escapeHtml(`${persistence.buckets} buckets, ${persistence.pendingChanges} unsaved changes`),
    );
  }
  return rows;
}

export function renderStatusHtml(report: StatusReport, styleNonce: string): string {
  const problems = report.problems.length
    ? report.problems
        .map(
          (p) =>
            `<li class="p ${p.level}"><span class="lvl">${p.level}</span><div><p>${escapeHtml(p.message)}</p>` +
            (p.fix ? `<p class="fix">${escapeHtml(p.fix)}</p>` : "") +
            `</div></li>`,
        )
        .join("")
    : `<li class="p ok"><span class="lvl">ok</span><div><p>No problems found.</p></div></li>`;

  const functions = report.functions.length
    ? report.functions
        .slice()
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .map(
          (f) =>
            `<tr${f.failureRate >= FAILURE_RATE_THRESHOLD && f.totalCalls >= FAILURE_MIN_CALLS ? ' class="bad"' : ""}>` +
            `<td>${escapeHtml(f.functionId)}</td><td>${f.totalCalls}</td><td>${f.failureCount}</td>` +
            `<td>${Math.round(f.failureRate * 100)}%</td><td>${Math.round(f.avgLatencyMs)} ms</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No function calls recorded yet.</td></tr>`;

  const flags = report.flags
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.label)}</td><td>${f.enabled ? "on" : "off"}</td>` +
        `<td>${f.enabled ? "" : escapeHtml(f.enableHow)}</td></tr>`,
    )
    .join("");

  const idx = report.index;
  const graph = report.graph;
  const ports = report.service.ports;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>agentmemory status</title>
<style nonce="${escapeHtml(styleNonce)}">
:root{--bg:#fafaf9;--ink:#18181b;--muted:#52525b;--line:#e4e4e7;--ok:#15803d;--info:#1d4ed8;--warn:#b45309;--error:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0c0c0e;--ink:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--ok:#4ade80;--info:#93c5fd;--warn:#fbbf24;--error:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}
header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:12px;margin-bottom:24px}
h1{font-size:22px;margin:0}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:32px 0 8px}
.badge{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:12px;padding:2px 8px;border:1.5px solid currentColor}
.ok{color:var(--ok)}.info{color:var(--info)}.warn{color:var(--warn)}.error{color:var(--error)}
.meta{color:var(--muted);font-size:12px;margin-left:auto}
ul.problems{list-style:none;padding:0;margin:0}
li.p{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
li.p p{margin:0;color:var(--ink)}li.p .fix{color:var(--muted);margin-top:4px}
.lvl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-top:2px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;width:220px}
table.list th{width:auto;font-size:12px}tr.bad td{color:var(--error)}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
a{color:inherit}
</style></head><body><main>
<header><h1>agentmemory</h1><span class="badge ${report.status}">${report.status}</span>
<span class="meta">v${escapeHtml(report.service.version)} · engine ${escapeHtml(report.service.engineVersion)} · checked ${escapeHtml(report.checkedAt)} · <a href="">refresh</a> · <a href="?format=json">json</a></span></header>
<h2>Problems</h2><ul class="problems">${problems}</ul>
<h2>Service</h2><table>
${row("Uptime", escapeHtml(formatDuration(report.service.uptimeSeconds)))}
${row("REST port", escapeHtml(ports.rest ?? "unknown"))}
${row("Streams port", escapeHtml(ports.streams ?? "unknown"))}
${row("Viewer port", escapeHtml(ports.viewer ?? "not running"))}
${row("Health monitor", escapeHtml(report.health?.status ?? "no data yet"))}
${row("Engine connection", escapeHtml(report.health?.connectionState ?? "unknown"))}
</table>
<h2>Providers</h2><table>
${row("LLM", escapeHtml(report.provider.llm))}
${row("Embeddings", escapeHtml(report.provider.embeddings))}
${row("Circuit breaker", escapeHtml(report.provider.circuitBreaker ? `${report.provider.circuitBreaker.state ?? "unknown"} (${report.provider.circuitBreaker.failures ?? 0} failures)` : "not in use"))}
</table>
<h2>Search index</h2><table>
${row("BM25 documents", escapeHtml(idx.bm25Documents))}
${row("Vector documents", escapeHtml(idx.vectorDocuments ?? "vector search off"))}
${row("Observations indexed", escapeHtml(idx.observationsIndexed))}
${row("Missing from index", escapeHtml(idx.missingObservations ?? "not checked"))}
${row("Sessions", escapeHtml(idx.sessions ?? "unknown"))}
${indexPersistenceRows(report)}
</table>
<h2>Knowledge graph</h2><table>
${graph
  ? row("Extraction", graph.extractionEnabled ? "on" : "off") +
    row("Nodes / edges", escapeHtml(`${graph.totalNodes ?? 0} / ${graph.totalEdges ?? 0}`)) +
    row("Snapshot age", escapeHtml(graph.fromSnapshot ? formatDuration(graph.ageSeconds) : "no snapshot"))
  : row("Graph", "unavailable")}
</table>
<h2>Functions</h2><table class="list"><tr><th>Function</th><th>Calls</th><th>Failed</th><th>Failure rate</th><th>Avg latency</th></tr>${functions}</table>
<h2>Features</h2><table class="list"><tr><th>Feature</th><th>State</th><th>How to enable</th></tr>${flags}</table>
<h2>More</h2><p>Environment checks (keys, engine binary, stale pid files) run on your machine with <code>agentmemory doctor</code>. This page as JSON: <code>GET /agentmemory/status</code> with <code>Accept: application/json</code>.</p>
</main></body></html>`;
}

export const UNINDEXED_SCAN_REUSE_MS = 30_000;

export function singleFlight<T>(
  run: () => Promise<T>,
  reuseMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  let current: { promise: Promise<T>; settledAt: number | null } | null = null;
  return () => {
    if (current && (current.settledAt === null || now() - current.settledAt < reuseMs)) {
      return current.promise;
    }
    const entry: { promise: Promise<T>; settledAt: number | null } = { promise: run(), settledAt: null };
    entry.promise.then(
      () => {
        entry.settledAt = now();
      },
      () => {
        if (current === entry) current = null;
      },
    );
    current = entry;
    return entry.promise;
  };
}

export function prefersHtml(accept: string | undefined, format: string | undefined): boolean {
  if (format === "json") return false;
  if (format === "html") return true;
  if (!accept) return false;
  return /\btext\/html\b/.test(accept);
}
