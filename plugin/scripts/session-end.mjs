#!/usr/bin/env node
//#region src/security/plaintext-bearer-auth.ts
const LOOPBACK_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1"
]);
function normalizedHostname(hostname) {
	return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}
function usesPlaintextBearerAuth(baseUrl, secret) {
	if (!secret) return false;
	try {
		const parsed = new URL(baseUrl);
		return parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(normalizedHostname(parsed.hostname));
	} catch {
		return false;
	}
}
function plaintextBearerAuthMessage(baseUrl) {
	return `agentmemory: AGENTMEMORY_SECRET is configured for plaintext HTTP to ${baseUrl}. Bearer tokens and memory payloads can be observed on the network; use HTTPS or an SSH tunnel.`;
}
function createPlaintextBearerAuthGuard(warn = (message) => console.warn(message), env) {
	let warned = false;
	return (baseUrl, secret) => {
		if (!usesPlaintextBearerAuth(baseUrl, secret)) return true;
		const message = plaintextBearerAuthMessage(baseUrl);
		if ((env || process.env).AGENTMEMORY_REQUIRE_HTTPS === "1") throw new Error(message);
		if (!warned) {
			warned = true;
			warn(message);
		}
		return false;
	};
}
//#endregion
//#region src/hooks/_http.ts
const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard((message) => process.stderr.write(`${message}\n`));
function authHeaders(secret) {
	const h = { "Content-Type": "application/json" };
	if (secret) h["Authorization"] = `Bearer ${secret}`;
	return h;
}
function canSendAuthenticatedRequest(baseUrl, secret) {
	try {
		return guardPlaintextBearerAuth(baseUrl, secret);
	} catch (err) {
		process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
		return false;
	}
}
function guardedFetch(baseUrl, path, secret, init) {
	if (!canSendAuthenticatedRequest(baseUrl, secret)) return void 0;
	return fetch(`${baseUrl}${path}`, init);
}
//#endregion
//#region src/hooks/session-end.ts
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
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
	const sessionId = data.session_id || data.sessionId || "unknown";
	guardedFetch(REST_URL, "/agentmemory/session/end", SECRET, {
		method: "POST",
		headers: authHeaders(SECRET),
		body: JSON.stringify({ sessionId }),
		signal: AbortSignal.timeout(3e4)
	})?.catch(() => {});
	if (process.env["CONSOLIDATION_ENABLED"] === "true") {
		guardedFetch(REST_URL, "/agentmemory/crystals/auto", SECRET, {
			method: "POST",
			headers: authHeaders(SECRET),
			body: JSON.stringify({ olderThanDays: 0 }),
			signal: AbortSignal.timeout(6e4)
		})?.catch(() => {});
		guardedFetch(REST_URL, "/agentmemory/consolidate-pipeline", SECRET, {
			method: "POST",
			headers: authHeaders(SECRET),
			body: JSON.stringify({
				tier: "all",
				force: true
			}),
			signal: AbortSignal.timeout(12e4)
		})?.catch(() => {});
	}
	if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") guardedFetch(REST_URL, "/agentmemory/claude-bridge/sync", SECRET, {
		method: "POST",
		headers: authHeaders(SECRET),
		signal: AbortSignal.timeout(3e4)
	})?.catch(() => {});
	setTimeout(() => process.exit(0), 1500).unref();
}
main();
//#endregion
export {};

//# sourceMappingURL=session-end.mjs.map