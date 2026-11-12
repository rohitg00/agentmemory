import { describe, expect, it, vi } from "vitest";
import {
  DEMO_PROJECT_PREFIX,
  demoProjectForRun,
  explainZeroHits,
  readDemoStatus,
  searchDemo,
  waitForDemoSearchable,
  type DemoWaitResult,
} from "../src/cli/demo-search.js";

const BASE = "http://localhost:3111";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("demo project", () => {
  it("gives each run its own project so earlier demo runs cannot fill the result limit", () => {
    const first = demoProjectForRun(1_000, () => 0.25);
    const second = demoProjectForRun(1_000, () => 0.75);
    const later = demoProjectForRun(2_000, () => 0.25);
    expect(first.startsWith(`${DEMO_PROJECT_PREFIX}-`)).toBe(true);
    expect(new Set([first, second, later]).size).toBe(3);
  });
});

describe("demo search readiness", () => {
  it("returns ready once every probe has hits after a few polls", async () => {
    let searchCalls = 0;
    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      searchCalls++;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      const ready = searchCalls > 4;
      return json({ results: ready ? [{ title: `hit for ${body.query}` }] : [] });
    });
    const c = clock();
    const wait = await waitForDemoSearchable(
      BASE,
      { project: "/tmp/agentmemory-demo" },
      ["jwt middleware", "prisma"],
      { fetch: fetchMock as unknown as typeof fetch, headers: () => ({ Authorization: "Bearer t" }), ...c },
      { timeoutMs: 18_000, intervalMs: 500 },
    );
    expect(wait.ready).toBe(true);
    expect(wait.pending).toEqual([]);
    expect(wait.polls).toBe(3);
    expect(wait.waitedMs).toBe(1_000);
    expect(bodies.every((b) => b.project === "/tmp/agentmemory-demo")).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("stops polling a probe once it has hits", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      seen.push(body.query);
      const hit = body.query === "prisma" || seen.filter((q) => q === "rate limiting").length > 2;
      return json({ results: hit ? [{ title: "x" }] : [] });
    });
    const c = clock();
    const wait = await waitForDemoSearchable(BASE, { project: "p" }, ["prisma", "rate limiting"], {
      fetch: fetchMock as unknown as typeof fetch,
      ...c,
    });
    expect(wait.ready).toBe(true);
    expect(seen.filter((q) => q === "prisma")).toHaveLength(1);
    expect(seen.filter((q) => q === "rate limiting")).toHaveLength(3);
  });

  it("gives up after the total timeout and reports the probes still empty", async () => {
    const fetchMock = vi.fn(async () => json({ results: [] }));
    const c = clock();
    const wait = await waitForDemoSearchable(
      BASE,
      { project: "p" },
      ["jwt middleware"],
      { fetch: fetchMock as unknown as typeof fetch, ...c },
      { timeoutMs: 18_000, intervalMs: 500 },
    );
    expect(wait.ready).toBe(false);
    expect(wait.pending).toEqual(["jwt middleware"]);
    expect(wait.waitedMs).toBeLessThanOrEqual(18_000);
    expect(wait.polls).toBe(37);
  });

  it("reports a failed search request as zero hits with the error", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    });
    const result = await searchDemo(BASE, "rate limiting", {}, { fetch: fetchMock as unknown as typeof fetch });
    expect(result).toEqual({ query: "rate limiting", hits: 0, topTitle: "(no results)", error: "ECONNREFUSED" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ query: "rate limiting", limit: 5 });
  });

  it("reports an HTTP error from the search endpoint", async () => {
    const fetchMock = vi.fn(async () => json({ error: "boom" }, 500));
    const result = await searchDemo(BASE, "prisma", { project: "p" }, { fetch: fetchMock as unknown as typeof fetch });
    expect(result.error).toBe("HTTP 500");
    const c = clock();
    const wait = await waitForDemoSearchable(BASE, { project: "p" }, ["prisma"], {
      fetch: fetchMock as unknown as typeof fetch,
      ...c,
    }, { timeoutMs: 1_000, intervalMs: 500 });
    expect(wait.ready).toBe(false);
    expect(wait.errors).toEqual(["HTTP 500"]);
  });

  it("counts only hits from the current demo sessions", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let calls = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const results = [{ title: "old run", sessionId: "demo_old" }];
      if (calls > 2) results.push({ title: "this run", sessionId: "demo_new" });
      return json({ results });
    });
    const c = clock();
    const scope = { project: "p", sessionIds: ["demo_new"] };
    const wait = await waitForDemoSearchable(BASE, scope, ["prisma"], { fetch: fetchMock as unknown as typeof fetch, ...c });
    expect(wait.ready).toBe(true);
    expect(wait.polls).toBe(3);
    expect(bodies[0]).toEqual({ query: "prisma", limit: 20, project: "p" });
    const result = await searchDemo(BASE, "prisma", scope, { fetch: fetchMock as unknown as typeof fetch });
    expect(result).toEqual({ query: "prisma", hits: 1, topTitle: "this run" });
  });
});

describe("demo zero-hit diagnosis", () => {
  const timedOut: DemoWaitResult = {
    ready: false,
    polls: 36,
    waitedMs: 17_600,
    pending: ["jwt middleware"],
    errors: [],
  };

  it("prints the reasons from server status after the wait times out", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/agentmemory/status")) {
        return json({
          health: { connectionState: "reconnecting" },
          provider: { embeddings: "none" },
          index: { missingObservations: 4, bm25Incomplete: false, keywordRebuildRunning: true },
          capture: { inbox: { pending: 2, retrying: 1, dead: 0, lastError: null } },
        });
      }
      return json({ results: [] });
    });
    const status = await readDemoStatus(BASE, { fetch: fetchMock as unknown as typeof fetch });
    const lines = explainZeroHits({
      emptyQueries: ["jwt auth middleware", "rate limiting"],
      seeded: 6,
      expected: 6,
      wait: timedOut,
      searchErrors: [],
      status,
      invocation: "agentmemory",
    });
    const text = lines.join("\n");
    expect(lines[0]).toBe('No results for "jwt auth middleware", "rate limiting". Why:');
    expect(text).toContain("still not searchable after 18 s");
    expect(text).toContain('connection to iii-engine is "reconnecting"');
    expect(text).toContain("3 observations accepted by the server are still waiting to be stored");
    expect(text).toContain("keyword index is being rebuilt");
    expect(text).toContain("4 stored observations are not in the search index");
    expect(text).toContain("No embedding provider is set");
    expect(lines[lines.length - 1]).toBe(
      "Next: run agentmemory status for details, or agentmemory doctor to find and fix the cause.",
    );
  });

  it("says the status could not be read when the status endpoint fails", async () => {
    const fetchMock = vi.fn(async () => json({ error: "unauthorized" }, 401));
    const status = await readDemoStatus(BASE, { fetch: fetchMock as unknown as typeof fetch });
    expect(status).toEqual({ error: "HTTP 401" });
    const lines = explainZeroHits({
      emptyQueries: ["rate limiting"],
      seeded: 0,
      expected: 6,
      wait: timedOut,
      searchErrors: [],
      status,
      invocation: "npx @agentmemory/agentmemory",
    });
    const text = lines.join("\n");
    expect(text).toContain("The server accepted none of the demo observations.");
    expect(text).toContain("server status could not be read (HTTP 401)");
    expect(text).toContain("npx @agentmemory/agentmemory doctor");
  });

  it("reports an incomplete keyword index and dead letters", () => {
    const lines = explainZeroHits({
      emptyQueries: ["rate limiting"],
      seeded: 5,
      expected: 6,
      wait: { ready: true, polls: 1, waitedMs: 0, pending: [], errors: [] },
      searchErrors: [],
      status: {
        status: {
          health: { connectionState: "connected" },
          provider: { embeddings: "local (384 dims)" },
          index: { missingObservations: 0, bm25Incomplete: true },
          capture: { inbox: { pending: 0, retrying: 0, dead: 1, lastError: "disk full" } },
        },
      },
      invocation: "agentmemory",
    });
    const text = lines.join("\n");
    expect(text).toContain("accepted only 5 of 6");
    expect(text).toContain("1 observation could not be stored: disk full");
    expect(text).toContain("keyword index is incomplete");
    expect(text).not.toContain("embedding provider");
    expect(text).not.toContain("not searchable after");
  });

  it("falls back to a plain reason when the server reports nothing wrong", () => {
    const lines = explainZeroHits({
      emptyQueries: ["rate limiting"],
      seeded: 6,
      expected: 6,
      wait: { ready: true, polls: 1, waitedMs: 0, pending: [], errors: [] },
      searchErrors: [],
      status: { status: { health: { connectionState: "connected" }, provider: { embeddings: "local (384 dims)" } } },
      invocation: "agentmemory",
    });
    expect(lines[1]).toContain("reported no capture or index problem");
  });

  it("reports a timed-out readiness check even when the final queries have hits", () => {
    const lines = explainZeroHits({
      emptyQueries: [],
      seeded: 6,
      expected: 6,
      wait: timedOut,
      searchErrors: [],
      status: { status: { health: { connectionState: "connected" }, provider: { embeddings: "local (384 dims)" } } },
      invocation: "agentmemory",
    });
    expect(lines[0]).toBe('The demo observations for "jwt middleware" were not searchable in time. Why:');
    expect(lines.join("\n")).toContain("still not searchable after 18 s");
  });

  it("names a failed search request as a reason", () => {
    const lines = explainZeroHits({
      emptyQueries: ["rate limiting"],
      seeded: 6,
      expected: 6,
      wait: timedOut,
      searchErrors: ["HTTP 500"],
      status: { status: { health: { connectionState: "connected" } } },
      invocation: "agentmemory",
    });
    expect(lines.join("\n")).toContain("The search request failed (HTTP 500)");
  });
});
