type ReadyHintEnv = Partial<Record<string, string>>;

type ReadyWebSocketOptions = {
  restPort: number;
  env?: ReadyHintEnv;
};

export function buildReadyWebSocketUrls({
  restPort,
  env = process.env,
}: ReadyWebSocketOptions): { streamUrl: string; engineUrl: string } {
  const host = getEngineHost(env);
  const scheme = getEngineScheme(env);
  return {
    streamUrl: joinWebSocketUrl(scheme, host, getStreamPort(restPort, env)),
    engineUrl: joinWebSocketUrl(scheme, host, getEnginePort(restPort, env)),
  };
}

function getStreamPort(restPort: number, env: ReadyHintEnv): number {
  return (
    parseInt(env["III_STREAM_PORT"] || "", 10) ||
    parseInt(env["III_STREAMS_PORT"] || "", 10) ||
    restPort + 1
  );
}

function getEnginePort(restPort: number, env: ReadyHintEnv): number {
  const explicit = parseInt(env["III_ENGINE_PORT"] || "", 10);
  if (explicit) return explicit;
  const url = env["III_ENGINE_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return restPort + 46023;
}

function getEngineHost(env: ReadyHintEnv): string {
  for (const envKey of ["III_ENGINE_URL", "AGENTMEMORY_URL"]) {
    const raw = env[envKey];
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.hostname) return parsed.hostname;
    } catch {}
  }
  return "localhost";
}

function getEngineScheme(env: ReadyHintEnv): "ws" | "wss" {
  const raw = env["III_ENGINE_URL"];
  if (!raw) return "ws";
  try {
    return new URL(raw).protocol === "wss:" ? "wss" : "ws";
  } catch {
    return "ws";
  }
}

function joinWebSocketUrl(scheme: "ws" | "wss", host: string, port: number): string {
  return `${scheme}${"://"}${host}:${port}`;
}
