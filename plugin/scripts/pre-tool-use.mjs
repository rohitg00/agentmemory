#!/usr/bin/env node
//#region src/hooks/pre-tool-use.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
}
function unique(values) {
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}
function extractCodexPatchFiles(patch) {
	const files = [];
	for (const line of patch.split("\n")) {
		const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
		if (match) files.push(match[1].trim());
	}
	return unique(files);
}
function extractCodexCommandTarget(command) {
	const trimmed = command.trim();
	if (!trimmed || /[;&|`$<>]/.test(trimmed)) return void 0;
	const tokens = (trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((part) => part.replace(/^["']|["']$/g, ""));
	const commandName = tokens[0]?.split("/").pop();
	if (!commandName) return void 0;
	if (commandName === "rg") {
		const positional = tokens.slice(1).filter((token) => !token.startsWith("-"));
		if (positional.length === 0) return void 0;
		const [pattern, ...paths] = positional;
		return {
			files: unique(paths),
			terms: pattern ? [pattern] : [],
			toolName: "grep"
		};
	}
	if ([
		"sed",
		"cat",
		"head",
		"tail",
		"nl"
	].includes(commandName)) {
		const paths = tokens.slice(1).filter((token) => !token.startsWith("-") && /[./]/.test(token));
		if (paths.length === 0) return void 0;
		return {
			files: unique(paths),
			terms: [],
			toolName: "read"
		};
	}
	if (["ls", "find"].includes(commandName)) {
		const paths = tokens.slice(1).filter((token) => !token.startsWith("-"));
		if (paths.length === 0) return void 0;
		return {
			files: unique(paths),
			terms: [],
			toolName: "glob"
		};
	}
}
function enrichTargetForTool(toolName, toolInput) {
	const normalizedToolName = toolName.toLowerCase();
	if ([
		"edit",
		"write",
		"create",
		"read",
		"view",
		"glob",
		"grep"
	].includes(normalizedToolName)) {
		const files = [];
		const fileKeys = normalizedToolName === "grep" ? ["path", "file"] : [
			"file_path",
			"path",
			"file",
			"pattern"
		];
		for (const key of fileKeys) {
			const val = toolInput[key];
			if (typeof val === "string" && val.length > 0) files.push(val);
		}
		if (files.length === 0) return void 0;
		const terms = [];
		if (normalizedToolName === "grep" || normalizedToolName === "glob") {
			const pattern = toolInput["pattern"];
			if (typeof pattern === "string" && pattern.length > 0) terms.push(pattern);
		}
		return {
			files: unique(files),
			terms,
			toolName
		};
	}
	if (normalizedToolName === "apply_patch") {
		const patch = toolInput["patch"] ?? toolInput["input"] ?? toolInput["command"];
		if (typeof patch !== "string") return void 0;
		const files = extractCodexPatchFiles(patch);
		if (files.length === 0) return void 0;
		return {
			files,
			terms: [],
			toolName: "edit"
		};
	}
	if ([
		"exec_command",
		"shell_command",
		"bash"
	].includes(normalizedToolName)) {
		const command = toolInput["cmd"] ?? toolInput["command"];
		if (typeof command !== "string") return void 0;
		return extractCodexCommandTarget(command);
	}
}
async function main() {
	if (!INJECT_CONTEXT) return;
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		return;
	}
	if (isSdkChildContext(data)) return;
	const toolName = typeof data.tool_name === "string" ? data.tool_name : typeof data.toolName === "string" ? data.toolName : void 0;
	if (!toolName) return;
	const rawToolInput = data.tool_input ?? data.toolArgs;
	const target = enrichTargetForTool(toolName, typeof rawToolInput === "object" && rawToolInput !== null && !Array.isArray(rawToolInput) ? rawToolInput : {});
	if (!target) return;
	const rawSessionId = data.session_id || data.sessionId;
	const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : "unknown";
	const project = typeof data.project === "string" && data.project.trim().length > 0 ? data.project.trim() : void 0;
	try {
		const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				files: target.files,
				terms: target.terms,
				toolName: target.toolName,
				...project !== void 0 && { project }
			}),
			signal: AbortSignal.timeout(2e3)
		});
		if (res.ok) {
			const result = await res.json();
			if (result.context) process.stdout.write(result.context);
		}
	} catch {}
}
main();
//#endregion
export {};

//# sourceMappingURL=pre-tool-use.mjs.map