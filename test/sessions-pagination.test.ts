import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// GET /agentmemory/sessions accepted `limit` from callers but never read it:
// every request did an unconditional full kv.list() and hydrated a summary for
// every session in the store. At ~10k sessions that is a ~13MB response, which
// is what broke the handoff/session-history skills -- they ask for 20 and got
// all of them. The MCP proxy has always sent limit=20 (src/mcp/standalone.ts),
// so this was purely a server-side omission.
//
// Scope each assertion to a single handler body: a whole-file regex for
// `limit` also matches api::commits and would pass vacuously.
function handlerBody(src: string, id: string): string {
  const start = src.indexOf(`sdk.registerFunction("${id}"`);
  expect(start, `${id} handler not found`).toBeGreaterThan(-1);
  const end = src.indexOf("sdk.registerTrigger", start);
  expect(end, `${id} trigger not found`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("api::sessions pagination", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");
  const sessions = handlerBody(api, "api::sessions");

  it("reads limit + offset from query params", () => {
    expect(sessions).toMatch(/query_params\?\.\["limit"\]/);
    expect(sessions).toMatch(/query_params\?\.\["offset"\]/);
    expect(sessions).toMatch(/\.slice\(offset/);
  });

  it("returns every session when limit is absent", () => {
    // scripts/agentmemory-import-with-skip.py builds its already-imported
    // skip-set from one unbounded call and implements no pagination loop. A
    // default cap would shrink that set silently and re-import the remainder
    // as duplicates, so absent-limit MUST stay unbounded.
    expect(sessions).toMatch(/limit\s*===\s*undefined/);
    expect(sessions).toMatch(/rawLimit\s*!==\s*undefined\s*&&\s*rawLimit\s*>\s*0/);
    // An unconditional numeric fallback (`rawLimit ?? 100`) is exactly the
    // regression this guards.
    expect(sessions).not.toMatch(/rawLimit\s*\?\?\s*\d+/);
  });

  it("sorts newest-first before slicing, so a limit returns the newest N", () => {
    // Ordering is load-bearing: slicing an unsorted kv.list() would return an
    // arbitrary N rather than the recent sessions every caller expects.
    expect(sessions).toMatch(/startedAt.*localeCompare.*startedAt/s);
    expect(sessions.indexOf(".sort(")).toBeLessThan(sessions.indexOf(".slice("));
  });

  it("hydrates summaries for the page only, not the whole store", () => {
    // The N+1: one kv.get per session in the store, even to answer limit=20.
    expect(sessions).toMatch(/page\.map\(\(s\)\s*=>\s*\n?\s*kv\.get<SessionSummary>/);
    expect(sessions).not.toMatch(/filtered\.map\(\(s\)\s*=>\s*\n?\s*kv\.get<SessionSummary>/);
  });

  it("reports the unpaged total so a capped response is not mistaken for all", () => {
    expect(sessions).toMatch(/total:\s*filtered\.length/);
  });
});

describe("memory_sessions MCP tool", () => {
  it("honors limit instead of dumping the whole store", () => {
    const server = readFileSync("src/mcp/server.ts", "utf-8");
    const start = server.indexOf('case "memory_sessions":');
    expect(start).toBeGreaterThan(-1);
    const body = server.slice(start, server.indexOf("case ", start + 10));
    // This path bypasses the HTTP API entirely (it is served by
    // /agentmemory/mcp/call), so fixing api::sessions alone does not reach it.
    expect(body).toMatch(/asNumber\(args\.limit\)/);
    expect(body).toMatch(/\.slice\(0,\s*limit\)/);
    expect(body).toMatch(/startedAt.*localeCompare.*startedAt/s);
    expect(body).not.toMatch(/JSON\.stringify\(\{\s*sessions\s*\}/);
  });

  it("advertises limit in its input schema", () => {
    const registry = readFileSync("src/mcp/tools-registry.ts", "utf-8");
    const start = registry.indexOf('name: "memory_sessions"');
    expect(start).toBeGreaterThan(-1);
    const entry = registry.slice(start, registry.indexOf("name: ", start + 10));
    // Was `inputSchema: { type: "object", properties: {} }` -- an empty schema
    // tells clients the tool takes no arguments, so limit was undiscoverable.
    expect(entry).toMatch(/limit:\s*\{\s*type:\s*"number"/);
  });
});
