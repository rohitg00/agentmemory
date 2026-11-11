export type WorkerConnection = "connected" | "engine-only" | "unreachable";

type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  status: number;
  body?: { cancel(): Promise<void> } | null;
}>;

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

export async function probeWorkerConnection(
  base: string,
  headers: Record<string, string> = {},
  timeoutMs = 2000,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<WorkerConnection> {
  const [livez, health] = await Promise.all([
    routeStatus(`${base}/agentmemory/livez`, headers, timeoutMs, fetchImpl),
    routeStatus(`${base}/agentmemory/health`, headers, timeoutMs, fetchImpl),
  ]);
  if (livez === null && health === null) return "unreachable";
  if (livez === 404 && health === 404) return "engine-only";
  return "connected";
}

export const ENGINE_ONLY_DOCKER_GUIDE =
  "https://github.com/rohitg00/agentmemory/blob/main/deploy/README.md#migrating-from-the-legacy-cli-docker-mode";

export const ENGINE_ONLY_FIX =
  "Stop the process that owns this port (an old Docker container or an iii you started yourself), then start agentmemory with: npx -y @agentmemory/agentmemory@latest. For Docker, run the current image instead.";

export function engineOnlyLines(base: string): string[] {
  return [
    `The iii engine is running at ${base}, but the agentmemory worker is not connected to it.`,
    "The engine returns 404 for /agentmemory/livez and /agentmemory/health. Version, health and the viewer stay unavailable until the worker connects.",
    "Old Docker images from the legacy CLI Docker mode ran only the engine and show this state.",
    `Fix: ${ENGINE_ONLY_FIX}`,
    `Docker migration: ${ENGINE_ONLY_DOCKER_GUIDE}`,
  ];
}
