#!/usr/bin/env node
//#region src/hooks/post-tool-failure.ts
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
	if (data.is_interrupt) return;
	const sessionId = data.session_id || "unknown";
	try {
		await fetch(`${REST_URL}/agentmemory/observe`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hookType: "post_tool_failure",
				sessionId,
				project: data.cwd || process.cwd(),
				cwd: data.cwd || process.cwd(),
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					tool_name: data.tool_name,
					tool_input: typeof data.tool_input === "string" ? data.tool_input.slice(0, 4e3) : JSON.stringify(data.tool_input ?? "").slice(0, 4e3),
					error: typeof data.error === "string" ? data.error.slice(0, 4e3) : JSON.stringify(data.error ?? "").slice(0, 4e3)
				}
			}),
			signal: AbortSignal.timeout(3e3)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=post-tool-failure.mjs.map