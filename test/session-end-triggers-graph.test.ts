import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("api::session::end → event::session::stopped", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");

  it("api::session::end fires event::session::stopped after kv.update", () => {
    expect(api).toMatch(
      /api::session::end[\s\S]*?kv\.update\(KV\.sessions[\s\S]*?function_id:\s*"event::session::stopped"/,
    );
  });

  it("event::session::stopped trigger payload includes sessionId", () => {
    expect(api).toMatch(
      /function_id:\s*"event::session::stopped",\s*payload:\s*\{\s*sessionId\s*\}/,
    );
  });

  it("event::session::stopped uses TriggerAction.Void for fire-and-forget", () => {
    expect(api).toMatch(
      /function_id:\s*"event::session::stopped"[\s\S]*?action:\s*TriggerAction\.Void\(\)/,
    );
  });
});

describe("api::graph-build endpoint", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");

  it("registers api::graph-build function", () => {
    expect(api).toMatch(/registerFunction\("api::graph-build"/);
  });

  it("registers HTTP trigger at /agentmemory/graph/build", () => {
    expect(api).toMatch(
      /api_path:\s*"\/agentmemory\/graph\/build",\s*http_method:\s*"POST"/,
    );
  });

  it("iterates sessions and calls mem::graph-extract", () => {
    expect(api).toMatch(/kv\.list<Session>\(KV\.sessions\)/);
    expect(api).toMatch(/kv\.list<CompressedObservation>\(KV\.observations\(sid\)\)/);
    expect(api).toMatch(
      /sdk\.trigger\(\{\s*function_id:\s*"mem::graph-extract"/,
    );
  });

  it("filters observations that have a title (compressed only)", () => {
    expect(api).toMatch(/typeof o\.title === "string" && o\.title\.length > 0/);
  });

  it("respects batchSize override with a 100-item upper bound", () => {
    expect(api).toMatch(/Math\.min\(100,\s*Number\(.*batchSize/);
  });

  it("response shape matches what the viewer expects (success + nodes)", () => {
    expect(api).toMatch(/success:\s*true,\s*sessions:[\s\S]*?nodes:\s*totalNodes/);
  });
});

describe("agentmemory status no longer depends on /export", () => {
  const cli = readFileSync("src/cli.ts", "utf-8");

  it("status uses count-only memories endpoint instead of export", () => {
    expect(cli).toMatch(/apiFetch<any>\(base,\s*"memories\?count=true"\)/);
    expect(cli).not.toMatch(/apiFetch<any>\(base,\s*"export"\)/);
  });

  it("status derives obsCount from sessions[].observationCount", () => {
    expect(cli).toMatch(
      /sessionList\.reduce\([\s\S]*?observationCount/,
    );
  });

  it("status reads memCount from memoriesRes.latestCount (count endpoint)", () => {
    expect(cli).toMatch(/memoriesRes\?\.latestCount\s*\?\?\s*memoriesRes\?\.total/);
  });
});
