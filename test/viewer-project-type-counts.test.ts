import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "../src/types.js";
import { createMemoryApi, facetCounts, memoryFixture, projectMemoryFixture, type FacetCount, type MemoryFacets, type MemoryListResponse } from "./helpers/project-memory-fixture.js";

type Body = MemoryListResponse["body"];
type Pending = { path: string; promise: Promise<Body | null>; resolve: (body: Body | null) => void };
type MemoryState = {
  projectFilter: string; agentFilter: string; typeFilter: string; search: string;
  facets: MemoryFacets | null; checked: Record<string, boolean>; searchIds: string[] | null;
  query: { loading?: boolean; total?: number | null; nextCursor?: string | null } | null;
  [key: string]: unknown;
};
type Viewer = {
  memoryFacetList: (dimension: string) => FacetCount[];
  memoryFilterSelect: (dimension: string, label: string, selected: string) => string;
  applyMemoryFilters: () => Promise<void>;
  setMemoryFilter: (dimension: string, value: string) => void;
  runMemorySearch: (query: string) => Promise<void>;
  loadMoreMemories: () => Promise<void>;
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
  .filter((node) => ts.isIdentifier(node.name) && ["MEMORY_TYPES", "memoryFilterSeq", "memorySearchSeq"].includes(node.name.text))
  .map((node) => `var ${node.getText(source)};`).join("\n");
const instantiate = new Function("fixture", `
  var state = fixture.state, store = fixture.store, document = fixture.document;
  ${bindings}
  ${declarations}
  apiGet = fixture.apiGet;
  renderMemories = fixture.render;
  return { memoryFacetList, memoryFilterSelect, applyMemoryFilters, setMemoryFilter, runMemorySearch, loadMoreMemories, noteMemoryChange };
`) as (fixture: object) => Viewer;

async function viewerFixture() {
  const rows = projectMemoryFixture();
  const api = createMemoryApi(rows);
  const initial = await api.get({ latest: "true", limit: "100", facets: "true" });
  expect(initial.status_code).toBe(200);
  expect(initial.body.total).toBe(136);
  const memories: MemoryState = {
    projectFilter: "", agentFilter: "", typeFilter: "", search: "", searchIds: null,
    facets: initial.body.facets!, checked: {}, query: null, nextCursor: initial.body.nextCursor || null,
  };
  const entities = Object.fromEntries(initial.body.memories!.map((row) => [row.id, row]));
  const store = { entities: { memory: entities }, loaded: { memory: true } };
  const requests: string[] = [], pending: Pending[] = [];
  let deferred = false;
  let lastResponse: Promise<Body | null> | undefined;
  const response = async (path: string) => {
    const query = Object.fromEntries(new URL(path, "http://viewer.test/").searchParams);
    const result = await api.get(query);
    return result.status_code === 200 ? result.body : null;
  };
  const viewer = instantiate({
    state: { memories, activeTab: "memories" }, store,
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
  vi.stubEnv("AGENT_ID", "x");
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "isolated");
});
afterEach(() => vi.unstubAllEnvs());

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
});
