import { createConnection } from "node:net";

export type WorkerConnection = "connected" | "engine-only" | "unrecognized" | "unreachable";

type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  status: number;
  body?: { cancel(): Promise<void> } | null;
}>;

export type WorkerProbeOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  engineBusReachable?: () => Promise<boolean>;
};

async function routeStatus(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<number | null> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers });
    void res.body?.cancel().catch(() => {});
    return res.status;
  } catch {
    return null;
  }
}

export async function tcpPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export async function probeWorkerConnection(
  base: string,
  options: WorkerProbeOptions = {},
): Promise<WorkerConnection> {
  const headers = options.headers ?? {};
  const timeoutMs = options.timeoutMs ?? 2000;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const [livez, health] = await Promise.all([
    routeStatus(`${base}/agentmemory/livez`, headers, timeoutMs, fetchImpl),
    routeStatus(`${base}/agentmemory/health`, headers, timeoutMs, fetchImpl),
  ]);
  if (livez === null && health === null) return "unreachable";
  const answered = (status: number | null) => status !== null && status !== 404;
  if (answered(livez) || answered(health)) return "connected";
  const busReachable = options.engineBusReachable
    ? await options.engineBusReachable().catch(() => false)
    : false;
  return busReachable ? "engine-only" : "unrecognized";
}

export const DEFAULT_START_COMMAND = "npx -y @agentmemory/agentmemory@latest";

export const ENGINE_ONLY_DOCKER_GUIDE =
  "https://github.com/rohitg00/agentmemory/blob/main/deploy/README.md#migrating-from-the-legacy-cli-docker-mode";

export function engineOnlyFix(startCommand = DEFAULT_START_COMMAND): string {
  return `Stop the process that owns this port (an old Docker container or an iii you started yourself), then start agentmemory with: ${startCommand}. For Docker, run the current image instead.`;
}

export function shellArg(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return /^[A-Za-z0-9._:\\/-]+$/.test(value) ? value : `"${value}"`;
  if (/^[A-Za-z0-9._:/@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export const UNRECOGNIZED_DOCKER_NOTE =
  `Old Docker images from the legacy CLI Docker mode keep the engine port inside the container and also show this state. Docker migration: ${ENGINE_ONLY_DOCKER_GUIDE}`;

export const UNRECOGNIZED_SERVICE_FIX =
  `Check that AGENTMEMORY_URL or --port points at agentmemory. If another program owns this port, start agentmemory on a free port with: ${DEFAULT_START_COMMAND} --port <N>.`;

export function engineOnlyLines(base: string, startCommand = DEFAULT_START_COMMAND): string[] {
  return [
    `The iii engine is running at ${base}, but the agentmemory worker is not connected to it.`,
    "The engine returns 404 for /agentmemory/livez and /agentmemory/health. Version, health and the viewer stay unavailable until the worker connects.",
    "Old Docker images from the legacy CLI Docker mode ran only the engine and show this state.",
    `Fix: ${engineOnlyFix(startCommand)}`,
    `Docker migration: ${ENGINE_ONLY_DOCKER_GUIDE}`,
  ];
}

export function unrecognizedServiceLines(base: string): string[] {
  return [
    `A server answers at ${base}, but agentmemory does not.`,
    "It returns 404 for /agentmemory/livez and /agentmemory/health, and the iii engine port does not answer. It can be another program on this port, or a remote iii engine without the agentmemory worker.",
    UNRECOGNIZED_DOCKER_NOTE,
    `Fix: ${UNRECOGNIZED_SERVICE_FIX}`,
  ];
}
