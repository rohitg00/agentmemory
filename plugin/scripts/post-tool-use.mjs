#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execSync } from "node:child_process";
//#region src/secret-store.ts
const SECRET_KEY = "AGENTMEMORY_SECRET";
function agentmemoryHomeDir() {
	return join(homedir(), ".agentmemory");
}
function secretFilePath() {
	return join(agentmemoryHomeDir(), "secret");
}
function usable(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("${") && trimmed.endsWith("}")) return "";
	return trimmed;
}
function unquote(value) {
	const quote = value[0];
	if ((quote === "\"" || quote === "'") && value.length > 1) {
		const close = value.indexOf(quote, 1);
		if (close !== -1) return value.slice(1, close);
	}
	const hash = value.indexOf(" #");
	return hash === -1 ? value : value.slice(0, hash).trim();
}
function readEnvFileSecret() {
	let content;
	try {
		content = readFileSync(join(agentmemoryHomeDir(), ".env"), "utf-8");
	} catch {
		return "";
	}
	if (typeof content !== "string") return "";
	let found = "";
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		if (trimmed.slice(0, eq).replace(/^export\s+/, "").trim() !== SECRET_KEY) continue;
		found = usable(unquote(trimmed.slice(eq + 1).trim()));
	}
	return found;
}
function readStoredSecret() {
	try {
		return usable(readFileSync(secretFilePath(), "utf-8"));
	} catch {
		return "";
	}
}
function isLoopbackUrl(url) {
	let hostname;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	const bare = hostname.replace(/^\[|\]$/g, "");
	return bare === "localhost" || bare === "::1" || /^127(?:\.\d{1,3}){3}$/.test(bare);
}
function resolveClientSecret(baseUrl, env = process.env) {
	const fromEnv = usable(env[SECRET_KEY]);
	if (fromEnv) return fromEnv;
	if (!isLoopbackUrl(baseUrl)) return "";
	return readEnvFileSecret() || readStoredSecret();
}
//#endregion
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
	const full = toolName.trim().toLowerCase();
	const pat = normalizePattern(pattern);
	if (!pat.includes("*")) return bare === pat || full === pat;
	const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
	return re.test(bare) || re.test(full);
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
function truncateCaptureOutput(value, max) {
	if (typeof value === "string" && value.length > max) {
		const suffix = "\n[...truncated]";
		return max <= 15 ? suffix.slice(0, max) : value.slice(0, max - 15) + suffix;
	}
	if (typeof value === "object" && value !== null) {
		const str = JSON.stringify(value);
		if (str.length > max) {
			const suffix = "...[truncated]";
			return max <= 14 ? suffix.slice(0, max) : str.slice(0, max - 14) + suffix;
		}
		return value;
	}
	return value;
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
const SECRET = resolveClientSecret(REST_URL);
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
				tool_output: truncateCaptureOutput(cleanOutput, outputMax),
				...imageData ? { image_data: imageData } : {}
			}
		}),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 3e3).unref();
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
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=post-tool-use.mjs.map