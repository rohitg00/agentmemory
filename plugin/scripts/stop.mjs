#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { REST_URL, authHeaders, captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.mjs";
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
//#endregion
//#region src/hooks/stop.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const OBSERVE_TIMEOUT_MS = 2e3;
const EXIT_CAP_MS = 2500;
const REPLY_MAX_CHARS = 4e3;
async function main() {
	if (isDrainChild()) return runDrainChild();
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
	const reply = data.last_assistant_message;
	if (typeof reply === "string" && reply.trim()) {
		const cwd = hookCwd(data) || process.cwd();
		captureObservation(withEventId({
			hookType: "stop",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: { last_assistant_message: reply.slice(0, REPLY_MAX_CHARS) }
		}, {}), OBSERVE_TIMEOUT_MS);
	}
	fetch(`${REST_URL}/agentmemory/session/end`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			sessionId,
			final: false
		}),
		signal: AbortSignal.timeout(5e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=stop.mjs.map