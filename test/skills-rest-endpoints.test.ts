import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectRestEndpoints } from "../scripts/skills/rest-endpoints.js";

describe("generated REST endpoint methods", () => {
  it("associates adjacent status and mutation routes with their own methods", () => {
    const source = readFileSync(new URL("../src/triggers/api.ts", import.meta.url), "utf8");
    expect(collectRestEndpoints(source).filter(({ path }) => path.startsWith("/agentmemory/graph/index"))).toEqual([
      { path: "/agentmemory/graph/index", method: "GET" },
      { path: "/agentmemory/graph/index/migrate", method: "POST" },
      { path: "/agentmemory/graph/index/resume", method: "POST" },
    ]);
  });

  it("includes the viewer SSE route registered outside api.ts", () => {
    const api = readFileSync(new URL("../src/triggers/api.ts", import.meta.url), "utf8");
    const viewerSse = readFileSync(new URL("../src/triggers/viewer-sse.ts", import.meta.url), "utf8");
    expect(collectRestEndpoints(api, viewerSse)).toContainEqual({
      path: "/agentmemory/viewer/events",
      method: "GET",
    });
  });

  it("handles either property order and ignores neighboring methods, comments and strings", () => {
    const source = `
      // api_path: "/comment", http_method: "DELETE"
      const example = 'api_path: "/string", http_method: "DELETE"';
      sdk.registerTrigger({ type: "http", config: { http_method: "GET", api_path: "/first" } });
      sdk.registerTrigger({ type: "http", config: { api_path: "/second", metadata: { http_method: "DELETE" },
        /* ${"spacing".repeat(40)} */ http_method: "POST" } });
      sdk.registerTrigger({ type: "http", config: { "api_path": '/third', "http_method": 'PATCH' } });
      sdk.registerTrigger({ type: "cron", config: { api_path: "/not-http", http_method: "GET" } });
    `;
    expect(collectRestEndpoints(source)).toEqual([
      { path: "/first", method: "GET" },
      { path: "/second", method: "POST" },
      { path: "/third", method: "PATCH" },
    ]);
  });

  it("deduplicates method/path pairs while preserving multiple methods for the same route", () => {
    const source = `
      sdk.registerTrigger({ type: "http", config: { api_path: "/shared", http_method: "POST" } });
      sdk.registerTrigger({ type: "http", config: { api_path: "/shared", http_method: "GET" } });
      sdk.registerTrigger({ type: "http", config: { api_path: "/shared", http_method: "POST" } });
    `;
    expect(collectRestEndpoints(source)).toEqual([
      { path: "/shared", method: "GET" },
      { path: "/shared", method: "POST" },
    ]);
  });
});
