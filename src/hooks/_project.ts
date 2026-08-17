import { execSync } from "node:child_process";
import { basename } from "node:path";

// Resolution order: AGENTMEMORY_PROJECT_NAME env → git toplevel basename → cwd basename.
export function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  const dir = cwd && cwd.trim() ? cwd : process.cwd();
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();
    if (top) return basename(top);
  } catch {}
  return basename(dir);
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
  // Klaat Code names the field project_root rather than cwd.
  if (typeof data.project_root === "string" && data.project_root.trim()) {
    return data.project_root;
  }
  // Take the first non-blank var: a `||` chain would stop at a
  // whitespace-only earlier value and shadow a valid later one.
  for (const name of [
    "DEVIN_PROJECT_DIR",
    "CLAUDE_PROJECT_DIR",
    "KLAATAI_PROJECT_ROOT",
  ]) {
    const value = process.env[name];
    if (value && value.trim()) return value;
  }
  return undefined;
}
