#!/usr/bin/env node
import { readFileSync } from "node:fs";
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
//#region src/hooks/session-end.ts
const OBSERVE_ATTEMPT_MS = 3e3;
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
function extractTranscriptPrompts(data) {
	const path = data.transcript_path;
	if (typeof path !== "string" || !path.endsWith(".jsonl")) return [];
	let raw;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return [];
	}
	const prompts = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			continue;
		}
		if (msg.role !== "user") continue;
		for (const block of msg.message?.content ?? []) {
			if (prompts.length >= 50) return prompts;
			if (block.type !== "text" || typeof block.text !== "string") continue;
			const m = block.text.match(/<user_query>\n?([\s\S]*?)\n?<\/user_query>/);
			const text = (m ? m[1] : block.text).trim();
			if (text) prompts.push(text.slice(0, 8e3));
		}
	}
	return prompts;
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
	const transcriptPrompts = extractTranscriptPrompts(data);
	if (transcriptPrompts.length > 0) {
		const cwd = hookCwd(data) || process.cwd();
		const project = resolveProject(cwd);
		const timestamp = (/* @__PURE__ */ new Date()).toISOString();
		await Promise.allSettled(transcriptPrompts.map((prompt) => postWithRetry(`${REST_URL}/agentmemory/observe`, authHeaders(), JSON.stringify({
			hookType: "prompt_submit",
			sessionId,
			project,
			cwd,
			timestamp,
			data: { prompt }
		}), OBSERVE_ATTEMPT_MS)));
	}
	fetch(`${REST_URL}/agentmemory/session/end`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ sessionId }),
		signal: AbortSignal.timeout(3e4)
	}).catch(() => {});
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
		method: "POST",
		headers: authHeaders(),
		signal: AbortSignal.timeout(3e4)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 1500).unref();
}
main().catch(() => process.exit(0));
//#endregion
export { OBSERVE_ATTEMPT_MS };

//# sourceMappingURL=session-end.mjs.map