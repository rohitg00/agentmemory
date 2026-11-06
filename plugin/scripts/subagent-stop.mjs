#!/usr/bin/env node
import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { captureObservation, isDrainChild, runDrainChild, stripPrivateData, withEventId } from "./_capture.mjs";
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
function stripPrivateData$1(input) {
	let result = redactPrivateBlocks(input);
	result = result.replace(new RegExp(PRIVATE_KEY_BLOCK_RE.source, PRIVATE_KEY_BLOCK_RE.flags), "[REDACTED_SECRET]");
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
	return cut(stripPrivateData$1(value), max);
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
	const agentId = data.agent_id || data.agentId || data.agentName;
	const agentType = data.agent_type || data.agentType || data.agentDisplayName || data.agentName;
	const reply = data.last_assistant_message ?? data.response;
	const redactedReply = typeof reply === "string" ? stripPrivateData(reply) : "";
	const lastMsg = truncateText(redactedReply, 4e3);
	const cwd = hookCwd(data) || process.cwd();
	const body = {
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
	};
	captureObservation(withEventId(body, {}, {
		...body.data,
		last_message: redactedReply,
		stop_hook_active: data.stop_hook_active === true
	}, { stable: Boolean(data.agent_id || data.agentId) }), OBSERVE_TIMEOUT_MS);
	setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=subagent-stop.mjs.map