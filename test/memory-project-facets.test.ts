import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryApi, facetCounts, memoryFixture, projectMemoryFixture } from "./helpers/project-memory-fixture.js";

beforeEach(() => {
  vi.stubEnv("AGENT_ID", "x");
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "isolated");
});
afterEach(() => vi.unstubAllEnvs());

describe("memory type facets within a project", () => {
  it("reports the selected project's two facts rather than eighteen global facts", async () => {
    const rows = [
      memoryFixture("A-1", "A", "fact"), memoryFixture("A-2", "A", "fact"),
      ...Array.from({ length: 16 }, (_, index) => memoryFixture(`B-${index}`, "B", "fact")),
      memoryFixture("B-workflow", "B", "workflow"),
    ];
    const response = await createMemoryApi(rows).get({ latest: "true", facets: "true", project: "A" });
    expect(response.status_code).toBe(200);
    expect(response.body.total).toBe(2);
    expect(facetCounts(response.body.facets!.types)).toEqual({ fact: 2 });
    expect(facetCounts(response.body.facets!.projects)).toEqual({ A: 2, B: 17 });
  });

  it.each([
    ["A", 133, { fact: 130, bug: 3 }],
    ["B", 3, { fact: 2, workflow: 1 }],
  ] as const)("counts all current project %s types before the first hundred rows are selected", async (project, total, types) => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ latest: "true", facets: "true", project, limit: "100" });
    expect(response.status_code).toBe(200);
    expect(response.body.total).toBe(total);
    expect(response.body.memories).toHaveLength(Math.min(100, total));
    expect(facetCounts(response.body.facets!.types)).toEqual(types);
    expect(facetCounts(response.body.facets!.projects)).toEqual({ A: 133, B: 3 });
    expect(facetCounts(response.body.facets!.agents)).toEqual({ x: 136 });
    if (total > 100) expect(response.body.nextCursor).toEqual(expect.any(String));
  });

  it("restores global counts for All projects while excluding old versions and other agents", async () => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ latest: "true", facets: "true", limit: "100" });
    expect(response.body.total).toBe(136);
    expect(response.body.memories).toHaveLength(100);
    expect(facetCounts(response.body.facets!.types)).toEqual({ fact: 132, bug: 3, workflow: 1 });
  });

  it("does not filter type choices by the selected type", async () => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ latest: "true", facets: "true", project: "A", type: "bug" });
    expect(response.body.total).toBe(3);
    expect(response.body.memories!.every((row) => row.type === "bug")).toBe(true);
    expect(facetCounts(response.body.facets!.types)).toEqual({ fact: 130, bug: 3 });
    expect(facetCounts(response.body.facets!.projects)).toEqual({ A: 133, B: 3 });
  });

  it("applies the isolated agent scope before counting the selected project's types", async () => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ latest: "true", facets: "true", project: "B" });
    expect(response.body.total).toBe(3);
    expect(facetCounts(response.body.facets!.types)).toEqual({ fact: 2, workflow: 1 });
    expect(response.body.memories!.every((row) => row.agentId === "x")).toBe(true);
  });

  it("retains explicit agent selection without leaking the default isolated corpus", async () => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ latest: "true", facets: "true", project: "A", agentId: "y" });
    expect(response.body.total).toBe(9);
    expect(facetCounts(response.body.facets!.types)).toEqual({ fact: 9 });
    expect(facetCounts(response.body.facets!.projects)).toEqual({ A: 9 });
  });

  it("returns no type choices for an empty project while keeping other projects selectable", async () => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ latest: "true", facets: "true", project: "empty" });
    expect(response.body.total).toBe(0);
    expect(response.body.memories).toEqual([]);
    expect(response.body.facets!.types).toEqual([]);
    expect(facetCounts(response.body.facets!.projects)).toEqual({ A: 133, B: 3 });
  });

  it("retains wildcard agent selection while counting project types across both agents", async () => {
    const api = createMemoryApi(projectMemoryFixture());
    const project = await api.get({ latest: "true", facets: "true", project: "A", agentId: "*" });
    expect(project.body.total).toBe(142);
    expect(facetCounts(project.body.facets!.types)).toEqual({ fact: 139, bug: 3 });
    expect(facetCounts(project.body.facets!.projects)).toEqual({ A: 142, B: 3 });
    const global = await api.get({ latest: "true", facets: "true", agentId: "*" });
    expect(global.body.total).toBe(145);
    expect(facetCounts(global.body.facets!.types)).toEqual({ fact: 141, bug: 3, workflow: 1 });
  });

  it("retains latest-only facet semantics when history is included in the row list", async () => {
    const response = await createMemoryApi(projectMemoryFixture()).get({ facets: "true" });
    expect(response.body.total).toBe(156);
    expect(facetCounts(response.body.facets!.types)).toEqual({ fact: 132, bug: 3, workflow: 1 });
  });

  it("requires authentication before reading memory or exposing facets", async () => {
    const api = createMemoryApi(projectMemoryFixture());
    const response = await api.get({ latest: "true", facets: "true", project: "A" }, false);
    expect(response.status_code).toBe(401);
    expect(response.body.facets).toBeUndefined();
    expect(api.kv.list).not.toHaveBeenCalled();
  });
});
