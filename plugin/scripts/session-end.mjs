#!/usr/bin/env node
//#region src/hooks/session-end.ts
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
	if (isSdkChildContext(data)) return;
	const sessionId = data.session_id || "unknown";
	try {
		await fetch(`${REST_URL}/agentmemory/session/end`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ sessionId }),
			signal: AbortSignal.timeout(3e4)
		});
	} catch {}
	if (process.env["CONSOLIDATION_ENABLED"] === "true") {
		try {
			await fetch(`${REST_URL}/agentmemory/crystals/auto`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ olderThanDays: 0 }),
				signal: AbortSignal.timeout(6e4)
			});
		} catch {}
		try {
			await fetch(`${REST_URL}/agentmemory/consolidate-pipeline`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					tier: "all",
					force: true
				}),
				signal: AbortSignal.timeout(12e4)
			});
		} catch {}
	}
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") try {
		await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
			method: "POST",
			headers: authHeaders(),
			signal: AbortSignal.timeout(3e4)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=session-end.mjs.map