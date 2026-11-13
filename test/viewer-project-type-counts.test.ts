import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "../src/types.js";
import { getSearchIndex, setEmbeddingProvider, setVectorIndex } from "../src/functions/search.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { createMemoryApi, facetCounts, memoryFixture, projectMemoryFixture, type FacetCount, type MemoryFacets, type MemoryListResponse } from "./helpers/project-memory-fixture.js";

type Body = MemoryListResponse["body"] & { memory?: Memory };
type Pending = { path: string; promise: Promise<Body | null>; resolve: (body: Body | null) => void };
type MemoryState = {
  projectFilter: string; agentFilter: string; typeFilter: string; search: string;
  facets: MemoryFacets | null; checked: Record<string, boolean>; searchIds: string[] | null;
  fetches: Record<string, string>;
  query: { loading?: boolean; total?: number | null; nextCursor?: string | null } | null;
  [key: string]: unknown;
};
type Viewer = {
  memoryFacetList: (dimension: string) => FacetCount[];
  memoryFilterSelect: (dimension: string, label: string, selected: string) => string;
  memoryListHtml: () => string;
  applyMemoryFilters: () => Promise<void>;
  setMemoryFilter: (dimension: string, value: string) => void;
  runMemorySearch: (query: string) => Promise<void>;
  loadMoreMemories: () => Promise<void>;
  ensureLoaded: (kind: string) => Promise<void>;
  fetchMemoryVersion: (id: string) => Promise<void>;
  openBootGate: () => void;
  handleLiveEvent: (type: string, data: object) => void;
  noteMemoryChange: (before: Memory | null, after: Memory | null, id: string) => void;
};

const html = readFileSync("src/viewer/index.html", "utf8");
let script: ts.SourceFile | undefined;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  const parsed = ts.createSourceFile("viewer.js", match[1]!, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.statements.some((node) => ts.isFunctionDeclaration(node) && node.name?.text === "memoryFacetList")) script = parsed;
}
if (!script) throw new Error("Viewer memory functions were not found");
const source = script;
const declarations = source.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(source)).join("\n");
const bindings = source.statements.filter(ts.isVariableStatement).flatMap((node) => [...node.declarationList.declarations])
  .filter((node) => ts.isIdentifier(node.name) && ["MEMORY_TYPES", "memoryFilterSeq", "memorySearchSeq", "ENTITY_ENDPOINTS", "bootGateOpen", "bootGate", "EVENT_LOG_MAX", "eventLog", "eventSeq", "ROW_EVENT_KINDS", "KIND_TABS"].includes(node.name.text))
  .map((node) => `var ${node.getText(source)};`).join("\n");
const instantiate = new Function("fixture", `
  var state = fixture.state, store = fixture.store, document = fixture.document, REST = fixture.rest;
  ${bindings}
  ${declarations}
  apiGet = fixture.apiGet;
  renderMemories = fixture.render;
  noteSessionProduced = fixture.render;
  feedFromChange = fixture.render;
  markDirty = fixture.render;
  return { memoryFacetList, memoryFilterSelect, memoryListHtml, applyMemoryFilters, setMemoryFilter, runMemorySearch, loadMoreMemories, noteMemoryChange, ensureLoaded, fetchMemoryVersion, openBootGate, handleLiveEvent };
`) as (fixture: object) => Viewer;

const renderMemoryView = new Function("fixture", `
  var state = fixture.state, store = fixture.store, document = fixture.document;
  var captureSearchFocus = function() { return null; };
  var restoreSearchFocus = function() {};
  var memoryToolbarHtml = function() { return ''; };
  var bindMemoryToolbar = function() {};
  var renderMemoryDetailPanel = function() {};
  var setViewHtml = function(el, html) { el.innerHTML = html; };
  var skeleton = function() { return 'initial skeleton'; };
  var memoryListHtml = function() { return 'loaded memory rows'; };
  ${source.statements.filter(ts.isFunctionDeclaration).find((node) => node.name?.text === "renderMemories")!.getText(source)}
  renderMemories();
`) as (fixture: object) => void;

function renderedMemoryCollection(r: Awaited<ReturnType<typeof viewerFixture>>): string {
  const list = { innerHTML: "" }, toolbar = { innerHTML: "" }, detail = { innerHTML: "", firstElementChild: null };
  const layout = { classList: { remove: vi.fn(), toggle: vi.fn() } };
  const view = { querySelector: (selector: string) => selector === "#memory-list" ? list : layout };
  const elements: Record<string, object> = { "view-memories": view, "memory-list": list, "memory-toolbar": toolbar, "memory-detail": detail };
  renderMemoryView({ state: { memories: r.memories }, store: r.store, document: { getElementById: (id: string) => elements[id] } });
  return list.innerHTML;
}

const indexedIds = new Set<string>();
async function viewerFixture(loaded = true, indexed = false, details = false, bootOpen = true) {
  const rows = projectMemoryFixture();
  if (indexed) {
    setVectorIndex(null);
    setEmbeddingProvider(null);
    for (const row of rows) {
      getSearchIndex().add(memoryToObservation(row), "memory");
      indexedIds.add(row.id);
    }
  }
  const api = createMemoryApi(rows);
  let detailGet: ((id: string) => Promise<{ status_code: number; body: Body }>) | undefined;
  if (details) {
    const handlers = new Map<string, (request: unknown) => unknown>();
    const sdk = {
      registerFunction: (id: string | { id: string }, handler: (request: unknown) => unknown) => handlers.set(typeof id === "string" ? id : id.id, handler),
      registerTrigger: vi.fn(), trigger: vi.fn(async () => ({})), on: vi.fn(),
    };
    const kv = { ...api.kv, get: async (scope: string, id: string) => scope === KV.memories ? rows.find((row) => row.id === id) ?? null : null };
    registerApiTriggers(sdk as never, kv as never, "viewer-detail-fixture");
    detailGet = async (id) => await handlers.get("api::memory-by-id")!({
      headers: { authorization: "Bearer viewer-detail-fixture" }, path_params: { id },
    }) as { status_code: number; body: Body };
  }
  const initial = await api.get({ latest: "true", limit: "100", facets: "true" });
  expect(initial.status_code).toBe(200);
  expect(initial.body.total).toBe(136);
  const memories: MemoryState = {
    projectFilter: "", agentFilter: "", typeFilter: "", search: "", searchIds: null,
    facets: loaded ? initial.body.facets! : null, checked: {}, fetches: {}, query: null, nextCursor: loaded ? initial.body.nextCursor || null : null,
  };
  const entities = Object.fromEntries((loaded ? initial.body.memories! : []).map((row) => [row.id, row]));
  const store = { entities: { memory: entities }, loaded: { memory: loaded }, loading: {} };
  const requests: string[] = [], pending: Pending[] = [];
  let deferred = false;
  let lastResponse: Promise<Body | null> | undefined;
  const response = async (path: string): Promise<Body | null> => {
    if (path.startsWith("memories/")) {
      if (!detailGet) throw new Error("Detail API fixture was not enabled");
      const result = await detailGet(decodeURIComponent(path.slice("memories/".length)));
      return result.status_code === 200 ? result.body : null;
    }
    const query = Object.fromEntries(new URL(path, "http://viewer.test/").searchParams);
    const result = await api.get(query);
    return result.status_code === 200 ? result.body : null;
  };
  const viewer = instantiate({
    state: { memories, activeTab: "memories" }, store, rest: "http://viewer.test",
    document: { getElementById: () => null }, render: vi.fn(),
    apiGet: (path: string) => {
      requests.push(path);
      if (!deferred) return lastResponse = response(path);
      let complete!: Pending["resolve"];
      const promise = new Promise<Body | null>((resolve) => { complete = resolve; });
      pending.push({ path, promise, resolve: complete });
      return lastResponse = promise;
    },
  });
  if (bootOpen) viewer.openBootGate();
  return {
    viewer, memories, store, rows, requests, pending, response,
    defer: () => { deferred = true; },
    resume: () => { deferred = false; },
    drain: async () => { await lastResponse; },
    select: async (project: string) => { memories.projectFilter = project; await viewer.applyMemoryFilters(); },
  };
}

function renderedTypes(viewer: Viewer, selected = ""): Record<string, number> {
  const rendered = viewer.memoryFilterSelect("type", "All types", selected);
  return Object.fromEntries([...rendered.matchAll(/<option value="([^"]+)"[^>]*>[^<]* \((\d+)\)<\/option>/g)]
    .map((match) => [match[1]!, Number(match[2]) ]));
}
const positive = (values: Record<string, number>) => Object.fromEntries(Object.entries(values).filter(([, count]) => count > 0));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENT_ID", "x");
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "isolated");
});

describe("search completion during live memory changes", () => {
  it("keeps a successful primary page accepted while the initial loader waits for startup", async () => {
    const r = await viewerFixture(false, false, false, false);
    r.defer();
    const initial = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    expect(r.pending).toEqual([]);
    r.memories.projectFilter = "A";
    const primary = r.viewer.applyMemoryFilters();
    const request = r.pending[0]!;
    request.resolve(structuredClone(await r.response(request.path)));
    await primary;
    expect(r.store.loaded.memory).toBe(true);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 130, bug: 3 });
    const ids = Object.keys(r.store.entities.memory).sort();
    const query = r.memories.query;
    const cursor = query!.nextCursor;
    r.viewer.openBootGate();
    await vi.advanceTimersByTimeAsync(0);
    const lateInitial = r.pending[1];
    if (lateInitial) lateInitial.resolve(structuredClone(await r.response(lateInitial.path)));
    await initial;
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(ids);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 130, bug: 3 });
    expect(r.memories.query).toBe(query);
    expect(r.memories.query!.nextCursor).toBe(cursor);
    expect(r.memories.readChanges).toEqual([]);
    expect(r.store.loading).toEqual({ memory: null });
  });

  it.each(["search", "filter"] as const)("renders a successful %s page after the initial request fails", async (mode) => {
    const r = await viewerFixture(false, true);
    r.defer();
    const initial = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    r.memories.projectFilter = "A";
    const primary = mode === "search" ? r.viewer.runMemorySearch("Memory") : r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(2);
    r.pending[0]!.resolve(null);
    await initial;
    expect(r.store.loaded.memory).toBe(false);
    expect(renderedMemoryCollection(r)).toBe("initial skeleton");
    const pending = r.pending[1]!;
    const response = await r.response(pending.path);
    expect(response!.memories!.length).toBeGreaterThan(0);
    expect(response!.memories!.every((row) => row.project === "A")).toBe(true);
    pending.resolve(response);
    await primary;
    expect(renderedMemoryCollection(r)).toBe("loaded memory rows");
    expect(r.store.loaded.memory).toBe(true);
    expect(r.memories.firstPageLoading).toBe(false);
    expect(r.store.loading).toEqual({ memory: null });
    expect(r.memories.readChanges).toEqual([]);
  });

  it("keeps newer background counts when an older reconnect page completes", async () => {
    const r = await viewerFixture();
    r.defer();
    const row = r.rows.find((item) => r.store.entities.memory[item.id])!;
    const updated = { ...row, title: "Update before reconnect starts", updatedAt: "2026-10-01T00:00:00Z" };
    r.rows[r.rows.findIndex((item) => item.id === row.id)] = updated;
    r.viewer.handleLiveEvent("memory.updated", { memory: updated });
    const revision = r.memories.facetRevision;
    r.store.loaded.memory = false;
    const reload = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const initial = r.pending[0]!;
    const old = structuredClone(await r.response(initial.path));
    r.rows.push(memoryFixture("B-without-later-event", "B", "fact"));
    await vi.advanceTimersByTimeAsync(100);
    expect(r.pending).toHaveLength(2);
    const metadata = r.pending[1]!;
    expect(new URL(metadata.path, "http://viewer.test").searchParams.get("limit")).toBe("1");
    metadata.resolve(structuredClone(await r.response(metadata.path)));
    await vi.advanceTimersByTimeAsync(0);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 133, bug: 3, workflow: 1 });
    expect(r.memories.facetRevision).toBe(revision);
    initial.resolve(old);
    await reload;
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 133, bug: 3, workflow: 1 });
    expect(r.memories.nextCursor).toBe(old!.nextCursor);
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(old!.memories!.map((item) => item.id).sort());
    expect(r.memories.readChanges).toEqual([]);
  });

  it.each(["A", "B"])("finishes project A search while project %s changes during every response", async (project) => {
    const r = await viewerFixture(true, true);
    await r.select("A");
    r.defer();
    const search = r.viewer.runMemorySearch("Memory");
    const resolved = new Set<Pending>();
    let expectedIds: string[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const pending = r.pending.find((request) => !resolved.has(request) && request.path.includes("&q=Memory"));
      if (!pending) break;
      resolved.add(pending);
      const snapshot = await r.response(pending.path);
      expectedIds = snapshot!.memories!.map((row) => row.id);
      const next = memoryFixture(`${project}-continuous-${attempt}`, project, "fact");
      r.rows.push(next);
      r.viewer.handleLiveEvent("memory.created", { memory: next });
      pending.resolve(snapshot);
      await vi.advanceTimersByTimeAsync(0);
      if (r.memories.searching) await vi.advanceTimersByTimeAsync(100);
    }
    await search;
    expect({ searching: r.memories.searching, firstPageLoading: r.memories.firstPageLoading }).toEqual({
      searching: false, firstPageLoading: false,
    });
    expect(expectedIds.length).toBeGreaterThan(0);
    expect(r.memories.searchIds).toEqual(expectedIds);
    expect(r.memories.searchIds!.every((id) => r.store.entities.memory[id]?.project === "A")).toBe(true);
  });

  it("renders an empty completed search after cancelling a pending project filter", async () => {
    const r = await viewerFixture(true, true);
    r.defer();
    r.memories.projectFilter = "A";
    const filter = r.viewer.applyMemoryFilters();
    expect(r.memories.query!.loading).toBe(true);
    const search = r.viewer.runMemorySearch("zzzxqvunfindablezz");
    expect(r.pending).toHaveLength(2);
    const empty = await r.response(r.pending[1]!.path);
    expect(empty!.memories).toEqual([]);
    r.pending[1]!.resolve(empty);
    await search;
    expect(r.viewer.memoryListHtml()).toContain("No memories match");
    expect(r.memories.query).toBeNull();
    expect(r.memories.searchIds).toEqual([]);
    expect(r.memories.searching).toBe(false);
    expect(r.memories.firstPageLoading).toBe(false);
    const rendered = r.viewer.memoryListHtml();
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await filter;
    expect(r.memories.query).toBeNull();
    expect(r.viewer.memoryListHtml()).toBe(rendered);
  });

  it.each(["updated", "deleted"] as const)("preserves a live %s row when search settles after the event log rolls over", async (action) => {
    const r = await viewerFixture(true, true);
    await r.select("A");
    r.defer();
    const search = r.viewer.runMemorySearch("Memory");
    let id = "";
    let updated: Memory | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = r.pending.filter((request) => request.path.includes("&q=Memory"))[attempt]!;
      const snapshot = await r.response(pending.path);
      if (attempt === 0) {
        const next = memoryFixture("B-before-row-control", "B", "fact");
        r.rows.push(next);
        r.viewer.handleLiveEvent("memory.created", { memory: next });
      } else {
        id = snapshot!.memories!.find((row) => row.type === "fact")!.id;
        const index = r.rows.findIndex((row) => row.id === id);
        if (action === "deleted") {
          r.rows.splice(index, 1);
          r.viewer.handleLiveEvent("memory.deleted", { memoryId: id });
        } else {
          updated = { ...r.rows[index]!, title: "New live title must survive the older response", updatedAt: "2026-10-01T00:00:00Z" };
          r.rows[index] = updated;
          r.viewer.handleLiveEvent("memory.updated", { memory: updated });
        }
        for (let index = 0; index < 600; index++) {
          const next = memoryFixture(`B-after-row-control-${index}`, "B", "fact");
          r.rows.push(next);
          r.viewer.handleLiveEvent("memory.created", { memory: next });
        }
      }
      pending.resolve(snapshot);
      await vi.advanceTimersByTimeAsync(0);
    }
    await search;
    expect(r.store.entities.memory[id]).toEqual(updated);
    expect(r.memories.searching).toBe(false);
    expect(r.memories.firstPageLoading).toBe(false);
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.store.entities.memory[id]).toEqual(updated);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: action === "deleted" ? 129 : 130, bug: 3 });
  });

  it("accepts a fresher server row on retry after an earlier live update", async () => {
    const r = await viewerFixture(true, true);
    await r.select("A");
    r.defer();
    const search = r.viewer.runMemorySearch("Memory");
    const first = r.pending[0]!;
    const old = structuredClone(await r.response(first.path));
    const id = old!.memories!.find((row) => row.type === "fact")!.id;
    const index = r.rows.findIndex((row) => row.id === id);
    const live = { ...r.rows[index]!, title: "First live title", updatedAt: "2026-10-01T00:00:00Z" };
    r.rows[index] = live;
    r.viewer.handleLiveEvent("memory.updated", { memory: live });
    first.resolve(old);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.pending).toHaveLength(2);
    const newer = { ...live, title: "Fresher server title before its event", updatedAt: "2026-10-02T00:00:00Z" };
    r.rows[index] = newer;
    const retry = r.pending[1]!;
    const fresh = structuredClone(await r.response(retry.path));
    expect(fresh!.memories!.find((row) => row.id === id)).toEqual(newer);
    retry.resolve(fresh);
    await search;
    expect(r.store.entities.memory[id]).toEqual(newer);
    expect(r.memories.searching).toBe(false);
  });

  it.each(["filter", "search"] as const)("initializes project B type choices during unrelated project A writes: %s", async (mode) => {
    const r = await viewerFixture(true, true);
    await r.select("A");
    r.defer();
    r.memories.projectFilter = "B";
    const action = mode === "filter" ? r.viewer.applyMemoryFilters() : r.viewer.runMemorySearch("Memory");
    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = r.pending[attempt]!;
      const snapshot = structuredClone(await r.response(pending.path));
      const next = memoryFixture(`A-during-new-B-scope-${attempt}`, "A", "fact");
      r.rows.push(next);
      r.viewer.handleLiveEvent("memory.created", { memory: next });
      pending.resolve(snapshot);
      await vi.advanceTimersByTimeAsync(0);
    }
    await action;
    expect(r.memories.firstPageLoading).toBe(false);
    expect(r.memories.searching).toBe(false);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 2, workflow: 1 });
    expect(r.memories.facetScope).toEqual({ project: "B", agent: "" });
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 2, workflow: 1 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 135, B: 3 });
  });

  it.each(["updated", "deleted"] as const)("keeps a live %s row when its unchanged-selection cursor response is stale", async (action) => {
    const r = await viewerFixture();
    await r.select("A");
    r.defer();
    const page = r.viewer.loadMoreMemories();
    const pending = r.pending[0]!;
    const stale = structuredClone(await r.response(pending.path));
    const id = stale!.memories!.find((row) => row.type === "fact")!.id;
    const index = r.rows.findIndex((row) => row.id === id);
    let updated: Memory | undefined;
    if (action === "deleted") {
      r.rows.splice(index, 1);
      r.viewer.handleLiveEvent("memory.deleted", { memoryId: id });
    } else {
      updated = { ...r.rows[index]!, title: "Live title during cursor request", updatedAt: "2026-10-02T00:00:00Z" };
      r.rows[index] = updated;
      r.viewer.handleLiveEvent("memory.updated", { memory: updated });
    }
    pending.resolve(stale);
    await page;
    expect(r.store.entities.memory[id]).toEqual(updated);
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.store.entities.memory[id]).toEqual(updated);
  });

  it("keeps initial-load deletions and creations after the event journal rolls over", async () => {
    const r = await viewerFixture(false);
    r.defer();
    const loading = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const pending = r.pending[0]!;
    const stale = structuredClone(await r.response(pending.path));
    const id = stale!.memories!.find((row) => row.type === "fact")!.id;
    r.rows.splice(r.rows.findIndex((row) => row.id === id), 1);
    r.viewer.handleLiveEvent("memory.deleted", { memoryId: id });
    const created: Memory[] = [];
    for (let index = 0; index < 600; index++) {
      const next = memoryFixture(`B-initial-overflow-${index}`, "B", "fact");
      created.push(next);
      r.rows.push(next);
      r.viewer.handleLiveEvent("memory.created", { memory: next });
    }
    pending.resolve(stale);
    await loading;
    expect(r.store.entities.memory[id]).toBeUndefined();
    expect(created.every((row) => r.store.entities.memory[row.id]?.id === row.id)).toBe(true);
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.store.entities.memory[id]).toBeUndefined();
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 731, bug: 3, workflow: 1 });
  });

  it("keeps a newer server row when a delayed older event arrives during the same retry", async () => {
    const r = await viewerFixture(true, true);
    await r.select("A");
    r.defer();
    const search = r.viewer.runMemorySearch("Memory");
    const first = r.pending[0]!;
    const firstSnapshot = structuredClone(await r.response(first.path));
    const other = memoryFixture("B-before-delayed-older-event", "B", "fact");
    r.rows.push(other);
    r.viewer.handleLiveEvent("memory.created", { memory: other });
    first.resolve(firstSnapshot);
    await vi.advanceTimersByTimeAsync(0);
    const retry = r.pending[1]!;
    const id = firstSnapshot!.memories!.find((row) => row.type === "fact")!.id;
    const index = r.rows.findIndex((row) => row.id === id);
    const newer = { ...r.rows[index]!, title: "Server T2 must survive delayed T1", updatedAt: "2026-10-02T00:00:00Z" };
    r.rows[index] = newer;
    const response = structuredClone(await r.response(retry.path));
    expect(response!.memories!.find((row) => row.id === id)).toEqual(newer);
    const older = { ...newer, title: "Delayed older T1", updatedAt: "2026-10-01T00:00:00Z" };
    r.viewer.handleLiveEvent("memory.updated", { memory: older });
    retry.resolve(response);
    await search;
    expect(r.store.entities.memory[id]).toEqual(newer);
    expect(r.memories.searching).toBe(false);
    expect(r.memories.firstPageLoading).toBe(false);
  });

  it("keeps the newer initial snapshot row when an older update overlaps that read", async () => {
    const r = await viewerFixture(false);
    const row = r.rows.find((item) => item.project === "A" && item.type === "fact" && item.isLatest && item.agentId === "x")!;
    const newer = { ...row, title: "Newer initial server row", updatedAt: "2026-10-02T00:00:00Z" };
    r.rows[r.rows.findIndex((item) => item.id === row.id)] = newer;
    r.defer();
    const loading = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const pending = r.pending[0]!;
    const response = structuredClone(await r.response(pending.path));
    expect(response!.memories!.find((item) => item.id === row.id)).toEqual(newer);
    r.viewer.handleLiveEvent("memory.updated", { memory: { ...newer, title: "Older delayed initial event", updatedAt: "2026-10-01T00:00:00Z" } });
    pending.resolve(response);
    await loading;
    expect(r.store.entities.memory[row.id]).toEqual(newer);
  });

  it("keeps a newer All first page when the original initial page finishes later without live events", async () => {
    const r = await viewerFixture(false);
    r.defer();
    const loading = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const initial = r.pending[0]!;
    const old = structuredClone(await r.response(initial.path));
    r.rows.push(...Array.from({ length: 250 }, (_, index) => memoryFixture(`B-before-newer-All-${index}`, "B", "fact", {
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    })));
    r.memories.search = "previous query";
    const clear = r.viewer.runMemorySearch("");
    expect(r.pending).toHaveLength(2);
    const newer = r.pending[1]!;
    newer.resolve(structuredClone(await r.response(newer.path)));
    await clear;
    const cursor = r.memories.nextCursor;
    const cached = Object.keys(r.store.entities.memory).sort();
    const types = positive(renderedTypes(r.viewer));
    expect(cursor).toEqual(expect.any(String));
    expect(types).toEqual({ fact: 382, bug: 3, workflow: 1 });
    initial.resolve(old);
    await loading;
    expect(r.store.loaded.memory).toBe(true);
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(cached);
    expect(r.memories.nextCursor).toBe(cursor);
    expect(positive(renderedTypes(r.viewer))).toEqual(types);
    r.resume();
    let pages = 0;
    while (r.memories.nextCursor && pages < 10) {
      await r.viewer.loadMoreMemories();
      pages++;
    }
    expect(pages).toBeLessThan(10);
    const expected = r.rows.filter((row) => row.isLatest && row.agentId === "x").map((row) => row.id).sort();
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(expected);
    expect(expected).toHaveLength(386);
  });

  it.each(["updated", "deleted"] as const)("reconciles a stale per-ID lookup after a live %s event", async (action) => {
    const r = await viewerFixture(true, false, true);
    const row = r.rows.find((item) => item.isLatest && item.agentId === "x" && !r.store.entities.memory[item.id])!;
    expect(row).toBeDefined();
    r.defer();
    const lookup = r.viewer.fetchMemoryVersion(row.id);
    const pending = r.pending[0]!;
    const old = structuredClone(await r.response(pending.path));
    expect(old!.memory).toEqual(row);
    let updated: Memory | undefined;
    const index = r.rows.findIndex((item) => item.id === row.id);
    if (action === "deleted") {
      r.rows.splice(index, 1);
      r.viewer.handleLiveEvent("memory.deleted", { memoryId: row.id });
    } else {
      updated = { ...row, title: "Newer live detail row", updatedAt: "2026-10-02T00:00:00Z" };
      r.rows[index] = updated;
      r.viewer.handleLiveEvent("memory.updated", { memory: updated });
    }
    pending.resolve(old);
    await lookup;
    expect(r.store.entities.memory[row.id]).toEqual(updated);
    expect(r.memories.fetches[row.id]).toBe(action === "deleted" ? "missing" : "done");
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.store.entities.memory[row.id]).toEqual(updated);
  });

  it("keeps an ordinary historical per-ID lookup when no live event overlaps", async () => {
    const r = await viewerFixture(true, false, true);
    const history = r.rows.find((row) => row.isLatest === false)!;
    expect(r.store.entities.memory[history.id]).toBeUndefined();
    await r.viewer.fetchMemoryVersion(history.id);
    expect(r.store.entities.memory[history.id]).toEqual(history);
    expect(r.memories.fetches[history.id]).toBe("done");
  });

  it("keeps a newer detail response when an older cursor response completes without live events", async () => {
    const r = await viewerFixture(true, false, true);
    await r.select("A");
    r.defer();
    const page = r.viewer.loadMoreMemories();
    const pendingPage = r.pending[0]!;
    const old = structuredClone(await r.response(pendingPage.path));
    const row = old!.memories!.find((item) => item.type === "fact")!;
    expect(r.store.entities.memory[row.id]).toBeUndefined();
    const detail = r.viewer.fetchMemoryVersion(row.id);
    const pendingDetail = r.pending[1]!;
    const newer = { ...row, title: "Newer detail response before older page", updatedAt: "2026-10-02T00:00:00Z" };
    r.rows[r.rows.findIndex((item) => item.id === row.id)] = newer;
    pendingDetail.resolve(structuredClone(await r.response(pendingDetail.path)));
    await detail;
    expect(r.store.entities.memory[row.id]).toEqual(newer);
    pendingPage.resolve(old);
    await page;
    expect(r.store.entities.memory[row.id]).toEqual(newer);
    expect(r.memories.fetches[row.id]).toBe("done");
  });

  it("keeps a newer reconnect snapshot when an older detail response finishes later", async () => {
    const r = await viewerFixture(true, false, true);
    const row = r.rows.find((item) => item.isLatest && item.agentId === "x" && !r.store.entities.memory[item.id])!;
    expect(row).toBeDefined();
    r.defer();
    const lookup = r.viewer.fetchMemoryVersion(row.id);
    const pendingLookup = r.pending[0]!;
    const old = structuredClone(await r.response(pendingLookup.path));
    expect(old!.memory).toEqual(row);
    const newer = { ...row, title: "Newer reconnect snapshot before older detail", updatedAt: "2026-10-02T00:00:00Z" };
    r.rows[r.rows.findIndex((item) => item.id === row.id)] = newer;
    r.store.loaded.memory = false;
    const reload = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const pendingReload = r.pending[1]!;
    const fresh = structuredClone(await r.response(pendingReload.path));
    expect(fresh!.memories).toContainEqual(newer);
    pendingReload.resolve(fresh);
    await reload;
    expect(r.store.entities.memory[row.id]).toEqual(newer);
    expect(r.memories.readChanges).toHaveLength(1);
    pendingLookup.resolve(old);
    await lookup;
    expect(r.store.entities.memory[row.id]).toEqual(newer);
    expect(r.memories.fetches[row.id]).toBe("done");
    expect(r.memories.readChanges).toEqual([]);
    expect(r.store.loading).toEqual({ memory: null });
  });

  it("preserves an updated detail row omitted from a later partial reconnect page", async () => {
    const r = await viewerFixture(true, false, true);
    const row = r.rows.find((item) => item.isLatest && item.agentId === "x" && !r.store.entities.memory[item.id])!;
    expect(row).toBeDefined();
    const index = r.rows.findIndex((item) => item.id === row.id);
    r.rows[index] = { ...row, createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" };
    r.defer();
    const lookup = r.viewer.fetchMemoryVersion(row.id);
    const pendingLookup = r.pending[0]!;
    const old = structuredClone(await r.response(pendingLookup.path));
    expect(old!.memory).toEqual(r.rows[index]);
    const newer = { ...r.rows[index]!, title: "Live detail outside the reconnect first page", updatedAt: "2026-08-02T00:00:00Z" };
    r.rows[index] = newer;
    r.viewer.handleLiveEvent("memory.updated", { memory: newer });
    expect(r.store.entities.memory[row.id]).toEqual(newer);
    r.store.loaded.memory = false;
    const reload = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const pendingReload = r.pending[1]!;
    const fresh = structuredClone(await r.response(pendingReload.path));
    expect(fresh!.memories).toHaveLength(100);
    expect(fresh!.memories!.some((item) => item.id === row.id)).toBe(false);
    expect(r.rows[index]).toEqual(newer);
    pendingReload.resolve(fresh);
    await reload;
    expect(r.store.entities.memory[row.id]).toBeUndefined();
    pendingLookup.resolve(old);
    await lookup;
    expect(r.store.entities.memory[row.id]).toEqual(newer);
    expect(r.memories.fetches[row.id]).toBe("done");
    expect(r.memories.readChanges).toEqual([]);
  });
});
afterEach(() => {
  for (const id of indexedIds) getSearchIndex().remove(id);
  indexedIds.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("project type counts in the rendered memory selector", () => {
  it("starts with full All-project counts even when only one hundred rows are loaded", async () => {
    const { viewer, store } = await viewerFixture();
    expect(Object.keys(store.entities.memory)).toHaveLength(100);
    expect(positive(renderedTypes(viewer))).toEqual({ fact: 132, bug: 3, workflow: 1 });
  });

  it("refreshes project A, project B and All-project type counts while retaining global project choices", async () => {
    const r = await viewerFixture();
    await r.select("A");
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 130, bug: 3 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 133, B: 3 });
    await r.select("B");
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 2, workflow: 1 });
    await r.select("");
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 132, bug: 3, workflow: 1 });
  });

  it("retains other project types when one type is selected", async () => {
    const r = await viewerFixture();
    r.memories.projectFilter = "A";
    r.memories.typeFilter = "bug";
    await r.viewer.applyMemoryFilters();
    expect(r.memories.query!.total).toBe(3);
    expect(positive(renderedTypes(r.viewer, "bug"))).toEqual({ fact: 130, bug: 3 });
  });

  it("omits unselected zero types while keeping a selected zero type clearable", async () => {
    const r = await viewerFixture();
    r.memories.projectFilter = "A";
    r.memories.typeFilter = "workflow";
    await r.viewer.applyMemoryFilters();
    expect(renderedTypes(r.viewer, "workflow")).toEqual({ fact: 130, bug: 3, workflow: 0 });
    expect(r.viewer.memoryFilterSelect("type", "All types", "workflow")).toContain('value="workflow" selected');
    expect(r.memories.typeFilter).toBe("workflow");
    r.viewer.setMemoryFilter("type", "");
    await r.drain();
    expect(r.memories.typeFilter).toBe("");
    expect(renderedTypes(r.viewer)).toEqual({ fact: 130, bug: 3 });
  });

  it("does not let a late project A response replace the later project B selector", async () => {
    const r = await viewerFixture();
    r.defer();
    r.memories.projectFilter = "A";
    const a = r.viewer.applyMemoryFilters();
    r.memories.projectFilter = "B";
    const b = r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(2);
    r.pending[1]!.resolve(await r.response(r.pending[1]!.path));
    await b;
    const afterB = positive(renderedTypes(r.viewer));
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await a;
    expect([afterB, positive(renderedTypes(r.viewer))]).toEqual([{ fact: 2, workflow: 1 }, { fact: 2, workflow: 1 }]);
    expect(r.memories.projectFilter).toBe("B");
    expect(r.memories.query!.total).toBe(3);
  });

  it("refreshes project facets during text search and ignores a superseded search response", async () => {
    const r = await viewerFixture();
    r.defer();
    r.memories.search = "needle";
    r.memories.projectFilter = "A";
    const a = r.viewer.applyMemoryFilters();
    r.memories.projectFilter = "B";
    const b = r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(2);
    r.pending[1]!.resolve(await r.response(r.pending[1]!.path));
    await b;
    const afterB = positive(renderedTypes(r.viewer));
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await a;
    expect([afterB, positive(renderedTypes(r.viewer))]).toEqual([{ fact: 2, workflow: 1 }, { fact: 2, workflow: 1 }]);
    expect(r.memories.projectFilter).toBe("B");
  });

  it("updates global project counts for a live B row without inflating selected A types", async () => {
    const r = await viewerFixture();
    await r.select("A");
    const next = memoryFixture("B-live", "B", "fact");
    r.store.entities.memory[next.id] = next;
    r.viewer.noteMemoryChange(null, next, next.id);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 130, bug: 3 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 133, B: 4 });
  });

  it("keeps searched project B facets when an outstanding project A filter finishes", async () => {
    const r = await viewerFixture();
    r.defer();
    r.memories.projectFilter = "A";
    const a = r.viewer.applyMemoryFilters();
    r.memories.projectFilter = "B";
    r.memories.search = "needle";
    const b = r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(2);
    r.pending[1]!.resolve(await r.response(r.pending[1]!.path));
    await b;
    const afterB = positive(renderedTypes(r.viewer));
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await a;
    expect([afterB, positive(renderedTypes(r.viewer))]).toEqual([{ fact: 2, workflow: 1 }, { fact: 2, workflow: 1 }]);
    expect(r.memories.projectFilter).toBe("B");
  });

  it("updates current-project counts on live insertion and removal from the latest version", async () => {
    const r = await viewerFixture();
    await r.select("A");
    const next = memoryFixture("A-live", "A", "fact");
    r.store.entities.memory[next.id] = next;
    r.viewer.noteMemoryChange(null, next, next.id);
    const added = positive(renderedTypes(r.viewer));
    const historical = { ...next, isLatest: false };
    r.store.entities.memory[next.id] = historical;
    r.viewer.noteMemoryChange(next, historical, next.id);
    expect([added, positive(renderedTypes(r.viewer))]).toEqual([{ fact: 131, bug: 3 }, { fact: 130, bug: 3 }]);
  });

  it("does not inflate a selected agent's facets for another agent's live row", async () => {
    const r = await viewerFixture();
    r.memories.agentFilter = "x";
    await r.select("A");
    const other = memoryFixture("A-other-agent-live", "A", "fact", { agentId: "y" });
    r.store.entities.memory[other.id] = other;
    r.viewer.noteMemoryChange(null, other, other.id);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 130, bug: 3 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 133, B: 3 });
  });

  it.each([
    ["filter", "A", false], ["filter", "A", true],
    ["filter", "B", false], ["filter", "B", true],
    ["search", "A", false], ["search", "A", true],
    ["search", "B", false], ["search", "B", true],
  ] as const)("keeps live counts with an authoritative snapshot: %s, event %s, already included %s", async (mode, project, included) => {
    const r = await viewerFixture();
    await r.select("A");
    r.defer();
    const request = mode === "filter" ? r.viewer.applyMemoryFilters() : r.viewer.runMemorySearch("needle");
    expect(r.pending).toHaveLength(1);
    const pending = r.pending[0]!;
    const beforeEvent = included ? null : await r.response(pending.path);
    const next = memoryFixture(`${project}-during-${mode}-${included}`, project, "fact");
    r.rows.push(next);
    r.store.entities.memory[next.id] = next;
    r.viewer.noteMemoryChange(null, next, next.id);
    const types = project === "A" ? { fact: 131, bug: 3 } : { fact: 130, bug: 3 };
    const projects = project === "A" ? { A: 134, B: 3 } : { A: 133, B: 4 };
    expect(positive(renderedTypes(r.viewer))).toEqual(types);
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual(projects);
    const snapshot = included ? await r.response(pending.path) : beforeEvent;
    r.resume();
    pending.resolve(snapshot);
    await request;
    expect(positive(renderedTypes(r.viewer))).toEqual(types);
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual(projects);
  });

  it("uses the fresh All-project cursor to load every row after the corpus grows while filtered", async () => {
    const r = await viewerFixture();
    await r.select("B");
    const newer = Array.from({ length: 250 }, (_, index) => memoryFixture(`newer-${index}`, "B", "fact", {
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    }));
    r.rows.push(...newer);
    await r.select("");
    const cursorAfterReset = r.memories.nextCursor;
    const freshPage = await r.response("memories?latest=true&limit=100");
    let pages = 0;
    while (r.memories.nextCursor && pages < 10) {
      await r.viewer.loadMoreMemories();
      pages++;
    }
    expect(pages).toBeLessThan(10);
    const missingNew = newer.filter((row) => !r.store.entities.memory[row.id]).map((row) => row.id);
    expect({ cursor: cursorAfterReset, missingNew, total: Object.keys(r.store.entities.memory).length }).toEqual({
      cursor: freshPage!.nextCursor, missingNew: [], total: 386,
    });
    const expectedIds = r.rows.filter((row) => row.isLatest && row.agentId === "x").map((row) => row.id).sort();
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(expectedIds);
  });

  it.each([
    ["filter", "A"], ["filter", "B"],
    ["search", "A"], ["search", "B"],
  ] as const)("reconciles a delayed live event already included in the accepted snapshot: %s, event %s", async (mode, project) => {
    const r = await viewerFixture();
    r.memories.projectFilter = "A";
    r.memories.typeFilter = "bug";
    await r.viewer.applyMemoryFilters();
    r.defer();
    const action = mode === "filter" ? r.viewer.applyMemoryFilters() : r.viewer.runMemorySearch("needle");
    expect(r.pending).toHaveLength(1);
    const pending = r.pending[0]!;
    const next = memoryFixture(`${project}-delayed-${mode}`, project, "fact");
    r.rows.push(next);
    pending.resolve(await r.response(pending.path));
    await action;
    const types = project === "A" ? { fact: 131, bug: 3 } : { fact: 130, bug: 3 };
    const projects = project === "A" ? { A: 134, B: 3 } : { A: 133, B: 4 };
    expect(positive(renderedTypes(r.viewer))).toEqual(types);
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual(projects);
    expect(r.store.entities.memory[next.id]).toBeUndefined();
    r.store.entities.memory[next.id] = next;
    r.viewer.noteMemoryChange(null, next, next.id);
    const cursor = r.memories.nextCursor, query = r.memories.query;
    const cachedIds = Object.keys(r.store.entities.memory).sort();
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(positive(renderedTypes(r.viewer))).toEqual(types);
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual(projects);
    expect(r.memories.nextCursor).toBe(cursor);
    expect(r.memories.query).toBe(query);
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(cachedIds);
  });

  it("coalesces live facet refreshes without replacing loaded rows or pagination", async () => {
    const r = await viewerFixture();
    await r.select("A");
    const cursor = r.memories.nextCursor, query = r.memories.query;
    const requests = r.requests.length;
    for (const project of ["A", "B"]) {
      const next = memoryFixture(`${project}-coalesced`, project, "fact");
      r.rows.push(next);
      r.store.entities.memory[next.id] = next;
      r.viewer.noteMemoryChange(null, next, next.id);
    }
    const cachedIds = Object.keys(r.store.entities.memory).sort();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.requests.length - requests).toBe(1);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 131, bug: 3 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 134, B: 4 });
    expect(r.memories.nextCursor).toBe(cursor);
    expect(r.memories.query).toBe(query);
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(cachedIds);
  });

  it("ignores an outstanding background facet response after selecting a later project", async () => {
    const r = await viewerFixture();
    await r.select("A");
    r.defer();
    const next = memoryFixture("B-before-background", "B", "fact");
    r.rows.push(next);
    r.store.entities.memory[next.id] = next;
    r.viewer.noteMemoryChange(null, next, next.id);
    await vi.advanceTimersByTimeAsync(100);
    expect(r.pending).toHaveLength(1);
    r.memories.projectFilter = "B";
    const b = r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(2);
    r.pending[1]!.resolve(await r.response(r.pending[1]!.path));
    await b;
    const types = positive(renderedTypes(r.viewer));
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await vi.advanceTimersByTimeAsync(0);
    expect([types, positive(renderedTypes(r.viewer))]).toEqual([{ fact: 3, workflow: 1 }, { fact: 3, workflow: 1 }]);
    expect(r.memories.projectFilter).toBe("B");
  });

  it("does not let older background facets replace a newer primary snapshot in the same selection", async () => {
    const r = await viewerFixture();
    r.memories.projectFilter = "A";
    r.memories.typeFilter = "bug";
    await r.viewer.applyMemoryFilters();
    r.defer();
    const first = memoryFixture("A-before-primary", "A", "fact");
    r.rows.push(first);
    r.store.entities.memory[first.id] = first;
    r.viewer.noteMemoryChange(null, first, first.id);
    const primary = r.viewer.applyMemoryFilters();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.pending).toHaveLength(2);
    const older = await r.response(r.pending[1]!.path);
    r.rows.push(memoryFixture("A-before-newer-snapshot", "A", "fact"));
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await primary;
    const types = positive(renderedTypes(r.viewer));
    r.pending[1]!.resolve(older);
    await vi.advanceTimersByTimeAsync(0);
    expect([types, positive(renderedTypes(r.viewer))]).toEqual([{ fact: 132, bug: 3 }, { fact: 132, bug: 3 }]);
  });

  it("reconciles a delayed matching paginated row without inflating the accepted total", async () => {
    const r = await viewerFixture();
    r.memories.projectFilter = "A";
    r.memories.typeFilter = "fact";
    await r.viewer.applyMemoryFilters();
    r.defer();
    const primary = r.viewer.applyMemoryFilters();
    const next = memoryFixture("A-000-delayed-matching", "A", "fact");
    r.rows.push(next);
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await primary;
    expect(r.memories.query!.total).toBe(131);
    expect(r.store.entities.memory[next.id]).toBeUndefined();
    r.store.entities.memory[next.id] = next;
    r.viewer.noteMemoryChange(null, next, next.id);
    const cursor = r.memories.nextCursor, query = r.memories.query;
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect({ types: positive(renderedTypes(r.viewer)), total: r.memories.query!.total }).toEqual({
      types: { fact: 131, bug: 3 }, total: 131,
    });
    expect(r.memories.nextCursor).toBe(cursor);
    expect(r.memories.query).toBe(query);
  });

  it("does not let an older primary response replace newer background facets", async () => {
    const r = await viewerFixture();
    r.memories.projectFilter = "A";
    r.memories.typeFilter = "bug";
    await r.viewer.applyMemoryFilters();
    r.defer();
    const first = memoryFixture("A-before-older-primary", "A", "fact");
    r.rows.push(first);
    r.store.entities.memory[first.id] = first;
    r.viewer.noteMemoryChange(null, first, first.id);
    const primary = r.viewer.applyMemoryFilters();
    const older = await r.response(r.pending[0]!.path);
    r.rows.push(memoryFixture("A-before-newer-background", "A", "fact"));
    await vi.advanceTimersByTimeAsync(100);
    expect(r.pending).toHaveLength(2);
    r.pending[1]!.resolve(await r.response(r.pending[1]!.path));
    await vi.advanceTimersByTimeAsync(0);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 132, bug: 3 });
    r.resume();
    r.pending[0]!.resolve(older);
    await primary;
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 132, bug: 3 });
  });

  it("reconciles an initial stale snapshot after a live event while facets were still unloaded", async () => {
    const r = await viewerFixture(false);
    r.defer();
    const loading = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    expect(r.pending).toHaveLength(1);
    const stale = await r.response(r.pending[0]!.path);
    const next = memoryFixture("A-during-initial-load", "A", "fact");
    r.rows.push(next);
    r.viewer.handleLiveEvent("memory.created", { memory: next });
    await vi.advanceTimersByTimeAsync(100);
    expect(r.memories.facets).toBeNull();
    r.pending[0]!.resolve(stale);
    await loading;
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.store.loaded.memory).toBe(true);
    expect(r.store.entities.memory[next.id]).toEqual(next);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 133, bug: 3, workflow: 1 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 134, B: 3 });
  });

  it("discards a late project page after returning to All without losing its fresh cursor or remaining rows", async () => {
    const r = await viewerFixture();
    await r.select("A");
    r.defer();
    const oldPage = r.viewer.loadMoreMemories();
    expect(r.pending).toHaveLength(1);
    const previous = await r.response(r.pending[0]!.path);
    expect(previous!.nextCursor).toBeNull();
    r.rows.push(...Array.from({ length: 250 }, (_, index) => memoryFixture(`B-new-before-All-${index}`, "B", "fact", {
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    })));
    r.memories.projectFilter = "";
    const all = r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(2);
    r.pending[1]!.resolve(await r.response(r.pending[1]!.path));
    await all;
    const cursor = r.memories.nextCursor;
    const cachedIds = Object.keys(r.store.entities.memory).sort();
    expect(cursor).toEqual(expect.any(String));
    r.pending[0]!.resolve(previous);
    await oldPage;
    expect(r.memories.nextCursor).toBe(cursor);
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(cachedIds);
    r.resume();
    let pages = 0;
    while (r.memories.nextCursor && pages < 10) {
      await r.viewer.loadMoreMemories();
      pages++;
    }
    expect(pages).toBeLessThan(10);
    const expected = r.rows.filter((row) => row.isLatest && row.agentId === "x").map((row) => row.id).sort();
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(expected);
    expect(expected).toHaveLength(386);
  });

  it("does not double-count a live event already included in the initial snapshot", async () => {
    const r = await viewerFixture(false);
    r.defer();
    const loading = r.viewer.ensureLoaded("memory");
    await vi.advanceTimersByTimeAsync(0);
    const next = memoryFixture("A-included-in-initial-load", "A", "fact");
    r.rows.push(next);
    r.viewer.handleLiveEvent("memory.created", { memory: next });
    await vi.advanceTimersByTimeAsync(100);
    expect(r.memories.facets).toBeNull();
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await loading;
    r.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.store.entities.memory[next.id]).toEqual(next);
    expect(positive(renderedTypes(r.viewer))).toEqual({ fact: 133, bug: 3, workflow: 1 });
    expect(facetCounts(r.viewer.memoryFacetList("project"))).toEqual({ A: 134, B: 3 });
  });

  it("does not paginate from an old global cursor while the new All first page is pending", async () => {
    const r = await viewerFixture();
    await r.select("B");
    r.rows.push(...Array.from({ length: 250 }, (_, index) => memoryFixture(`B-before-pending-All-${index}`, "B", "fact", {
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    })));
    r.defer();
    r.memories.projectFilter = "";
    const all = r.viewer.applyMemoryFilters();
    expect(r.pending).toHaveLength(1);
    const page = r.viewer.loadMoreMemories();
    const oldRequest = r.pending[1];
    const oldResponse = oldRequest ? await r.response(oldRequest.path) : null;
    if (oldResponse) expect(oldResponse.nextCursor).toBeNull();
    r.pending[0]!.resolve(await r.response(r.pending[0]!.path));
    await all;
    const cursor = r.memories.nextCursor;
    const cachedIds = Object.keys(r.store.entities.memory).sort();
    expect(cursor).toEqual(expect.any(String));
    if (oldRequest) oldRequest.resolve(oldResponse);
    await page;
    expect(r.memories.nextCursor).toBe(cursor);
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(cachedIds);
    r.resume();
    let pages = 0;
    while (r.memories.nextCursor && pages < 10) {
      await r.viewer.loadMoreMemories();
      pages++;
    }
    expect(pages).toBeLessThan(10);
    const expected = r.rows.filter((row) => row.isLatest && row.agentId === "x").map((row) => row.id).sort();
    expect(Object.keys(r.store.entities.memory).sort()).toEqual(expected);
    expect(expected).toHaveLength(386);
  });
});
