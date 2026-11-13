import { vi } from "vitest";
import { registerApiTriggers } from "../../src/triggers/api.js";
import { KV } from "../../src/state/schema.js";
import type { Memory } from "../../src/types.js";

export type FacetCount = { value: string; count: number };
export type MemoryFacets = { projects: FacetCount[]; agents: FacetCount[]; types: FacetCount[] };
export type MemoryListResponse = {
  status_code: number;
  body: { memories?: Memory[]; facets?: MemoryFacets; total?: number; nextCursor?: string | null; error?: string };
};
type Handler = (request: unknown) => unknown;
const SECRET = "project-memory-fixture";

export function memoryFixture(id: string, project: string, type: Memory["type"], extra: Partial<Memory> = {}): Memory {
  return {
    id, project, type, agentId: "x", title: id, content: `Memory ${id}`,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
    ...extra,
  };
}

export function projectMemoryFixture(): Memory[] {
  const group = (count: number, project: string, type: Memory["type"], extra: Partial<Memory> = {}) =>
    Array.from({ length: count }, (_, index) => memoryFixture(`${project}-${type}-${extra.agentId ?? "x"}-${extra.isLatest ?? true}-${index}`, project, type, extra));
  return [
    ...group(130, "A", "fact"), ...group(3, "A", "bug"),
    ...group(2, "B", "fact"), ...group(1, "B", "workflow"),
    ...group(20, "A", "fact", { isLatest: false }),
    ...group(9, "A", "fact", { agentId: "y" }),
  ];
}

export function createMemoryApi(memories: Memory[]) {
  const handlers = new Map<string, Handler>();
  const sdk = {
    registerFunction: (id: string | { id: string }, handler: Handler) => handlers.set(typeof id === "string" ? id : id.id, handler),
    registerTrigger: vi.fn(), trigger: vi.fn(async () => ({})), on: vi.fn(),
  };
  const kv = {
    get: vi.fn(async () => null), set: vi.fn(async (_scope: string, _key: string, value: unknown) => value),
    delete: vi.fn(async () => {}), list: vi.fn(async (scope: string) => scope === KV.memories ? memories : []),
  };
  registerApiTriggers(sdk as never, kv as never, SECRET);
  const get = async (query: Record<string, string> = {}, authenticated = true) =>
    await handlers.get("api::memories")!({ method: "GET", headers: authenticated ? { authorization: `Bearer ${SECRET}` } : {}, query_params: query }) as MemoryListResponse;
  return { get, kv };
}

export function facetCounts(rows: FacetCount[]): Record<string, number> {
  return Object.fromEntries(rows.map(({ value, count }) => [value, count]));
}
