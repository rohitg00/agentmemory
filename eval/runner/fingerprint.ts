import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const enginePath = (): string => process.env.AGENTMEMORY_EVAL_III ?? join(homedir(), ".agentmemory/bin/iii");

export function fileDigest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function treeDigest(paths: string[]): string {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    hash.update(relative(repositoryRoot, path)).update("\0").update(fileDigest(path)).update("\0");
  }
  return hash.digest("hex");
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

export function fingerprint(live: boolean) {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  const dependencies: Record<string, string | null> = {};
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.devDependencies }).sort()) {
    const path = join(repositoryRoot, "node_modules", name, "package.json");
    dependencies[name] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).version : null;
  }
  const lock = join(repositoryRoot, "node_modules/.package-lock.json");
  return {
    revision: git(["rev-parse", "HEAD"]), dirty: Boolean(git(["status", "--porcelain"])),
    contentSha256: treeDigest([...files(join(repositoryRoot, "src")), ...files(join(repositoryRoot, "eval/runner")), join(repositoryRoot, "package.json")]),
    dependencies, installedLockSha256: existsSync(lock) ? fileDigest(lock) : null,
    builtArtifactSha256: live ? treeDigest(files(join(repositoryRoot, "dist"))) : null,
    engine: live ? { version: execFileSync(enginePath(), ["--version"], { encoding: "utf8" }).trim(), sha256: fileDigest(enginePath()) } : null,
  };
}
