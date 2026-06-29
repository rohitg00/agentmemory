#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename } from "node:path";
//#region src/hooks/_capture-filter.ts
const DEFAULT_DENY_PATTERNS = [
	"memory_*",
	"toolsearch",
	"listmcpresources",
	"fetchmcpresource"
];
function parseEnvList(raw) {
	if (!raw?.trim()) return void 0;
	return raw.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);
}
function bareToolName(toolName) {
	const trimmed = toolName.trim();
	if (/^mcp__/i.test(trimmed)) {
		const parts = trimmed.split("__");
		if (parts.length >= 3) return parts[parts.length - 1];
	}
	return trimmed;
}
function normalizePattern(pattern) {
	return pattern.trim().toLowerCase();
}
function matchesPattern(toolName, pattern) {
	const bare = bareToolName(toolName).toLowerCase();
	const pat = normalizePattern(pattern);
	if (!pat.includes("*")) return bare === pat;
	const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
	return re.test(bare) || re.test(toolName.toLowerCase());
}
function matchesAny(toolName, patterns) {
	return patterns.some((pattern) => matchesPattern(toolName, pattern));
}
function shouldCaptureTool(toolName) {
	if (typeof toolName !== "string" || !toolName.trim()) return true;
	const allow = parseEnvList(process.env["AGENTMEMORY_CAPTURE_ALLOW"]);
	if (allow) return matchesAny(toolName, allow);
	return !matchesAny(toolName, [...DEFAULT_DENY_PATTERNS, ...parseEnvList(process.env["AGENTMEMORY_CAPTURE_DENY"]) ?? []]);
}
function captureOutputMax() {
	const raw = process.env["AGENTMEMORY_CAPTURE_OUTPUT_MAX"];
	if (!raw?.trim()) return 8e3;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 8e3;
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
//#region src/hooks/post-tool-use.ts
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
	const toolName = data.tool_name ?? data.toolName;
	if (!shouldCaptureTool(toolName)) return;
	const toolInput = data.tool_input ?? data.toolArgs;
	const { imageData, cleanOutput } = extractImageData(toolOutput(data));
	const cwd = hookCwd(data) || process.cwd();
	const outputMax = captureOutputMax();
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hookType: "post_tool_use",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: {
				tool_name: toolName,
				tool_input: toolInput,
				tool_output: truncate(cleanOutput, outputMax),
				...imageData ? { image_data: imageData } : {}
			}
		}),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 500).unref();
}
function toolOutput(data) {
	if (data.tool_response !== void 0) return data.tool_response;
	if (data.tool_output !== void 0) return data.tool_output;
	const result = data.tool_result ?? data.toolResult;
	if (typeof result === "object" && result !== null) {
		const obj = result;
		return obj.text_result_for_llm ?? obj.textResultForLlm ?? result;
	}
	return result;
}
function isBase64Image(val) {
	return typeof val === "string" && (val.startsWith("data:image/") || val.startsWith("iVBORw0KGgo") || val.startsWith("/9j/"));
}
function extractImageData(output) {
	if (isBase64Image(output)) return {
		imageData: output,
		cleanOutput: "[image data extracted]"
	};
	if (typeof output === "object" && output !== null && !Array.isArray(output)) {
		const obj = output;
		let imageData;
		const clean = {};
		for (const [key, val] of Object.entries(obj)) if (!imageData && isBase64Image(val)) {
			imageData = val;
			clean[key] = "[image data extracted]";
		} else clean[key] = val;
		return {
			imageData,
			cleanOutput: clean
		};
	}
	return {
		imageData: void 0,
		cleanOutput: output
	};
}
function truncate(value, max) {
	if (typeof value === "string" && value.length > max) return value.slice(0, max) + "\n[...truncated]";
	if (typeof value === "object" && value !== null) {
		const str = JSON.stringify(value);
		if (str.length > max) return str.slice(0, max) + "...[truncated]";
		return value;
	}
	return value;
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=post-tool-use.mjs.map