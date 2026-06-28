import { execSync } from "node:child_process";
import { basename } from "node:path";
import "./_env.js";

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
