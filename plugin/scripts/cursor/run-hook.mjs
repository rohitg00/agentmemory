#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
function existingAncestor(pathValue) {
	let current = pathValue;
	while (current && current !== HOME && current !== "/") {
		if (pathExists(current)) {
			const resolved = process.platform === "win32" ? current.replace(/\//g, "\\") : current;
			try {
				if (statSync(resolved).isFile()) return dirname(resolved);
			} catch {}
			return resolved;
		}
		current = dirname(current);
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
function cleanRepoName(dirPath) {
	const normalized = normalizePathSlashes(dirPath).replace(/\/+$/, "");
	if (!normalized) return "unknown-project";
	const claudeWt = normalized.match(/^(.*?)\/\.claude\/worktrees\/[^/]+$/i);
	if (claudeWt?.[1]) return cleanRepoName(claudeWt[1]);
	const baseName = basename(normalized);
	if (/^agent-[a-f0-9]{6,}$/i.test(baseName)) {
		const parent = dirname(normalized);
		if (parent && parent !== normalized && parent !== "." && parent !== "/") return cleanRepoName(parent);
	}
	return baseName.replace(/(-worktree-\d+|-worktree|-[a-f0-9]{7,40})$/i, "") || "unknown-project";
}
function projectFromPath(targetPath) {
	try {
		return cleanRepoName(gitRootFromPath(targetPath));
	} catch {
		return cleanRepoName(targetPath);
	}
}
function decodeSlugCandidates(slug) {
	if (!slug || slug === "empty-window") return [];
	const parts = slug.split("-");
	if (parts[0] !== "Users" || parts.length < 2) return [];
	const results = /* @__PURE__ */ new Set();
	function walk(index, currentPath) {
		if (index >= parts.length) {
			if (existsSync(currentPath)) results.add(currentPath);
			return;
		}
		walk(index + 1, `${currentPath}/${parts[index]}`);
		const alt = `${currentPath}/${parts.slice(index).join("-")}`;
		if (existsSync(alt)) results.add(alt);
	}
	walk(2, `/${parts[0]}/${parts[1]}`);
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
function workspaceFromTranscriptFile(transcriptFile) {
	if (!transcriptFile || !existsSync(transcriptFile)) return null;
	const chunk = normalizePathSlashes(readFileSync(transcriptFile, "utf-8").slice(0, 25e4));
	const escapedHome = normalizePathSlashes(HOME).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`${escapedHome}[^\\s"'\\\\]+`, "g");
	const counts = /* @__PURE__ */ new Map();
	for (const match of chunk.match(re) || []) {
		if (isCursorMetadataPath(match)) continue;
		const existing = existingAncestor(match);
		if (!existing || existing === HOME) continue;
		counts.set(existing, (counts.get(existing) || 0) + 1);
	}
	let best = null;
	let bestCount = 0;
	for (const [pathValue, count] of counts) if (count > bestCount) {
		best = pathValue;
		bestCount = count;
	}
	return best;
}
function workspaceFromSessionId(sessionId) {
	const hit = findSessionTranscript(sessionId);
	if (!hit) return null;
	const fromTranscript = workspaceFromTranscriptFile(hit.transcriptFile);
	if (fromTranscript) return fromTranscript;
	const preferredLabel = process.env["CURSOR_WORKSPACE_LABEL"] || "";
	return pickBestCandidate(decodeSlugCandidates(hit.slug), preferredLabel);
}
function resolveFromPathCandidates(candidates, sessionId) {
	for (const candidate of candidates) {
		if (typeof candidate !== "string" || isBadPath(candidate)) continue;
		const existing = existingAncestor(candidate);
		if (!existing || isIdeInstallPath(existing)) continue;
		const project = projectFromPath(existing);
		if (project !== ".cursor") {
			rememberSession(sessionId, project, existing);
			return {
				project,
				cwd: existing
			};
		}
	}
	return null;
}
function resolveWorkspace(data) {
	const sessionId = data?.["session_id"] ?? data?.["sessionId"];
	const cached = recallSession(sessionId);
	if (cached?.cwd && !isBadPath(cached.cwd)) return {
		project: cached.project,
		cwd: cached.cwd
	};
	const fromPayload = resolveFromPathCandidates([
		...Array.isArray(data?.["workspace_roots"]) ? data["workspace_roots"] : [],
		...Array.isArray(data?.["workspace_folders"]) ? data["workspace_folders"] : [],
		data?.["workspace_folder"],
		data?.["workspaceFolder"],
		data?.["workspace"],
		data?.["cwd"],
		data?.["root_path"],
		data?.["project_path"]
	], sessionId);
	if (fromPayload) return fromPayload;
	const fromTools = resolveFromPathCandidates(collectPathStrings(data?.["tool_input"]).map(existingAncestor).filter((p) => Boolean(p) && !isIdeInstallPath(p)), sessionId);
	if (fromTools) return fromTools;
	if (sessionId) {
		const fromSession = workspaceFromSessionId(sessionId);
		if (fromSession && !isIdeInstallPath(fromSession)) {
			const project = projectFromPath(fromSession);
			rememberSession(sessionId, project, fromSession);
			return {
				project,
				cwd: fromSession
			};
		}
	}
	const fromEnv = resolveFromPathCandidates([
		process.env["CURSOR_WORKSPACE_ROOT"],
		process.env["CURSOR_WORKSPACE_FOLDER"],
		process.env["PWD"],
		process.env["VSCODE_CWD"]
	], sessionId);
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
	const { project, payload } = enrichPayload(data);
	const scriptPath = join(options.officialDir ?? defaultOfficialDir(), script);
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