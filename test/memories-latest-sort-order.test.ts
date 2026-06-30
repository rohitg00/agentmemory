import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// api::memories returned rows in KV-insertion order (oldest first), so
// `?latest=true&limit=N` served the N OLDEST "latest" memories and the viewer
// showed stale data once the corpus exceeded the limit (#990). The handler now
// sorts newest-first (createdAt desc, fallback updatedAt) before it slices,
// mirroring the viewer-side fix that already landed for the Memories tab
// (#674/#701).
//
// Like the other api::memories tests in this repo, this asserts on the handler
// source: the SDK-registered handler is not invoked in isolation here, so the
// guard is that the sort exists, uses the agreed keys, and runs BEFORE the
// slice (slicing an unsorted list is the bug).
describe("api::memories sorts newest first before pagination (#990)", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");
  const start = api.indexOf('registerFunction("api::memories"');
  const end = api.indexOf('config: { api_path: "/agentmemory/memories"');
  const handler = api.slice(start, end);

  it("isolates the api::memories handler source", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("sorts filtered memories before the offset/limit slice", () => {
    const sortIdx = handler.search(/filtered\.sort\(/);
    const sliceIdx = handler.search(/filtered\.slice\(offset/);
    expect(sortIdx).toBeGreaterThan(-1);
    expect(sliceIdx).toBeGreaterThan(-1);
    // Slicing before sorting is the #990 bug — the sort must come first.
    expect(sortIdx).toBeLessThan(sliceIdx);
  });

  it("sorts on createdAt desc with updatedAt fallback (matches the #701 viewer fix)", () => {
    expect(handler).toMatch(/a\.createdAt \|\| a\.updatedAt/);
    expect(handler).toMatch(/b\.createdAt \|\| b\.updatedAt/);
    expect(handler).toMatch(/localeCompare/);
  });
});
