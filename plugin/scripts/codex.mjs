#!/usr/bin/env node
//#region src/hooks/codex.ts
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
}
async function readJsonFromStdin() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	try {
		return JSON.parse(input);
	} catch {
		return null;
	}
}
async function main() {
	const payload = await readJsonFromStdin();
	if (!payload) return;
	const sid = payload.session_id || `codex-${Date.now().toString(36)}`;
	const root = payload.cwd || process.cwd();
	const event = payload.hook_event_name || "";
	const timestamp = (/* @__PURE__ */ new Date()).toISOString();
	try {
		if (event === "SessionStart") {
			const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					sessionId: sid,
					project: root,
					cwd: root
				}),
				signal: AbortSignal.timeout(1500)
			});
			if (res.ok) {
				const data = await res.json();
				if (typeof data.context === "string" && data.context) process.stdout.write(data.context);
			}
			return;
		}
		if (event === "UserPromptSubmit") {
			await fetch(`${REST_URL}/agentmemory/observe`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hookType: "prompt_submit",
					sessionId: sid,
					project: root,
					cwd: root,
					timestamp,
					data: { prompt: payload.prompt || "" }
				}),
				signal: AbortSignal.timeout(3e3)
			});
			return;
		}
		if (event === "PostToolUse" || event === "PreToolUse") {
			await fetch(`${REST_URL}/agentmemory/observe`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hookType: "post_tool_use",
					sessionId: sid,
					project: root,
					cwd: root,
					timestamp,
					data: {
						tool_name: payload.tool_name || "tool",
						tool_input: payload.tool_input || {},
						tool_output: payload.tool_output ?? "tool execution"
					}
				}),
				signal: AbortSignal.timeout(3e3)
			});
			return;
		}
		if (event === "Stop") {
			await fetch(`${REST_URL}/agentmemory/session/end`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ sessionId: sid }),
				signal: AbortSignal.timeout(1500)
			});
			return;
		}
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=codex.mjs.map