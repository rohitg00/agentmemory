/**
 * Exact session -> workspace lookup from Cursor's own SQLite storage.
 *
 * Everything else in the resolver infers the workspace: from payload fields
 * Cursor may or may not send, from paths that happen to appear in tool
 * arguments, from a transcript directory name whose path separators have been
 * flattened into hyphens. Those work, but they are inference, and inference
 * that lands on the wrong project writes a user's memories into the wrong
 * place without ever reporting an error.
 *
 * Cursor knows the answer exactly, and stores it. The layout (reverse
 * engineered; see integrations/cursor/README.md for the full picture):
 *
 *   <userdir>/globalStorage/state.vscdb
 *     ItemTable["composer.composerHeaders"]
 *       -> { allComposers: [ { composerId, workspaceIdentifier: {
 *              id, uri: { fsPath, ... } } } ] }
 *
 * A Cursor hook's `session_id` is the `composerId`, so one indexed lookup
 * gives the workspace path with no guessing.
 *
 * Two things stop this from being the only strategy:
 *
 *  - Cursor 3.0 (April 2026) moved this index from per-workspace databases
 *    into the global one, and the migration is lazy: a workspace migrates
 *    when it is next opened. Machines still on <=2.6, or with workspaces not
 *    opened since the upgrade, keep the old per-workspace `allComposers`
 *    array instead. Both shapes are handled below.
 *  - Reading SQLite needs a driver. `node:sqlite` only exists from Node 22.5,
 *    and this package supports Node >=20. better-sqlite3 is an optional
 *    dependency of the daemon, not something a hook can count on.
 *
 * So every failure path here returns null and the caller falls back to
 * inference. This module is an accuracy upgrade, never a requirement.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

interface Statement {
  get(...params: unknown[]): unknown;
}
interface DbHandle {
  prepare(sql: string): Statement;
  close(): void;
}
interface Driver {
  open(path: string): DbHandle;
}

// `undefined` = not probed yet, `null` = probed and unavailable.
let driverCache: Driver | null | undefined;

// node:sqlite is still flagged experimental and emits a process warning the
// first time it is required. Hook stderr is surfaced in Cursor's hook log, so
// a warning on every session would be noise about an implementation detail
// the user did not ask for. Silence that one warning across the require, then
// restore whatever listeners were there.
function requireQuietly<T>(id: string): T | null {
  const previous = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning: Error) => {
    if (warning.name !== "ExperimentalWarning") process.emitWarning(warning);
  });
  try {
    return require(id) as T;
  } catch {
    return null;
  } finally {
    process.removeAllListeners("warning");
    for (const listener of previous) process.on("warning", listener);
  }
}

function loadDriver(): Driver | null {
  if (driverCache !== undefined) return driverCache;

  const nodeSqlite = requireQuietly<{ DatabaseSync: new (p: string, o?: object) => DbHandle }>(
    "node:sqlite",
  );
  if (nodeSqlite?.DatabaseSync) {
    driverCache = {
      open: (path) => new nodeSqlite.DatabaseSync(path, { readOnly: true }),
    };
    return driverCache;
  }

  // Same lazy-optional pattern the daemon uses for better-sqlite3 in
  // src/functions/migrate.ts -- used when installed, never required.
  const better = requireQuietly<new (p: string, o?: object) => DbHandle>("better-sqlite3");
  if (better) {
    driverCache = {
      open: (path) => new better(path, { readonly: true, fileMustExist: true }),
    };
    return driverCache;
  }

  driverCache = null;
  return driverCache;
}

/** Read one ItemTable value. Returns null for any failure, including a locked DB. */
function readItemTableValue(dbPath: string, key: string): string | null {
  if (!existsSync(dbPath)) return null;
  const driver = loadDriver();
  if (!driver) return null;

  let db: DbHandle | null = null;
  try {
    db = driver.open(dbPath);
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key) as
      | { value?: unknown }
      | undefined;
    const value = row?.value;
    if (typeof value === "string") return value;
    if (value instanceof Uint8Array) return Buffer.from(value).toString("utf-8");
    return null;
  } catch {
    // Cursor holds the database open while running. Readers normally coexist
    // fine, but a locked or half-migrated file must not break the hook.
    return null;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

export interface CursorStorageRoots {
  globalStorage: string;
  workspaceStorage: string;
}

export function cursorStorageRoots(): CursorStorageRoots | null {
  const home = homedir();
  const bases: string[] = [];
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"];
    if (appData) bases.push(join(appData, "Cursor", "User"));
    bases.push(join(home, "AppData", "Roaming", "Cursor", "User"));
  } else if (process.platform === "darwin") {
    bases.push(join(home, "Library", "Application Support", "Cursor", "User"));
  } else {
    const configHome = process.env["XDG_CONFIG_HOME"];
    if (configHome) bases.push(join(configHome, "Cursor", "User"));
    bases.push(join(home, ".config", "Cursor", "User"));
  }

  for (const base of bases) {
    const globalStorage = join(base, "globalStorage");
    if (existsSync(globalStorage)) {
      return { globalStorage, workspaceStorage: join(base, "workspaceStorage") };
    }
  }
  return null;
}

interface ComposerHeader {
  composerId?: unknown;
  workspaceIdentifier?: { uri?: { fsPath?: unknown; path?: unknown } };
}

function fsPathFromHeader(header: ComposerHeader | undefined): string | null {
  const uri = header?.workspaceIdentifier?.uri;
  const value = uri?.fsPath ?? uri?.path;
  return typeof value === "string" && value.trim() ? value : null;
}

/** Cursor 3.0+: one central index in the global database. */
function fromGlobalIndex(sessionId: string, roots: CursorStorageRoots): string | null {
  const raw = readItemTableValue(
    join(roots.globalStorage, "state.vscdb"),
    "composer.composerHeaders",
  );
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { allComposers?: ComposerHeader[] };
    const hit = parsed.allComposers?.find((c) => c?.composerId === sessionId);
    // A hit with no uri is a workspace-less "empty window" chat -- Cursor
    // genuinely has no path for it, so neither do we.
    return fsPathFromHeader(hit);
  } catch {
    return null;
  }
}

/** `{"folder":"file:///d%3A/repo"}`, or a vscode-remote:// URI we cannot map. */
function folderFromWorkspaceJson(workspaceDir: string): string | null {
  const file = join(workspaceDir, "workspace.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as { folder?: unknown };
    const folder = parsed.folder;
    if (typeof folder !== "string" || !folder.startsWith("file://")) return null;
    return fileURLToPath(folder);
  } catch {
    return null;
  }
}

// Pre-3.0 lookup means opening one database per workspace, so it is ordered
// by recency and capped: the workspace a live session belongs to was touched
// moments ago and sits at the top. A full scan of ~120 workspaces measures
// around 200ms; this ordering turns the common case into one or two opens.
const LEGACY_SCAN_LIMIT = 40;

function fromLegacyWorkspaceDbs(sessionId: string, roots: CursorStorageRoots): string | null {
  if (!existsSync(roots.workspaceStorage)) return null;

  let dirs: Array<{ dir: string; mtime: number }>;
  try {
    dirs = readdirSync(roots.workspaceStorage)
      .map((dir) => {
        try {
          return { dir, mtime: statSync(join(roots.workspaceStorage, dir, "state.vscdb")).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { dir: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, LEGACY_SCAN_LIMIT);
  } catch {
    return null;
  }

  for (const { dir } of dirs) {
    const raw = readItemTableValue(
      join(roots.workspaceStorage, dir, "state.vscdb"),
      "composer.composerData",
    );
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { allComposers?: Array<{ composerId?: unknown }> };
      // Migrated workspaces no longer carry allComposers; their sessions are
      // in the global index handled above.
      if (!Array.isArray(parsed.allComposers)) continue;
      if (!parsed.allComposers.some((c) => c?.composerId === sessionId)) continue;
      return folderFromWorkspaceJson(join(roots.workspaceStorage, dir));
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The workspace directory Cursor recorded for this session, or null when it
 * cannot be determined (no driver, no storage, workspace-less window, or a
 * remote URI that does not map to a local path).
 */
export function workspaceFromCursorDb(sessionId: string): string | null {
  if (!sessionId) return null;
  const roots = cursorStorageRoots();
  if (!roots) return null;
  return fromGlobalIndex(sessionId, roots) ?? fromLegacyWorkspaceDbs(sessionId, roots);
}
