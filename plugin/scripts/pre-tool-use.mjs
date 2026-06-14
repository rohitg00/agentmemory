#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
//#region src/hooks/_project.ts
function cleanEnv(name) {
	const value = process.env[name];
	if (!value) return void 0;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : void 0;
}
function gitOutput(cwd, args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: [
			"ignore",
			"pipe",
			"ignore"
		],
		timeout: 500
	}).trim();
}
function realPath(path) {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}
function gitCommonDir(cwd) {
	try {
		return gitOutput(cwd, [
			"rev-parse",
			"--path-format=absolute",
			"--git-common-dir"
		]);
	} catch {
		const relativeOrAbsolute = gitOutput(cwd, ["rev-parse", "--git-common-dir"]);
		return isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : resolve(cwd, relativeOrAbsolute);
	}
}
function canonicalGitProject(cwd) {
	try {
		const common = realPath(gitCommonDir(cwd));
		const root = basename(common) === ".git" ? realPath(dirname(common)) : common;
		return `git:${createHash("sha256").update(root).digest("hex").slice(0, 32)}`;
	} catch {
		return;
	}
}
function resolveCwd(cwd) {
	if (typeof cwd !== "string") return process.cwd();
	return cwd.trim().length > 0 ? cwd : process.cwd();
}
function resolveProject(cwd) {
	const explicitId = cleanEnv("AGENTMEMORY_PROJECT_ID");
	if (explicitId) return explicitId;
	const explicitName = cleanEnv("AGENTMEMORY_PROJECT_NAME");
	if (explicitName) return explicitName;
	const dir = resolveCwd(cwd);
	return canonicalGitProject(dir) ?? basename(dir);
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
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
function normalizedHostname(hostname) {
	return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}
function usesPlaintextBearerAuth(baseUrl, secret) {
	if (!secret) return false;
	try {
		const parsed = new URL(baseUrl);
		return parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(normalizedHostname(parsed.hostname));
	} catch {
		return false;
	}
}
function plaintextBearerAuthMessage(baseUrl) {
	return `agentmemory: AGENTMEMORY_SECRET is configured for plaintext HTTP to ${baseUrl}. Bearer tokens and memory payloads can be observed on the network; use HTTPS or an SSH tunnel.`;
}
function createPlaintextBearerAuthGuard(warn = (message) => console.warn(message)) {
	let warned = false;
	return (baseUrl, secret) => {
		if (!usesPlaintextBearerAuth(baseUrl, secret)) return true;
		const message = plaintextBearerAuthMessage(baseUrl);
		if (process.env["AGENTMEMORY_REQUIRE_HTTPS"] === "1") throw new Error(message);
		if (!warned) {
			warned = true;
			warn(message);
		}
		return false;
	};
}
const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard((message) => process.stderr.write(`${message}\n`));
function canSendAuthenticatedRequest(baseUrl, secret) {
	try {
		return guardPlaintextBearerAuth(baseUrl, secret);
	} catch (err) {
		process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
		return false;
	}
}
function guardedFetch(baseUrl, path, secret, init) {
	if (!canSendAuthenticatedRequest(baseUrl, secret)) return void 0;
	return fetch(`${baseUrl}${path}`, init);
}
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
	const rawSessionId = data.session_id || data.sessionId;
	const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : "unknown";
	const project = resolveProject(data.cwd);
	try {
		const res = await guardedFetch(REST_URL, "/agentmemory/enrich", SECRET, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				files,
				terms,
				toolName,
				...project !== void 0 && { project }
			}),
			signal: AbortSignal.timeout(2e3)
		});
		if (!res) return;
		if (res.ok) {
			const result = await res.json();
			if (result.context) process.stdout.write(result.context);
		}
	} catch {}
}
main();
//#endregion
export {};

//# sourceMappingURL=pre-tool-use.mjs.map
