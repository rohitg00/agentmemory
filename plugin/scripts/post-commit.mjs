#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/hooks/post-commit.ts
const exec = promisify(execFile);
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
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
function createPlaintextBearerAuthGuard(warn = (message) => console.warn(message)) {
	let warned = false;
	return (baseUrl, secret) => {
		if (!usesPlaintextBearerAuth(baseUrl, secret)) return true;
		const message = plaintextBearerAuthMessage(baseUrl);
		if (process.env["AGENTMEMORY_REQUIRE_HTTPS"] === "1") throw new Error(message);
		if (!warned) {
			warned = true;
			warn(message);
		}
		return false;
	};
}
const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard((message) => process.stderr.write(`${message}\n`));
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
const TIMEOUT_MS = 1500;
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
}
async function git(args, cwd) {
	try {
		const { stdout } = await exec("git", args, {
			cwd,
			timeout: 1500
		});
		return stdout.trim();
	} catch {
		return null;
	}
}
async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let data = {};
	if (input.trim()) try {
		data = JSON.parse(input);
	} catch {}
	if (isSdkChildContext(data)) return;
	const cwd = data.cwd || process.env["AGENTMEMORY_CWD"] || process.cwd();
	const sessionId = data.session_id || process.env["AGENTMEMORY_SESSION_ID"] || void 0;
	const sha = process.env["AGENTMEMORY_COMMIT_SHA"] || await git(["rev-parse", "HEAD"], cwd);
	if (!sha) return;
	const branch = await git([
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	], cwd);
	const repo = await git([
		"config",
		"--get",
		"remote.origin.url"
	], cwd);
	const message = await git([
		"log",
		"-1",
		"--pretty=%B",
		sha
	], cwd);
	const author = await git([
		"log",
		"-1",
		"--pretty=%an <%ae>",
		sha
	], cwd);
	const authoredAt = await git([
		"log",
		"-1",
		"--pretty=%aI",
		sha
	], cwd);
	const filesRaw = await git([
		"diff-tree",
		"--no-commit-id",
		"--name-only",
		"-r",
		sha
	], cwd);
	const files = filesRaw ? filesRaw.split("\n").filter(Boolean) : void 0;
	const body = {
		sessionId,
		sha,
		branch: branch || void 0,
		repo: repo || void 0,
		message: message || void 0,
		author: author || void 0,
		authoredAt: authoredAt || void 0,
		files
	};
	try {
		await guardedFetch(REST_URL, "/agentmemory/session/commit", SECRET, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {}
}
main();
//#endregion
export {};

//# sourceMappingURL=post-commit.mjs.map