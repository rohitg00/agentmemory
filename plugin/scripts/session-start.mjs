#!/usr/bin/env node
//#region src/hooks/session-start.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const INJECT_TIMEOUT_MS = 1500;
const REGISTER_TIMEOUT_MS = 800;
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
	const sessionId = data.session_id || `ses_${Date.now().toString(36)}`;
	const project = data.cwd || process.cwd();
	const url = `${REST_URL}/agentmemory/session/start`;
	const init = {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			sessionId,
			project,
			cwd: project
		})
	};
	if (!INJECT_CONTEXT) {
		fetch(url, {
			...init,
			signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS)
		}).catch(() => {});
		return;
	}
	try {
		const res = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(INJECT_TIMEOUT_MS)
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
//# sourceMappingURL=session-start.mjs.map