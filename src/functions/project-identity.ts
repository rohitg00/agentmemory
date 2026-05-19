import { execFile } from "node:child_process";
import { basename, resolve, sep } from "node:path";

export interface GitProjectInfo {
  isWorktree: boolean;
  branch: string | null;
  topLevel: string;
  mainRepoRoot: string;
  gitDir: string;
  commonDir: string;
}

export interface ProjectIdentity {
  project: string;
  cwd: string;
  aliases: string[];
  git?: GitProjectInfo;
}

function execAsync(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    execFile(cmd, args, { cwd, timeout: 5000 }, (err, stdout) => {
      if (err) reject(err);
      else resolveOutput(stdout.trim());
    });
  });
}

function cleanValue(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function looksLikePath(value: string): boolean {
  return (
    value.startsWith(".") ||
    value.startsWith("~") ||
    value.includes("/") ||
    value.includes("\\")
  );
}

export function expandProjectAliases(
  ...values: Array<string | null | undefined>
): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | null | undefined) => {
    const cleaned = cleanValue(value);
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    aliases.push(cleaned);

    if (looksLikePath(cleaned)) {
      const absolute = resolve(cleaned);
      if (!seen.has(absolute)) {
        seen.add(absolute);
        aliases.push(absolute);
      }
    }

    const base = basename(cleaned);
    if (base && base !== cleaned && !seen.has(base)) {
      seen.add(base);
      aliases.push(base);
    }
  };

  for (const value of values) add(value);
  return aliases;
}

export function projectValueMatches(
  value: string | null | undefined,
  aliases: ReadonlySet<string>,
): boolean {
  const cleaned = cleanValue(value);
  if (!cleaned) return false;
  const expanded = expandProjectAliases(cleaned);
  if (looksLikePath(cleaned)) {
    return expanded.some((alias) => looksLikePath(alias) && aliases.has(alias));
  }
  return expanded.some((alias) => aliases.has(alias));
}

export function sessionMatchesProjectAliases(
  session: { project: string; cwd: string },
  aliases: ReadonlySet<string>,
): boolean {
  if (projectValueMatches(session.project, aliases)) return true;
  if (projectValueMatches(session.cwd, aliases)) return true;

  for (const alias of aliases) {
    if (!looksLikePath(alias)) continue;
    const prefix = alias.endsWith("/") || alias.endsWith("\\")
      ? alias
      : `${alias}${sep}`;
    if (session.cwd.startsWith(prefix)) return true;
  }

  return false;
}

export async function detectGitProject(
  cwd: string,
): Promise<GitProjectInfo | null> {
  try {
    const gitDir = await execAsync("git", ["rev-parse", "--git-dir"], cwd);
    const commonDir = await execAsync(
      "git",
      ["rev-parse", "--git-common-dir"],
      cwd,
    );
    const branch = await execAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd,
    ).catch(() => "detached");
    const topLevel = await execAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      cwd,
    );

    const gitDirPath = resolve(cwd, gitDir);
    const commonDirPath = resolve(cwd, commonDir);
    const isWorktree = gitDirPath !== commonDirPath;
    const mainRepoRoot = isWorktree ? resolve(commonDirPath, "..") : topLevel;

    return {
      isWorktree,
      branch,
      topLevel,
      mainRepoRoot,
      gitDir: gitDirPath,
      commonDir: commonDirPath,
    };
  } catch {
    return null;
  }
}

export async function resolveProjectIdentity(input: {
  project?: string | null;
  cwd?: string | null;
}): Promise<ProjectIdentity> {
  const cwd = cleanValue(input.cwd) ?? cleanValue(input.project) ?? process.cwd();
  const requestedProject = cleanValue(input.project) ?? cwd;
  const git = await detectGitProject(cwd);
  const project = git?.mainRepoRoot ?? requestedProject;

  return {
    project,
    cwd,
    aliases: expandProjectAliases(
      requestedProject,
      cwd,
      git?.topLevel,
      git?.mainRepoRoot,
    ),
    ...(git ? { git } : {}),
  };
}
