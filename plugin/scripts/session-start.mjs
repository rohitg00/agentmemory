#!/usr/bin/env node
//#region src/hooks/session-start.ts
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		return;
	}
	const sessionId = data.session_id || `ses_${Date.now().toString(36)}`;
	const project = data.cwd || process.cwd();
	try {
		const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId,
				project,
				cwd: project
			}),
			signal: AbortSignal.timeout(5e3)
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