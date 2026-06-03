const DEFAULT_REST_PORT = 3111;

function parsePort(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function setIfUnset(env: NodeJS.ProcessEnv, key: string, value: number | string): void {
  if (!env[key]) env[key] = String(value);
}

export function configuredRuntimePorts(env: NodeJS.ProcessEnv = process.env): {
  restPort: number;
  streamPort: number;
  enginePort: number;
} {
  const restPort = parsePort(env["III_REST_PORT"]) ?? DEFAULT_REST_PORT;
  return {
    restPort,
    streamPort:
      parsePort(env["III_STREAMS_PORT"]) ??
      parsePort(env["III_STREAM_PORT"]) ??
      restPort + 1,
    enginePort:
      parsePort(env["III_ENGINE_PORT"]) ??
      parsePort(env["III_PORT"]) ??
      (() => {
        try {
          const port = new URL(env["III_ENGINE_URL"] || "").port;
          return parsePort(port) ?? restPort + 3;
        } catch {
          return restPort + 3;
        }
      })(),
  };
}

export function applyPortFlag(args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const portIdx = args.indexOf("--port");
  if (portIdx === -1 || !args[portIdx + 1]) return;

  const restPort = parsePort(args[portIdx + 1]);
  if (!restPort) return;

  env["III_REST_PORT"] = String(restPort);

  if (restPort === DEFAULT_REST_PORT) return;

  const streamPort = restPort + 1;
  const viewerPort = restPort + 2;
  const enginePort = restPort + 3;
  if (enginePort > 65535) return;

  setIfUnset(env, "III_STREAMS_PORT", streamPort);
  setIfUnset(env, "III_STREAM_PORT", streamPort);
  setIfUnset(env, "AGENTMEMORY_VIEWER_PORT", viewerPort);
  setIfUnset(env, "III_VIEWER_PORT", viewerPort);
  setIfUnset(env, "III_PORT", enginePort);
  setIfUnset(env, "III_ENGINE_PORT", enginePort);
  setIfUnset(env, "III_ENGINE_URL", `ws://localhost:${enginePort}`);
}

export function renderRuntimeIiiConfig(
  config: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { restPort, streamPort, enginePort } = configuredRuntimePorts(env);
  let currentWorker = "";
  let sawTopLevelPort = false;

  const lines = config.split(/\r?\n/).map((line) => {
    const worker = line.match(/^\s*-\s+name:\s*([A-Za-z0-9_-]+)\s*$/);
    if (worker) currentWorker = worker[1];

    if (/^port:\s*\d+\s*$/.test(line)) {
      sawTopLevelPort = true;
      return `port: ${enginePort}`;
    }

    if (/^\s+port:\s*\d+\s*$/.test(line)) {
      if (currentWorker === "iii-http") {
        return line.replace(/\d+/, String(restPort));
      }
      if (currentWorker === "iii-stream") {
        return line.replace(/\d+/, String(streamPort));
      }
    }
    return line;
  });

  if (!sawTopLevelPort) lines.unshift(`port: ${enginePort}`, "");
  return lines.join("\n");
}
