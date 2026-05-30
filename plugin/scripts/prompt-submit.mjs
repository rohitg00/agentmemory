#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename } from "node:path";
//#region src/hooks/_project.ts
function gitToplevelBasename(dir) {
	try {
		const top = execSync("git rev-parse --show-toplevel", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim();
		return top ? basename(top) : null;
	} catch {
		return null;
	}
}
function normalizeGitRemote(url) {
	const raw = (url ?? "").trim();
	if (!raw) return null;
	let host = "";
	let path = "";
	const scp = raw.match(/^[^@/]+@([^:/]+):(.+)$/);
	if (scp) {
		host = scp[1];
		path = scp[2];
	} else {
		const noCreds = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "").replace(/^[^@/]*@/, "");
		const slash = noCreds.indexOf("/");
		if (slash === -1) return null;
		host = noCreds.slice(0, slash);
		path = noCreds.slice(slash + 1);
	}
	host = host.toLowerCase().replace(/:\d+$/, "");
	path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
	if (!host || !path) return null;
	return `${host}/${path}`;
}
function gitRemoteIdentity(dir) {
	try {
		return normalizeGitRemote(execSync("git config --get remote.origin.url", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim());
	} catch {
		return null;
	}
}
function remoteIdentityEnabled() {
	const flag = process.env["AGENTMEMORY_PROJECT_FROM_REMOTE"];
	return flag === "1" || flag === "true";
}
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = cwd && cwd.trim() ? cwd : process.cwd();
	if (remoteIdentityEnabled()) {
		const id = gitRemoteIdentity(dir);
		if (id) return id;
	}
	return gitToplevelBasename(dir) ?? basename(dir);
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
//#region src/hooks/prompt-submit.ts
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
	if (!data || typeof data !== "object") return;
	if (isSdkChildContext(data)) return;
	const sessionId = data.session_id || data.sessionId || data.conversation_id || "unknown";
	const cwd = hookCwd(data) || process.cwd();
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hookType: "prompt_submit",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: { prompt: data.prompt ?? data.userPrompt }
		}),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 500).unref();
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=prompt-submit.mjs.map