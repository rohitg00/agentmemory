#!/usr/bin/env node
//#region src/hooks/stop.ts
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
		await fetch(`${REST_URL}/agentmemory/summarize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sessionId }),
			signal: AbortSignal.timeout(3e4)
		});
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=stop.mjs.map