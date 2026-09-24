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

describe("viewer dashboard reliability", () => {
  it("observations never reload the dashboard; pushed session and memory events update it in place", () => {
    const router = extractFunction("routeWsMessage");
    expect(router).not.toMatch(/loadDashboard\(\)|scheduleDashboardReload\(\)/);
    const live = extractFunction("handleLiveEvent");
    expect(live).not.toMatch(/loadDashboard\(\)/);
    expect(live).toMatch(/type === 'session\.updated'/);
    expect(live).toMatch(/type === 'session\.activity'/);
    expect(live).toMatch(/type === 'session\.deleted'/);
    expect(live).toMatch(/type === 'memory\.updated' \|\| type === 'memory\.deleted'/);
    expect(live).toMatch(/scheduleLiveRender\(\);\s*\}$/);
    expect(viewer).toMatch(/var LIVE_RENDER_THROTTLE_MS = 250;/);
    expect(extractFunction("handleStreamEvent")).toMatch(
      /evt\.type === 'event' && evt\.event && evt\.event\.type\) \{\s*handleLiveEvent\(evt\.event\.type, evt\.event\.data \|\| \{\}\);/,
    );
  });

  it("no timer re-fetches the dashboard and no refresh path blanks a loaded view", () => {
    expect(viewer).not.toMatch(/startDashboardAutoRefresh|dashboardTimer|Auto-refresh 30s/);
    expect(extractFunction("refreshDashboard")).not.toMatch(/loaded = false/);
    expect(extractFunction("startPolling")).not.toMatch(/loaded = false/);
    expect(extractFunction("endSession")).not.toMatch(/loaded = false/);
    expect(extractFunction("confirmDeleteMemory")).not.toMatch(/loaded = false/);
  });

  it("session events upsert, patch and remove sessions by id", () => {
    const deps = ["sessionKey", "upsertSessionIn", "removeSessionFrom", "patchSessionCount"]
      .map(extractFunction)
      .join("\n");
    const api = new Function(`${deps}\nreturn { upsertSessionIn, removeSessionFrom, patchSessionCount };`)() as {
      upsertSessionIn: (l: Array<Record<string, unknown>>, s: Record<string, unknown>) => Array<Record<string, unknown>>;
      removeSessionFrom: (l: Array<Record<string, unknown>>, k: string) => Array<Record<string, unknown>>;
      patchSessionCount: (l: Array<Record<string, unknown>>, k: string, c: number) => void;
    };
    const list: Array<Record<string, unknown>> = [{ id: "a", status: "active", observationCount: 1 }];
    api.upsertSessionIn(list, { id: "a", status: "completed" });
    expect(list).toEqual([{ id: "a", status: "completed", observationCount: 1 }]);
    api.upsertSessionIn(list, { id: "b", status: "active" });
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    api.patchSessionCount(list, "a", 7);
    expect(list[1].observationCount).toBe(7);
    expect(api.removeSessionFrom(list, "b").map((s) => s.id)).toEqual(["a"]);
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

  it("connects with the join mode first and flips mode after two failures of either", () => {
    expect(viewer).toMatch(/var directFailed = true;/);
    expect(viewer).toMatch(/if \(directFailures >= DIRECT_FAILURE_THRESHOLD\) \{\s*directFailed = ws\.__direct;/);
  });

  it("loadDashboard never runs twice at once and replays a request that arrived mid-flight", () => {
    const loader = extractFunction("loadDashboard");
    expect(loader).toMatch(/if \(dashboardLoading\) \{\s*dashboardReloadPending = true;\s*return;/);
    expect(loader).toMatch(/finally \{\s*dashboardLoading = false;/);
  });

  it("a failed refresh keeps the last data instead of showing the new-install hero", () => {
    const loader = extractFunction("loadDashboard");
    expect(loader).toMatch(/if \(sessionsOk\) d\.sessions = replaySessionEvents\(results\[1\]\.sessions, seqAtStart\);/);
    expect(loader).toMatch(/if \(!sessionsOk && !d\.loaded\)/);
    const listOr = load<(p: unknown[], r: unknown, k: string, f?: string) => unknown[]>("listOr");
    expect(listOr([1, 2], null, "items")).toEqual([1, 2]);
    expect(listOr([1, 2], { items: [3] }, "items")).toEqual([3]);
    expect(listOr([1], { other: [4] }, "items", "other")).toEqual([4]);
    expect(listOr([1], {}, "items")).toEqual([]);
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

  it("session summaries stored as objects render as text (#1229)", () => {
    const summaryText = load<(v: unknown) => string>("summaryText");
    expect(summaryText({ title: "Fix auth", narrative: "long" })).toBe("Fix auth");
    expect(summaryText({ narrative: "Only narrative" })).toBe("Only narrative");
    expect(summaryText({ keyDecisions: ["a", "b"] })).toBe("a; b");
    expect(summaryText("plain")).toBe("plain");
    expect(summaryText(undefined)).toBe("");
    expect(viewer).not.toMatch(/s\.firstPrompt \|\| s\.summary \|\|/);
  });

  it("tags stored as a CSV string no longer break a tab (#906)", () => {
    const asTags = load<(v: unknown) => string[]>("asTags");
    expect(asTags("analysis, run,streamed")).toEqual(["analysis", "run", "streamed"]);
    expect(asTags(["feat", "prompts"])).toEqual(["feat", "prompts"]);
    expect(asTags(undefined)).toEqual([]);
    expect(viewer).not.toMatch(/\(a\.tags \|\| \[\]\)/);
    expect(viewer).not.toMatch(/\(l\.tags \|\| \[\]\)/);
  });

  it("live buffers are capped so a large sync backlog cannot freeze the tab (#609)", () => {
    expect(viewer).toMatch(/var LIVE_BUFFER_MAX = 200;/);
    expect(extractFunction("handleStreamEvent")).toMatch(/evt\.data\.slice\(-LIVE_BUFFER_MAX\)/);
    expect(extractFunction("routeWsMessage")).toMatch(/observations\.length > LIVE_BUFFER_MAX/);
  });

  it("Rebuild Graph asks first, ignores repeat clicks, and reports the result (#1383)", () => {
    const rebuild = extractFunction("rebuildGraph");
    expect(rebuild).toMatch(/if \(graphRebuilding\) return;/);
    expect(rebuild).toMatch(/window\.confirm\(/);
    expect(rebuild).toMatch(/result && result\.success/);
    expect(rebuild).toMatch(/finally \{\s*graphRebuilding = false;/);
  });

  it("a session list fetched while live events arrive replays them so deletes and updates stick", () => {
    const deps = ["sessionKey", "upsertSessionIn", "removeSessionFrom", "patchSessionCount", "applySessionEvent", "replaySessionEvents"]
      .map(extractFunction)
      .join("\n");
    const replay = new Function(
      "liveSessionLog",
      `${deps}\nreturn replaySessionEvents;`,
    )([
      { seq: 1, type: "session.deleted", data: { sessionId: "old" } },
      { seq: 2, type: "session.deleted", data: { sessionId: "a" } },
      { seq: 3, type: "session.updated", data: { session: { id: "c", status: "active" } } },
      { seq: 4, type: "session.activity", data: { sessionId: "b", observationCount: 9 } },
    ]) as (l: Array<Record<string, unknown>>, since: number) => Array<Record<string, unknown>>;
    const fetched = [
      { id: "a", observationCount: 1 },
      { id: "b", observationCount: 2 },
      { id: "old", observationCount: 0 },
    ];
    expect(replay(fetched, 1)).toEqual([
      { id: "c", status: "active" },
      { id: "b", observationCount: 9 },
      { id: "old", observationCount: 0 },
    ]);
    expect(extractFunction("loadSessions")).toMatch(/replaySessionEvents\(result\.sessions, seqAtStart\)/);
  });

  it("count updates rerender the session list without refetching or blanking the open detail", () => {
    const render = extractFunction("renderSessions");
    expect(render).toMatch(/cached\.id === state\.sessions\.selectedId && !state\.sessions\.detailStale/);
    const detail = extractFunction("renderSessionDetail");
    expect(detail).toMatch(/if \(!cached \|\| cached\.id !== id\) \{\s*panel\.innerHTML = '<div class="detail-panel"><h3>Loading/);
    expect(detail).toMatch(/if \(request !== sessionDetailRequest \|\| state\.sessions\.selectedId !== id\) return;/);
    expect(extractFunction("handleLiveEvent")).toMatch(
      /if \(type !== 'session\.activity' && touched === state\.sessions\.selectedId\) \{\s*state\.sessions\.detailStale = true;/,
    );
  });

  it("memory events coalesce list reloads and only the newest count response wins", () => {
    const reload = extractFunction("scheduleMemoriesReload");
    expect(reload).toMatch(/if \(memoriesReloading\) \{\s*memoriesReloadPending = true;\s*return;/);
    expect(reload).toMatch(/finally \{\s*memoriesReloading = false;/);
    expect(extractFunction("handleLiveEvent")).not.toMatch(/loadMemories\(\)/);
    expect(extractFunction("refreshMemoryCount")).toMatch(
      /var request = \+\+memoryCountRequest;[\s\S]*if \(request !== memoryCountRequest\) return;/,
    );
  });

  it("a reconnect resyncs loaded views, and only a delivered message clears the failure count", () => {
    expect(viewer).toMatch(/if \(wsHasConnected\) resyncLiveViews\(\);\s*wsHasConnected = true;/);
    const resync = extractFunction("resyncLiveViews");
    expect(resync).toMatch(/if \(state\.dashboard\.loaded\) loadDashboard\(\);/);
    expect(resync).toMatch(/if \(state\.sessions\.loaded\) loadSessions\(\);/);
    expect(viewer).toMatch(/if \(!ws\.__usable\) \{\s*ws\.__usable = true;\s*directFailures = 0;/);
    const onopen = viewer.slice(viewer.indexOf("ws.onopen = function"), viewer.indexOf("ws.onmessage = function"));
    expect(onopen).toMatch(/wsRetries = 0;/);
    expect(onopen).not.toMatch(/directFailures = 0;/);
  });

  it("returning to the tab reconnects a dropped live stream (#1370)", () => {
    expect(viewer).toMatch(/addEventListener\('visibilitychange'/);
    expect(viewer).toMatch(/visibilityState !== 'visible'[\s\S]{0,400}connectWs\(\);/);
  });
});
