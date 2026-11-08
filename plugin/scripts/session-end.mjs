#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { REST_URL, authHeaders, captureObservation, isDrainChild, runDrainChild, transportBlocked, withEventId } from "./_capture.mjs";
//#region src/functions/privacy.ts
const PRIVATE_TAG_TOKEN_RE = /<private(?=\s|>)[^>]*>|<\/private\s*>/gi;
function redactPrivateBlocks(input) {
	const tokens = new RegExp(PRIVATE_TAG_TOKEN_RE.source, PRIVATE_TAG_TOKEN_RE.flags);
	let out = "";
	let cursor = 0;
	let depth = 0;
	for (let match = tokens.exec(input); match; match = tokens.exec(input)) {
		const closing = match[0].startsWith("</");
		if (depth === 0) {
			if (closing) continue;
			out += input.slice(cursor, match.index);
			depth = 1;
		} else if (closing) {
			depth -= 1;
			if (depth === 0) {
				out += "[REDACTED]";
				cursor = match.index + match[0].length;
			}
		} else depth += 1;
	}
	if (depth > 0) return `${out}[REDACTED]`;
	return out + input.slice(cursor);
}
const SECRET_PATTERN_SOURCES = [
	/(?:api[_-]?key|secret|token|password|credential|auth)[\s]*[=:]\s*["']?[A-Za-z0-9_\-/.+]{20,}["']?/gi,
	/Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi,
	/(?<![\p{L}\p{N}\p{M}_])sk-proj-[A-Za-z0-9\-_]{20,}/gu,
	/(?<![\p{L}\p{N}\p{M}_])(?:sk|pk|rk|ak)-[A-Za-z0-9][A-Za-z0-9\-_]{19,}/gu,
	/(?<![\p{L}\p{N}\p{M}_])sk-ant-[A-Za-z0-9\-_]{20,}/gu,
	/gh[pus]_[A-Za-z0-9]{36,}/g,
	/github_pat_[A-Za-z0-9_]{22,}/g,
	/xoxb-[A-Za-z0-9\-]+/g,
	/AKIA[0-9A-Z]{16}/g,
	/AIza[A-Za-z0-9\-_]{35}/g,
	/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
	/npm_[A-Za-z0-9]{36}/g,
	/glpat-[A-Za-z0-9\-_]{20,}/g,
	/dop_v1_[A-Za-z0-9]{64}/g
];
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@:"'<>]*:[^\s/?#@"'<>]+@/gi;
function stripPrivateData(input) {
	return stripSecrets(redactPrivateBlocks(input));
}
function stripSecrets(input) {
	let result = input.replace(new RegExp(PRIVATE_KEY_BLOCK_RE.source, PRIVATE_KEY_BLOCK_RE.flags), "[REDACTED_SECRET]");
	result = result.replace(new RegExp(URL_CREDENTIALS_RE.source, URL_CREDENTIALS_RE.flags), "$1[REDACTED_SECRET]@");
	for (const source of SECRET_PATTERN_SOURCES) {
		const pattern = new RegExp(source.source, source.flags);
		result = result.replace(pattern, "[REDACTED_SECRET]");
	}
	return result;
}
//#endregion
//#region src/hooks/_capture-filter.ts
function cut(value, max) {
	if (value.length <= max) return value;
	const end = /[\uD800-\uDBFF]/.test(value[max - 1] ?? "") ? max - 1 : max;
	return value.slice(0, end);
}
function truncateText(value, max) {
	if (value.length <= max) return value;
	return cut(stripPrivateData(value), max);
}
//#endregion
//#region src/hooks/_project.ts
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = cwd && cwd.trim() ? cwd : process.cwd();
	try {
		const [top, gitDir, commonDir] = execSync("git rev-parse --show-toplevel --git-dir --git-common-dir", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim().split(/\r?\n/);
		if (top) return basename(repositoryRoot(dir, top, gitDir, commonDir));
	} catch {}
	return basename(dir);
}
function repositoryRoot(dir, top, gitDir, commonDir) {
	if (!gitDir || !commonDir) return top;
	const physical = realpathSync(dir);
	const common = resolve(physical, commonDir);
	if (resolve(physical, gitDir) === common || basename(common) !== ".git") return top;
	return dirname(common);
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
//#region src/hooks/session-end.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const HARNESS_TEXT = /^(?:<(?:command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|task-notification|system-reminder|ci-monitor-event|cross-session-message|scheduled-task)(?=[\s>])|\[Request interrupted)/;
function isUserTurn(msg) {
	if (msg.isSidechain || msg.isMeta || msg.isCompactSummary) return false;
	return msg.role === "user" || msg.type === "user" || msg.message?.role === "user";
}
function promptText(raw) {
	const m = raw.match(/<user_query>\n?([\s\S]*?)\n?<\/user_query>/);
	const text = (m ? m[1] : raw).trim();
	return HARNESS_TEXT.test(text) ? "" : text;
}
function turnTexts(content) {
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];
	const texts = [];
	for (const block of content) if (block?.type === "text" && typeof block.text === "string") texts.push(block.text);
	return texts;
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
		if (msg.type === "USER_INPUT" && msg.source === "USER_EXPLICIT" && typeof msg.content === "string") {
			if (prompts.length >= 50) return prompts;
			const match = msg.content.match(/<USER_REQUEST>\n?([\s\S]*?)\n?<\/USER_REQUEST>/);
			const text = (match ? match[1] : msg.content).trim();
			if (text) prompts.push({ prompt: truncateText(text, 8e3) });
			continue;
		}
		if (!isUserTurn(msg)) continue;
		const texts = turnTexts(msg.message?.content).map(promptText).filter(Boolean);
		const promptId = typeof msg.promptId === "string" ? msg.promptId : void 0;
		const timestamp = typeof msg.timestamp === "string" ? msg.timestamp : void 0;
		for (const text of promptId ? [texts.join("\n\n")].filter(Boolean) : texts) {
			if (prompts.length >= 50) return prompts;
			prompts.push({
				prompt: truncateText(text, 8e3),
				promptId,
				timestamp
			});
		}
	}
	return prompts;
}
const WORKER_ENV = "AGENTMEMORY_SESSION_END_WORKER";
function handOff(input) {
	if (process.env[WORKER_ENV] === "1" || !process.argv[1]) return Promise.resolve(false);
	return new Promise((resolve) => {
		try {
			const child = spawn(process.execPath, [process.argv[1]], {
				detached: true,
				stdio: [
					"pipe",
					"ignore",
					"ignore"
				],
				windowsHide: true,
				env: {
					...process.env,
					[WORKER_ENV]: "1"
				}
			});
			child.on("error", () => resolve(false));
			child.stdin.on("error", () => resolve(false));
			child.once("spawn", () => {
				child.stdin.end(input, () => {
					child.unref();
					resolve(true);
				});
			});
		} catch {
			resolve(false);
		}
	});
}
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
	if (data.hook_event_name === "SessionEnd" && await handOff(input)) return;
	const sessionId = data.session_id || data.sessionId || data.conversation_id || "unknown";
	const transcriptPrompts = extractTranscriptPrompts(data);
	if (transcriptPrompts.length > 0) {
		const cwd = hookCwd(data) || process.cwd();
		const project = resolveProject(cwd);
		const timestamp = (/* @__PURE__ */ new Date()).toISOString();
		await Promise.allSettled(transcriptPrompts.map(({ prompt, promptId, timestamp: at }, index) => captureObservation(withEventId({
			hookType: "prompt_submit",
			sessionId,
			project,
			cwd,
			timestamp: at ?? timestamp,
			data: {
				prompt,
				backfill: true
			}
		}, promptId ? { prompt_id: promptId } : {}, {
			source: "transcript",
			transcript: data.transcript_path,
			index,
			prompt
		}, { stable: true }), 3e3)));
	}
	if (transportBlocked()) {
		setTimeout(() => process.exit(0), 1500).unref();
		return;
	}
	fetch(`${REST_URL}/agentmemory/session/end`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			sessionId,
			final: true
		}),
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
export {};

//# sourceMappingURL=session-end.mjs.map