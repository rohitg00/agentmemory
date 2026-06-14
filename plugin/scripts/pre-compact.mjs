#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
//#region src/security/plaintext-bearer-auth.ts
const LOOPBACK_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1"
]);
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
function createPlaintextBearerAuthGuard(warn = (message) => console.warn(message), env) {
	let warned = false;
	return (baseUrl, secret) => {
		if (!usesPlaintextBearerAuth(baseUrl, secret)) return true;
		const message = plaintextBearerAuthMessage(baseUrl);
		if ((env || process.env).AGENTMEMORY_REQUIRE_HTTPS === "1") throw new Error(message);
		if (!warned) {
			warned = true;
			warn(message);
		}
		return false;
	};
}
//#endregion
//#region src/hooks/_http.ts
const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard((message) => process.stderr.write(`${message}\n`));
function authHeaders(secret) {
	const h = { "Content-Type": "application/json" };
	if (secret) h["Authorization"] = `Bearer ${secret}`;
	return h;
}
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
//#endregion
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
//#region src/hooks/pre-compact.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		return;
	}
	if (isSdkChildContext(data)) return;
	const sessionId = data.session_id || data.sessionId || "unknown";
	const project = resolveProject(data.cwd);
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") try {
		await guardedFetch(REST_URL, "/agentmemory/claude-bridge/sync", SECRET, {
			method: "POST",
			headers: authHeaders(SECRET),
			body: JSON.stringify({}),
			signal: AbortSignal.timeout(5e3)
		});
	} catch {}
	try {
		const res = await guardedFetch(REST_URL, "/agentmemory/context", SECRET, {
			method: "POST",
			headers: authHeaders(SECRET),
			body: JSON.stringify({
				sessionId,
				project,
				budget: 1500
			}),
			signal: AbortSignal.timeout(5e3)
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

//# sourceMappingURL=pre-compact.mjs.map