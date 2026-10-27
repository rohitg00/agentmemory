#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { execFileSync, execSync } from "node:child_process";
//#region src/secret-store.ts
const SECRET_KEY = "AGENTMEMORY_SECRET";
function agentmemoryHomeDir() {
	return process.env["AGENTMEMORY_DATA_DIR"] || join(homedir(), ".agentmemory");
}
function secretFilePath() {
	return join(agentmemoryHomeDir(), "secret");
}
function usable(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("${") && trimmed.endsWith("}")) return "";
	return trimmed;
}
function unquote(value) {
	const quote = value[0];
	if ((quote === "\"" || quote === "'") && value.length > 1) {
		const close = value.indexOf(quote, 1);
		if (close !== -1) return value.slice(1, close);
	}
	const hash = value.indexOf(" #");
	return hash === -1 ? value : value.slice(0, hash).trim();
}
function readEnvFileSecret() {
	let content;
	try {
		content = readFileSync(process.env["AGENTMEMORY_ENV_FILE"] || join(homedir(), ".agentmemory", ".env"), "utf-8");
	} catch {
		return "";
	}
	if (typeof content !== "string") return "";
	let found = "";
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		if (trimmed.slice(0, eq).replace(/^export\s+/, "").trim() !== SECRET_KEY) continue;
		found = usable(unquote(trimmed.slice(eq + 1).trim()));
	}
	return found;
}
function readSecretFile(path) {
	try {
		return usable(readFileSync(path, "utf-8"));
	} catch {
		return "";
	}
}
function legacyDataDirSecretPaths(env = process.env) {
	const dataDir = env["AGENTMEMORY_DATA_DIR"];
	if (!dataDir) return [];
	const paths = [
		join(dataDir, "secret"),
		join(dataDir, ".hmac"),
		join(dataDir, "..", ".hmac")
	];
	return [...new Set(paths.filter((path) => path !== secretFilePath()))];
}
function readStoredSecret(env = process.env) {
	const canonicalPath = canonicalSecretPath();
	const localPath = secretFilePath();
	const legacyPaths = legacyDataDirSecretPaths(env);
	return readSecretFile(canonicalPath) || (localPath === canonicalPath ? "" : readSecretFile(localPath)) || legacyPaths.map(readSecretFile).find(Boolean) || "";
}
function isLoopbackUrl(url) {
	let hostname;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	const bare = hostname.replace(/^\[|\]$/g, "");
	return bare === "localhost" || bare === "::1" || /^127(?:\.\d{1,3}){3}$/.test(bare);
}
function resolveClientSecret(baseUrl, env = process.env) {
	const fromEnv = usable(env[SECRET_KEY]);
	if (fromEnv) return fromEnv;
	if (env.AGENTMEMORY_CREDENTIAL_MODE === "explicit") return "";
	if (!isLoopbackUrl(baseUrl)) return "";
	return readEnvFileSecret() || readStoredSecret(env);
}
function canonicalSecretPath() {
	return join(homedir(), ".agentmemory", "secret");
}
//#endregion
//#region src/hooks/_project.ts
function relativePathsEnabled() {
	return process.env["AGENTMEMORY_RELATIVE_PATHS"]?.trim().toLowerCase() === "true";
}
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = cwd && cwd.trim() ? cwd : process.cwd();
	try {
		const [top, gitDir, commonDir] = execSync("git rev-parse --show-toplevel --git-dir --git-common-dir", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim().split(/\r?\n/);
		if (top) return basename(repositoryRoot(dir, top, gitDir, commonDir));
	} catch {}
	return basename(dir);
}
function repositoryRoot(dir, top, gitDir, commonDir) {
	if (!gitDir || !commonDir) return top;
	const physical = realpathSync(dir);
	const common = resolve(physical, commonDir);
	if (resolve(physical, gitDir) === common || basename(common) !== ".git") return top;
	return dirname(common);
}
function hookCwd(data) {
	if (!data || typeof data !== "object") return void 0;
	if (typeof data.cwd === "string" && data.cwd.trim()) return data.cwd;
	const roots = data.workspace_roots;
	if (Array.isArray(roots)) {
		for (const root of roots) if (typeof root === "string" && root.trim()) return root;
	}
	const projectDir = process.env["DEVIN_PROJECT_DIR"] || process.env["CLAUDE_PROJECT_DIR"];
	if (projectDir && projectDir.trim()) return projectDir;
}
//#endregion
//#region src/hooks/_relative-paths.ts
function gitWorktreeListing(cwd) {
	const run = (args) => execFileSync("git", [
		"worktree",
		"list",
		"--porcelain",
		...args
	], {
		cwd,
		env: {
			...process.env,
			LC_ALL: "C"
		},
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		],
		timeout: 500
	}).toString();
	try {
		return run(["-z"]).split("\0");
	} catch (err) {
		const stderr = String(err.stderr ?? "");
		if (!/unknown switch|usage:/i.test(stderr)) return [];
	}
	try {
		return run([]).split(/\r?\n/);
	} catch {
		return [];
	}
}
function tryRealpath(path) {
	try {
		return realpathSync.native(path);
	} catch {
		return;
	}
}
function slashed(path) {
	return path.replace(/\\/g, "/");
}
function isInsideRoot(root, path) {
	return slashed(path) === slashed(root) || slashed(path).startsWith(`${slashed(root)}/`);
}
function cwdAliases(rawCwd, roots) {
	const cwd = rawCwd.replace(/(.)[\\/]+$/, "$1");
	const physical = tryRealpath(cwd);
	if (!physical || physical === cwd) return [];
	const root = roots.find((candidate) => isInsideRoot(candidate, physical));
	if (root === void 0) return [];
	const inside = slashed(physical.slice(root.length));
	const prefix = inside && slashed(cwd).endsWith(inside) ? cwd.slice(0, cwd.length - inside.length) : void 0;
	const prefixPhysical = prefix ? tryRealpath(prefix) : void 0;
	if (prefix && prefixPhysical && slashed(prefixPhysical) === slashed(root)) return [{
		from: prefix,
		to: ""
	}];
	return [{
		from: cwd,
		to: relative(root, physical).replace(/\\/g, "/")
	}];
}
function repositoryRoots(cwd) {
	const recorded = gitWorktreeListing(cwd).filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9)).filter(Boolean);
	const roots = /* @__PURE__ */ new Set();
	for (const root of recorded) {
		roots.add(root);
		const physical = tryRealpath(root);
		if (physical) roots.add(physical);
	}
	const longestFirst = [...roots].sort((a, b) => b.length - a.length);
	const aliases = longestFirst.map((from) => ({
		from,
		to: ""
	}));
	aliases.push(...cwdAliases(cwd, longestFirst));
	if (process.platform === "win32") for (const alias of [...aliases]) aliases.push({
		...alias,
		from: alias.from.replace(/\//g, "\\")
	});
	return aliases.sort((a, b) => b.from.length - a.from.length);
}
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const PATH_END = `$|[\\s"'\`:;,)\\]}>|&]`;
const WINDOWS_TAIL = `[^\\s"'\`,;|<>]*`;
const PATH_KEYS = new Set([
	"file_path",
	"filePath",
	"filepath",
	"notebook_path",
	"path",
	"file"
]);
const SKIPPED_KEYS = new Set(["image_data", "imageData"]);
function aliasPattern(aliases, platform) {
	if (aliases.length === 0) return null;
	const alternatives = aliases.map((alias) => `(${escapeRegExp(alias.from)})`).join("|");
	return new RegExp(`(?<![\\w.~/\\\\:-])(?:${alternatives})(?:([\\\\/]+)(?!${PATH_END})(${platform === "win32" ? WINDOWS_TAIL : ""})|[\\\\/]*(?=${PATH_END}))`, platform === "win32" || platform === "darwin" ? "gi" : "g");
}
function relativizePaths(value, aliases, platform = process.platform) {
	const pattern = aliasPattern(aliases, platform);
	if (!pattern) return value;
	const windows = platform === "win32";
	const rewrite = (_match, ...groups) => {
		const to = aliases[groups.findIndex((group) => typeof group === "string")]?.to ?? "";
		if (typeof groups[aliases.length] !== "string") return to || ".";
		const tail = String(groups[aliases.length + 1] ?? "").replace(/\\/g, "/");
		return to ? `${to}/${tail}` : tail;
	};
	const walk = (node, key) => {
		if (typeof node === "string") {
			const rewritten = node.replace(pattern, rewrite);
			return windows && rewritten !== node && key !== void 0 && PATH_KEYS.has(key) ? rewritten.replace(/\\/g, "/") : rewritten;
		}
		if (Array.isArray(node)) return node.map((child) => walk(child, key));
		if (node && typeof node === "object" && Object.getPrototypeOf(node) === Object.prototype) return Object.fromEntries(Object.entries(node).map(([k, child]) => [k, SKIPPED_KEYS.has(k) ? child : walk(child, k)]));
		return node;
	};
	return walk(value);
}
function relativizeFilePath(file, aliases, platform = process.platform) {
	return relativizePaths({ file_path: file }, aliases, platform).file_path;
}
//#endregion
//#region src/hooks/pre-tool-use.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = resolveClientSecret(REST_URL);
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
}
async function main() {
	if (!INJECT_CONTEXT) return;
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		return;
	}
	if (!data || typeof data !== "object") return;
	if (isSdkChildContext(data)) return;
	const toolName = typeof data.tool_name === "string" ? data.tool_name : typeof data.toolName === "string" ? data.toolName : void 0;
	if (!toolName) return;
	const normalizedToolName = toolName.toLowerCase();
	if (![
		"edit",
		"write",
		"create",
		"read",
		"view",
		"glob",
		"grep"
	].includes(normalizedToolName)) return;
	const rawToolInput = data.tool_input ?? data.toolArgs;
	const toolInput = typeof rawToolInput === "object" && rawToolInput !== null && !Array.isArray(rawToolInput) ? rawToolInput : {};
	const files = [];
	const fileKeys = normalizedToolName === "grep" ? ["path", "file"] : [
		"file_path",
		"path",
		"file",
		"pattern"
	];
	for (const key of fileKeys) {
		const val = toolInput[key];
		if (typeof val === "string" && val.length > 0) files.push(val);
	}
	if (files.length === 0) return;
	const terms = [];
	if (normalizedToolName === "grep" || normalizedToolName === "glob") {
		const pattern = toolInput["pattern"];
		if (typeof pattern === "string" && pattern.length > 0) terms.push(pattern);
	}
	const rawSessionId = data.session_id || data.sessionId || data.conversation_id;
	const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : "unknown";
	const relativeFiles = relativePathsEnabled();
	const cwd = hookCwd(data) || process.cwd();
	const project = typeof data.project === "string" && data.project.trim().length > 0 ? data.project.trim() : relativeFiles ? resolveProject(cwd) || void 0 : void 0;
	const aliases = relativeFiles ? repositoryRoots(cwd) : [];
	const queryFiles = relativeFiles ? files.map((file) => relativizeFilePath(file, aliases)) : files;
	try {
		const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				files: queryFiles,
				terms,
				toolName,
				...project !== void 0 && { project },
				...relativeFiles && { relativeFiles: true }
			}),
			signal: AbortSignal.timeout(2e3)
		});
		if (res.ok) {
			const result = await res.json();
			if (result.context) process.stdout.write(result.context);
		}
	} catch {}
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=pre-tool-use.mjs.map