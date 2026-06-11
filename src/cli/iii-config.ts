import { join } from "node:path";

export type IiiConfigLookupOptions = {
  envPath?: string;
  cwd: string;
  home: string;
  packageDir: string;
  exists: (path: string) => boolean;
};

export function iiiConfigCandidates(
  options: Omit<IiiConfigLookupOptions, "exists">,
): string[] {
  return [
    ...(options.envPath ? [options.envPath] : []),
    join(options.cwd, "iii-config.yaml"),
    join(options.home, ".agentmemory", "iii-config.yaml"),
    join(options.packageDir, "iii-config.yaml"),
    join(options.packageDir, "..", "iii-config.yaml"),
  ];
}

export function resolveIiiConfigPath(options: IiiConfigLookupOptions): string {
  for (const candidate of iiiConfigCandidates(options)) {
    if (options.exists(candidate)) return candidate;
  }
  return "";
}
