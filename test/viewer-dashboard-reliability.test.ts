import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const viewer = readFileSync("src/viewer/index.html", "utf-8");

function extractFunction(name: string): string {
  const start = viewer.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in viewer`);
  let depth = 0;
  for (let i = viewer.indexOf("{", start); i < viewer.length; i++) {
    if (viewer[i] === "{") depth++;
    if (viewer[i] === "}") {
      depth--;
      if (depth === 0) return viewer.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} is not balanced`);
}

function load<T>(name: string): T {
  return new Function(`${extractFunction(name)}\nreturn ${name};`)() as T;
}

function callbackBodies(marker: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = viewer.indexOf(marker, from);
    if (at < 0) return bodies;
    const open = viewer.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < viewer.length; i++) {
      if (viewer[i] === "{") depth++;
      if (viewer[i] === "}") {
        depth--;
        if (depth === 0) {
          bodies.push(viewer.slice(at, i + 1));
          break;
        }
      }
    }
    from = at + marker.length;
  }
}

type Store = {
  entities: Record<string, Record<string, Record<string, unknown>>>;
  counts?: unknown;
  status?: string;
  health?: unknown;
  circuitBreaker?: unknown;
  functionMetrics?: unknown[];
  indexes?: unknown;
  lastHealthAt?: number;
  graph?: unknown;
  consolidation?: unknown;
};

function reducer() {
  const deps = ["sessionKey", "applyEntityEvent", "reduceLiveEvent"].map(extractFunction).join("\n");
  return new Function(
    `var ROW_EVENT_KINDS = ['lesson', 'action', 'crystal', 'semantic', 'procedural', 'audit'];\n${deps}\nreturn reduceLiveEvent;`,
  )() as (s: Store, type: string, data: Record<string, unknown>) => Record<string, unknown> | null;
}

function emptyStore(): Store {
  return {
    entities: { memory: {}, session: {}, lesson: {}, action: {}, crystal: {}, semantic: {}, procedural: {}, audit: {} },
  };
}

describe("viewer streams instead of polling", () => {
  it("has no polling or refetch loops left", () => {
    for (const name of [
      "startPolling",
      "POLL_INTERVAL_MS",
      "scheduleStaleRetry",
      "STALE_RETRY_MS",
      "scheduleDashboardReload",
      "refreshMemoryCount",
      "scheduleMemoriesReload",
      "TAB_FRESH_MS",
      "tabFetchedAt",
    ]) {
      expect(viewer, name).not.toContain(name);
    }
  });

  it("no interval timer touches the network", () => {
    const intervals = callbackBodies("setInterval(function");
    expect(intervals.length).toBeGreaterThan(0);
    for (const body of intervals) {
      expect(body).not.toMatch(/\bapi(Get|Post|Delete)?\(|\bfetch\(|\bload[A-Z]\w*\(|ensure\w+\(/);
    }
  });

  it("the ambient background renders on animation frames and pauses while the tab is hidden", () => {
    const dither = viewer.slice(viewer.indexOf("(function ditherField()"));
    expect(dither).toMatch(/requestAnimationFrame\(frame\)/);
    expect(dither).toMatch(/if \(document\.hidden\) return;/);
    expect(dither).not.toMatch(/setInterval/);
  });

  it("fetches the snapshot once per connection and replays events that arrived during a list load", () => {
    const resync = extractFunction("resyncAfterConnect");
    expect(resync).toMatch(/await loadSnapshot\(\);/);
    expect(resync).toMatch(/reloadKinds\.forEach\(function\(k\) \{ store\.loaded\[k\] = false; \}\);/);
    expect(extractFunction("loadSnapshot")).toMatch(/apiGet\('viewer\/snapshot'\)/);
    const ensure = extractFunction("ensureLoaded");
    expect(ensure).toMatch(/var seqAtStart = eventSeq;/);
    expect(ensure).toMatch(/replayEventsSince\(seqAtStart, kind\);/);
    expect(viewer).toMatch(/ws\.onopen = function\(\) \{[\s\S]{0,700}resyncAfterConnect\(firstConnect\);/);
  });

  it("reconnects with capped exponential backoff and never falls back to polling", () => {
    const delay = load<(n: number) => number>("reconnectDelay");
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(delay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(extractFunction("scheduleReconnect")).toMatch(/wsReconnectTimer = setTimeout\(connectWs, delay\);/);
    expect(viewer).toMatch(/var directFailed = true;/);
    expect(viewer).toMatch(/if \(directFailures >= DIRECT_FAILURE_THRESHOLD\) \{\s*directFailed = ws\.__direct;/);
    expect(viewer).toMatch(/addEventListener\('visibilitychange'[\s\S]{0,300}reconnectNow\(\);/);
  });

  it("shows an explicit reconnecting and offline state and marks data stale", () => {
    const render = extractFunction("renderConnection");
    expect(render).toMatch(/'reconnecting'/);
    expect(render).toMatch(/'offline'/);
    expect(render).toMatch(/Showing data as of/);
    expect(extractFunction("setConnection")).toMatch(/classList\.toggle\('is-stale'/);
  });
});

describe("viewer live event reducer", () => {
  it("upserts, updates and removes memories from the full row in the event", () => {
    const reduce = reducer();
    const s = emptyStore();
    reduce(s, "memory.created", { memoryId: "mem_1", memory: { id: "mem_1", title: "a", isLatest: true } });
    expect(s.entities.memory.mem_1).toEqual({ id: "mem_1", title: "a", isLatest: true });
    reduce(s, "memory.updated", { memoryId: "mem_1", memory: { id: "mem_1", isLatest: false } });
    expect(s.entities.memory.mem_1.isLatest).toBe(false);
    expect(s.entities.memory.mem_1.title).toBe("a");
    const change = reduce(s, "memory.deleted", { memoryId: "mem_1" });
    expect(s.entities.memory.mem_1).toBeUndefined();
    expect(change).toMatchObject({ kind: "memory", action: "deleted", id: "mem_1" });
  });

  it("treats a soft-deleted lesson as removed and patches other row kinds by id", () => {
    const reduce = reducer();
    const s = emptyStore();
    reduce(s, "lesson.created", { id: "lsn_1", lesson: { id: "lsn_1", content: "x" } });
    reduce(s, "lesson.updated", { id: "lsn_1", lesson: { id: "lsn_1", content: "x", deleted: true } });
    expect(s.entities.lesson.lsn_1).toBeUndefined();
    reduce(s, "action.created", { id: "act_1", action: { id: "act_1", status: "pending" } });
    reduce(s, "action.updated", { id: "act_1", action: { id: "act_1", status: "done" } });
    expect(s.entities.action.act_1.status).toBe("done");
    reduce(s, "audit.created", { id: "aud_1", audit: { id: "aud_1", operation: "remember" } });
    expect(Object.keys(s.entities.audit)).toEqual(["aud_1"]);
  });

  it("applies session updates, activity counts and deletes", () => {
    const reduce = reducer();
    const s = emptyStore();
    reduce(s, "session.updated", { session: { id: "a", status: "active", observationCount: 1 } });
    reduce(s, "session.activity", { sessionId: "a", observationCount: 9 });
    expect(s.entities.session.a.observationCount).toBe(9);
    reduce(s, "session.activity", { sessionId: "missing", observationCount: 3 });
    expect(s.entities.session.missing).toBeUndefined();
    reduce(s, "session.deleted", { sessionId: "a" });
    expect(s.entities.session.a).toBeUndefined();
  });

  it("takes counts, health and graph stats straight from the events", () => {
    const reduce = reducer();
    const s = emptyStore();
    reduce(s, "counts.changed", { counts: { memories: 4 } });
    expect(s.counts).toEqual({ memories: 4 });
    reduce(s, "health", { status: "degraded", health: { status: "degraded" }, circuitBreaker: { state: "open" }, functionMetrics: [{ functionId: "f" }], counts: { memories: 5 }, indexes: { bm25Documents: 2 } });
    expect(s.status).toBe("degraded");
    expect(s.counts).toEqual({ memories: 5 });
    expect(s.lastHealthAt).toBeGreaterThan(0);
    const g = reduce(s, "graph.changed", { source: "snapshot", stats: { totalNodes: 3 }, updatedAt: "t" });
    expect(g).toMatchObject({ kind: "graph", source: "snapshot" });
    expect(s.graph).toEqual({ stats: { totalNodes: 3 }, updatedAt: "t", resetAt: null });
    expect(reduce(s, "unknown.thing", {})).toBeNull();
  });
});

describe("viewer navigation and shared components", () => {
  it("parses deep links into a tab and an entity id", () => {
    const deps = ["normalizeTab", "decodePart", "parseRoute"].map(extractFunction).join("\n");
    const parse = new Function(
      `var TAB_IDS = ${viewer.match(/var TAB_IDS = (\[[^\]]*\]);/)?.[1]};\nvar TAB_ALIASES = ${viewer.match(/var TAB_ALIASES = (\{[^}]*\});/)?.[1]};\n${deps}\nreturn parseRoute;`,
    )() as (h: string) => { tab: string; id: string; obs: string; redirect: boolean };
    expect(parse("#memories/mem_abc")).toMatchObject({ tab: "memories", id: "mem_abc", obs: "", redirect: false });
    expect(parse("#sessions/ses%2Fone")).toMatchObject({ tab: "sessions", id: "ses/one" });
    expect(parse("#health")).toMatchObject({ tab: "health", id: "" });
    expect(parse("#nope/x")).toMatchObject({ tab: "dashboard", id: "x" });
    expect(parse("#sessions/ses_1?obs=obs%3A9")).toMatchObject({ tab: "sessions", id: "ses_1", obs: "obs:9" });
    expect(parse("#timeline/ses_1")).toMatchObject({ tab: "sessions", id: "ses_1", redirect: true });
  });

  it("every help tooltip used on a page has a glossary entry", () => {
    const glossaryBlock = viewer.slice(viewer.indexOf("var GLOSSARY = {"), viewer.indexOf("var state = {"));
    const keys = new Set([...glossaryBlock.matchAll(/^\s{6}(\w+): \{ term:/gm)].map((m) => m[1]));
    expect(keys.size).toBeGreaterThan(40);
    const used = new Set([...viewer.matchAll(/help\('(\w+)'\)/g)].map((m) => m[1]));
    for (const key of used) expect(keys.has(key), key).toBe(true);
  });

  it("empty states explain what, why and how, with commands aimed at the live origin", () => {
    const empty = extractFunction("emptyState");
    expect(empty).toMatch(/What this is/);
    expect(empty).toMatch(/Why it is empty/);
    expect(empty).toMatch(/How to fill it/);
    expect(extractFunction("apiBase")).toMatch(/return REST \+ '\/agentmemory';/);
    expect(viewer).not.toMatch(/localhost:3111/);
  });

  it("offers keyboard shortcuts for search, help and jumping between pages", () => {
    expect(viewer).toMatch(/if \(e\.key === '\/'\) \{\s*if \(focusPageSearch\(\)\) e\.preventDefault\(\);/);
    expect(viewer).toMatch(/if \(e\.key === '\?'\) \{\s*e\.preventDefault\(\);\s*openHelpOverlay\(\);/);
    expect(viewer).toMatch(/var jump = TAB_SHORTCUTS\[e\.key\.toLowerCase\(\)\];/);
    expect(viewer).toMatch(/role="tablist"/);
  });

  it("re-rendering identical HTML leaves the DOM alone, but a placeholder in between forces a render", () => {
    const setViewHtml = load<(el: Record<string, unknown>, html: string) => void>("setViewHtml");
    let writes = 0;
    const el: Record<string, unknown> & { firstElementChild?: object } = {};
    Object.defineProperty(el, "innerHTML", {
      set() {
        writes++;
        el.firstElementChild = {};
      },
    });
    setViewHtml(el, "<div>a</div>");
    setViewHtml(el, "<div>a</div>");
    expect(writes).toBe(1);
    setViewHtml(el, "<div>b</div>");
    expect(writes).toBe(2);
    el.firstElementChild = {};
    setViewHtml(el, "<div>b</div>");
    expect(writes).toBe(3);
  });

  it("token savings only counts sessions that produced observations", () => {
    const estimate = load<(s: Array<{ observationCount?: number }>, b: number) => { percent: number; saved: number }>(
      "estimateTokenSavings",
    );
    const busy = { observationCount: 100 };
    const empties = Array.from({ length: 50 }, () => ({ observationCount: 0 }));
    expect(estimate([busy, ...empties], 2000)).toEqual({ percent: 75, saved: 6000 });
    expect(estimate([{ observationCount: 10 }], 2000)).toEqual({ percent: 0, saved: 0 });
    expect(estimate([], 2000)).toEqual({ percent: 0, saved: 0 });
  });

  it("session summaries stored as objects render as text", () => {
    const summaryText = load<(v: unknown) => string>("summaryText");
    expect(summaryText({ title: "Fix auth", narrative: "long" })).toBe("Fix auth");
    expect(summaryText({ narrative: "Only narrative" })).toBe("Only narrative");
    expect(summaryText({ keyDecisions: ["a", "b"] })).toBe("a; b");
    expect(summaryText("plain")).toBe("plain");
    expect(summaryText(undefined)).toBe("");
    expect(viewer).not.toMatch(/s\.firstPrompt \|\| s\.summary \|\|/);
  });

  it("tags stored as a CSV string no longer break a tab", () => {
    const asTags = load<(v: unknown) => string[]>("asTags");
    expect(asTags("analysis, run,streamed")).toEqual(["analysis", "run", "streamed"]);
    expect(asTags(["feat", "prompts"])).toEqual(["feat", "prompts"]);
    expect(asTags(undefined)).toEqual([]);
    expect(viewer).not.toMatch(/\(a\.tags \|\| \[\]\)/);
    expect(viewer).not.toMatch(/\(l\.tags \|\| \[\]\)/);
  });

  it("live buffers are capped so a large sync backlog cannot freeze the tab", () => {
    expect(viewer).toMatch(/var LIVE_BUFFER_MAX = 200;/);
    expect(extractFunction("handleStreamEvent")).toMatch(/evt\.data\.slice\(-LIVE_BUFFER_MAX\)/);
    expect(extractFunction("routeWsMessage")).toMatch(/observations\.length > LIVE_BUFFER_MAX/);
  });

  it("Rebuild Graph asks first, ignores repeat clicks, and reports the result", () => {
    const rebuild = extractFunction("rebuildGraph");
    expect(rebuild).toMatch(/if \(graphRebuilding\) return;/);
    expect(rebuild).toMatch(/window\.confirm\(/);
    expect(rebuild).toMatch(/result && result\.success/);
    expect(rebuild).toMatch(/finally \{\s*graphRebuilding = false;/);
    expect(rebuild).toMatch(/New ones arrive on the live stream\./);
    expect(rebuild).not.toMatch(/loadGraph\(/);
  });

  it("the graph never builds itself: loading only reads, a rebuild is always a user click", () => {
    const loader = extractFunction("loadGraph");
    expect(loader).not.toMatch(/graph\/build/);
    expect(loader).toMatch(/apiPost\('graph\/query', \{ limit: GRAPH_LIMIT \}\)/);
  });

  it("graph.changed patches the loaded graph from the event payload and refetches only when it must", () => {
    const handler = extractFunction("handleGraphChange");
    expect(handler).toMatch(/if \(data\.delta && applyGraphDelta\(data\.delta\)\)/);
    expect(handler).toMatch(/if \(data\.source === 'items' && !data\.coveredBySnapshot\) scheduleGraphReload\(\);/);
    const reload = extractFunction("scheduleGraphReload");
    expect(reload).toMatch(/clearTimeout\(graphReloadTimer\)/);
    expect(reload).toMatch(/loadGraph\(\{ quiet: true \}\)/);
  });
});
