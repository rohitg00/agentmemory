import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("viewer SSE proxy", () => {
  it("forwards upstream chunks as they arrive and propagates client disconnection", () => {
    const server = readFileSync("src/viewer/server.ts", "utf8");
    const start = server.indexOf('if (pathname === "/agentmemory/viewer/events")');
    const end = server.indexOf("const controller = new AbortController()", start);
    const branch = server.slice(start, end);
    expect(server.slice(0, server.indexOf("async function proxyToRestApi"))).toContain("request as httpRequest");
    expect(branch).toContain("upstream.on(\"data\"");
    expect(branch).toContain("res.write(chunk)");
    expect(branch).toContain("upstream.pause()");
    expect(branch).toContain("upstream.resume()");
    expect(branch).toContain("res.once(\"close\", abortUpstream)");
    expect(branch).toContain("req.once(\"aborted\", abortUpstream)");
    expect(branch).not.toContain("upstream.text()");
    expect(branch).not.toContain("10000");
  });
});
