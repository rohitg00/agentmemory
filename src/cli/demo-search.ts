export type DemoSearchResult = { query: string; hits: number; topTitle: string; error?: string };

export interface DemoSearchScope {
  project?: string;
  sessionIds?: string[];
}

export interface DemoHttpDeps {
  fetch?: typeof fetch;
  headers?: (url: string) => Record<string, string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface DemoWaitResult {
  ready: boolean;
  polls: number;
  waitedMs: number;
  pending: string[];
  errors: string[];
}

export interface DemoStatusSnapshot {
  health?: { connectionState?: string } | null;
  provider?: { embeddings?: string } | null;
  index?: {
    missingObservations?: number | null;
    bm25Incomplete?: boolean;
    keywordRebuildRunning?: boolean;
  } | null;
  capture?: { inbox?: { pending?: number; retrying?: number; dead?: number; lastError?: string | null } | null } | null;
}

export type DemoStatusRead = { status: DemoStatusSnapshot } | { error: string };

export const DEMO_PROJECT_PREFIX = "/tmp/agentmemory-demo";

export function demoProjectForRun(now: number = Date.now(), random: () => number = Math.random): string {
  return `${DEMO_PROJECT_PREFIX}-${now.toString(36)}${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
}

export const DEMO_WAIT_TIMEOUT_MS = 18_000;
export const DEMO_WAIT_INTERVAL_MS = 500;

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function uniqueErrors(results: DemoSearchResult[]): string[] {
  return [...new Set(results.flatMap((r) => (r.error ? [r.error] : [])))];
}

export async function searchDemo(
  base: string,
  query: string,
  scope: DemoSearchScope = {},
  deps: DemoHttpDeps = {},
  timeoutMs = 10_000,
): Promise<DemoSearchResult> {
  const doFetch = deps.fetch ?? fetch;
  const url = `${base}/agentmemory/smart-search`;
  const sessions = scope.sessionIds ? new Set(scope.sessionIds) : null;
  const limit = sessions ? 20 : 5;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(deps.headers?.(url) ?? {}) },
      body: JSON.stringify(scope.project ? { query, limit, project: scope.project } : { query, limit }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { query, hits: 0, topTitle: "(no results)", error: `HTTP ${res.status}` };
    const data = (await res.json().catch(() => null)) as { results?: Array<{ title?: string; sessionId?: string }> } | null;
    if (!data || !Array.isArray(data.results)) {
      return { query, hits: 0, topTitle: "(no results)", error: "the search response was not valid JSON" };
    }
    const items = sessions
      ? data.results.filter((r) => typeof r.sessionId === "string" && sessions.has(r.sessionId)).slice(0, 5)
      : data.results;
    return { query, hits: items.length, topTitle: items[0]?.title ?? "(no results)" };
  } catch (err) {
    return { query, hits: 0, topTitle: "(no results)", error: errorText(err) };
  }
}

export async function waitForDemoSearchable(
  base: string,
  scope: DemoSearchScope,
  probes: string[],
  deps: DemoHttpDeps = {},
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<DemoWaitResult> {
  const timeoutMs = options.timeoutMs ?? DEMO_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEMO_WAIT_INTERVAL_MS;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const start = now();
  let pending = [...probes];
  let polls = 0;
  for (;;) {
    polls++;
    const budgetMs = Math.max(1_000, timeoutMs - (now() - start));
    const results = await Promise.all(pending.map((q) => searchDemo(base, q, scope, deps, Math.min(10_000, budgetMs))));
    const errors = uniqueErrors(results);
    pending = pending.filter((_, i) => results[i].hits === 0);
    const waitedMs = now() - start;
    if (pending.length === 0) return { ready: true, polls, waitedMs, pending, errors };
    if (waitedMs + intervalMs > timeoutMs) return { ready: false, polls, waitedMs, pending, errors };
    await sleep(intervalMs);
  }
}

export async function readDemoStatus(base: string, deps: DemoHttpDeps = {}): Promise<DemoStatusRead> {
  const doFetch = deps.fetch ?? fetch;
  const url = `${base}/agentmemory/status`;
  try {
    const res = await doFetch(url, {
      headers: { Accept: "application/json", ...(deps.headers?.(url) ?? {}) },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return { error: "the status response was not JSON" };
    return { status: body as DemoStatusSnapshot };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export function explainZeroHits(input: {
  emptyQueries: string[];
  seeded: number;
  expected: number;
  wait: DemoWaitResult;
  searchErrors: string[];
  status: DemoStatusRead;
  invocation: string;
}): string[] {
  const reasons: string[] = [];
  if (input.searchErrors.length > 0) {
    reasons.push(
      `The search request failed (${input.searchErrors.join("; ")}), so the demo could not check the search index.`,
    );
  }
  if (input.seeded < input.expected) {
    reasons.push(
      input.seeded === 0
        ? "The server accepted none of the demo observations."
        : `The server accepted only ${input.seeded} of ${input.expected} demo observations.`,
    );
  }
  if (!input.wait.ready) {
    reasons.push(
      `The demo observations were still not searchable after ${Math.round(input.wait.waitedMs / 1000)} s.`,
    );
  }
  if ("error" in input.status) {
    reasons.push(`The server status could not be read (${input.status.error}), so the worker may not be fully started.`);
  } else {
    const s = input.status.status;
    const connection = s.health?.connectionState;
    if (connection && connection !== "connected") {
      reasons.push(`The worker is not ready: its connection to iii-engine is "${connection}".`);
    }
    const inbox = s.capture?.inbox;
    const waiting = (inbox?.pending ?? 0) + (inbox?.retrying ?? 0);
    if (waiting > 0) {
      reasons.push(`${plural(waiting, "observation")} accepted by the server ${waiting === 1 ? "is" : "are"} still waiting to be stored.`);
    }
    if ((inbox?.dead ?? 0) > 0) {
      const dead = inbox?.dead ?? 0;
      reasons.push(
        `${plural(dead, "observation")} could not be stored${inbox?.lastError ? `: ${inbox.lastError}` : "."}`,
      );
    }
    if (s.index?.keywordRebuildRunning) {
      reasons.push("The keyword index is being rebuilt, so new observations are not searchable yet.");
    } else if (s.index?.bm25Incomplete) {
      reasons.push("The keyword index is incomplete, so some stored observations cannot be found.");
    }
    const missing = s.index?.missingObservations ?? 0;
    if (missing > 0) {
      reasons.push(`${plural(missing, "stored observation")} ${missing === 1 ? "is" : "are"} not in the search index.`);
    }
    if (s.provider?.embeddings === "none") {
      reasons.push(
        "No embedding provider is set, so search finds keyword matches only. Set EMBEDDING_PROVIDER=local for on-device semantic recall.",
      );
    }
  }
  if (reasons.length === 0) {
    reasons.push("The server reported no capture or index problem. The demo observations may still be indexing.");
  }
  const quoted = input.emptyQueries.map((q) => `"${q}"`).join(", ");
  const pendingProbes = input.wait.pending.map((q) => `"${q}"`).join(", ");
  const header = input.emptyQueries.length > 0
    ? `No results for ${quoted}. Why:`
    : `The demo observations for ${pendingProbes} were not searchable in time. Why:`;
  return [
    header,
    ...reasons.map((r) => `  - ${r}`),
    `Next: run ${input.invocation} status for details, or ${input.invocation} doctor to find and fix the cause.`,
  ];
}
