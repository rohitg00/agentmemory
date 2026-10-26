import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative } from "node:path";

export interface PathAlias {
  from: string;
  to: string;
}

function gitWorktreeListing(cwd: string): string[] {
  const run = (args: string[]) =>
    execFileSync("git", ["worktree", "list", "--porcelain", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).toString();
  try {
    return run(["-z"]).split("\0");
  } catch {}
  try {
    return run([]).split(/\r?\n/);
  } catch {
    return [];
  }
}

function tryRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function isInsideRoot(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`);
}

// `roots` must be longest first, so a cwd inside a nested worktree maps onto that worktree.
function cwdAliases(cwd: string, roots: readonly string[]): PathAlias[] {
  const physical = tryRealpath(cwd);
  if (!physical || physical === cwd) return [];
  const root = roots.find((candidate) => isInsideRoot(candidate, physical));
  if (root === undefined) return [];
  const inside = physical.slice(root.length);
  const prefix = inside && cwd.endsWith(inside) ? cwd.slice(0, cwd.length - inside.length) : undefined;
  if (prefix && tryRealpath(prefix) === root) return [{ from: prefix, to: "" }];
  return [{ from: cwd, to: relative(root, physical).replace(/\\/g, "/") }];
}

// Longest first: a worktree nested inside the main checkout must be stripped before it.
export function repositoryRoots(cwd: string): PathAlias[] {
  const recorded = gitWorktreeListing(cwd)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter(Boolean);
  const roots = new Set<string>();
  for (const root of recorded) {
    roots.add(root);
    const physical = tryRealpath(root);
    if (physical) roots.add(physical);
  }
  const longestFirst = [...roots].sort((a, b) => b.length - a.length);
  const aliases = longestFirst.map((from) => ({ from, to: "" }));
  aliases.push(...cwdAliases(cwd, longestFirst));
  if (process.platform === "win32") {
    for (const alias of [...aliases]) aliases.push({ ...alias, from: alias.from.replace(/\//g, "\\") });
  }
  return aliases.sort((a, b) => b.from.length - a.from.length);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PATH_END = `$|[\\s"'\`:;,)\\]}>]`;
const PATH_REST = `[^\\s"'\`]*`;
const PATH_KEYS = new Set(["file_path", "filePath", "filepath", "notebook_path", "path", "file"]);

// A root counts only where a path starts and ends, so `/mnt/repo/x` and `repo-old/` are left alone.
// Windows paths compare case-insensitively and come out with forward slashes, like the file index.
// Free text cannot say where a path ends, so it is converted only up to the next space; a path
// field is one path, so it is converted in full.
function aliasPattern(aliases: readonly PathAlias[], windows: boolean): RegExp | null {
  if (aliases.length === 0) return null;
  const alternatives = aliases.map((alias) => `(${escapeRegExp(alias.from)})`).join("|");
  const rest = windows ? PATH_REST : "";
  return new RegExp(
    `(?<![\\w.~/\\\\-])(?:${alternatives})(?:([\\\\/])(${rest})|(?=${PATH_END}))`,
    windows ? "gi" : "g",
  );
}

export function relativizePaths(
  value: unknown,
  aliases: readonly PathAlias[],
  windows = process.platform === "win32",
): unknown {
  const pattern = aliasPattern(aliases, windows);
  if (!pattern) return value;
  const rewrite = (_match: string, ...groups: unknown[]): string => {
    const to = aliases[groups.findIndex((group) => typeof group === "string")]?.to ?? "";
    const separator = groups[aliases.length];
    if (typeof separator !== "string") return to || ".";
    const tail = String(groups[aliases.length + 1] ?? "").replace(/\\/g, "/");
    return to ? `${to}/${tail}` : tail;
  };
  const walk = (node: unknown, key?: string): unknown => {
    if (typeof node === "string") {
      const rewritten = node.replace(pattern, rewrite);
      return windows && rewritten !== node && key !== undefined && PATH_KEYS.has(key)
        ? rewritten.replace(/\\/g, "/")
        : rewritten;
    }
    if (Array.isArray(node)) return node.map((child) => walk(child));
    if (node && typeof node === "object" && Object.getPrototypeOf(node) === Object.prototype) {
      return Object.fromEntries(Object.entries(node).map(([k, child]) => [k, walk(child, k)]));
    }
    return node;
  };
  return walk(value);
}
