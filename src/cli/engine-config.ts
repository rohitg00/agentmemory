import { join } from "node:path";

export interface EngineConfigOptions {
  dataDir: string;
  ports?: EngineRuntimePorts;
}

export interface EngineRuntimePorts {
  restPort: number;
  streamPort: number;
  viewerPort: number;
  enginePort: number;
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
  const rendered = template
    .replace(
      "file_path: ./data/state_store.db",
      `file_path: ${yamlSingleQuote(join(options.dataDir, "state_store.db"))}`,
    )
    .replace(
      "file_path: ./data/stream_store",
      `file_path: ${yamlSingleQuote(join(options.dataDir, "stream_store"))}`,
    );
  if (!options.ports) return rendered;

  const lines = rendered.split("\n");
  setWorkerPort(lines, "iii-http", options.ports.restPort);
  setWorkerPort(lines, "iii-stream", options.ports.streamPort);
  setWorkerPort(lines, "iii-worker-manager", options.ports.enginePort);
  setManagedCorsOrigins(lines, options.ports.restPort, options.ports.viewerPort);
  return lines.join("\n");
}
