import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export function relativePathsEnabled(): boolean {
  return process.env["AGENTMEMORY_RELATIVE_PATHS"]?.trim().toLowerCase() === "true";
}

// Every worktree of the repository that holds cwd, under each spelling a hook can see:
// the path git recorded, its resolved form, and the path cwd was reached through when
// that goes through a symlink. Longest first, so a worktree nested inside the main
// checkout is stripped before the checkout itself.
export function repositoryRoots(cwd: string): string[] {
  let listing: string;
  try {
    listing = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).toString();
  } catch {
    return [];
  }
  const recorded = listing
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter(Boolean);
  const roots = new Set<string>();
  for (const root of recorded) {
    roots.add(root);
    const physical = tryRealpath(root);
    if (physical) roots.add(physical);
  }
  const logical = logicalRoot(cwd, [...roots]);
  if (logical) roots.add(logical);
  if (process.platform === "win32") {
    for (const root of [...roots]) roots.add(root.replace(/\//g, "\\"));
  }
  return [...roots].sort((a, b) => b.length - a.length);
}

function tryRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function logicalRoot(cwd: string, roots: string[]): string | undefined {
  const physical = tryRealpath(cwd);
  if (!physical || physical === cwd) return undefined;
  for (const root of roots) {
    if (physical === root) return cwd;
    if (!physical.startsWith(`${root}/`)) continue;
    const inside = physical.slice(root.length);
    if (cwd.endsWith(inside)) return cwd.slice(0, cwd.length - inside.length);
  }
  return undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A root counts only where a path starts (not inside a longer path) and only where it
// ends (not as the prefix of a sibling such as `repo-old`). `root/x` becomes `x`, the
// bare root becomes `.`.
function rootPattern(roots: readonly string[]): RegExp | null {
  if (roots.length === 0) return null;
  const alternatives = roots.map(escapeRegExp).join("|");
  return new RegExp(
    `(?<![\\w.~/\\\\-])(?:${alternatives})(?:[\\\\/]|(?=$|[\\s"'\`:;,)\\]}>]))`,
    "g",
  );
}

export function relativizePaths(value: unknown, roots: readonly string[]): unknown {
  const pattern = rootPattern(roots);
  if (!pattern) return value;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return node.replace(pattern, (match) => (/[\\/]$/.test(match) ? "" : "."));
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object" && Object.getPrototypeOf(node) === Object.prototype) {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  return walk(value);
}
