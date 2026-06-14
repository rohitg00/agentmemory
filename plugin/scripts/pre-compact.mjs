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
//#region src/hooks/pre-compact.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
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
	if (isSdkChildContext(data)) return;
	const sessionId = data.session_id || data.sessionId || "unknown";
	const project = resolveProject(data.cwd);
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") try {
		await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
			signal: AbortSignal.timeout(5e3)
		});
	} catch {}
	try {
		const res = await fetch(`${REST_URL}/agentmemory/context`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				project,
				budget: 1500
			}),
			signal: AbortSignal.timeout(5e3)
		});
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