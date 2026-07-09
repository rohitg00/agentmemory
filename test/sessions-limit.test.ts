import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// GET /agentmemory/sessions and GET /agentmemory/replay/sessions must
// accept a `limit` query param so the viewer and CLI can page through
// large session tables without forcing the engine to ship every
// record on every request (#1022).
//
// Source-level assertions: the HTTP endpoint is defined inside a
// single big registerFunction call and spinning up the iii engine
// just to test a query param is out of scope for this fix.
describe("sessions endpoint limit query param (#1022)", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");

  it("api::sessions uses parsePositiveLimit for the limit query param", () => {
    expect(api).toMatch(
      /sdk\.registerFunction\(\s*"api::sessions"[\s\S]*?parsePositiveLimit\(req\.query_params\?\.\["limit"\]\)/,
    );
  });

  it("api::sessions slices filtered before summary lookups", () => {
    expect(api).toMatch(
      /sdk\.registerFunction\(\s*"api::sessions"[\s\S]*?sliced\.map\([\s\S]*?kv\.get/,
    );
  });

  it("api::sessions falls back to full list when limit is missing or invalid", () => {
    expect(api).toMatch(
      /sdk\.registerFunction\(\s*"api::sessions"[\s\S]*?limit !== undefined \? filtered\.slice/,
    );
  });

  it("api::replay::sessions also honours limit (companion fix)", () => {
    expect(api).toMatch(
      /sdk\.registerFunction\(\s*"api::replay::sessions"[\s\S]*?parsePositiveLimit\(req\.query_params\?\.\["limit"\]\)/,
    );
    expect(api).toMatch(
      /sdk\.registerFunction\(\s*"api::replay::sessions"[\s\S]*?sessions\.slice\(0,\s*limit\)/,
    );
  });

  it("api::replay::sessions falls back to full list when limit is missing or invalid", () => {
    expect(api).toMatch(
      /sdk\.registerFunction\(\s*"api::replay::sessions"[\s\S]*?limit !== undefined \? sessions\.slice/,
    );
  });

  it("parsePositiveLimit helper is defined and delegates to parseOptionalInt", () => {
    expect(api).toMatch(
      /function parsePositiveLimit\(raw: unknown\): number \| undefined/,
    );
    expect(api).toMatch(
      /parsePositiveLimit[\s\S]*?parseOptionalInt\(raw\)/,
    );
  });
});