#!/usr/bin/env node
//#region src/hooks/post-compact.ts
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
async function post(path, body, timeoutMs) {
	try {
		const response = await fetch(`${REST_URL}/agentmemory${path}`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!response.ok) process.stderr.write(`[agentmemory] post-compact POST ${path} failed: ${response.status} ${response.statusText}\n`);
	} catch (err) {
		process.stderr.write(`[agentmemory] post-compact POST ${path} failed: ${err instanceof Error ? err.message : String(err)}\n`);
	}
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
	const sessionId = typeof data.session_id === "string" && data.session_id.trim() ? data.session_id.trim() : void 0;
	if (!sessionId) return;
	const cwd = data.cwd || process.cwd();
	await post("/observe", {
		hookType: "session_compacted",
		sessionId,
		project: cwd,
		cwd,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		data: {
			source: "codex_post_compact",
			summary: data.summary || data.compaction || null
		}
	}, 3e3);
	await post("/summarize", { sessionId }, 12e4);
	if (process.env["CONSOLIDATION_ENABLED"] === "true") {
		await post("/crystals/auto", { olderThanDays: 0 }, 6e4);
		await post("/consolidate-pipeline", {
			tier: "all",
			force: true
		}, 12e4);
	}
}
main();

//#endregion
export {  };
//# sourceMappingURL=post-compact.mjs.map