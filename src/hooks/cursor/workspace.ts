import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { homedir } from "node:os";
import { workspaceFromCursorDb } from "./cursor-db.js";

// Cursor does not hand hooks a trustworthy working directory: `cwd` can be
// `.cursor`, the IDE install path (via VSCODE_CWD), or absent entirely. This
// module is the Cursor-specific piece of the adapter — everything it exists
// to do is turn whatever Cursor sends into a real project directory, so the
// canonical hooks in src/hooks/*.ts can stay unchanged.
const HOME = homedir();
const CURSOR_PROJECTS_DIR = join(HOME, ".cursor", "projects");
const SESSION_CACHE_PATH = join(HOME, ".cursor", "hooks", ".agentmemory-session-cache.json");
const HOOK_PAYLOAD_DIR = join(HOME, ".cursor", "hooks", ".am-hook-payloads");

export interface Workspace {
  project: string;
  cwd: string;
}

export type HookData = Record<string, unknown> | null | undefined;

interface SessionCacheEntry {
  project: string;
  cwd: string;
  updatedAt: string;
}

type SessionCache = Record<string, SessionCacheEntry>;

export function normalizePathSlashes(value: unknown): string {
  return String(value).replace(/\\/g, "/");
}

export function isCursorMetadataPath(value: unknown): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = normalizePathSlashes(value.trim());
  if (trimmed === ".cursor") return true;
  // ~/.cursor/worktrees/<name> is the exception: Cursor puts real git
  // checkouts there for its background agents. Treating those as metadata
  // sends the session to whatever the transcript scan guesses instead of to
  // the repository the agent is actually editing.
  if (/(^|\/)\.cursor\/worktrees\/[^/]/.test(trimmed)) return false;
  return /(^|\/)\.cursor(\/|$)/.test(trimmed);
}

export function pathUnderHome(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const homeNorm = normalizePathSlashes(HOME);
  const valueNorm = normalizePathSlashes(value);
  return valueNorm === homeNorm || valueNorm.startsWith(`${homeNorm}/`);
}

// VSCODE_CWD points at the Cursor install directory, which resolves to a
// project literally named "cursor" if it is allowed through.
function isIdeInstallPath(value: unknown): boolean {
  if (!value || typeof value !== "string") return false;
  const norm = normalizePathSlashes(value).toLowerCase();
  return (
    /(^|[\\/])(programs|program files|program files \(x86\))[\\/]cursor([\\/]|$)/i.test(norm) ||
    /cursor\.app[\\/]contents/i.test(norm) ||
    /(^|[\\/])microsoft vs code[\\/]resources[\\/]app([\\/]|$)/i.test(norm)
  );
}

function isBadPath(value: unknown): boolean {
  if (!value || typeof value !== "string") return true;
  const trimmed = normalizePathSlashes(value.trim());
  if (!trimmed || trimmed === "/" || trimmed === ".") return true;
  // A bare drive root is never a project. Cursor emits a single-letter
  // transcript slug for some legacy windows ("c"), which decodes to "C:".
  if (/^[a-zA-Z]:\/?$/.test(trimmed)) return true;
  if (isCursorMetadataPath(trimmed)) return true;
  if (isIdeInstallPath(trimmed)) return true;
  return false;
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait: this runs inside a lock retry loop in a short-lived hook
    // process, where blocking is cheaper than an async scheduler hop.
  }
}

function withSessionCacheLock<T>(fn: () => T): T | undefined {
  const lockPath = `${SESSION_CACHE_PATH}.lock`;
  mkdirSync(dirname(SESSION_CACHE_PATH), { recursive: true });
  let fd: number | undefined;
  for (let i = 0; i < 50; i++) {
    try {
      fd = openSync(lockPath, "wx");
      break;
    } catch {
      sleepMs(10);
    }
  }
  if (fd === undefined) return undefined;
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {}
  }
}

function loadSessionCache(): SessionCache {
  try {
    return JSON.parse(readFileSync(SESSION_CACHE_PATH, "utf-8")) as SessionCache;
  } catch {
    return {};
  }
}

function rememberSession(sessionId: string | undefined, project: string, cwd: string): void {
  if (!sessionId || !project || project === ".cursor") return;
  withSessionCacheLock(() => {
    try {
      const cache = loadSessionCache();
      cache[sessionId] = { project, cwd, updatedAt: new Date().toISOString() };
      const tmp = `${SESSION_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, JSON.stringify(cache, null, 2));
      renameSync(tmp, SESSION_CACHE_PATH);
    } catch {}
  });
}

function recallSession(sessionId: string | undefined): SessionCacheEntry | null {
  if (!sessionId) return null;
  const cache = loadSessionCache();
  return cache[sessionId] ?? null;
}

// Absolute paths that belong to the OS rather than to any user project. A
// stray /usr/lib/... or /etc/... reference inside tool_input must not be
// allowed to resolve to a project named "lib" or "etc".
const SYSTEM_PATH_PREFIXES = [
  "/usr/",
  "/etc/",
  "/bin/",
  "/sbin/",
  "/lib/",
  "/lib64/",
  "/opt/",
  "/var/",
  "/proc/",
  "/sys/",
  "/dev/",
  "/run/",
  "/boot/",
  "/snap/",
  "/nix/",
];

function isSystemPath(value: string): boolean {
  const norm = normalizePathSlashes(value);
  return SYSTEM_PATH_PREFIXES.some((prefix) => norm.startsWith(prefix));
}

// tool_input carries whatever shape the tool used, so paths are harvested by
// walking the object. The filter has to be permissive enough to find the
// project and strict enough not to invent one.
function isCollectablePath(value: unknown): value is string {
  if (typeof value !== "string" || isCursorMetadataPath(value)) return false;
  if (pathUnderHome(value)) return true;
  // Windows drive-absolute: HOME is regularly on C: while the checkout sits
  // on D:, so a HOME-only rule loses every cross-drive project.
  if (/^[a-zA-Z]:[\\/]/.test(value)) return pathExists(value);
  // POSIX-absolute outside $HOME: containers (Codespaces, devcontainers)
  // check repos out at /workspaces/..., which a HOME-only rule silently
  // rejects. existingAncestor() and the git lookup downstream validate it.
  if (value.startsWith("/")) return !isSystemPath(value) && pathExists(value);
  return false;
}

function collectPathStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (isCollectablePath(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectPathStrings(v, out);
  }
  return out;
}

function pathExists(pathValue: string): boolean {
  if (existsSync(pathValue)) return true;
  if (process.platform === "win32") {
    const native = pathValue.replace(/\//g, "\\");
    if (native !== pathValue && existsSync(native)) return true;
  }
  return false;
}

const MAX_ANCESTOR_STEPS = 64;

// Payloads often carry a file path (tool_input.path) rather than a
// directory, and sometimes a path that no longer exists. Walk up until
// something real is found, then normalise a file down to its directory.
function existingAncestor(pathValue: string): string | null {
  let current = pathValue;
  for (let step = 0; step < MAX_ANCESTOR_STEPS; step++) {
    if (!current || current === HOME || current === "/") return null;
    if (pathExists(current)) {
      const resolved = process.platform === "win32" ? current.replace(/\//g, "\\") : current;
      try {
        if (statSync(resolved).isFile()) {
          return dirname(resolved);
        }
      } catch {}
      return resolved;
    }
    // dirname() is a fixed point at every filesystem root -- dirname("//") is
    // "//", dirname("C:") is "C:", dirname("D:/") is "D:/" -- so climbing
    // without a progress check spins forever. Nothing produced such an input
    // while this only ever saw $HOME-prefixed paths; a general path scan
    // produces them constantly, because every "https://host/x" in a
    // transcript contains a "//host/x".
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function gitRootFromPath(targetPath: string): string {
  return execSync("git rev-parse --show-toplevel", {
    cwd: targetPath,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

// Filesystem-only equivalent of `git rev-parse --show-toplevel`, for hot
// paths that would otherwise spawn a process per candidate. `.git` is a
// directory in a normal clone and a file in a linked worktree, so a plain
// existence check covers both.
function gitRootNearby(startPath: string): string | null {
  let current = startPath;
  for (let step = 0; step < MAX_ANCESTOR_STEPS; step++) {
    if (!current || current === "/") return null;
    if (pathExists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function cleanRepoName(dirPath: string): string {
  const normalized = normalizePathSlashes(dirPath).replace(/\/+$/, "");
  if (!normalized) return "unknown-project";

  const claudeWt = normalized.match(/^(.*?)\/\.claude\/worktrees\/[^/]+$/i);
  if (claudeWt?.[1]) return cleanRepoName(claudeWt[1]);

  // Cursor names agent worktrees "<repo>-<4-8 char token>" under
  // ~/.cursor/worktrees. Fold them back onto the repository so a background
  // agent's memories land with the rest of that project's.
  const cursorWt = normalized.match(/\/\.cursor\/worktrees\/([^/]+)$/i);
  if (cursorWt?.[1]) {
    const stripped = cursorWt[1].replace(/-[a-z0-9]{4,8}$/i, "");
    return stripped || cursorWt[1];
  }

  const baseName = basename(normalized);
  if (/^agent-[a-f0-9]{6,}$/i.test(baseName)) {
    const parent = dirname(normalized);
    if (parent && parent !== normalized && parent !== "." && parent !== "/") {
      return cleanRepoName(parent);
    }
  }

  const name = baseName.replace(/(-worktree-\d+|-worktree|-[a-f0-9]{7,40})$/i, "");
  return name || "unknown-project";
}

interface ResolvedProject {
  name: string;
  /** Whether the name came from a git toplevel rather than a bare directory. */
  fromGitRoot: boolean;
}

function projectFromPath(targetPath: string): ResolvedProject {
  try {
    return { name: cleanRepoName(gitRootFromPath(targetPath)), fromGitRoot: true };
  } catch {
    return { name: cleanRepoName(targetPath), fromGitRoot: false };
  }
}

// Cursor names each directory under ~/.cursor/projects after the workspace
// path with every separator flattened to "-", so the transcript directory for
// a session already encodes where that session was running. Decoding it is
// lossy in one direction only: a directory name may itself contain hyphens,
// which makes "d-Andrew-Code-cc-router" mean D:/Andrew/Code/cc-router and,
// just as validly on paper, D:/Andrew/Code/cc/router.
//
// The disambiguator is the filesystem. Try every way of grouping consecutive
// segments into one directory name, but only descend into groupings that
// actually exist -- pruning collapses what looks like a 2^segments search
// into the handful of real directories on the machine.
function decodeSlugCandidates(slug: string): string[] {
  if (!slug || slug === "empty-window") return [];
  // Cursor 3.x names workspace-less windows (started from the welcome screen)
  // after a timestamp. Those never correspond to a path.
  if (/^\d{10,}$/.test(slug)) return [];

  const parts = slug.split("-");
  if (!parts.length) return [];

  const results = new Set<string>();

  function walk(index: number, currentPath: string): void {
    if (index >= parts.length) {
      results.add(currentPath);
      return;
    }
    for (let take = 1; index + take <= parts.length; take++) {
      const next = `${currentPath}/${parts.slice(index, index + take).join("-")}`;
      if (!pathExists(next)) continue;
      walk(index + take, next);
    }
  }

  // A single leading letter is a Windows drive: "d-Andrew-Code" -> D:/Andrew/Code.
  // Without this branch the whole function returns nothing on Windows, which
  // is where HOME and the checkout most often sit on different drives.
  const first = parts[0];
  if (first && /^[a-zA-Z]$/.test(first)) walk(1, `${first.toUpperCase()}:`);
  // Otherwise the slug starts at the filesystem root: "Users-alice-src",
  // "home-andrew-src", "workspaces-repo".
  walk(0, "");

  return [...results];
}

function pickBestCandidate(candidates: string[], preferredLabel: string): string | null {
  if (!candidates.length) return null;
  if (preferredLabel) {
    const labelMatch = candidates.find((p) => basename(p) === preferredLabel);
    if (labelMatch) return labelMatch;
  }

  const gitRoots: string[] = [];
  for (const candidate of candidates) {
    try {
      gitRoots.push(gitRootFromPath(candidate));
    } catch {}
  }
  const uniqueGitRoots = [...new Set(gitRoots)];
  if (uniqueGitRoots.length === 1) return uniqueGitRoots[0] ?? null;

  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function findSessionTranscript(
  sessionId: string,
): { slug: string; transcriptFile: string | null } | null {
  if (!sessionId || !existsSync(CURSOR_PROJECTS_DIR)) return null;

  for (const slug of readdirSync(CURSOR_PROJECTS_DIR)) {
    const transcriptsRoot = join(CURSOR_PROJECTS_DIR, slug, "agent-transcripts");
    if (!existsSync(transcriptsRoot)) continue;

    for (const entry of readdirSync(transcriptsRoot)) {
      if (entry === sessionId || entry.startsWith(`${sessionId}-`)) {
        const transcriptFile = join(transcriptsRoot, entry, `${entry}.jsonl`);
        return {
          slug,
          transcriptFile: existsSync(transcriptFile) ? transcriptFile : null,
        };
      }
    }
  }
  return null;
}

const TRANSCRIPT_SCAN_BYTES = 250000;
const TRANSCRIPT_CANDIDATE_LIMIT = 120;
const TRANSCRIPT_MATCH_LIMIT = 4000;
const TRANSCRIPT_MIN_VOTES = 3;

// Paths are normalised to forward slashes before matching, so a Windows path
// looks like "D:/repo/src/a.ts" by the time these run.
//
// Both patterns are a single character class with one bounded quantifier, on
// purpose. The obvious formulation -- /\/(?:[\w.-]+\/)+[\w.-]*/ -- nests a
// quantifier inside a quantifier, and on a 250KB transcript full of
// slash-bearing strings that backtracks badly enough to hang the hook for
// minutes. There is no clever matching to do here anyway: grab anything
// path-shaped and let the existence check below decide.
const TRANSCRIPT_PATH_PATTERNS = [
  /[a-zA-Z]:[A-Za-z0-9._@+\-/]{3,240}/g, // Windows drive-absolute
  /\/[A-Za-z0-9._@+\-/]{3,240}/g, // POSIX absolute
];

// Last resort before environment variables: mine the session transcript for
// paths and take the directory that shows up across the most of them.
//
// This used to anchor its regex on $HOME, which quietly made the whole layer
// dead on the two most common non-trivial setups -- Windows with HOME on C:
// and the checkout on D:, and containers that check out under /workspaces.
// Match any absolute path shape instead and let existence plus the git lookup
// downstream throw out the noise (URLs, log fragments, OS paths).
function workspaceFromTranscriptFile(transcriptFile: string | null): string | null {
  if (!transcriptFile || !existsSync(transcriptFile)) return null;

  const chunk = normalizePathSlashes(
    readFileSync(transcriptFile, "utf-8").slice(0, TRANSCRIPT_SCAN_BYTES),
  );
  const counts = new Map<string, number>();
  const seen = new Set<string>();

  // Bounded on both axes: every candidate costs filesystem walks, and a busy
  // transcript can contain thousands of path-shaped strings.
  for (const pattern of TRANSCRIPT_PATH_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let scanned = 0;
    while ((match = pattern.exec(chunk)) !== null) {
      if (++scanned > TRANSCRIPT_MATCH_LIMIT) break;
      if (seen.size >= TRANSCRIPT_CANDIDATE_LIMIT) break;
      const value = match[0];
      if (seen.has(value)) continue;
      seen.add(value);
      // "//host/path" is the tail of a URL, not a filesystem path.
      if (value.startsWith("//")) continue;
      if (isCursorMetadataPath(value) || isIdeInstallPath(value) || isSystemPath(value)) continue;
      // Only paths that still exist vote, and they vote for their git root.
      //
      // Both halves matter. Letting a path climb to whatever ancestor still
      // exists (existingAncestor) means a deleted D:/repo/pkg/src/a.ts votes
      // for D:/repo, and a transcript is full of such paths, so the
      // shallowest common directory always wins -- a session in
      // D:/Andrew/Code/pkg resolves to the project "Code". Counting existing
      // directories as themselves instead just moves the problem: the winner
      // becomes whatever generic directory the conversation mentioned most,
      // which in practice is "/bin" or "C:/Users". Requiring a repository
      // root is what makes a vote mean "this is a project".
      const existing = existingDirectory(value);
      if (!existing || existing === HOME || isBadPath(existing)) continue;
      const root = gitRootNearby(existing);
      if (!root || root === HOME || isBadPath(root)) continue;
      counts.set(root, (counts.get(root) || 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [pathValue, count] of counts) {
    if (count > bestCount) {
      best = pathValue;
      bestCount = count;
    }
  }

  // One passing mention of a repository is not evidence that the session was
  // running in it. This layer is a guess of last resort, and a wrong guess
  // files a user's memories under someone else's project -- worse than
  // admitting the workspace is unknown.
  return bestCount >= TRANSCRIPT_MIN_VOTES ? best : null;
}

function workspaceFromSessionId(sessionId: string): string | null {
  const hit = findSessionTranscript(sessionId);
  if (!hit) return null;

  // Slug first. It is a lossy encoding of the workspace path, but every
  // candidate it produces is verified against the filesystem, so a result is
  // a directory that really exists and really matches the name Cursor gave
  // this session's transcript directory.
  const preferredLabel = process.env["CURSOR_WORKSPACE_LABEL"] || "";
  const fromSlug = pickBestCandidate(decodeSlugCandidates(hit.slug), preferredLabel);
  if (fromSlug) return fromSlug;

  // Transcript scan last: it answers "which directory is mentioned most in
  // this conversation", which is a guess, not a fact. Asked first it will
  // happily answer "agentmemory" for a session about agentmemory that was
  // actually running somewhere else entirely. It stays because it is the only
  // thing that can place a workspace-less window that was still working on
  // real files.
  return workspaceFromTranscriptFile(hit.transcriptFile);
}

export function readHookStdinComplete(maxWaitMs = 30000): Promise<string> {
  return new Promise((resolve) => {
    let input = "";
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      try {
        process.stdin.destroy();
      } catch {}
      resolve(input);
    };
    const t = setTimeout(finish, maxWaitMs);
    if (t.unref) t.unref();
    process.stdin.on("data", (c) => {
      input += c;
    });
    process.stdin.on("end", () => {
      clearTimeout(t);
      finish();
    });
    process.stdin.on("error", () => {
      clearTimeout(t);
      finish();
    });
  });
}

export function writeHookPayloadTemp(input: string): string {
  mkdirSync(HOOK_PAYLOAD_DIR, { recursive: true });
  try {
    chmodSync(HOOK_PAYLOAD_DIR, 0o700);
  } catch {}
  const path = join(HOOK_PAYLOAD_DIR, `am-hook-${process.pid}-${Date.now()}.json`);
  writeFileSync(path, input, { encoding: "utf-8", mode: 0o600 });
  return path;
}

export function readWorkerHookPayload(): Record<string, unknown> | null {
  const file = process.env["AM_HOOK_INPUT_FILE"];
  if (!file) {
    console.error("[agentmemory] missing AM_HOOK_INPUT_FILE in worker");
    return null;
  }
  try {
    const raw = readFileSync(file, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error("[agentmemory] failed to parse hook payload:", (err as Error).message);
    return null;
  } finally {
    try {
      unlinkSync(file);
    } catch {}
  }
}

// Sessions were landing under ".codex": a path pointing into an agent's state
// directory walked up to ~/.codex and that became the project name.
//
// Rejecting every dot-named directory would be wrong, though. Plenty of real
// projects are dot-named -- ~/.dotfiles, ~/.emacs.d, ~/.config kept under
// chezmoi, and GitHub's own convention of a repository literally named
// ".github". What separates those from ~/.codex or ~/.vscode is not the name,
// it is that a human deliberately version controls them. So the rule is "a
// dot-named directory that is not a repository", which needs no list of tool
// names to keep up to date as new agents ship.
function isMetadataProject(project: ResolvedProject): boolean {
  return project.name.startsWith(".") && !project.fromGitRoot;
}

function isHomeDirectory(pathValue: string): boolean {
  return normalizePathSlashes(pathValue) === normalizePathSlashes(HOME);
}

// The path exactly, or its parent when it points at a file. Unlike
// existingAncestor() this does not climb: for a workspace path that some
// source claims is authoritative, "the directory is gone" means the record is
// stale, not "use whatever ancestor still exists". Climbing there silently
// turns D:/Andrew/Code/cc-router (moved away) into the project "Code" and
// files the session's memories under it.
function existingDirectory(pathValue: string): string | null {
  if (!pathExists(pathValue)) return null;
  const resolved = process.platform === "win32" ? pathValue.replace(/\//g, "\\") : pathValue;
  try {
    return statSync(resolved).isFile() ? dirname(resolved) : resolved;
  } catch {
    return null;
  }
}

function resolveFromPathCandidates(
  candidates: unknown[],
  sessionId: string | undefined,
  options: { exact?: boolean } = {},
): Workspace | null {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || isBadPath(candidate)) continue;
    const existing = options.exact ? existingDirectory(candidate) : existingAncestor(candidate);
    if (!existing || isBadPath(existing)) continue;
    const project = projectFromPath(existing);
    // $HOME is what a hook sees when the agent was launched with no workspace
    // at all. Accepting it invents a project named after the account -- real
    // sessions were being filed under "Andrew" with cwd C:\Users\Andrew --
    // when the honest answer is that there is no workspace. Same carve-out as
    // the dot-directory rule: allowed when HOME is itself a repository, which
    // is the dotfiles-checked-out-in-$HOME layout.
    if (isHomeDirectory(existing) && !project.fromGitRoot) continue;
    if (!isMetadataProject(project)) {
      rememberSession(sessionId, project.name, existing);
      return { project: project.name, cwd: existing };
    }
  }
  return null;
}

// Which layer answered is the single most useful thing to know when a session
// lands under the wrong project, and it is invisible from the outside: every
// layer returns the same shape. Set AM_CURSOR_DEBUG=1 to have the resolver say
// so on stderr, which Cursor surfaces in its hook log.
function debugLayer(layer: string, result: Workspace | null): Workspace | null {
  if (result && process.env["AM_CURSOR_DEBUG"] === "1") {
    console.error(`[agentmemory] workspace resolved by ${layer}: ${result.project} (${result.cwd})`);
  }
  return result;
}

export function resolveWorkspace(data: HookData): Workspace {
  const sessionId = (data?.["session_id"] ?? data?.["sessionId"]) as string | undefined;
  const cached = recallSession(sessionId);
  if (cached?.cwd && !isBadPath(cached.cwd)) {
    return { project: cached.project, cwd: cached.cwd };
  }

  const payloadCandidates: unknown[] = [
    ...(Array.isArray(data?.["workspace_roots"]) ? (data["workspace_roots"] as unknown[]) : []),
    ...(Array.isArray(data?.["workspace_folders"]) ? (data["workspace_folders"] as unknown[]) : []),
    data?.["workspace_folder"],
    data?.["workspaceFolder"],
    data?.["workspace"],
    data?.["cwd"],
    data?.["root_path"],
    data?.["project_path"],
  ];

  const fromPayload = debugLayer("payload", resolveFromPathCandidates(payloadCandidates, sessionId));
  if (fromPayload) return fromPayload;

  const toolPaths = collectPathStrings(data?.["tool_input"])
    .map(existingAncestor)
    .filter((p): p is string => Boolean(p) && !isIdeInstallPath(p));
  const fromTools = debugLayer("tool_input", resolveFromPathCandidates(toolPaths, sessionId));
  if (fromTools) return fromTools;

  if (sessionId) {
    // Cursor's own record of where this session was running. Exact, so it is
    // tried before the inference layers below -- it costs one indexed SQLite
    // read (~5ms) and, because the result is cached per session, happens at
    // most once per session rather than once per hook.
    const fromDb = debugLayer(
      "cursor-db",
      resolveFromPathCandidates([workspaceFromCursorDb(sessionId)], sessionId, { exact: true }),
    );
    if (fromDb) return fromDb;

    // Same validation as every other layer: both sources here already
    // verified the directory exists, so `exact` keeps a stale one from
    // silently climbing to a parent.
    const fromSession = debugLayer(
      "transcript-dir",
      resolveFromPathCandidates([workspaceFromSessionId(sessionId)], sessionId, { exact: true }),
    );
    if (fromSession) return fromSession;
  }

  // Env comes last: VSCODE_CWD in particular is frequently the IDE install
  // directory rather than the workspace.
  const envCandidates: unknown[] = [
    process.env["CURSOR_WORKSPACE_ROOT"],
    process.env["CURSOR_WORKSPACE_FOLDER"],
    process.env["PWD"],
    process.env["VSCODE_CWD"],
  ];
  const fromEnv = debugLayer("env", resolveFromPathCandidates(envCandidates, sessionId));
  if (fromEnv) return fromEnv;

  const label = process.env["CURSOR_WORKSPACE_LABEL"];
  if (label) {
    rememberSession(sessionId, label, label);
    return { project: label, cwd: label };
  }

  return { project: "unknown-project", cwd: "unknown-project" };
}

export function resolveProject(data: HookData): string {
  return resolveWorkspace(data).project;
}
