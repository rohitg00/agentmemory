// Shared project-name resolution for hook scripts.
//
// Background: a Claude Code session started in /Users/me/work/foo previously
// got `project = "/Users/me/work/foo"` (the full cwd). But native sessions,
// mem::replay::import-jsonl, and most manual memory_lesson_save calls use
// the basename ("foo"). The mismatch meant the auto-inject context block at
// session start filtered out the bulk of relevant lessons. See #474 for the
// full diagnosis.
//
// Resolution order (first non-empty wins):
//   1. AGENTMEMORY_PROJECT_NAME env var (operator escape hatch — set per-repo
//      via Claude Code's .claude/settings.json `env` block, direnv, or
//      shell rc for cross-tool consistency)
//   2. basename of `git rev-parse --show-toplevel` from cwd (handles sessions
//      started in a subdirectory of the repo; survives moving the repo)
//   3. basename of cwd (final fallback when not in a git repo)
//
// tsdown inlines this module into every hook bundle, so each hook ships
// self-contained.
import { execSync } from "node:child_process";
import { basename } from "node:path";

export function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();

  const dir = cwd?.trim() || process.cwd();

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
