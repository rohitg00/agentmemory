import { readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const SEEDED_BUILTIN_WORKERS = [
  "http",
  "iii-http",
  "state",
  "iii-state",
  "queue",
  "iii-queue",
  "pubsub",
  "iii-pubsub",
  "cron",
  "iii-cron",
  "iii-stream",
  "iii-observability",
  "iii-worker-manager",
];

export function configuredPersistDir(renderedConfig: string): string | null {
  const lines = renderedConfig.split("\n");
  const block = workerBlock(lines, "configuration");
  if (!block) return null;
  for (let i = block.start + 1; i < block.end; i++) {
    const match = lines[i]!.trim().match(/^directory:\s*(.+?)\s*$/);
    if (match) return match[1]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return null;
}

export function configuredSaveIntervalMs(renderedConfig: string): number | null {
  const match = renderedConfig.match(/save_interval_ms:\s*(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

export const ENGINE_DEFAULT_SAVE_INTERVAL_MS = 5000;
export const AGENTMEMORY_STATE_SAVE_INTERVAL_MS = 2000;
export const ENGINE_FLUSH_MARGIN_MS = 1500;

export function engineFlushWaitMs(
  stateBackend: "file" | "redis",
  configTexts: readonly string[],
): number {
  if (stateBackend === "redis") return 0;
  return engineSaveIntervalMs(configTexts) + ENGINE_FLUSH_MARGIN_MS;
}

export function captureDurableAfterMs(
  stateBackend: "file" | "redis",
  configTexts: readonly string[],
): number {
  if (stateBackend === "redis") return ENGINE_FLUSH_MARGIN_MS;
  return engineSaveIntervalMs(configTexts) + ENGINE_FLUSH_MARGIN_MS;
}

export function engineSaveIntervalMs(configTexts: readonly string[]): number {
  const intervals: number[] = [];
  for (const text of configTexts) {
    const explicit = [...text.matchAll(/save_interval_ms:\s*(\d+)/g)].map((m) => parseInt(m[1]!, 10));
    intervals.push(...explicit);
    const fileStores = text.match(/store_method:\s*file_based/g)?.length ?? 0;
    if (fileStores > explicit.length) intervals.push(ENGINE_DEFAULT_SAVE_INTERVAL_MS);
  }
  return intervals.length > 0 ? Math.max(...intervals) : ENGINE_DEFAULT_SAVE_INTERVAL_MS;
}

export function engineStateConfigPaths(engineCwd: string, runtimePath: string): string[] {
  return [
    ...persistedBuiltinConfigDirs(engineCwd, runtimePath).map((dir) => join(dir, "iii-state.yaml")),
    runtimePath,
  ];
}

export function persistedBuiltinConfigDirs(
  engineCwd: string,
  configPath: string,
  renderedConfig?: string,
): string[] {
  const dirs = [
    join(engineCwd, "config"),
    join(dirname(configPath), "config"),
    join(engineCwd, "data", "configuration"),
  ];
  const custom = renderedConfig ? configuredPersistDir(renderedConfig) : null;
  if (custom) dirs.unshift(resolve(engineCwd, custom));
  return [...new Set(dirs)];
}

export function persistedBuiltinConfigPaths(
  engineCwd: string,
  configPath: string,
  renderedConfig?: string,
): string[] {
  return persistedBuiltinConfigDirs(engineCwd, configPath, renderedConfig).flatMap((dir) =>
    SEEDED_BUILTIN_WORKERS.map((id) => join(dir, `${id}.yaml`)),
  );
}

export function isPersistedBuiltinEntry(content: string, id: string): boolean {
  const firstLine = content.split("\n").find((line) => line.trim() !== "");
  return firstLine?.trim() === `id: ${id}`;
}

export function clearPersistedBuiltinConfig(
  engineCwd: string,
  configPath: string,
  renderedConfig?: string,
): string[] {
  const cleared: string[] = [];
  for (const path of persistedBuiltinConfigPaths(engineCwd, configPath, renderedConfig)) {
    try {
      const content = readFileSync(path, "utf8");
      if (!isPersistedBuiltinEntry(content, basename(path, ".yaml"))) continue;
      rmSync(path);
      cleared.push(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error(
        `could not remove persisted engine config ${path}: ${String(err)}`,
      );
    }
  }
  return cleared;
}

export interface EngineConfigOptions {
  dataDir: string;
  ports?: EngineRuntimePorts;
  stateBackend?: StateBackendOptions;
  saveIntervalMs?: number;
}

export interface EngineRuntimePorts {
  restPort: number;
  streamPort: number;
  viewerPort: number;
  enginePort: number;
}

export interface StateBackendOptions {
  kind: "file" | "redis";
  redisUrl?: string;
}

function yamlSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function workerBlock(
  lines: string[],
  name: string,
): { start: number; end: number; indent: string } | null {
  const marker = `- name: ${name}`;
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) return null;
  const indent = lines[start]!.match(/^\s*/)?.[0] ?? "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith(indent) && line.trim().startsWith("- name: ")) {
      end = i;
      break;
    }
  }
  return { start, end, indent };
}

function setWorkerPort(lines: string[], name: string, port: number): void {
  let block = workerBlock(lines, name);
  if (!block && name === "iii-worker-manager") {
    const workersIndex = lines.findIndex((line) => line.trim() === "workers:");
    if (workersIndex === -1) return;
    lines.splice(
      workersIndex + 1,
      0,
      "  - name: iii-worker-manager",
      "    config:",
      `      port: ${port}`,
      "      host: 127.0.0.1",
    );
    return;
  }
  if (!block) return;

  const portIndex = lines.findIndex(
    (line, index) =>
      index > block!.start &&
      index < block!.end &&
      line.trim().startsWith("port:"),
  );
  if (portIndex !== -1) {
    const indent = lines[portIndex]!.match(/^\s*/)?.[0] ?? `${block.indent}    `;
    lines[portIndex] = `${indent}port: ${port}`;
    return;
  }

  const configIndex = lines.findIndex(
    (line, index) =>
      index > block!.start && index < block!.end && line.trim() === "config:",
  );
  if (configIndex !== -1) {
    const configIndent = lines[configIndex]!.match(/^\s*/)?.[0] ?? `${block.indent}  `;
    lines.splice(configIndex + 1, 0, `${configIndent}  port: ${port}`);
  }
}

function setFileStoreSaveInterval(
  lines: string[],
  workerName: string,
  override: number | undefined,
): void {
  const block = workerBlock(lines, workerName);
  if (!block) return;
  const methodIndex = lines.findIndex(
    (line, index) =>
      index > block.start &&
      index < block.end &&
      line.trim() === "store_method: file_based",
  );
  if (methodIndex === -1) return;
  const indent = lines[methodIndex]!.match(/^\s*/)?.[0] ?? "";
  const intervalIndex = lines.findIndex(
    (line, index) =>
      index > block.start &&
      index < block.end &&
      line.trim().startsWith("save_interval_ms:"),
  );
  if (intervalIndex !== -1) {
    if (override === undefined) return;
    const existingIndent = lines[intervalIndex]!.match(/^\s*/)?.[0] ?? indent;
    lines[intervalIndex] = `${existingIndent}save_interval_ms: ${override}`;
    return;
  }
  lines.splice(
    methodIndex + 1,
    0,
    `${indent}save_interval_ms: ${override ?? AGENTMEMORY_STATE_SAVE_INTERVAL_MS}`,
  );
}

const REDIS_URL_ENV_REF = "${AGENTMEMORY_REDIS_URL}";
const UNSAFE_REDIS_URL_CHARS = /['\u0000-\u001f\u007f]/;

function replaceKvAdapterWithRedis(
  lines: string[],
  workerName: string,
): void {
  const block = workerBlock(lines, workerName);
  if (!block) {
    throw new Error(
      `AGENTMEMORY_STATE_BACKEND=redis requires a "${workerName}" worker in the engine config, but none was found.`,
    );
  }
  const adapterIndex = lines.findIndex(
    (line, index) =>
      index > block.start && index < block.end && line.trim() === "adapter:",
  );
  if (adapterIndex === -1) {
    throw new Error(
      `AGENTMEMORY_STATE_BACKEND=redis requires an "adapter:" block under the "${workerName}" worker in the engine config, but none was found.`,
    );
  }
  const adapterIndent = lines[adapterIndex]!.match(/^\s*/)?.[0] ?? "";
  let end = block.end;
  for (let i = adapterIndex + 1; i < block.end; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    if (indent.length <= adapterIndent.length) {
      end = i;
      break;
    }
  }
  const childIndent = `${adapterIndent}  `;
  const grandchildIndent = `${adapterIndent}    `;
  lines.splice(
    adapterIndex + 1,
    end - (adapterIndex + 1),
    `${childIndent}name: redis`,
    `${childIndent}config:`,
    `${grandchildIndent}redis_url: ${yamlSingleQuote(REDIS_URL_ENV_REF)}`,
  );
}

function setManagedCorsOrigins(
  lines: string[],
  restPort: number,
  viewerPort: number,
): void {
  const block = workerBlock(lines, "iii-http");
  if (!block) return;
  const originsIndex = lines.findIndex(
    (line, index) =>
      index > block.start &&
      index < block.end &&
      line.trim().startsWith("allowed_origins:"),
  );
  if (originsIndex === -1) return;
  const indent = lines[originsIndex]!.match(/^\s*/)?.[0] ?? "        ";
  lines[originsIndex] =
    `${indent}allowed_origins: [` +
    `"http://localhost:${restPort}", ` +
    `"http://localhost:${viewerPort}", ` +
    `"http://127.0.0.1:${restPort}", ` +
    `"http://127.0.0.1:${viewerPort}"]`;
}

export function renderEngineConfig(
  template: string,
  options: EngineConfigOptions,
): string {
  if (options.stateBackend?.kind === "redis" && !options.stateBackend.redisUrl) {
    throw new Error(
      "AGENTMEMORY_STATE_BACKEND=redis requires AGENTMEMORY_REDIS_URL to be set (e.g. redis://localhost:6379).",
    );
  }
  if (
    options.stateBackend?.kind === "redis" &&
    UNSAFE_REDIS_URL_CHARS.test(options.stateBackend.redisUrl ?? "")
  ) {
    throw new Error(
      "AGENTMEMORY_REDIS_URL contains a single quote or a control character, which breaks the engine config once the engine expands it. Percent-encode those characters in the URL (for example a single quote as %27).",
    );
  }

  const rendered = template
    .replace(
      "file_path: ./data/state_store.db",
      `file_path: ${yamlSingleQuote(join(options.dataDir, "state_store.db"))}`,
    )
    .replace(
      "file_path: ./data/stream_store",
      `file_path: ${yamlSingleQuote(join(options.dataDir, "stream_store"))}`,
    );

  const usesRedis = options.stateBackend?.kind === "redis";
  const lines = rendered.split("\n");
  setFileStoreSaveInterval(lines, "iii-state", options.saveIntervalMs);
  setFileStoreSaveInterval(lines, "iii-stream", options.saveIntervalMs);
  if (options.ports) {
    setWorkerPort(lines, "iii-http", options.ports.restPort);
    setWorkerPort(lines, "iii-stream", options.ports.streamPort);
    setWorkerPort(lines, "iii-worker-manager", options.ports.enginePort);
    setManagedCorsOrigins(lines, options.ports.restPort, options.ports.viewerPort);
  }
  if (usesRedis) {
    replaceKvAdapterWithRedis(lines, "iii-state");
    replaceKvAdapterWithRedis(lines, "iii-stream");
  }
  return lines.join("\n");
}
