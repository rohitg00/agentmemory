import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

function cleanEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function gitOutput(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
  }).trim();
}

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function gitCommonDir(cwd: string): string {
  try {
    return gitOutput(cwd, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
  } catch {
    const relativeOrAbsolute = gitOutput(cwd, [
      "rev-parse",
      "--git-common-dir",
    ]);
    return isAbsolute(relativeOrAbsolute)
      ? relativeOrAbsolute
      : resolve(cwd, relativeOrAbsolute);
  }
}

function canonicalGitProject(cwd: string): string | undefined {
  try {
    const common = realPath(gitCommonDir(cwd));
    const root = basename(common) === ".git" ? realPath(dirname(common)) : common;
    return `git:${createHash("sha256").update(root).digest("hex").slice(0, 32)}`;
  } catch {
    return undefined;
  }
}

export function resolveCwd(cwd?: unknown): string {
  if (typeof cwd !== "string") return process.cwd();
  return cwd.trim().length > 0 ? cwd : process.cwd();
}

// Resolution order:
// 1. AGENTMEMORY_PROJECT_ID for explicit, agent-independent project scoping.
// 2. AGENTMEMORY_PROJECT_NAME for backward compatibility.
// 3. Opaque hash of the Git common-dir parent so linked worktrees share one
//    project memory without persisting host paths.
// 4. basename(cwd) for non-Git folders.
export function resolveProject(cwd?: unknown): string {
  const explicitId = cleanEnv("AGENTMEMORY_PROJECT_ID");
  if (explicitId) return explicitId;

  const explicitName = cleanEnv("AGENTMEMORY_PROJECT_NAME");
  if (explicitName) return explicitName;

  const dir = resolveCwd(cwd);
  return canonicalGitProject(dir) ?? basename(dir);
}
