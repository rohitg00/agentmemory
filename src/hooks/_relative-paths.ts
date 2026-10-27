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
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 500,
    }).toString();
  try {
    return run(["-z"]).split("\0");
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? "");
    if (!/unknown switch|usage:/i.test(stderr)) return [];
  }
  try {
    return run([]).split(/\r?\n/);
  } catch {
    return [];
  }
}

function tryRealpath(path: string): string | undefined {
  try {
    return realpathSync.native(path);
  } catch {
    return undefined;
  }
}

function slashed(path: string): string {
  return path.replace(/\\/g, "/");
}

function isInsideRoot(root: string, path: string): boolean {
  return slashed(path) === slashed(root) || slashed(path).startsWith(`${slashed(root)}/`);
}

// `roots` must be longest first, so a cwd inside a nested worktree maps onto that worktree.
function cwdAliases(rawCwd: string, roots: readonly string[]): PathAlias[] {
  const cwd = rawCwd.replace(/(.)[\\/]+$/, "$1");
  const physical = tryRealpath(cwd);
  if (!physical || physical === cwd) return [];
  const root = roots.find((candidate) => isInsideRoot(candidate, physical));
  if (root === undefined) return [];
  const inside = slashed(physical.slice(root.length));
  const prefix = inside && slashed(cwd).endsWith(inside) ? cwd.slice(0, cwd.length - inside.length) : undefined;
  const prefixPhysical = prefix ? tryRealpath(prefix) : undefined;
  if (prefix && prefixPhysical && slashed(prefixPhysical) === slashed(root)) return [{ from: prefix, to: "" }];
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

const PATH_END = `$|[\\s"'\`:;,)\\]}>|&]`;
const WINDOWS_TAIL = `[^\\s"'\`,;|<>]*`;
const PATH_KEYS = new Set(["file_path", "filePath", "filepath", "notebook_path", "path", "file"]);
const SKIPPED_KEYS = new Set(["image_data", "imageData"]);

// A root counts only where a path starts (not after a word character, `/`, `-`, `.`, `~` or a
// `host:` prefix) and where it ends, so `/mnt/repo/x`, `repo-old/` and `build:/repo` stay as they
// are. Windows and macOS file systems ignore case, so their roots match in any case. Windows
// paths come out with forward slashes, like the file index: free text cannot say where a path
// ends, so it is converted up to the next space or list separator, while a path field is one
// path and is converted in full.
function aliasPattern(aliases: readonly PathAlias[], platform: NodeJS.Platform): RegExp | null {
  if (aliases.length === 0) return null;
  const alternatives = aliases.map((alias) => `(${escapeRegExp(alias.from)})`).join("|");
  const tail = platform === "win32" ? WINDOWS_TAIL : "";
  return new RegExp(
    `(?<![\\w.~/\\\\:-])(?:${alternatives})(?:([\\\\/]+)(?!${PATH_END})(${tail})|[\\\\/]*(?=${PATH_END}))`,
    platform === "win32" || platform === "darwin" ? "gi" : "g",
  );
}

export function relativizePaths(
  value: unknown,
  aliases: readonly PathAlias[],
  platform: NodeJS.Platform = process.platform,
): unknown {
  const pattern = aliasPattern(aliases, platform);
  if (!pattern) return value;
  const windows = platform === "win32";
  const rewrite = (_match: string, ...groups: unknown[]): string => {
    const to = aliases[groups.findIndex((group) => typeof group === "string")]?.to ?? "";
    if (typeof groups[aliases.length] !== "string") return to || ".";
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
    if (Array.isArray(node)) return node.map((child) => walk(child, key));
    if (node && typeof node === "object" && Object.getPrototypeOf(node) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(node).map(([k, child]) => [k, SKIPPED_KEYS.has(k) ? child : walk(child, k)]),
      );
    }
    return node;
  };
  return walk(value);
}

export function relativizeFilePath(
  file: string,
  aliases: readonly PathAlias[],
  platform: NodeJS.Platform = process.platform,
): string {
  const rewritten = relativizePaths({ file_path: file }, aliases, platform) as { file_path: string };
  return rewritten.file_path;
}
