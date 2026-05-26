import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// /memories and /export must support count + pagination so the
// viewer and `agentmemory status` work on large corpora (8K+ memories)
// without timing out at the iii engine boundary.
describe("memories + export pagination (#544)", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");

  it("api::memories accepts count=true and returns total + latestCount", () => {
    expect(api).toMatch(/req\.query_params\?\.\["count"\]\s*===\s*"true"/);
    // count must report the SAME scope as the list path (#554 follow-up).
    expect(api).toMatch(/total:\s*filtered\.length/);
    expect(api).toMatch(/latestCount:\s*filtered\.filter/);
  });

  it("api::memories accepts limit + offset query params", () => {
    expect(api).toMatch(/query_params\?\.\["limit"\]/);
    expect(api).toMatch(/query_params\?\.\["offset"\]/);
    expect(api).toMatch(/filtered\.slice\(offset/);
    expect(api).toMatch(/total:\s*filtered\.length/);
  });

  it("api::memories caps limit at 5000 to bound response size", () => {
    expect(api).toMatch(/Math\.min\(parsedLimit,\s*5000\)/);
  });

  it("api::export passes through maxSessions + offset query params", () => {
    expect(api).toMatch(/query_params\?\.\["maxSessions"\]/);
    expect(api).toMatch(/query_params\?\.\["offset"\]/);
    // The payload object is named `payload` in our handler; assert it is
    // forwarded to mem::export rather than the previous empty object.
    expect(api).toMatch(
      /sdk\.trigger\(\{\s*function_id:\s*"mem::export",\s*payload,/m,
    );
  });

  it("viewer dashboard caps memories?latest fetch with limit", () => {
    const viewer = readFileSync("src/viewer/index.html", "utf-8");
    expect(viewer).toMatch(/memories\?latest=true&limit=500/);
    expect(viewer).toMatch(/memories\?latest=true&limit=2000/);
  });
});
