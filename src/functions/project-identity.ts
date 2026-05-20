import { execFile } from "node:child_process";
import { basename, resolve, sep } from "node:path";

const GIT_IDENTITY_TIMEOUT_MS = 500;

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

function execAsync(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: GIT_IDENTITY_TIMEOUT_MS },
      (err, stdout) => {
        if (err) reject(err);
        else resolveOutput(stdout.trim());
      },
    );
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
    const prefix =
      alias.endsWith("/") || alias.endsWith("\\") ? alias : `${alias}${sep}`;
    if (session.cwd.startsWith(prefix)) return true;
  }

  return false;
}

export async function detectGitProject(
  cwd: string,
): Promise<GitProjectInfo | null> {
  try {
    const [gitDir, commonDir, branch, topLevel] = (
      await execAsync(
        "git",
        [
          "rev-parse",
          "--git-dir",
          "--git-common-dir",
          "--abbrev-ref",
          "HEAD",
          "--show-toplevel",
        ],
        cwd,
      )
    ).split(/\r?\n/);
    if (!gitDir || !commonDir || !topLevel) return null;

    const gitDirPath = resolve(cwd, gitDir);
    const commonDirPath = resolve(cwd, commonDir);
    const isWorktree = gitDirPath !== commonDirPath;
    const mainRepoRoot = isWorktree ? resolve(commonDirPath, "..") : topLevel;

    return {
      isWorktree,
      branch: branch || null,
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
  const cwd =
    cleanValue(input.cwd) ?? cleanValue(input.project) ?? process.cwd();
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
