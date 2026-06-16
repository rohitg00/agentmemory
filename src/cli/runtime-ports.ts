const DEFAULT_REST_PORT = 3111;
const MAX_PORT = 65535;

type RuntimePortEnv = Partial<Record<string, string>>;

export type RuntimePorts = {
  restPort: number;
  streamPort: number;
  viewerPort: number;
  enginePort: number;
};

function parsePort(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) return null;
  return port;
}

function parseRestAnchor(value: string | undefined): number | null {
  const port = parsePort(value);
  if (!port || !parsePort(String(port + 2))) return null;
  return port;
}

function setIfUnset(env: RuntimePortEnv, key: string, value: number | string): void {
  if (!env[key]) env[key] = String(value);
}

function parseEngineUrlPort(value: string | undefined): number | null {
  if (!value) return null;
  try {
    return parsePort(new URL(value).port);
  } catch {
    return null;
  }
}

export function configuredRuntimePorts(env: RuntimePortEnv = process.env): RuntimePorts {
  const restPort = parseRestAnchor(env["III_REST_PORT"]) ?? DEFAULT_REST_PORT;
  const enginePort =
    parsePort(env["III_ENGINE_PORT"]) ??
    parseEngineUrlPort(env["III_ENGINE_URL"]) ??
    49134;

  return {
    restPort,
    streamPort:
      parsePort(env["III_STREAM_PORT"]) ??
      parsePort(env["III_STREAMS_PORT"]) ??
      restPort + 1,
    viewerPort:
      parsePort(env["AGENTMEMORY_VIEWER_PORT"]) ??
      parsePort(env["III_VIEWER_PORT"]) ??
      restPort + 2,
    enginePort,
  };
}

export function applyRuntimePortArgs(
  args: string[],
  env: RuntimePortEnv = process.env,
): void {
  const restPort = parsePort(runtimePortArg(args) ?? undefined);
  if (!restPort) return;
  const streamPort =
    parsePort(env["III_STREAM_PORT"]) ??
    parsePort(env["III_STREAMS_PORT"]) ??
    parsePort(String(restPort + 1));
  const viewerPort =
    parsePort(env["AGENTMEMORY_VIEWER_PORT"]) ??
    parsePort(env["III_VIEWER_PORT"]) ??
    parsePort(String(restPort + 2));
  if (!streamPort || !viewerPort) return;

  env["III_REST_PORT"] = String(restPort);

  setIfUnset(env, "III_STREAM_PORT", streamPort);
  setIfUnset(env, "III_STREAMS_PORT", streamPort);
  setIfUnset(env, "AGENTMEMORY_VIEWER_PORT", viewerPort);
  setIfUnset(env, "III_VIEWER_PORT", viewerPort);
}

function runtimePortArg(args: string[]): string | null {
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) return args[portIdx + 1] ?? null;

  const instanceIdx = args.indexOf("--instance");
  if (instanceIdx !== -1 && args[instanceIdx + 1]) {
    return instancePortArg(args[instanceIdx + 1]);
  }

  return null;
}

function instancePortArg(value: string | undefined): string | null {
  const instance = Number(value);
  if (!Number.isInteger(instance) || instance < 0 || instance > 50) return null;
  return String(DEFAULT_REST_PORT + instance * 100);
}

export function renderRuntimeIiiConfig(
  config: string,
  env: RuntimePortEnv = process.env,
): string {
  const ports = configuredRuntimePorts(env);
  let currentWorker = "";

  const lines = config.split(/\r?\n/).flatMap((line) => {
    const worker = line.match(/^\s*-\s+name:\s*([A-Za-z0-9_-]+)\s*$/);
    if (worker) currentWorker = worker[1] ?? "";

    if (/^port:\s*\d+\s*$/.test(line)) {
      return [];
    }

    if (currentWorker === "iii-http" && /^\s+allowed_origins:\s*\[.*\]\s*$/.test(line)) {
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return `${indent}allowed_origins: [${allowedOrigins(ports).map((origin) => `"${origin}"`).join(", ")}]`;
    }

    if (/^\s+port:\s*\d+\s*$/.test(line)) {
      if (currentWorker === "iii-http") {
        return line.replace(/\d+/, String(ports.restPort));
      }
      if (currentWorker === "iii-stream") {
        return line.replace(/\d+/, String(ports.streamPort));
      }
    }

    return [line];
  });

  return lines.join("\n").replace(/^\n+/, "");
}

function allowedOrigins(ports: RuntimePorts): string[] {
  return [
    `http://localhost:${ports.restPort}`,
    `http://localhost:${ports.viewerPort}`,
    `http://127.0.0.1:${ports.restPort}`,
    `http://127.0.0.1:${ports.viewerPort}`,
  ];
}
