#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename } from "node:path";
//#region src/hooks/_project.ts
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = cwd && cwd.trim() ? cwd : process.cwd();
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
		if (top) return basename(top);
	} catch {}
	return basename(dir);
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
async function postWithRetry(url, headers, body, attemptMs = 400) {
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt) await new Promise((r) => setTimeout(r, 100));
		try {
			if ((await fetch(url, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(attemptMs)
			})).ok) return;
		} catch (err) {
			const name = err?.name;
			if (name === "TimeoutError" || name === "AbortError") return;
		}
	}
}
//#endregion
//#region src/hooks/task-completed.ts
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
	postWithRetry(`${REST_URL}/agentmemory/observe`, authHeaders(), JSON.stringify({
		hookType: "task_completed",
		sessionId,
		project: resolveProject(cwd),
		cwd,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		data: {
			task_id: data.task_id,
			task_subject: data.task_subject,
			task_description: typeof data.task_description === "string" ? data.task_description.slice(0, 2e3) : "",
			teammate_name: data.teammate_name,
			team_name: data.team_name
		}
	}));
	setTimeout(() => process.exit(0), 1e3).unref();
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=task-completed.mjs.map