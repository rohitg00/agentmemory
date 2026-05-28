#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

//#region src/hooks/env.ts
let cachedEnv = null;
function parseEnvFile(content) {
	const vars = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eqIdx = line.indexOf("=");
		if (eqIdx === -1) continue;
		const key = line.slice(0, eqIdx).trim();
		let value = line.slice(eqIdx + 1).trim();
		const quote = value[0];
		if (quote === "\"" || quote === "'") {
			const closeIdx = value.indexOf(quote, 1);
			if (closeIdx !== -1) value = value.slice(1, closeIdx);
		} else {
			const hashIdx = value.indexOf(" #");
			if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
		}
		vars[key] = value;
	}
	return vars;
}
function readAgentmemoryEnvFile() {
	const envPath = join(homedir(), ".agentmemory", ".env");
	if (!existsSync(envPath)) return {};
	try {
		return parseEnvFile(readFileSync(envPath, "utf-8"));
	} catch {
		return {};
	}
}
function agentmemoryEnv(key) {
	const processValue = process.env[key];
	if (processValue !== void 0) return processValue;
	cachedEnv ??= readAgentmemoryEnvFile();
	return cachedEnv[key] ?? "";
}

//#endregion
//#region src/hooks/pre-tool-use.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = agentmemoryEnv("AGENTMEMORY_INJECT_CONTEXT") === "true";
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = agentmemoryEnv("AGENTMEMORY_SECRET");
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
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
	const toolName = data.tool_name;
	if (!toolName) return;
	if (![
		"Edit",
		"Write",
		"Read",
		"Glob",
		"Grep"
	].includes(toolName)) return;
	const toolInput = data.tool_input || {};
	const files = [];
	const fileKeys = toolName === "Grep" ? ["path", "file"] : [
		"file_path",
		"path",
		"file",
		"pattern"
	];
	for (const key of fileKeys) {
		const val = toolInput[key];
		if (typeof val === "string" && val.length > 0) files.push(val);
	}
	if (files.length === 0) return;
	const terms = [];
	if (toolName === "Grep" || toolName === "Glob") {
		const pattern = toolInput["pattern"];
		if (typeof pattern === "string" && pattern.length > 0) terms.push(pattern);
	}
	const sessionId = data.session_id || "unknown";
	const project = typeof data.project === "string" && data.project.trim().length > 0 ? data.project.trim() : void 0;
	try {
		const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				files,
				terms,
				toolName,
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
export {  };
//# sourceMappingURL=pre-tool-use.mjs.map