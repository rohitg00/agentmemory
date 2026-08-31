import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  renderEngineConfig,
  type EngineConfigOptions,
} from "./engine-config.js";

export function agentmemoryHome(home: string): string {
  return join(home, ".agentmemory");
}

export function runtimeConfigPath(dataDir: string): string {
  return join(dataDir, "iii-config.runtime.yaml");
}

export function dockerProjectName(restPort: number): string {
  return `agentmemory-${restPort}`;
}

export function dockerComposeArgs(
  composeFile: string,
  projectName: string | undefined,
  command: string[],
): string[] {
  return [
    "compose",
    ...(projectName ? ["-p", projectName] : []),
    "-f",
    composeFile,
    ...command,
  ];
}

export function isBundledConfig(configPath: string, packageDir: string): boolean {
  const resolved = resolve(configPath);
  return (
    resolved === resolve(join(packageDir, "iii-config.yaml")) ||
    resolved === resolve(join(packageDir, "..", "iii-config.yaml"))
  );
}

export function resolveEngineCwd(
  configPath: string,
  invocationCwd: string,
  home: string,
  bundledConfig = false,
): string {
  if (bundledConfig) return agentmemoryHome(home);
  const absoluteConfigPath = isAbsolute(configPath)
    ? configPath
    : resolve(invocationCwd, configPath);
  return dirname(absoluteConfigPath);
}

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function yamlScalar(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isAgentmemoryExecCommand(
  line: string,
  nodeBin: string,
  workerEntry: string,
): boolean {
  const match = line.match(/^\s*-\s+(.+?)\s*$/);
  if (!match) return false;
  const command = yamlScalar(match[1]!).replaceAll("\\", "/");
  const explicitCommand = `${nodeBin} ${workerEntry}`.replaceAll("\\", "/");
  return (
    command === explicitCommand ||
    /^(?:node|node\.exe)\s+\.\/dist\/index\.mjs$/.test(command) ||
    /^(?:node|node\.exe)\s+dist\/index\.mjs$/.test(command)
  );
}

function removeAgentmemoryExecCommand(
  raw: string,
  nodeBin: string,
  workerEntry: string,
): string {
  const lines = raw.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() !== "- name: iii-exec") {
      output.push(line);
      index++;
      continue;
    }

    const blockIndent = indentation(line);
    let blockEnd = index + 1;
    while (blockEnd < lines.length) {
      const candidate = lines[blockEnd]!;
      if (candidate.trim() !== "") {
        const candidateIndent = indentation(candidate);
        if (
          candidateIndent < blockIndent ||
          (candidateIndent === blockIndent && candidate.trim().startsWith("- name: "))
        ) {
          break;
        }
      }
      blockEnd++;
    }

    const block = lines.slice(index, blockEnd);
    const execIndex = block.findIndex((candidate) => candidate.trim() === "exec:");
    if (execIndex === -1) {
      output.push(...block);
      index = blockEnd;
      continue;
    }

    const execIndent = indentation(block[execIndex]!);
    let execEnd = execIndex + 1;
    while (execEnd < block.length) {
      const candidate = block[execEnd]!;
      if (candidate.trim() !== "" && indentation(candidate) <= execIndent) break;
      execEnd++;
    }

    const beforeExec = block.slice(0, execIndex + 1);
    const execLines = block.slice(execIndex + 1, execEnd);
    const afterExec = block.slice(execEnd);
    const remainingExecLines = execLines.filter(
      (candidate) => !isAgentmemoryExecCommand(candidate, nodeBin, workerEntry),
    );
    const removed = remainingExecLines.length !== execLines.length;
    const hasExecCommand = remainingExecLines.some(
      (candidate) => /^\s*-\s+/.test(candidate) && indentation(candidate) > execIndent,
    );

    if (!removed) {
      output.push(...block);
    } else if (hasExecCommand) {
      output.push(...beforeExec, ...remainingExecLines, ...afterExec);
    }
    index = blockEnd;
  }

  return output.join("\n");
}

export function rewriteBundledConfig(
  raw: string,
  home: string,
  nodeBin: string,
  workerEntry: string,
  options?: EngineConfigOptions,
): string {
  const rendered = renderEngineConfig(raw, {
    dataDir: options?.dataDir ?? join(agentmemoryHome(home), "data"),
    ...(options?.ports ? { ports: options.ports } : {}),
  });
  return removeAgentmemoryExecCommand(rendered, nodeBin, workerEntry);
}

export interface DataMigration {
  from: string;
  to: string;
}

export function legacyDataMigrations(
  invocationCwd: string,
  home: string,
  resolvedDataDir = join(agentmemoryHome(home), "data"),
): DataMigration[] {
  return [
    {
      from: join(invocationCwd, "data", "state_store.db"),
      to: join(resolvedDataDir, "state_store.db"),
    },
    {
      from: join(invocationCwd, "data", "stream_store"),
      to: join(resolvedDataDir, "stream_store"),
    },
  ];
}
