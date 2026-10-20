import { statSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_ENGINE_TIMEOUT_MS = 120_000;
export const DEFAULT_WORKER_TIMEOUT_MS = 300_000;
export const MAX_STARTUP_TIMEOUT_MS = 3_600_000;

export function startupTimeouts(env: NodeJS.ProcessEnv = process.env): {
  engineMs: number;
  workerMs: number;
  engineManagesWorker: boolean | undefined;
} {
  const parse = (key: string, fallback: number): number => {
    const raw = env[key];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > MAX_STARTUP_TIMEOUT_MS) {
      throw new Error(`${key} must be an integer between 1 and ${MAX_STARTUP_TIMEOUT_MS} milliseconds.`);
    }
    return value;
  };
  const ownership = env.AGENTMEMORY_ENGINE_MANAGES_WORKER;
  if (ownership !== undefined && ownership !== "true" && ownership !== "false") {
    throw new Error("AGENTMEMORY_ENGINE_MANAGES_WORKER must be true or false.");
  }
  return {
    engineMs: parse("AGENTMEMORY_ENGINE_READY_TIMEOUT_MS", DEFAULT_ENGINE_TIMEOUT_MS),
    workerMs: parse("AGENTMEMORY_READY_TIMEOUT_MS", DEFAULT_WORKER_TIMEOUT_MS),
    engineManagesWorker: ownership === undefined ? undefined : ownership === "true",
  };
}

export function configStartsAgentmemoryWorker(raw: string, workerEntry: string, engineCwd?: string): boolean {
  const lines = raw.split(/\r?\n/);
  let workerIndent: number | undefined;
  let execIndent: number | undefined;
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (workerIndent !== undefined && indent <= workerIndent) {
      workerIndent = undefined;
      execIndent = undefined;
    }
    if (/^\s*-\s+name:\s*(?:iii-exec|"iii-exec"|'iii-exec')(?:\s+#.*)?\s*$/.test(line)) {
      workerIndent = indent;
      continue;
    }
    if (workerIndent === undefined) continue;
    if (execIndent !== undefined && indent <= execIndent) execIndent = undefined;
    if (/^\s*exec:\s*(?:#.*)?$/.test(line)) {
      execIndent = indent;
      continue;
    }
    if (execIndent === undefined) continue;
    const scalar = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim();
    if (!scalar) continue;
    const quoted = scalar.match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
    const command = quoted ? quoted[2]! : scalar;
    const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((token) => token.replace(/^("|')(.*)\1$/, "$2").replaceAll("\\", "/"));
    if (!tokens) continue;
    const comment = tokens.findIndex((token) => token.startsWith("#"));
    if (comment !== -1) tokens.splice(comment);
    const runtime = tokens[0]?.split("/").at(-1);
    if (runtime !== "node" && runtime !== "node.exe" && runtime !== "tsx") continue;
    if (runtime !== "tsx") {
      while (tokens[1] && /^(?:--max[-_]old[-_]space[-_]size=\d+|--enable-source-maps|--no-warnings)$/.test(tokens[1])) tokens.splice(1, 1);
    }
    const entry = tokens.length === 2
      ? tokens[1]
      : tokens.length === 4 && tokens[1] === "--import" && tokens[2] === "tsx" ? tokens[3] : undefined;
    if (entry === workerEntry.replaceAll("\\", "/")) return true;
    if (entry === "dist/index.mjs" || entry === "./dist/index.mjs" || entry === "src/index.ts" || entry === "./src/index.ts") {
      if (engineCwd === undefined) return true;
      try {
        if (statSync(join(engineCwd, entry)).isFile()) return true;
      } catch {}
    }
  }
  return false;
}

export function startupTimeoutMessage(kind: "engine" | "worker", timeoutMs: number): string {
  const name = kind === "engine" ? "iii-engine" : "agentmemory worker";
  const variable = kind === "engine" ? "AGENTMEMORY_ENGINE_READY_TIMEOUT_MS" : "AGENTMEMORY_READY_TIMEOUT_MS";
  return `${name} did not become ready within ${timeoutMs / 1000}s. Set ${variable} to allow more startup time.`;
}

export interface StartupDeadline {
  remaining(): number;
}

export function startupDeadline(timeoutMs: number): StartupDeadline {
  const deadline = performance.now() + timeoutMs;
  return { remaining: () => Math.max(0, deadline - performance.now()) };
}

export async function withinStartupDeadline<T>(
  deadline: StartupDeadline,
  work: (signal: AbortSignal) => Promise<T>,
  maximumMs = Infinity,
): Promise<{ completed: true; value: T } | { completed: false }> {
  const remaining = Math.min(deadline.remaining(), maximumMs);
  if (remaining <= 0) return { completed: false };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<{ completed: false }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ completed: false });
    }, Math.ceil(remaining));
  });
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => work(controller.signal)).then((value) => ({ completed: true as const, value })),
      expired,
    ]);
    return deadline.remaining() > 0 ? result : { completed: false };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function waitForReadiness(
  deadline: StartupDeadline,
  probe: (signal: AbortSignal) => Promise<boolean>,
  options: { intervalMs?: number; stopped?: () => boolean } = {},
): Promise<boolean> {
  while (deadline.remaining() > 0 && !options.stopped?.()) {
    const result = await withinStartupDeadline(deadline, probe, 2000).catch(() => ({ completed: false as const }));
    if (options.stopped?.()) return false;
    if (result.completed && result.value) return true;
    const remaining = deadline.remaining();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(options.intervalMs ?? 250, remaining)));
  }
  return false;
}

export async function probeEngine(base: string, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${base}/`, { signal });
  void response.body?.cancel().catch(() => {});
  // The engine's root path is normally 404 until the worker registers routes.
  return true;
}

export async function probeWorker(
  base: string,
  signal: AbortSignal,
  onViewerPort?: (port: number) => void,
): Promise<boolean> {
  const response = await fetch(`${base}/agentmemory/livez`, { signal });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    return false;
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const { viewerPort, viewerSkipped } = data as { viewerPort?: unknown; viewerSkipped?: unknown };
  if (typeof viewerPort === "number" && Number.isInteger(viewerPort) && viewerPort > 0 && viewerPort <= 65535) {
    onViewerPort?.(viewerPort);
    return true;
  }
  return viewerSkipped === true;
}

export async function startWorkerAndWait(options: {
  timeoutMs: number;
  hasLiveWorker: () => boolean;
  engineStartsWorker: () => boolean;
  startWorker: () => Promise<unknown>;
  probe: (signal: AbortSignal) => Promise<boolean>;
  stopped?: () => boolean;
}): Promise<boolean> {
  const deadline = startupDeadline(options.timeoutMs);
  if (options.stopped?.()) return false;
  if (!options.hasLiveWorker() && !options.engineStartsWorker()) {
    const started = await withinStartupDeadline(deadline, () => options.startWorker());
    if (!started.completed) return false;
  }
  return waitForReadiness(deadline, options.probe, { stopped: options.stopped });
}
