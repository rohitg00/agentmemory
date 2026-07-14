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
//#region src/hooks/session-end.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = agentmemoryEnv("AGENTMEMORY_SECRET");
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
	if (isSdkChildContext(data)) return;
	const sessionId = data.session_id || data.sessionId || "unknown";
	fetch(`${REST_URL}/agentmemory/session/end`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ sessionId }),
		signal: AbortSignal.timeout(3e4)
	}).catch(() => {});
	if (process.env["CONSOLIDATION_ENABLED"] === "true") {
		fetch(`${REST_URL}/agentmemory/crystals/auto`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ olderThanDays: 0 }),
			signal: AbortSignal.timeout(6e4)
		}).catch(() => {});
		fetch(`${REST_URL}/agentmemory/consolidate-pipeline`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				tier: "all",
				force: true
			}),
			signal: AbortSignal.timeout(12e4)
		}).catch(() => {});
	}
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
		method: "POST",
		headers: authHeaders(),
		signal: AbortSignal.timeout(3e4)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 1500).unref();
}
main();

//#endregion
export {  };
//# sourceMappingURL=session-end.mjs.map