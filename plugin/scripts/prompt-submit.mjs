#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execSync } from "node:child_process";
//#region src/hooks/_env.ts
let fileEnv;
function loadHookEnvFile() {
	if (fileEnv) return fileEnv;
	const vars = {};
	const envPath = join(process.env["AGENTMEMORY_DATA_DIR"] || join(homedir(), ".agentmemory"), ".env");
	if (!existsSync(envPath)) {
		fileEnv = vars;
		return vars;
	}
	try {
		for (const line of readFileSync(envPath, "utf-8").split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			const key = trimmed.slice(0, eqIdx).trim();
			let value = trimmed.slice(eqIdx + 1).trim();
			const quote = value[0] === "\"" || value[0] === "'" ? value[0] : "";
			if (quote) {
				const closeIdx = value.indexOf(quote, 1);
				if (closeIdx !== -1) value = value.slice(1, closeIdx);
			} else {
				const commentIdx = value.indexOf(" #");
				if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
			}
			vars[key] = value;
		}
	} catch {}
	fileEnv = vars;
	return vars;
}
/** Process env wins; hook subprocesses fall back to ~/.agentmemory/.env. */
function getHookEnv(key) {
	return process.env[key] ?? loadHookEnvFile()[key];
}
//#endregion
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
//#endregion
//#region src/hooks/prompt-submit.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = getHookEnv("AGENTMEMORY_URL") || "http://localhost:3111";
const SECRET = getHookEnv("AGENTMEMORY_SECRET") || "";
const PROMPT_RECALL_ENABLED = getHookEnv("AGENTMEMORY_PROMPT_RECALL") === "true";
const RECALL_LIMIT = 5;
const RECALL_TIMEOUT_MS = 500;
const MAX_TITLE_CHARS = 500;
const MAX_TYPE_CHARS = 80;
function authHeaders() {
	const headers = {
		"Content-Type": "application/json",
		"X-Agentmemory-Source": "prompt-hook"
	};
	if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
	return headers;
}
function sanitizeInline(value, maxChars) {
	return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}
async function recallContext(prompt, project, sessionId) {
	if (!prompt.trim()) return "";
	try {
		const response = await fetch(`${REST_URL}/agentmemory/smart-search`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				query: prompt,
				limit: RECALL_LIMIT,
				project,
				includeLessons: false,
				sessionId,
				source: "prompt-hook"
			}),
			signal: AbortSignal.timeout(RECALL_TIMEOUT_MS)
		});
		if (!response.ok) return "";
		const body = await response.json();
		const lines = (Array.isArray(body.results) ? body.results.slice(0, RECALL_LIMIT) : []).flatMap((item) => {
			if (typeof item.title !== "string") return [];
			const title = sanitizeInline(item.title, MAX_TITLE_CHARS);
			if (!title) return [];
			const itemType = typeof item.type === "string" ? sanitizeInline(item.type, MAX_TYPE_CHARS) : "";
			return [`-${itemType ? ` [${itemType}]` : ""} ${title}`];
		});
		if (lines.length === 0) return "";
		return [
			"<agentmemory-context>",
			"Relevant memories recalled for this prompt:",
			...lines,
			"Use these as background context; verify details against the current workspace.",
			"</agentmemory-context>"
		].join("\n");
	} catch {
		return "";
	}
}
function observePrompt(payload) {
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
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
	const sessionId = data.session_id || data.sessionId || "unknown";
	const cwd = data.cwd || process.cwd();
	const project = resolveProject(cwd);
	const prompt = String(data.prompt ?? data.userPrompt ?? "");
	observePrompt({
		hookType: "prompt_submit",
		sessionId,
		project,
		cwd,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		data: { prompt }
	});
	const promptRecall = PROMPT_RECALL_ENABLED && process.env["COPILOT_PLUGIN_ROOT"] === void 0;
	setTimeout(() => process.exit(0), promptRecall ? RECALL_TIMEOUT_MS + 250 : 500).unref();
	if (!promptRecall) return;
	const additionalContext = await recallContext(prompt, project, sessionId);
	if (!additionalContext) return;
	await new Promise((resolve) => {
		process.stdout.write(JSON.stringify({ hookSpecificOutput: {
			hookEventName: "UserPromptSubmit",
			additionalContext
		} }), () => resolve());
	});
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=prompt-submit.mjs.map