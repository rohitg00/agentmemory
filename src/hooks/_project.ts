import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

// Resolution order: AGENTMEMORY_PROJECT_NAME env → git repository basename → cwd basename.
export function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  const dir = cwd && cwd.trim() ? cwd : process.cwd();
  try {
    const [top, gitDir, commonDir] = execSync(
      "git rev-parse --show-toplevel --git-dir --git-common-dir",
      {
        cwd: dir,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 500,
      },
    )
      .toString()
      .trim()
      .split(/\r?\n/);
    if (top) return basename(repositoryRoot(dir, top, gitDir, commonDir));
  } catch {}
  return basename(dir);
}

function repositoryRoot(dir: string, top: string, gitDir?: string, commonDir?: string): string {
  if (!gitDir || !commonDir) return top;
  const physical = realpathSync(dir);
  const common = resolve(physical, commonDir);
  if (resolve(physical, gitDir) === common || basename(common) !== ".git") return top;
  return dirname(common);
}

export function hookCwd(data: Record<string, unknown> | null | undefined): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  if (typeof data.cwd === "string" && data.cwd.trim()) return data.cwd;
  const roots = data.workspace_roots;
  if (Array.isArray(roots)) {
    for (const root of roots) {
      if (typeof root === "string" && root.trim()) return root;
    }
  }
  const projectDir =
    process.env["DEVIN_PROJECT_DIR"] || process.env["CLAUDE_PROJECT_DIR"];
  if (projectDir && projectDir.trim()) return projectDir;
  return undefined;
}
