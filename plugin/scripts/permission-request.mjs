#!/usr/bin/env node
//#region src/hooks/permission-request.ts
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
function asText(value, max) {
	if (typeof value === "string") return value.slice(0, max);
	if (value == null) return "";
	try {
		return JSON.stringify(value).slice(0, max);
	} catch {
		return String(value).slice(0, max);
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
	const sessionId = data.session_id || "unknown";
	const cwd = data.cwd || process.cwd();
	try {
		await fetch(`${REST_URL}/agentmemory/observe`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hookType: "notification",
				sessionId,
				project: cwd,
				cwd,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					notification_type: "permission_request",
					tool_name: data.tool_name,
					tool_input: asText(data.tool_input, 4e3),
					permission: data.permission || data.permission_type || data.action || null,
					title: data.title || data.tool_name || "Permission request",
					message: asText(data.message || data.reason || data, 4e3)
				}
			}),
			signal: AbortSignal.timeout(3e3)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=permission-request.mjs.map