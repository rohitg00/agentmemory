#!/usr/bin/env node
import { t as resolveProject } from "./_project--Krf34Q5.mjs";

//#region src/hooks/notification.ts
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
	if (data.notification_type !== "permission_prompt") return;
	const sessionId = data.session_id || "unknown";
	const cwd = (typeof data.cwd === "string" ? data.cwd.trim() : "") || process.cwd();
	const project = resolveProject(cwd);
	try {
		await fetch(`${REST_URL}/agentmemory/observe`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hookType: "notification",
				sessionId,
				project,
				cwd,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				data: {
					notification_type: data.notification_type,
					title: data.title,
					message: data.message
				}
			}),
			signal: AbortSignal.timeout(2e3)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=notification.mjs.map