import { execSync } from "node:child_process";
import { basename } from "node:path";

// Shared project-name resolver for hook scripts. Hooks that read
// `data.cwd` directly were sending the full filesystem path as the
// project field — but native sessions, mem::replay::import-jsonl,
// and most manual memory_lesson_save calls use the repo basename.
// The mismatch made auto-injected context filter out the bulk of
// relevant lessons. See #474.
//
// Resolution order (first non-empty wins):
//   1. AGENTMEMORY_PROJECT_NAME env (per-repo escape hatch)
//   2. basename of `git rev-parse --show-toplevel` (handles subdirs)
//   3. basename of cwd (final fallback when not in a git repo)
//
// tsdown inlines this module into each hook bundle so every hook
// ships self-contained without a runtime import.
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
  } catch {
    // Not a git repo, git missing, or timeout — fall through.
  }
  return basename(dir);
}
