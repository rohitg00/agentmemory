#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
//#region src/hooks/_project.ts
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = cwd && cwd.trim() ? cwd : process.cwd();
	const remote = readGitConfig(dir, "remote.origin.url");
	if (remote) {
		const canonical = canonicalizeRemoteUrl(remote);
		if (canonical) return canonical;
	}
	const top = readGitToplevel(dir);
	if (top) return basename(top);
	return basename(dir);
}
function readGitConfig(cwd, key) {
	try {
		return execFileSync("git", [
			"config",
			"--get",
			key
		], {
			cwd,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim() || void 0;
	} catch {
		return;
	}
}
function readGitToplevel(cwd) {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim() || void 0;
	} catch {
		return;
	}
}
function canonicalizeRemoteUrl(raw) {
	const url = raw.trim();
	if (!url) return void 0;
	let host;
	let path;
	const scp = url.match(/^[^@\s/:]+@([^:\s/[\]]+):(.+)$/);
	if (scp && !url.includes("://")) {
		host = scp[1];
		path = scp[2];
	} else try {
		const u = new URL(url);
		host = u.hostname;
		path = u.pathname;
	} catch {
		return;
	}
	if (!host || !path) return void 0;
	path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
	if (!path) return void 0;
	return `${host}/${path}`.toLowerCase();
}
//#endregion
//#region src/hooks/session-start.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const INJECT_TIMEOUT_MS = 1500;
const REGISTER_TIMEOUT_MS = 800;
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
	const sessionId = data.session_id || data.sessionId || `ses_${Date.now().toString(36)}`;
	const cwd = data.cwd || process.cwd();
	const project = resolveProject(data.cwd);
	const url = `${REST_URL}/agentmemory/session/start`;
	const init = {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			sessionId,
			project,
			cwd
		})
	};
	if (!INJECT_CONTEXT) {
		fetch(url, {
			...init,
			signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS)
		}).catch(() => {});
		return;
	}
	try {
		const res = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(INJECT_TIMEOUT_MS)
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

//# sourceMappingURL=session-start.mjs.map