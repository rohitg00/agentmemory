import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir, platform } from "node:os";

export type DataDirSource = "flag" | "env" | "default";

export type ResolvedDataDir = {
  dataDir: string;
  source: DataDirSource;
  relocatedFrom?: string;
};

type ResolveDataDirOptions = {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  home?: string;
  platform?: NodeJS.Platform;
};

function argValue(args: string[], name: string): string | undefined {
  const equals = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(equals));
  if (inline) return inline.slice(equals.length);

  const idx = args.indexOf(name);
  if (idx !== -1) return args[idx + 1];
  return undefined;
}

function expandHome(pathValue: string, home: string): string {
  if (pathValue === "~") return home;
  if (pathValue.startsWith("~/") || pathValue.startsWith("~\\")) {
    return join(home, pathValue.slice(2));
  }
  return pathValue;
}

function absoluteDataDir(pathValue: string, cwd: string, home: string): string {
  const expanded = expandHome(pathValue, home);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function platformDefaultDataDir(
  env: NodeJS.ProcessEnv,
  home: string,
  nodePlatform: NodeJS.Platform,
  useXdg = true,
): string {
  if (nodePlatform === "darwin") {
    return join(home, "Library", "Application Support", "agentmemory");
  }
  if (nodePlatform === "win32") {
    const appData = env["APPDATA"];
    return appData
      ? join(appData, "agentmemory")
      : join(home, ".agentmemory");
  }
  const xdgDataHome = env["XDG_DATA_HOME"];
  if (useXdg && xdgDataHome && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, "agentmemory");
  }
  return join(home, ".local", "share", "agentmemory");
}

function nearestGitParent(pathValue: string): string | undefined {
  let current = pathValue;
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveDataDir(options: ResolveDataDirOptions = {}): ResolvedDataDir {
  const args = options.args ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  const nodePlatform = options.platform ?? platform();
  const parsedInstance = parseInt(argValue(args, "--instance") ?? "0", 10);
  const instance =
    parsedInstance > 0 && parsedInstance <= 50 ? parsedInstance : 0;
  const forInstance = (dataDir: string) =>
    instance ? join(dataDir, `instance-${instance}`) : dataDir;

  const flagValue = argValue(args, "--data-dir");
  if (flagValue) {
    return {
      dataDir: forInstance(absoluteDataDir(flagValue, cwd, home)),
      source: "flag",
    };
  }

  const envValue = env["AGENTMEMORY_DATA_DIR"];
  if (envValue) {
    return {
      dataDir: forInstance(absoluteDataDir(envValue, cwd, home)),
      source: "env",
    };
  }

  const legacyDir = resolve(cwd, "data");
  if (instance === 0 && existsSync(legacyDir)) {
    return { dataDir: legacyDir, source: "default" };
  }

  const defaultDir = platformDefaultDataDir(env, home, nodePlatform);
  if (nearestGitParent(cwd)) {
    const relocated = platformDefaultDataDir(env, home, nodePlatform, false);
    if (relocated !== defaultDir) {
      return {
        dataDir: forInstance(relocated),
        source: "default",
        relocatedFrom: defaultDir,
      };
    }
  }

  return {
    dataDir: forInstance(defaultDir),
    source: "default",
  };
}
