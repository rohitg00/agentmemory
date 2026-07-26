#!/usr/bin/env node
import { createRequire } from "node:module";
import { execSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
//#region src/hooks/cursor/cursor-db.ts
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
const require = createRequire(import.meta.url);
let driverCache;
let warningFilterInstalled = false;
function suppressSqliteExperimentalWarning() {
	if (warningFilterInstalled) return;
	warningFilterInstalled = true;
	const previous = process.listeners("warning");
	process.removeAllListeners("warning");
	process.on("warning", (warning) => {
		if (warning.name === "ExperimentalWarning" && /sqlite/i.test(warning.message)) return;
		for (const listener of previous) listener(warning);
	});
}
function requireQuietly(id) {
	suppressSqliteExperimentalWarning();
	try {
		return require(id);
	} catch {
		return null;
	}
}
function loadDriver() {
	if (driverCache !== void 0) return driverCache;
	const nodeSqlite = requireQuietly("node:sqlite");
	if (nodeSqlite?.DatabaseSync) {
		driverCache = { open: (path) => new nodeSqlite.DatabaseSync(path, { readOnly: true }) };
		return driverCache;
	}
	const better = requireQuietly("better-sqlite3");
	if (better) {
		driverCache = { open: (path) => new better(path, {
			readonly: true,
			fileMustExist: true
		}) };
		return driverCache;
	}
	driverCache = null;
	return driverCache;
}
/** Read one ItemTable value. Returns null for any failure, including a locked DB. */
function readItemTableValue(dbPath, key) {
	if (!existsSync(dbPath)) return null;
	const driver = loadDriver();
	if (!driver) return null;
	let db = null;
	try {
		db = driver.open(dbPath);
		const value = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key)?.value;
		if (typeof value === "string") return value;
		if (value instanceof Uint8Array) return Buffer.from(value).toString("utf-8");
		return null;
	} catch {
		return null;
	} finally {
		try {
			db?.close();
		} catch {}
	}
}
function cursorStorageRoots() {
	const home = homedir();
	const bases = [];
	if (process.platform === "win32") {
		const appData = process.env["APPDATA"];
		if (appData) bases.push(join(appData, "Cursor", "User"));
		bases.push(join(home, "AppData", "Roaming", "Cursor", "User"));
	} else if (process.platform === "darwin") bases.push(join(home, "Library", "Application Support", "Cursor", "User"));
	else {
		const configHome = process.env["XDG_CONFIG_HOME"];
		if (configHome) bases.push(join(configHome, "Cursor", "User"));
		bases.push(join(home, ".config", "Cursor", "User"));
	}
	for (const base of bases) {
		const globalStorage = join(base, "globalStorage");
		if (existsSync(globalStorage)) return {
			globalStorage,
			workspaceStorage: join(base, "workspaceStorage")
		};
	}
	return null;
}
function fsPathFromHeader(header) {
	const uri = header?.workspaceIdentifier?.uri;
	const value = uri?.fsPath ?? uri?.path;
	return typeof value === "string" && value.trim() ? value : null;
}
/** Cursor 3.0+: one central index in the global database. */
function fromGlobalIndex(sessionId, roots) {
	const raw = readItemTableValue(join(roots.globalStorage, "state.vscdb"), "composer.composerHeaders");
	if (!raw) return null;
	try {
		const hit = JSON.parse(raw).allComposers?.find((c) => c?.composerId === sessionId);
		return fsPathFromHeader(hit);
	} catch {
		return null;
	}
}
/** `{"folder":"file:///d%3A/repo"}`, or a vscode-remote:// URI we cannot map. */
function folderFromWorkspaceJson(workspaceDir) {
	const file = join(workspaceDir, "workspace.json");
	if (!existsSync(file)) return null;
	try {
		const folder = JSON.parse(readFileSync(file, "utf-8")).folder;
		if (typeof folder !== "string" || !folder.startsWith("file://")) return null;
		return fileURLToPath(folder);
	} catch {
		return null;
	}
}
const LEGACY_SCAN_LIMIT = 40;
function fromLegacyWorkspaceDbs(sessionId, roots) {
	if (!existsSync(roots.workspaceStorage)) return null;
	let dirs;
	try {
		dirs = readdirSync(roots.workspaceStorage).map((dir) => {
			try {
				return {
					dir,
					mtime: statSync(join(roots.workspaceStorage, dir, "state.vscdb")).mtimeMs
				};
			} catch {
				return null;
			}
		}).filter((x) => x !== null).sort((a, b) => b.mtime - a.mtime).slice(0, LEGACY_SCAN_LIMIT);
	} catch {
		return null;
	}
	for (const { dir } of dirs) {
		const raw = readItemTableValue(join(roots.workspaceStorage, dir, "state.vscdb"), "composer.composerData");
		if (!raw) continue;
		try {
			const parsed = JSON.parse(raw);
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
function workspaceFromCursorDb(sessionId) {
	if (!sessionId) return null;
	const roots = cursorStorageRoots();
	if (!roots) return null;
	return fromGlobalIndex(sessionId, roots) ?? fromLegacyWorkspaceDbs(sessionId, roots);
}
//#endregion
//#region src/hooks/cursor/workspace.ts
const HOME = homedir();
const CURSOR_PROJECTS_DIR = join(HOME, ".cursor", "projects");
const SESSION_CACHE_PATH = join(HOME, ".cursor", "hooks", ".agentmemory-session-cache.json");
join(HOME, ".cursor", "hooks", ".am-hook-payloads");
function normalizePathSlashes(value) {
	return String(value).replace(/\\/g, "/");
}
function isCursorMetadataPath(value) {
	if (!value || typeof value !== "string") return false;
	const trimmed = normalizePathSlashes(value.trim());
	if (trimmed === ".cursor") return true;
	if (/(^|\/)\.cursor\/worktrees\/[^/]/.test(trimmed)) return false;
	return /(^|\/)\.cursor(\/|$)/.test(trimmed);
}
function pathUnderHome(value) {
	if (typeof value !== "string") return false;
	const homeNorm = normalizePathSlashes(HOME);
	const valueNorm = normalizePathSlashes(value);
	return valueNorm === homeNorm || valueNorm.startsWith(`${homeNorm}/`);
}
function isIdeInstallPath(value) {
	if (!value || typeof value !== "string") return false;
	const norm = normalizePathSlashes(value).toLowerCase();
	return /(^|[\\/])(programs|program files|program files \(x86\))[\\/]cursor([\\/]|$)/i.test(norm) || /cursor\.app[\\/]contents/i.test(norm) || /(^|[\\/])microsoft vs code[\\/]resources[\\/]app([\\/]|$)/i.test(norm);
}
function isBadPath(value) {
	if (!value || typeof value !== "string") return true;
	const trimmed = normalizePathSlashes(value.trim());
	if (!trimmed || trimmed === "/" || trimmed === ".") return true;
	if (/^[a-zA-Z]:\/?$/.test(trimmed)) return true;
	if (isCursorMetadataPath(trimmed)) return true;
	if (isIdeInstallPath(trimmed)) return true;
	return false;
}
function sleepMs(ms) {
	const end = Date.now() + ms;
	while (Date.now() < end);
}
function withSessionCacheLock(fn) {
	const lockPath = `${SESSION_CACHE_PATH}.lock`;
	mkdirSync(dirname(SESSION_CACHE_PATH), { recursive: true });
	let fd;
	for (let i = 0; i < 50; i++) try {
		fd = openSync(lockPath, "wx");
		break;
	} catch {
		sleepMs(10);
	}
	if (fd === void 0) return void 0;
	try {
		return fn();
	} finally {
		closeSync(fd);
		try {
			unlinkSync(lockPath);
		} catch {}
	}
}
function loadSessionCache() {
	try {
		return JSON.parse(readFileSync(SESSION_CACHE_PATH, "utf-8"));
	} catch {
		return {};
	}
}
function rememberSession(sessionId, project, cwd) {
	if (!sessionId || !project || project === ".cursor") return;
	withSessionCacheLock(() => {
		try {
			const cache = loadSessionCache();
			cache[sessionId] = {
				project,
				cwd,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
			const tmp = `${SESSION_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
			writeFileSync(tmp, JSON.stringify(cache, null, 2));
			renameSync(tmp, SESSION_CACHE_PATH);
		} catch {}
	});
}
function recallSession(sessionId) {
	if (!sessionId) return null;
	return loadSessionCache()[sessionId] ?? null;
}
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
	"/nix/"
];
function isSystemPath(value) {
	const norm = normalizePathSlashes(value);
	return SYSTEM_PATH_PREFIXES.some((prefix) => norm.startsWith(prefix));
}
function isCollectablePath(value) {
	if (typeof value !== "string" || isCursorMetadataPath(value)) return false;
	if (pathUnderHome(value)) return true;
	if (/^[a-zA-Z]:[\\/]/.test(value)) return pathExists(value);
	if (value.startsWith("/")) return !isSystemPath(value) && pathExists(value);
	return false;
}
function collectPathStrings(value, out = []) {
	if (typeof value === "string") {
		if (isCollectablePath(value)) out.push(value);
		return out;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectPathStrings(item, out);
		return out;
	}
	if (value && typeof value === "object") for (const v of Object.values(value)) collectPathStrings(v, out);
	return out;
}
function pathExists(pathValue) {
	if (existsSync(pathValue)) return true;
	if (process.platform === "win32") {
		const native = pathValue.replace(/\//g, "\\");
		if (native !== pathValue && existsSync(native)) return true;
	}
	return false;
}
const MAX_ANCESTOR_STEPS = 64;
function existingAncestor(pathValue) {
	let current = pathValue;
	for (let step = 0; step < MAX_ANCESTOR_STEPS; step++) {
		if (!current || current === HOME || current === "/") return null;
		if (pathExists(current)) {
			const resolved = process.platform === "win32" ? current.replace(/\//g, "\\") : current;
			try {
				if (statSync(resolved).isFile()) return dirname(resolved);
			} catch {}
			return resolved;
		}
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
	return null;
}
function gitRootFromPath(targetPath) {
	return execSync("git rev-parse --show-toplevel", {
		cwd: targetPath,
		encoding: "utf-8",
		stdio: [
			"ignore",
			"pipe",
			"ignore"
		]
	}).trim();
}
function gitRootNearby(startPath) {
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
function cleanRepoName(dirPath) {
	const normalized = normalizePathSlashes(dirPath).replace(/\/+$/, "");
	if (!normalized) return "unknown-project";
	const claudeWt = normalized.match(/^(.*?)\/\.claude\/worktrees\/[^/]+$/i);
	if (claudeWt?.[1]) return cleanRepoName(claudeWt[1]);
	const cursorWt = normalized.match(/\/\.cursor\/worktrees\/([^/]+)$/i);
	if (cursorWt?.[1]) return cursorWt[1].replace(/-[a-z0-9]{4,8}$/i, "") || cursorWt[1];
	const baseName = basename(normalized);
	if (/^agent-[a-f0-9]{6,}$/i.test(baseName)) {
		const parent = dirname(normalized);
		if (parent && parent !== normalized && parent !== "." && parent !== "/") return cleanRepoName(parent);
	}
	return baseName.replace(/(-worktree-\d+|-worktree|-[a-f0-9]{7,40})$/i, "") || "unknown-project";
}
function projectFromPath(targetPath) {
	try {
		return {
			name: cleanRepoName(gitRootFromPath(targetPath)),
			fromGitRoot: true
		};
	} catch {
		return {
			name: cleanRepoName(targetPath),
			fromGitRoot: false
		};
	}
}
function decodeSlugCandidates(slug) {
	if (!slug || slug === "empty-window") return [];
	if (/^\d{10,}$/.test(slug)) return [];
	const parts = slug.split("-");
	if (!parts.length) return [];
	const results = /* @__PURE__ */ new Set();
	function walk(index, currentPath) {
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
	const first = parts[0];
	if (first && /^[a-zA-Z]$/.test(first)) walk(1, `${first.toUpperCase()}:`);
	walk(0, "");
	return [...results];
}
function pickBestCandidate(candidates, preferredLabel) {
	if (!candidates.length) return null;
	if (preferredLabel) {
		const labelMatch = candidates.find((p) => basename(p) === preferredLabel);
		if (labelMatch) return labelMatch;
	}
	const gitRoots = [];
	for (const candidate of candidates) try {
		gitRoots.push(gitRootFromPath(candidate));
	} catch {}
	const uniqueGitRoots = [...new Set(gitRoots)];
	if (uniqueGitRoots.length === 1) return uniqueGitRoots[0] ?? null;
	return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}
function findSessionTranscript(sessionId) {
	if (!sessionId || !existsSync(CURSOR_PROJECTS_DIR)) return null;
	for (const slug of readdirSync(CURSOR_PROJECTS_DIR)) {
		const transcriptsRoot = join(CURSOR_PROJECTS_DIR, slug, "agent-transcripts");
		if (!existsSync(transcriptsRoot)) continue;
		for (const entry of readdirSync(transcriptsRoot)) if (entry === sessionId || entry.startsWith(`${sessionId}-`)) {
			const transcriptFile = join(transcriptsRoot, entry, `${entry}.jsonl`);
			return {
				slug,
				transcriptFile: existsSync(transcriptFile) ? transcriptFile : null
			};
		}
	}
	return null;
}
const TRANSCRIPT_SCAN_BYTES = 25e4;
const TRANSCRIPT_CANDIDATE_LIMIT = 120;
const TRANSCRIPT_MATCH_LIMIT = 4e3;
const TRANSCRIPT_MIN_VOTES = 3;
const TRANSCRIPT_PATH_PATTERNS = [/[a-zA-Z]:[A-Za-z0-9._@+\-/]{3,240}/g, /\/[A-Za-z0-9._@+\-/]{3,240}/g];
function workspaceFromTranscriptFile(transcriptFile) {
	if (!transcriptFile || !existsSync(transcriptFile)) return null;
	const chunk = normalizePathSlashes(readFileSync(transcriptFile, "utf-8").slice(0, TRANSCRIPT_SCAN_BYTES));
	const counts = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	for (const pattern of TRANSCRIPT_PATH_PATTERNS) {
		pattern.lastIndex = 0;
		let match;
		let scanned = 0;
		while ((match = pattern.exec(chunk)) !== null) {
			if (++scanned > TRANSCRIPT_MATCH_LIMIT) break;
			if (seen.size >= TRANSCRIPT_CANDIDATE_LIMIT) break;
			const value = match[0];
			if (seen.has(value)) continue;
			seen.add(value);
			if (value.startsWith("//")) continue;
			if (isCursorMetadataPath(value) || isIdeInstallPath(value) || isSystemPath(value)) continue;
			const existing = existingDirectory(value);
			if (!existing || existing === HOME || isBadPath(existing)) continue;
			const root = gitRootNearby(existing);
			if (!root || root === HOME || isBadPath(root)) continue;
			counts.set(root, (counts.get(root) || 0) + 1);
		}
	}
	let best = null;
	let bestCount = 0;
	for (const [pathValue, count] of counts) if (count > bestCount) {
		best = pathValue;
		bestCount = count;
	}
	return bestCount >= TRANSCRIPT_MIN_VOTES ? best : null;
}
function workspaceFromSessionId(sessionId) {
	const hit = findSessionTranscript(sessionId);
	if (!hit) return null;
	const preferredLabel = process.env["CURSOR_WORKSPACE_LABEL"] || "";
	const fromSlug = pickBestCandidate(decodeSlugCandidates(hit.slug), preferredLabel);
	if (fromSlug) return fromSlug;
	return workspaceFromTranscriptFile(hit.transcriptFile);
}
function isMetadataProject(project) {
	return project.name.startsWith(".") && !project.fromGitRoot;
}
function existingDirectory(pathValue) {
	if (!pathExists(pathValue)) return null;
	const resolved = process.platform === "win32" ? pathValue.replace(/\//g, "\\") : pathValue;
	try {
		return statSync(resolved).isFile() ? dirname(resolved) : resolved;
	} catch {
		return null;
	}
}
function resolveFromPathCandidates(candidates, sessionId, options = {}) {
	for (const candidate of candidates) {
		if (typeof candidate !== "string" || isBadPath(candidate)) continue;
		const existing = options.exact ? existingDirectory(candidate) : existingAncestor(candidate);
		if (!existing || isBadPath(existing)) continue;
		const project = projectFromPath(existing);
		if (!isMetadataProject(project)) {
			rememberSession(sessionId, project.name, existing);
			return {
				project: project.name,
				cwd: existing
			};
		}
	}
	return null;
}
function debugLayer(layer, result) {
	if (result && process.env["AM_CURSOR_DEBUG"] === "1") console.error(`[agentmemory] workspace resolved by ${layer}: ${result.project} (${result.cwd})`);
	return result;
}
function resolveWorkspace(data) {
	const sessionId = data?.["session_id"] ?? data?.["sessionId"];
	const cached = recallSession(sessionId);
	if (cached?.cwd && !isBadPath(cached.cwd)) return {
		project: cached.project,
		cwd: cached.cwd
	};
	const fromPayload = debugLayer("payload", resolveFromPathCandidates([
		...Array.isArray(data?.["workspace_roots"]) ? data["workspace_roots"] : [],
		...Array.isArray(data?.["workspace_folders"]) ? data["workspace_folders"] : [],
		data?.["workspace_folder"],
		data?.["workspaceFolder"],
		data?.["workspace"],
		data?.["cwd"],
		data?.["root_path"],
		data?.["project_path"]
	], sessionId));
	if (fromPayload) return fromPayload;
	const fromTools = debugLayer("tool_input", resolveFromPathCandidates(collectPathStrings(data?.["tool_input"]).map(existingAncestor).filter((p) => Boolean(p) && !isIdeInstallPath(p)), sessionId));
	if (fromTools) return fromTools;
	if (sessionId) {
		const fromDb = debugLayer("cursor-db", resolveFromPathCandidates([workspaceFromCursorDb(sessionId)], sessionId, { exact: true }));
		if (fromDb) return fromDb;
		const fromSession = debugLayer("transcript-dir", resolveFromPathCandidates([workspaceFromSessionId(sessionId)], sessionId, { exact: true }));
		if (fromSession) return fromSession;
	}
	const fromEnv = debugLayer("env", resolveFromPathCandidates([
		process.env["CURSOR_WORKSPACE_ROOT"],
		process.env["CURSOR_WORKSPACE_FOLDER"],
		process.env["PWD"],
		process.env["VSCODE_CWD"]
	], sessionId));
	if (fromEnv) return fromEnv;
	const label = process.env["CURSOR_WORKSPACE_LABEL"];
	if (label) {
		rememberSession(sessionId, label, label);
		return {
			project: label,
			cwd: label
		};
	}
	return {
		project: "unknown-project",
		cwd: "unknown-project"
	};
}
//#endregion
//#region src/hooks/cursor/delegate.ts
const HOOK_MAP = {
	sessionStart: "session-start.mjs",
	beforeSubmitPrompt: "prompt-submit.mjs",
	preToolUse: "pre-tool-use.mjs",
	postToolUse: "post-tool-use.mjs",
	postToolUseFailure: "post-tool-failure.mjs",
	preCompact: "pre-compact.mjs",
	subagentStart: "subagent-start.mjs",
	subagentStop: "subagent-stop.mjs",
	stop: "stop.mjs",
	sessionEnd: "session-end.mjs"
};
function isCursorHookKey(value) {
	return typeof value === "string" && value in HOOK_MAP;
}
const SLOW_HOOKS = new Set(["stop", "sessionEnd"]);
function defaultOfficialDir() {
	return join(dirname(fileURLToPath(import.meta.url)), "..");
}
function enrichPayload(data) {
	const { project, cwd } = resolveWorkspace(data);
	return {
		project,
		payload: {
			...data,
			session_id: data["session_id"] ?? data["sessionId"],
			cwd
		}
	};
}
function delegateHook(hookKey, data, options = {}) {
	const script = HOOK_MAP[hookKey];
	const scriptPath = join(options.officialDir ?? defaultOfficialDir(), script);
	if (!existsSync(scriptPath)) {
		console.error(`[agentmemory] cursor hook "${hookKey}": canonical hook not found at ${scriptPath}. Run \`npm run build\` in the agentmemory checkout.`);
		return 0;
	}
	const { project, payload } = enrichPayload(data);
	const child = spawnSync(process.execPath, [scriptPath], {
		input: JSON.stringify(payload),
		env: {
			...process.env,
			AGENTMEMORY_PROJECT_NAME: project
		},
		encoding: "utf-8",
		maxBuffer: 10 * 1024 * 1024,
		timeout: SLOW_HOOKS.has(hookKey) ? 18e4 : 3e4
	});
	if (child.stdout) process.stdout.write(child.stdout);
	if (child.stderr) process.stderr.write(child.stderr);
	if (child.error) {
		console.error(`[agentmemory] cursor hook "${hookKey}" could not run ${script}: ${child.error.message}`);
		return 0;
	}
	if (child.signal) {
		console.error(`[agentmemory] cursor hook "${hookKey}" (${script}) was killed by ${child.signal} -- treating as no-op`);
		return 0;
	}
	return child.status ?? 0;
}
//#endregion
//#region src/hooks/cursor/run-hook.ts
async function main() {
	const hookKey = process.argv[2];
	if (!isCursorHookKey(hookKey)) process.exit(0);
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	if (!input.trim()) process.exit(0);
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		process.exit(0);
	}
	process.exit(delegateHook(hookKey, data));
}
main();
//#endregion
export {};

//# sourceMappingURL=run-hook.mjs.map