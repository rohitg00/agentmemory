import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  engineOnlyLines,
  probeWorkerConnection,
  shellArg,
  tcpPortOpen,
  unrecognizedServiceLines,
} from "../src/cli/worker-connection.js";

function fakeFetch(routes: Record<string, number | Error>) {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const result = routes[path];
    if (result instanceof Error || result === undefined) throw result ?? new Error("connection refused");
    return { status: result, body: null };
  });
}

const busUp = async () => true;
const busDown = async () => false;

describe("probeWorkerConnection", () => {
  const base = "http://localhost:3111";

  it("reports engine-only when both routes return 404 and the engine bus answers", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 404, "/agentmemory/health": 404 });
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable: busUp })).toBe("engine-only");
  });

  it("reports an unrecognized service when both routes return 404 and no engine bus answers", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 404, "/agentmemory/health": 404 });
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable: busDown })).toBe("unrecognized");
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl })).toBe("unrecognized");
  });

  it("reports an unrecognized service when the engine bus check throws", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 404, "/agentmemory/health": 404 });
    const engineBusReachable = async () => { throw new Error("bad url"); };
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable })).toBe("unrecognized");
  });

  it("reports connected when the worker answers", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 200, "/agentmemory/health": 200 });
    const engineBusReachable = vi.fn(busUp);
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable })).toBe("connected");
    expect(engineBusReachable).not.toHaveBeenCalled();
  });

  it("treats an auth rejection as a connected worker", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 401, "/agentmemory/health": 401 });
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl })).toBe("connected");
  });

  it("does not report engine-only when only one route is missing", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 404, "/agentmemory/health": 200 });
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable: busUp })).toBe("connected");
  });

  it("checks the engine bus when one route returns 404 and the other request fails", async () => {
    for (const routes of [
      { "/agentmemory/livez": 404 },
      { "/agentmemory/health": 404 },
    ]) {
      const fetchImpl = fakeFetch(routes);
      expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable: busUp })).toBe("engine-only");
      expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl, engineBusReachable: busDown })).toBe("unrecognized");
    }
  });

  it("reports connected when one route answers and the other request fails", async () => {
    for (const routes of [
      { "/agentmemory/livez": 200 },
      { "/agentmemory/health": 200 },
    ]) {
      expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl: fakeFetch(routes) })).toBe("connected");
    }
  });

  it("reports unreachable when nothing answers", async () => {
    const fetchImpl = fakeFetch({});
    expect(await probeWorkerConnection(base, { timeoutMs: 500, fetchImpl })).toBe("unreachable");
  });

  it("sends the given headers to both routes", async () => {
    const fetchImpl = fakeFetch({ "/agentmemory/livez": 200, "/agentmemory/health": 200 });
    await probeWorkerConnection(base, { headers: { Authorization: "Bearer x" }, timeoutMs: 500, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>) {
      expect(call[1].headers).toEqual({ Authorization: "Bearer x" });
    }
  });
});

describe("tcpPortOpen", () => {
  let server: Server | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
  });

  it("reports an open and a closed port", async () => {
    server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    expect(await tcpPortOpen("127.0.0.1", port, 500)).toBe(true);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    expect(await tcpPortOpen("127.0.0.1", port, 500)).toBe(false);
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

  it("uses the given start command so recovery keeps the selected port", () => {
    const text = engineOnlyLines("http://localhost:4111", "npx -y @agentmemory/agentmemory@latest --port 4111").join("\n");
    expect(text).toContain("start agentmemory with: npx -y @agentmemory/agentmemory@latest --port 4111.");
  });
});

describe("unrecognizedServiceLines", () => {
  it("does not claim an iii engine and does not tell the user to stop the service", () => {
    const text = unrecognizedServiceLines("http://localhost:3111").join("\n");
    expect(text).toContain("A server answers at http://localhost:3111, but agentmemory does not.");
    expect(text).not.toContain("iii engine is running");
    expect(text).not.toContain("Stop the process");
    expect(text).toContain("--port <N>");
  });

  it("points old Docker images that keep the engine port internal at the migration guide", () => {
    const text = unrecognizedServiceLines("http://localhost:3111").join("\n");
    expect(text).toContain("legacy CLI Docker mode");
    expect(text).toContain("#migrating-from-the-legacy-cli-docker-mode");
  });
});

describe("shellArg", () => {
  it("leaves plain paths unquoted", () => {
    expect(shellArg("/home/alice/data", "linux")).toBe("/home/alice/data");
    expect(shellArg("C:\\Users\\alice\\data", "win32")).toBe("C:\\Users\\alice\\data");
  });

  it("quotes apostrophes, backslashes, spaces and dollar signs for POSIX shells", () => {
    expect(shellArg("/home/alice/O'Reilly", "darwin")).toBe(`'/home/alice/O'"'"'Reilly'`);
    expect(shellArg("/tmp/a b", "linux")).toBe("'/tmp/a b'");
    expect(shellArg("/tmp/a\\b", "linux")).toBe("'/tmp/a\\b'");
    expect(shellArg("/tmp/$HOME", "linux")).toBe("'/tmp/$HOME'");
  });

  it("single-quotes Windows paths for PowerShell so apostrophes and dollar signs stay literal", () => {
    expect(shellArg("C:\\Users\\O'Reilly\\my data", "win32")).toBe(`'C:\\Users\\O''Reilly\\my data'`);
    expect(shellArg("C:\\data\\$archive", "win32")).toBe(`'C:\\data\\$archive'`);
  });

  it("drops trailing Windows separators so no backslash precedes a closing quote", () => {
    expect(shellArg("C:\\my data\\", "win32")).toBe(`'C:\\my data'`);
    expect(shellArg("C:\\data\\", "win32")).toBe("C:\\data");
    expect(shellArg("C:\\", "win32")).toBe("C:\\");
  });
});
