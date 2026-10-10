#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.mjs";
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
//#region src/hooks/subagent-stop.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const OBSERVE_TIMEOUT_MS = 2e3;
const EXIT_CAP_MS = 2500;
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
	const agentId = data.agent_id || data.agentName;
	const agentType = data.agent_type || data.agentDisplayName || data.agentName;
	const lastMsg = typeof data.last_assistant_message === "string" ? data.last_assistant_message.slice(0, 4e3) : "";
	const cwd = hookCwd(data) || process.cwd();
	captureObservation(withEventId({
		hookType: "subagent_stop",
		sessionId,
		project: resolveProject(cwd),
		cwd,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		data: {
			agent_id: agentId,
			agent_type: agentType,
			last_message: lastMsg
		}
	}, data), OBSERVE_TIMEOUT_MS);
	setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=subagent-stop.mjs.map