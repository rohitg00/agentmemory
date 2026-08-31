import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// #666: api::session::end must publish the session-stopped lifecycle so
// summarize + slot-reflect + graph extraction actually fire. Before this
// fix the `event::session::stopped` handler in events.ts was a dead
// subscriber — no code published `agentmemory.session.stopped`, so graph
// nodes / lessons / crystals never materialized despite the handler
// existing. Direct fire-and-forget trigger keeps the HTTP response fast
// (kv.update runs synchronously, downstream pipeline fan-outs without
// blocking).
describe("api::session::end → event::session::stopped (#666)", () => {
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

// #666: viewer's "Build Graph" button used to POST /agentmemory/graph/build
// which returned 404 because the endpoint was never registered. Backfill
// the knowledge graph from existing compressed observations across every
// session in batches.
describe("api::graph-build endpoint (#666)", () => {
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

// #666: `agentmemory status` showed Memories/Observations as 0 because it
// fetched /agentmemory/export which times out on iii-engine's file-based
// KV under concurrent kv.list() pressure. Switch to /memories for the
// memory count and derive observation count from sessions[].observationCount.
describe("agentmemory status no longer depends on /export (#666)", () => {
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
