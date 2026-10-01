import type { IndexLegStatus, IndexPersistenceStatus } from "../state/index-persistence.js";
import type { VectorBackfillState } from "./search.js";

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
  stateBackend: "file" | "redis";
  ports: { rest: number | null; streams: number | null; viewer: number | null };
  health: {
    status?: string;
    alerts?: string[];
    notes?: string[];
    connectionState?: string;
    memory?: { heapUsed: number; heapTotal: number; heapLimit?: number; rss: number };
    eventLoopLagMs?: number;
    cpuPercent?: number;
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
    memoriesIndexed?: number;
    lessonsIndexed?: number;
    missingObservations: number | null;
    sessions: number | null;
    bm25Incomplete: boolean;
    keywordRebuildRunning?: boolean;
    pendingVectorBackfill: number;
    vectorBackfillState?: VectorBackfillState;
  };
  graph: GraphStatsInput | null;
  graphExtractionEnabled: boolean;
  auditLegacy: { status: string; sizeBytes?: number } | null;
  indexPersistence?: IndexPersistenceStatus | null;
  stateStore?: { ok: boolean; latencyMs?: number } | null;
}

export interface IndexBreakdown {
  observations: number;
  memories: number;
  lessons: number;
}

export interface StatusReport {
  status: StatusLevel;
  headline: string;
  checkedAt: string;
  service: {
    version: string;
    engineVersion: string;
    uptimeSeconds: number;
    stateBackend: StatusInputs["stateBackend"];
    stateStore: { ok: boolean; latencyMs?: number } | null;
    ports: StatusInputs["ports"];
  };
  health: StatusInputs["health"];
  provider: {
    llm: string;
    embeddings: string;
    circuitBreaker: StatusInputs["circuitBreaker"];
    offWithoutLlm: string[];
  };
  index: StatusInputs["index"] & { breakdown: IndexBreakdown | null };
  indexPersistence: IndexPersistenceStatus | null;
  graph: (GraphStatsInput & { ageSeconds: number | null; extractionEnabled: boolean }) | null;
  functions: Array<FunctionMetricInput & { failureRate: number; offWithoutLlm: boolean }>;
  flags: Array<StatusFlag & { inactiveReason?: string }>;
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

export const LLM_KEY_FIX =
  "Add one LLM provider key (for example ANTHROPIC_API_KEY or OPENAI_API_KEY) to ~/.agentmemory/.env and restart.";

export const OFF_WITHOUT_LLM = [
  "session summaries",
  "consolidation into semantic facts and procedures",
  "typed graph extraction",
  "LLM observation compression",
  "skill extraction from finished sessions",
];

export const BM25_EXPLAINER =
  "The keyword index holds observations, memories and lessons, so its total is larger than the observation count.";

export function describeHealthAlert(slug: string): { level: "warn" | "error"; message: string; fix: string } {
  let m: RegExpExecArray | null;
  if ((m = /^memory_(warn|critical)_(\d+)%_rss(\d+)mb$/.exec(slug))) {
    return {
      level: m[1] === "critical" ? "error" : "warn",
      message: `Memory ${m[1] === "critical" ? "critically high" : "high"}: ${m[2]}% of the heap limit in use, process memory ${m[3]} MB.`,
      fix: "Restart agentmemory to release memory. If it climbs back, raise the limit with NODE_OPTIONS=--max-old-space-size=4096.",
    };
  }
  if ((m = /^cpu_(warn|critical)_(\d+)%$/.exec(slug))) {
    return {
      level: m[1] === "critical" ? "error" : "warn",
      message: `CPU ${m[1] === "critical" ? "critically high" : "high"}: ${m[2]}%.`,
      fix: "Usually a burst of observations or a rebuild. If it stays high with no agent running, check the server log for a loop.",
    };
  }
  if ((m = /^event_loop_lag_(warn|critical)_(\d+)ms$/.exec(slug))) {
    return {
      level: m[1] === "critical" ? "error" : "warn",
      message: `The worker is ${m[2]} ms behind on its work (event loop delay), so requests answer slowly.`,
      fix: "It usually clears after an import or index rebuild finishes. If it persists, restart agentmemory.",
    };
  }
  if (slug === "stream_relay_down") {
    return {
      level: "warn",
      message: "Live updates are not reaching the viewer: the engine stopped relaying stream events, which happens after Redis restarts or drops the connection. Data is still saved.",
      fix: "Restart agentmemory (npx @agentmemory/agentmemory stop, then start) so the engine subscribes to Redis again, then reload the viewer.",
    };
  }
  if (slug === "connection_reconnecting") {
    return {
      level: "warn",
      message: "The connection to the iii engine dropped and is reconnecting.",
      fix: "Wait a few seconds. If it does not recover, check that the engine is running with npx @agentmemory/agentmemory status.",
    };
  }
  if ((m = /^connection_(.+)$/.exec(slug))) {
    return {
      level: "error",
      message: `The connection to the iii engine is ${m[1]}, so nothing can be stored or searched.`,
      fix: "Restart agentmemory. Run npx @agentmemory/agentmemory doctor if the engine does not start.",
    };
  }
  return { level: "warn", message: slug, fix: "Look for this alert in the server log." };
}

export function isOffWithoutLlm(functionId: string, providerKind: string): boolean {
  return providerKind === "noop" && functionId in FUNCTION_FIXES;
}

export function markLlmFunctions<T extends { functionId: string }>(
  metrics: T[],
  providerKind: string,
): Array<T & { offWithoutLlm: boolean }> {
  return metrics.map((m) => ({ ...m, offWithoutLlm: isOffWithoutLlm(m.functionId, providerKind) }));
}

function secondsBetween(later: Date, earlierIso: string | undefined): number | null {
  if (!earlierIso) return null;
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(earlier)) return null;
  return Math.max(0, Math.round((later.getTime() - earlier) / 1000));
}

function vectorBackfillFix(state: VectorBackfillState | undefined): string {
  if (state === "waiting-for-opt-in") {
    return "Backfill is paused. Set AGENTMEMORY_VECTOR_BACKFILL=all and restart to opt in. This calls the embedding provider and is capped per boot by AGENTMEMORY_VECTOR_BACKFILL_MAX.";
  }
  if (state === "running") {
    return "Backfill is running in the background, capped per boot by AGENTMEMORY_VECTOR_BACKFILL_MAX. Check the server log for embedding provider errors if progress stops.";
  }
  return "Backfill is not running. Check the server log and embedding provider configuration. A full backfill requires AGENTMEMORY_VECTOR_BACKFILL=all and a restart, and can consume embedding provider tokens.";
}

export function evaluateStatus(input: StatusInputs): StatusReport {
  const problems: StatusProblem[] = [];

  if (!input.health) {
    problems.push({
      level: "info",
      code: "health-check-unavailable",
      message: "The health monitor has no snapshot yet or did not answer in time, so its state was not checked.",
      fix: "The monitor writes a snapshot every 30 seconds after start. Wait a minute; if this stays, check the server log.",
    });
  }
  const healthStatus = input.health?.status;
  const alerts = input.health?.alerts ?? [];
  if (alerts.length === 0 && healthStatus === "critical") {
    problems.push({
      level: "error",
      code: "health-critical",
      message: "The health monitor reports a critical state.",
      fix: "Check the server log, then restart agentmemory.",
    });
  } else if (alerts.length === 0 && healthStatus === "degraded") {
    problems.push({
      level: "warn",
      code: "health-degraded",
      message: "The health monitor reports a degraded state.",
      fix: "Check the server log for the cause.",
    });
  }
  const described = alerts.map(describeHealthAlert);
  if (healthStatus !== "critical") for (const d of described) d.level = "warn";
  else if (described.length && !described.some((d) => d.level === "error")) described[0].level = "error";
  for (const d of described) {
    problems.push({ level: d.level, code: "health-alert", message: d.message, fix: d.fix });
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
      fix: LLM_KEY_FIX,
    });
  }

  const noLlm = input.provider === "noop";
  const functions = markLlmFunctions(input.functionMetrics, input.provider).map((m) => ({
    ...m,
    failureRate: m.totalCalls > 0 ? m.failureCount / m.totalCalls : 0,
  }));
  for (const fn of functions) {
    if (fn.offWithoutLlm) continue;
    if (fn.totalCalls < FAILURE_MIN_CALLS || fn.failureRate < FAILURE_RATE_THRESHOLD) continue;
    problems.push({
      level: "warn",
      code: "function-failing",
      message: `${fn.functionId} failed ${fn.failureCount} of ${fn.totalCalls} calls (${Math.round(fn.failureRate * 100)}%).`,
      fix: FUNCTION_FIXES[fn.functionId] ?? "Look for this function id in the server log to see the error.",
    });
  }

  const missingObservations = input.index.missingObservations;
  if (!input.index.keywordRebuildRunning && missingObservations !== null && missingObservations > 0) {
    problems.push({
      level: "warn",
      code: "index-missing-observations",
      message: `${missingObservations} stored observations are not in the search index, so search cannot find them.`,
      fix: "Restart agentmemory: the boot reconcile re-indexes observations missing from the snapshot.",
    });
  }
  if (input.index.keywordRebuildRunning) {
    problems.push({
      level: "info",
      code: "keyword-index-rebuilding",
      message: "The keyword index is still rebuilding from stored data, so the check for observations missing from search waits until it finishes.",
      fix: "No action needed. The check runs on the next health update after the rebuild.",
    });
  } else if (missingObservations === null) {
    problems.push({
      level: "info",
      code: "index-check-unavailable",
      message: "The session store did not answer in time, so the search index was not checked for missing observations.",
      fix: "The check runs again on the next health update. If it keeps timing out, the store is overloaded: check the server log.",
    });
  }

  if (input.index.bm25Incomplete) {
    problems.push({
      level: "error",
      code: "bm25-rebuild-incomplete",
      message: "The keyword index could not load every session at boot, so some observations are missing from search until the next successful rebuild.",
      fix: "Check the server log for the session listing failure. Restarting or the next cold-start search retries automatically.",
    });
  }

  if (input.index.pendingVectorBackfill > 0) {
    problems.push({
      level: "info",
      code: "index-vector-backfill-pending",
      message: `${input.index.pendingVectorBackfill} documents are waiting for a vector embedding.`,
      fix: vectorBackfillFix(input.index.vectorBackfillState),
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
        fix: "After the first checkpoint, saves are batched by AGENTMEMORY_INDEX_SAVE_INTERVAL_MS. Check the server log for save errors or a save that never finishes.",
      });
    }
  }
  if (persistence?.vectorCountShortfall) {
    const { expected, loaded } = persistence.vectorCountShortfall;
    problems.push({
      level: "warn",
      code: "index-vector-count-shortfall",
      message: `Only ${loaded} of ${expected} vectors loaded from the last save.`,
      fix: vectorBackfillFix(input.index.vectorBackfillState),
    });
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
        fix: "No action needed: the next graph write settles the counts.",
      });
    }
  }

  if (input.auditLegacy?.status === "too-large" || input.auditLegacy?.status === "unreadable") {
    const size = input.auditLegacy.sizeBytes;
    const sizeText = typeof size === "number" ? ` (${Math.round(size / (1024 * 1024))} MiB)` : "";
    problems.push({
      level: "info",
      code: "audit-legacy-frozen",
      message: `An older audit log${sizeText} was left in place instead of being migrated into monthly scopes, so it is no longer rewritten but its rows do not show up in audit queries.`,
      fix:
        input.stateBackend === "redis"
          ? "Safe to ignore. To remove it, run redis-cli -u \"$AGENTMEMORY_REDIS_URL\" DEL state:mem:audit, then restart agentmemory."
          : "Safe to ignore. To remove it, stop agentmemory, delete mem%3Aaudit.bin from the state store directory, then start it again.",
    });
  }

  if (input.stateStore && !input.stateStore.ok) {
    problems.push({
      level: "error",
      code: "state-store-unreachable",
      message:
        input.stateBackend === "redis"
          ? "The state store is not answering: the engine cannot reach Redis, so nothing is being saved or read."
          : "The state store is not answering: the engine did not complete a state read in time, so nothing is being saved or read.",
      fix:
        input.stateBackend === "redis"
          ? "Check that Redis is running and reachable at AGENTMEMORY_REDIS_URL (redis-cli -u \"$AGENTMEMORY_REDIS_URL\" ping should answer PONG). Once Redis is back, restart agentmemory: the engine does not resume the live viewer stream after a Redis restart."
          : "Check the server log for engine errors, then restart agentmemory.",
    });
  }

  const status = problems.reduce<StatusLevel>(
    (worst, p) => (LEVEL_RANK[p.level] > LEVEL_RANK[worst] ? p.level : worst),
    "ok",
  );

  return {
    status,
    headline: statusHeadline(status, problems),
    checkedAt: input.now.toISOString(),
    service: {
      version: input.version,
      engineVersion: input.engineVersion,
      uptimeSeconds: input.uptimeSeconds,
      stateBackend: input.stateBackend,
      stateStore: input.stateStore ?? null,
      ports: input.ports,
    },
    health: input.health,
    provider: {
      llm: input.provider,
      embeddings: input.embeddingProvider,
      circuitBreaker: input.circuitBreaker,
      offWithoutLlm: noLlm ? OFF_WITHOUT_LLM : [],
    },
    index: { ...input.index, breakdown: indexBreakdown(input.index) },
    indexPersistence: persistence,
    graph,
    functions,
    flags: input.flags.map((flag) =>
      flag.enabled && flag.needsLlm && noLlm
        ? { ...flag, inactiveReason: "needs an LLM provider, none is configured" }
        : flag,
    ),
    problems,
  };
}

function statusHeadline(status: StatusLevel, problems: StatusProblem[]): string {
  if (status === "ok") return "Every check passed. Capture, search and the stream are working.";
  if (status === "info") {
    return `Working normally. ${plural(problems.length, "note")} below about features that are off or checks that did not run.`;
  }
  const worst = problems.find((p) => p.level === status) ?? problems[0];
  const rest = problems.length - 1;
  const lead = status === "error" ? "Not working correctly" : "Working, but needs attention";
  return `${lead}: ${worst.message}${rest > 0 ? ` (${plural(rest, "more item")} below.)` : ""}`;
}

function indexBreakdown(idx: StatusInputs["index"]): IndexBreakdown | null {
  if (idx.memoriesIndexed === undefined && idx.lessonsIndexed === undefined) return null;
  const lessons = idx.lessonsIndexed ?? 0;
  return {
    observations: Math.max(0, idx.observationsIndexed - lessons),
    memories: idx.memoriesIndexed ?? 0,
    lessons,
  };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function documentBreakdown(idx: StatusReport["index"]): string {
  const b = idx.breakdown;
  if (!b) return String(idx.bm25Documents);
  const parts = [
    plural(b.observations, "observation"),
    `${b.memories} ${b.memories === 1 ? "memory" : "memories"}`,
    plural(b.lessons, "lesson"),
  ];
  return `${idx.bm25Documents} (${parts.join(", ")})`;
}

function flagState(flag: StatusReport["flags"][number]): string {
  if (!flag.enabled) return "off";
  if (flag.inactiveReason) return `on, inactive: ${flag.inactiveReason}`;
  return "on";
}

function flagHowTo(flag: StatusReport["flags"][number]): string {
  if (!flag.enabled) return flag.enableHow;
  if (flag.inactiveReason) return LLM_KEY_FIX;
  return `Set ${flag.key}=false and restart to turn it off.`;
}

function processHealth(report: StatusReport): string {
  const status = report.health?.status;
  if (!status) return "no data yet";
  if (status === "healthy" && report.status !== "ok") {
    return "healthy (memory, CPU and engine checks only; the badge at the top covers every problem on this page)";
  }
  return status;
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
      escapeHtml(`${plural(persistence.buckets, "bucket")}, ${plural(persistence.pendingChanges, "unsaved change")}`),
    );
  }
  return rows;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function processRows(report: StatusReport): string {
  const h = report.health;
  let rows = row("Process health", escapeHtml(processHealth(report)));
  if (h?.memory) {
    const limit = h.memory.heapLimit || h.memory.heapTotal;
    const pct = limit > 0 ? Math.round((h.memory.heapUsed / limit) * 100) : 0;
    rows += row(
      "Heap",
      escapeHtml(`${mb(h.memory.heapUsed)} of ${mb(limit)} (${pct}%)`) +
        '<p class="note">JavaScript memory in use against the most it may grow to. Only a concern above 80% while RSS is also over 512 MB.</p>',
    );
    rows += row(
      "RSS",
      escapeHtml(mb(h.memory.rss)) + '<p class="note">Everything the process holds from the operating system, including code and buffers.</p>',
    );
  }
  if (typeof h?.eventLoopLagMs === "number") {
    rows += row(
      "Event loop delay",
      escapeHtml(`${h.eventLoopLagMs.toFixed(1)} ms`) +
        '<p class="note">How far behind the worker is. Under 100 ms is fine; above that requests answer slowly.</p>',
    );
  }
  return rows;
}

export function renderStatusHtml(
  report: StatusReport,
  styleNonce: string,
  options: { viewerUrl?: string } = {},
): string {
  const viewerUrl = options.viewerUrl ?? "/agentmemory/viewer#health";
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
            `<tr${!f.offWithoutLlm && f.failureRate >= FAILURE_RATE_THRESHOLD && f.totalCalls >= FAILURE_MIN_CALLS ? ' class="bad"' : ""}>` +
            `<td>${escapeHtml(f.functionId)}</td><td>${f.totalCalls}</td><td>${f.offWithoutLlm ? "-" : f.failureCount}</td>` +
            `<td>${f.offWithoutLlm ? "off, no LLM provider" : `${Math.round(f.failureRate * 100)}%`}</td><td>${Math.round(f.avgLatencyMs)} ms</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No function calls recorded yet.</td></tr>`;

  const flags = report.flags
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.label)}</td><td><code>${escapeHtml(f.key)}</code></td><td${f.inactiveReason ? ' class="warn"' : ""}>${escapeHtml(flagState(f))}</td>` +
        `<td>${escapeHtml(flagHowTo(f))}</td></tr>`,
    )
    .join("");

  const idx = report.index;
  const graph = report.graph;
  const ports = report.service.ports;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>agentmemory status</title>
<style nonce="${escapeHtml(styleNonce)}">
:root{--bg:#F9F9F7;--bg-alt:#F0F0EC;--ink:#111111;--ink-muted:#666666;--line:#D4D4CF;--rule:#111111;--ok:#2D6A4F;--info:#1D4E89;--warn:#B8860B;--error:#CC0000;--font-display:'Playfair Display',Georgia,'Times New Roman',serif;--font-body:'Lora',Georgia,serif;--font-ui:'Inter',-apple-system,system-ui,sans-serif;--font-mono:'JetBrains Mono','SF Mono','Fira Code',ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--bg-alt:#1a1c20;--ink:#eef0f3;--ink-muted:#94979d;--line:#26282c;--rule:#c9cbd1;--ok:#4ade80;--info:#93c5fd;--warn:#fbbf24;--error:#f2555a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--font-body)}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}
header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:3px double var(--rule);padding-bottom:12px;margin-bottom:24px}
h1{font:700 26px/1.2 var(--font-display);margin:0}h2{font:600 11px/1.4 var(--font-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin:32px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--rule)}
.badge{font:700 11px/1.4 var(--font-ui);text-transform:uppercase;letter-spacing:.08em;padding:2px 8px;border:1.5px solid currentColor}
.ok{color:var(--ok)}.info{color:var(--info)}.warn{color:var(--warn)}.error{color:var(--error)}
.meta{color:var(--ink-muted);font:12px/1.4 var(--font-ui);margin-left:auto}
ul.problems{list-style:none;padding:0;margin:0}
li.p{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
li.p p{margin:0;color:var(--ink)}li.p .fix{color:var(--ink-muted);margin-top:4px;font-size:13px}
.lvl{font:700 11px/1.4 var(--font-ui);text-transform:uppercase;letter-spacing:.08em;padding-top:2px}
table{width:100%;border-collapse:collapse;font:13px/1.5 var(--font-ui)}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
th{color:var(--ink-muted);font-weight:500;width:220px}
table.list th{width:auto;font-size:11px;text-transform:uppercase;letter-spacing:.06em;overflow-wrap:normal}table.list td{overflow-wrap:break-word}table.list td code{overflow-wrap:break-word;word-break:normal}tr.bad td{color:var(--error)}
tr:nth-child(even) td{background:var(--bg-alt)}
code{font:12px var(--font-mono);overflow-wrap:anywhere}
.lead{font:600 16px/1.45 var(--font-body);margin:0 0 8px}.live{font:13px/1.5 var(--font-ui);color:var(--ink-muted);margin:0 0 8px}
.note{margin:2px 0 0;color:var(--ink-muted);font-size:12px}
a{color:inherit}
@media (max-width:640px){th{width:110px}table.list{table-layout:fixed}table.list th,table.list td{padding:6px 4px;font-size:12px}}
</style></head><body><main>
<header><h1>agentmemory</h1><span class="badge ${report.status}">${report.status}</span>
<span class="meta">v${escapeHtml(report.service.version)} · engine ${escapeHtml(report.service.engineVersion)} · checked ${escapeHtml(report.checkedAt)} · <a href="?format=json">json</a></span></header>
<p class="lead ${report.status}">${escapeHtml(report.headline)}</p>
<p class="live">A snapshot from when this page loaded. <a href="${escapeHtml(viewerUrl)}">Open the live version in the viewer &rarr;</a> From a terminal: <code>curl -s ${ports.rest ? `http://localhost:${escapeHtml(ports.rest)}` : ""}/agentmemory/status</code> returns this report as JSON.</p>
<h2>Problems</h2><ul class="problems">${problems}</ul>
<h2>Engine and connection</h2><table>
${row("Engine connection", escapeHtml(report.health?.connectionState ?? "unknown"))}
${row("Uptime", escapeHtml(formatDuration(report.service.uptimeSeconds)))}
${row("State backend", escapeHtml(report.service.stateBackend))}
${row("REST port", escapeHtml(ports.rest ?? "unknown"))}
${row("Streams port", escapeHtml(ports.streams ?? "unknown"))}
${row("Viewer port", escapeHtml(ports.viewer ?? "not running"))}
</table>
<h2>LLM and embeddings</h2><table>
${row("LLM", escapeHtml(report.provider.llm === "noop" ? "none configured" : report.provider.llm))}
${report.provider.offWithoutLlm.length ? row("Off without an LLM", escapeHtml(report.provider.offWithoutLlm.join(", ")) + `<p class="note">${escapeHtml(LLM_KEY_FIX)}</p>`) : ""}
${row("Embeddings", escapeHtml(report.provider.embeddings === "none" ? "none (keyword search only)" : report.provider.embeddings))}
${row("Circuit breaker", escapeHtml(report.provider.circuitBreaker ? `${report.provider.circuitBreaker.state ?? "unknown"} (${report.provider.circuitBreaker.failures ?? 0} failures)` : "not in use"))}
</table>
<h2>Search index</h2><table>
${row("Keyword index (BM25)", escapeHtml(documentBreakdown(idx)) + `<p class="note">${escapeHtml(BM25_EXPLAINER)}</p>`)}
${row("Vector documents", escapeHtml(idx.vectorDocuments ?? "vector search off"))}
${row("Observations searchable", escapeHtml(idx.breakdown ? idx.breakdown.observations : idx.observationsIndexed))}
${row("Missing from index", escapeHtml(idx.missingObservations ?? "not checked"))}
${row("Sessions", escapeHtml(idx.sessions ?? "unknown"))}
${row("Keyword index rebuild", idx.bm25Incomplete ? '<span class="warn">incomplete</span>' : "complete")}
${row("Pending vector backfill", escapeHtml(idx.pendingVectorBackfill))}
${idx.vectorBackfillState ? row("Vector backfill", escapeHtml(idx.vectorBackfillState === "waiting-for-opt-in" ? "paused, waiting for opt-in" : idx.vectorBackfillState)) : ""}
${indexPersistenceRows(report)}
</table>
<h2>Knowledge graph</h2><table>
${graph
  ? row("Extraction", graph.extractionEnabled ? "on" : "off") +
    row("Nodes / edges", escapeHtml(`${graph.totalNodes ?? 0} / ${graph.totalEdges ?? 0}`)) +
    row("Snapshot age", escapeHtml(graph.fromSnapshot ? formatDuration(graph.ageSeconds) : "no snapshot"))
  : row("Graph", "unavailable")}
</table>
<h2>Features</h2><table class="list"><tr><th>Feature</th><th>Setting</th><th>State</th><th>How to change</th></tr>${flags}</table>
<h2>Process</h2><table>
${processRows(report)}
</table>
<h2>Functions</h2><table class="list"><tr><th>Function</th><th>Calls</th><th>Failed</th><th>Failure rate</th><th>Avg latency</th></tr>${functions}</table>
<h2>More</h2><p>Environment checks (keys, engine binary, stale pid files) run on your machine with <code>npx @agentmemory/agentmemory doctor</code>. JSON: <code>GET /agentmemory/status</code> with <code>Accept: application/json</code>, or add <code>?format=json</code>.</p>
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
