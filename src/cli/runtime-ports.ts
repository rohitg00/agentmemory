const DEFAULT_REST_PORT = 3111;
const MAX_PORT = 65535;

type RuntimePortEnv = Partial<Record<string, string>>;
const RUNTIME_ENV_FILE_KEYS = [
  "AGENTMEMORY_HOST",
  "AGENTMEMORY_SECRET",
  "III_REST_PORT",
  "III_STREAM_PORT",
  "III_STREAMS_PORT",
  "AGENTMEMORY_VIEWER_PORT",
  "III_VIEWER_PORT",
] as const;

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

function setIfReal(env: RuntimePortEnv, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) env[key] = trimmed;
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

export function applyRuntimeHostArgs(
  args: string[],
  env: RuntimePortEnv = process.env,
): void {
  const host = runtimeHostArg(args);
  if (!host) return;
  setIfReal(env, "AGENTMEMORY_HOST", host);
}

export function applyRuntimeEnvFileValues(
  fileEnv: RuntimePortEnv,
  env: RuntimePortEnv = process.env,
): void {
  for (const key of RUNTIME_ENV_FILE_KEYS) {
    const value = runtimeEnvValue(fileEnv[key]);
    if (value && !env[key]) {
      env[key] = value;
    }
  }
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

function runtimeHostArg(args: string[]): string | null {
  const hostIdx = args.indexOf("--host");
  if (hostIdx !== -1 && args[hostIdx + 1]) return args[hostIdx + 1] ?? null;

  const prefixed = args.find((arg) => arg.startsWith("--host="));
  if (prefixed) return prefixed.slice("--host=".length);

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
  const host = runtimeHost(env);
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

    if (
      host &&
      (currentWorker === "iii-http" || currentWorker === "iii-stream") &&
      /^\s+host:\s*\S+\s*$/.test(line)
    ) {
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return `${indent}host: ${host}`;
    }

    return [line];
  });

  return lines.join("\n").replace(/^\n+/, "");
}

function runtimeHost(env: RuntimePortEnv): string | null {
  const host = env["AGENTMEMORY_HOST"]?.trim();
  if (!host) return null;
  if (!isValidRuntimeHost(host)) {
    throw new Error(
      "AGENTMEMORY_HOST must be a hostname, IPv4 address, or IPv6 address.",
    );
  }
  return host;
}

function runtimeEnvValue(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  const commentIdx = trimmed.indexOf(" #");
  return commentIdx === -1 ? trimmed : trimmed.slice(0, commentIdx).trim();
}

export function assertRuntimeHostAllowed(env: RuntimePortEnv = process.env): void {
  const host = runtimeHost(env);
  if (!host || isLoopbackHost(host)) return;
  if (env["AGENTMEMORY_SECRET"]?.trim()) return;

  throw new Error(
    `AGENTMEMORY_HOST=${host} exposes agentmemory beyond loopback. ` +
      "Set AGENTMEMORY_SECRET before binding to a non-loopback host.",
  );
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!normalized) return true;
  if (normalized === "localhost" || normalized === "::1") return true;
  if (normalized === "0:0:0:0:0:0:0:1") return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(normalized)) return true;
  return false;
}

function isValidRuntimeHost(host: string): boolean {
  if (isValidHostname(host)) return true;
  if (isValidIpv4Host(host)) return true;
  if (/^[0-9A-Fa-f:]+$/.test(host) && host.includes(":")) return true;
  if (/^\[[0-9A-Fa-f:]+\]$/.test(host)) return true;
  return false;
}

function isValidHostname(host: string): boolean {
  if (host.length > 253 || host.includes(":")) return false;
  return host
    .split(".")
    .every((label) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
    );
}

function isValidIpv4Host(host: string): boolean {
  const parts = host.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

function allowedOrigins(ports: RuntimePorts): string[] {
  return [
    `http://localhost:${ports.restPort}`,
    `http://localhost:${ports.viewerPort}`,
    `http://127.0.0.1:${ports.restPort}`,
    `http://127.0.0.1:${ports.viewerPort}`,
  ];
}
