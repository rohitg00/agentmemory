import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function agentmemoryHome(home: string): string {
  return join(home, ".agentmemory");
}

export function runtimeConfigPath(home: string): string {
  return join(agentmemoryHome(home), "iii-config.runtime.yaml");
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
): string {
  if (resolve(configPath) === resolve(join(invocationCwd, "iii-config.yaml"))) {
    return invocationCwd;
  }
  return agentmemoryHome(home);
}

function yamlSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function shellDoubleQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

export function buildBundledRuntimeConfig(
  raw: string,
  home: string,
  nodeBin: string,
  workerEntry: string,
): string {
  const dataDir = join(agentmemoryHome(home), "data");
  const workerCommand = `${shellDoubleQuote(nodeBin)} ${shellDoubleQuote(workerEntry)}`;
  return raw
    .replace(
      "file_path: ./data/state_store.db",
      `file_path: ${yamlSingleQuote(join(dataDir, "state_store.db"))}`,
    )
    .replace(
      "file_path: ./data/stream_store",
      `file_path: ${yamlSingleQuote(join(dataDir, "stream_store"))}`,
    )
    .replace("- src/**/*.ts", `- ${yamlSingleQuote(workerEntry)}`)
    .replace("- node dist/index.mjs", `- ${yamlSingleQuote(workerCommand)}`);
}

export type PrepareEngineLaunchOptions = {
  configPath: string;
  invocationCwd?: string;
  home: string;
  packageDir: string;
  nodeBin: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, content: string) => void;
  mkdir?: (path: string) => void;
};

export function prepareEngineLaunch({
  configPath,
  invocationCwd = process.cwd(),
  home,
  packageDir,
  nodeBin,
  readFile = (path) => readFileSync(path, "utf-8"),
  writeFile = (path, content) => writeFileSync(path, content, "utf-8"),
  mkdir = (path) => mkdirSync(path, { recursive: true }),
}: PrepareEngineLaunchOptions): { configPath: string; cwd: string } {
  const cwd = resolveEngineCwd(configPath, invocationCwd, home);
  mkdir(cwd);
  if (resolve(configPath) === resolve(join(invocationCwd, "iii-config.yaml"))) {
    return { configPath, cwd };
  }
  if (!isBundledConfig(configPath, packageDir)) {
    return { configPath, cwd };
  }

  const runtimePath = runtimeConfigPath(home);
  const workerEntry = join(packageDir, "index.mjs");
  const rewritten = buildBundledRuntimeConfig(
    readFile(configPath),
    home,
    nodeBin,
    workerEntry,
  );
  mkdir(dirname(runtimePath));
  writeFile(runtimePath, rewritten);
  return { configPath: runtimePath, cwd };
}
