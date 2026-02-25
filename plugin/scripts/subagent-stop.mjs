#!/usr/bin/env node
//#region src/hooks/subagent-stop.ts
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
	const sessionId = data.session_id || "unknown";
	const lastMsg = typeof data.last_assistant_message === "string" ? data.last_assistant_message.slice(0, 4e3) : "";
	try {
		await fetch(`${REST_URL}/agentmemory/observe`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hookType: "subagent_stop",
				sessionId,
				project: data.cwd || process.cwd(),
				cwd: data.cwd || process.cwd(),
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					agent_id: data.agent_id,
					agent_type: data.agent_type,
					last_message: lastMsg
				}
			}),
			signal: AbortSignal.timeout(2e3)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=subagent-stop.mjs.map