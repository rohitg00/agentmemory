import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface RuntimeMetadataPathOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export function runtimeMetadataPath(
  name: string,
  options: RuntimeMetadataPathOptions = {},
): string {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const baseDir = env["AGENTMEMORY_RUNTIME_DIR"]
    ? resolve(env["AGENTMEMORY_RUNTIME_DIR"])
    : join(home, ".agentmemory");
  return join(baseDir, name);
}
