#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
//#region src/hooks/_capture-filter.ts
function preCompactBudget() {
	const raw = process.env["AGENTMEMORY_PRE_COMPACT_BUDGET"];
	if (raw?.trim() === "0") return 0;
	if (!raw?.trim()) return 1500;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1500;
}
//#endregion
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
function readEnvFileValue(name) {
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
		if (trimmed.slice(0, eq).replace(/^export\s+/, "").trim() !== name) continue;
		found = unquote(trimmed.slice(eq + 1).trim());
	}
	return found;
}
function readEnvFileSecret() {
	return usable(readEnvFileValue(SECRET_KEY));
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
//#region src/hooks/_endpoint.ts
const OPTION_PREFIX = "CLAUDE_PLUGIN_OPTION_";
const DEFAULT_URL = "http://localhost:3111";
function filled(value) {
	const trimmed = value?.trim();
	if (!trimmed || trimmed.startsWith("${") && trimmed.endsWith("}")) return void 0;
	return value;
}
function hookSetting(name, env = process.env) {
	const optionKey = `${OPTION_PREFIX}${name}`;
	const option = filled(env[optionKey])?.trim();
	if (option) return option;
	if (name === "AGENTMEMORY_SECRET" && optionKey in env) return void 0;
	return filled(env[name]);
}
function resolveSettingSecret(url, env = process.env) {
	const secretEnv = { ...env };
	const explicit = hookSetting("AGENTMEMORY_SECRET", env);
	if (explicit === void 0) delete secretEnv["AGENTMEMORY_SECRET"];
	else secretEnv["AGENTMEMORY_SECRET"] = explicit;
	return resolveClientSecret(url, secretEnv);
}
function secretTransportAllowed(url) {
	try {
		return new URL(url).protocol === "https:" || isLoopbackUrl(url);
	} catch {
		return false;
	}
}
function resolveHookEndpoint(env = process.env) {
	const url = hookSetting("AGENTMEMORY_URL", env) || DEFAULT_URL;
	const secret = resolveSettingSecret(url, env);
	const blocked = !secretTransportAllowed(url);
	return {
		url,
		secret: blocked ? "" : secret,
		blocked
	};
}
let blockedNoticeShown = false;
function reportBlockedTransport(endpoint) {
	if (!endpoint.blocked) return false;
	if (!blockedNoticeShown) {
		blockedNoticeShown = true;
		process.stderr.write("[agentmemory] AGENTMEMORY_URL must use HTTPS unless it is a loopback address. Nothing was sent.\n");
	}
	return true;
}
function hookAuthHeaders(endpoint) {
	const h = { "Content-Type": "application/json" };
	if (endpoint.secret) h["Authorization"] = `Bearer ${endpoint.secret}`;
	return h;
}
//#endregion
//#region src/hooks/_project.ts
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
//#region src/hooks/pre-compact.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const ENDPOINT = resolveHookEndpoint();
const REST_URL = ENDPOINT.url;
function authHeaders() {
	return hookAuthHeaders(ENDPOINT);
}
async function main() {
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
	if (reportBlockedTransport(ENDPOINT)) return;
	const sessionId = data.session_id || data.sessionId || data.conversation_id || "unknown";
	const project = resolveProject(hookCwd(data));
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") try {
		await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
			signal: AbortSignal.timeout(5e3)
		});
	} catch {}
	if (!INJECT_CONTEXT) return;
	const budget = preCompactBudget();
	if (budget === 0) return;
	try {
		const res = await fetch(`${REST_URL}/agentmemory/context`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				project,
				budget
			}),
			signal: AbortSignal.timeout(5e3)
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

//# sourceMappingURL=pre-compact.mjs.map