import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export function iiiReleaseAsset(
  nodePlatform: NodeJS.Platform = platform(),
  nodeArch: string = process.arch,
): string | null {
  if (nodePlatform === "darwin" && nodeArch === "arm64")
    return "iii-aarch64-apple-darwin.tar.gz";
  if (nodePlatform === "darwin" && nodeArch === "x64")
    return "iii-x86_64-apple-darwin.tar.gz";
  if (nodePlatform === "linux" && nodeArch === "x64")
    return "iii-x86_64-unknown-linux-gnu.tar.gz";
  if (nodePlatform === "linux" && nodeArch === "arm64")
    return "iii-aarch64-unknown-linux-gnu.tar.gz";
  if (nodePlatform === "linux" && nodeArch === "arm")
    return "iii-armv7-unknown-linux-gnueabihf.tar.gz";
  if (nodePlatform === "win32" && nodeArch === "x64")
    return "iii-x86_64-pc-windows-msvc.zip";
  if (nodePlatform === "win32" && nodeArch === "arm64")
    return "iii-aarch64-pc-windows-msvc.zip";
  return null;
}

export function iiiReleaseUrl(
  version: string,
  nodePlatform: NodeJS.Platform = platform(),
  nodeArch: string = process.arch,
): string | null {
  const asset = iiiReleaseAsset(nodePlatform, nodeArch);
  if (!asset) return null;
  return `https://github.com/iii-hq/iii/releases/download/iii/v${version}/${asset}`;
}

export function findIiiConfigPath({
  envPath = process.env["AGENTMEMORY_III_CONFIG"],
  cwd = process.cwd(),
  homeDir = homedir(),
  moduleDir,
  packageRootDir = join(moduleDir, ".."),
  exists = existsSync,
}: {
  envPath?: string;
  cwd?: string;
  homeDir?: string;
  moduleDir: string;
  packageRootDir?: string;
  exists?: (path: string) => boolean;
}): string {
  const candidates = [
    ...(envPath ? [envPath] : []),
    join(cwd, "iii-config.yaml"),
    join(homeDir, ".agentmemory", "iii-config.yaml"),
    join(packageRootDir, "iii-config.yaml"),
    join(moduleDir, "iii-config.yaml"),
  ];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return "";
}
