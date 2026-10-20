export interface ConsoleLaunch {
  iiiBin: string;
  consolePort: number;
  restPort: number;
  streamPort: number;
  enginePort: number;
  extraArgs: string[];
}

const GLOBAL_VALUE_FLAGS = new Set(["--port", "--instance", "--data-dir", "--tools"]);
const GLOBAL_BOOLEAN_FLAGS = new Set(["--verbose", "-v", "--no-engine"]);

export function defaultConsolePort(viewerPort: number): number {
  return viewerPort + 1;
}

function readPort(raw: string | undefined, flag: string): number {
  const port = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${flag} needs a port between 1 and 65535`);
  }
  return port;
}

export function parseConsoleArgs(
  tail: string[],
  fallbackPort: number,
): { consolePort: number; extraArgs: string[] } {
  let consolePort = fallbackPort;
  const extraArgs: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const arg = tail[i]!;
    if (arg === "--console-port") {
      consolePort = readPort(tail[i + 1], arg);
      i++;
      continue;
    }
    if (arg.startsWith("--console-port=")) {
      consolePort = readPort(arg.slice("--console-port=".length), "--console-port");
      continue;
    }
    if (GLOBAL_VALUE_FLAGS.has(arg)) {
      i++;
      continue;
    }
    if ([...GLOBAL_VALUE_FLAGS].some((flag) => arg.startsWith(`${flag}=`))) continue;
    if (GLOBAL_BOOLEAN_FLAGS.has(arg)) continue;
    extraArgs.push(arg);
  }
  return { consolePort, extraArgs };
}

export function consoleArgs(launch: ConsoleLaunch): string[] {
  return [
    "console",
    "--port",
    String(launch.consolePort),
    "--engine-port",
    String(launch.restPort),
    "--ws-port",
    String(launch.streamPort),
    "--bridge-port",
    String(launch.enginePort),
    ...launch.extraArgs,
  ];
}
