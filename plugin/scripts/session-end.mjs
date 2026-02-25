#!/usr/bin/env node
//#region src/hooks/session-end.ts
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
	const sessionId = data.session_id || "unknown";
	try {
		await fetch(`${REST_URL}/agentmemory/session/end`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sessionId }),
			signal: AbortSignal.timeout(5e3)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=session-end.mjs.map