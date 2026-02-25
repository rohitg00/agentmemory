#!/usr/bin/env node
//#region src/hooks/pre-tool-use.ts
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
	const sessionId = data.session_id || "unknown";
	try {
		const res = await fetch(`${REST_URL}/agentmemory/file-context`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId,
				files
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