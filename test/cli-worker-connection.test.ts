import { describe, expect, it, vi } from "vitest";
import { engineOnlyLines, probeWorkerConnection } from "../src/cli/worker-connection.js";

function fakeFetch(routes: Record<string, number | Error>) {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const result = routes[path];
    if (result instanceof Error || result === undefined) throw result ?? new Error("connection refused");
    return { status: result, body: null };
  });
}

describe("probeWorkerConnection", () => {
  const base = "http://localhost:3111";

  it("reports engine-only when the engine returns 404 for the agentmemory routes", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 404, "/agentmemory/health": 404 });
    expect(await probeWorkerConnection(base, {}, 500, fetchImpl)).toBe("engine-only");
  });

  it("reports connected when the worker answers", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 200, "/agentmemory/health": 200 });
    expect(await probeWorkerConnection(base, {}, 500, fetchImpl)).toBe("connected");
  });

  it("treats an auth rejection as a connected worker", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 401, "/agentmemory/health": 401 });
    expect(await probeWorkerConnection(base, {}, 500, fetchImpl)).toBe("connected");
  });

  it("does not report engine-only when only one route is missing", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 404, "/agentmemory/health": 200 });
    expect(await probeWorkerConnection(base, {}, 500, fetchImpl)).toBe("connected");
  });

  it("reports unreachable when nothing answers", async () => {
    const fetchImpl = fakeFetch({});
    expect(await probeWorkerConnection(base, {}, 500, fetchImpl)).toBe("unreachable");
  });

  it("sends the given headers to both routes", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 200, "/agentmemory/health": 200 });
    await probeWorkerConnection(base, { Authorization: "Bearer x" }, 500, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>) {
      expect(call[1].headers).toEqual({ Authorization: "Bearer x" });
    }
  });
});

describe("engineOnlyLines", () => {
  it("explains the state, the start command and old Docker images", () => {
    const text = engineOnlyLines("http://localhost:3111").join("\n");
    expect(text).toContain("iii engine is running at http://localhost:3111");
    expect(text).toContain("agentmemory worker is not connected");
    expect(text).toContain("npx -y @agentmemory/agentmemory@latest");
    expect(text).toContain("Docker");
  });
});
