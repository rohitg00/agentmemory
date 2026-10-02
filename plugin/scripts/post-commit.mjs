#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/secret-store.ts
const SECRET_KEY = "AGENTMEMORY_SECRET";
function agentmemoryHomeDir() {
	return join(homedir(), ".agentmemory");
}
function secretFilePath() {
	return join(agentmemoryHomeDir(), "secret");
}
function usable(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("${") && trimmed.endsWith("}")) return "";
	return trimmed;
}
function unquote(value) {
	const quote = value[0];
	if ((quote === "\"" || quote === "'") && value.length > 1) {
		const close = value.indexOf(quote, 1);
		if (close !== -1) return value.slice(1, close);
	}
	const hash = value.indexOf(" #");
	return hash === -1 ? value : value.slice(0, hash).trim();
}
function readEnvFileSecret() {
	let content;
	try {
		content = readFileSync(join(agentmemoryHomeDir(), ".env"), "utf-8");
	} catch {
		return "";
	}
	if (typeof content !== "string") return "";
	let found = "";
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		if (trimmed.slice(0, eq).replace(/^export\s+/, "").trim() !== SECRET_KEY) continue;
		found = usable(unquote(trimmed.slice(eq + 1).trim()));
	}
	return found;
}
function readStoredSecret() {
	try {
		return usable(readFileSync(secretFilePath(), "utf-8"));
	} catch {
		return "";
	}
}
function isLoopbackUrl(url) {
	let hostname;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	const bare = hostname.replace(/^\[|\]$/g, "");
	return bare === "localhost" || bare === "::1" || /^127(?:\.\d{1,3}){3}$/.test(bare);
}
function resolveClientSecret(baseUrl, env = process.env) {
	const fromEnv = usable(env[SECRET_KEY]);
	if (fromEnv) return fromEnv;
	if (!isLoopbackUrl(baseUrl)) return "";
	return readEnvFileSecret() || readStoredSecret();
}
//#endregion
//#region src/hooks/_project.ts
function hookCwd(data) {
	if (!data || typeof data !== "object") return void 0;
	if (typeof data.cwd === "string" && data.cwd.trim()) return data.cwd;
	const roots = data.workspace_roots;
	if (Array.isArray(roots)) {
		for (const root of roots) if (typeof root === "string" && root.trim()) return root;
	}
	const projectDir = process.env["DEVIN_PROJECT_DIR"] || process.env["CLAUDE_PROJECT_DIR"];
	if (projectDir && projectDir.trim()) return projectDir;
}
//#endregion
//#region src/hooks/post-commit.ts
const exec = promisify(execFile);
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = resolveClientSecret(REST_URL);
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
	if (!data || typeof data !== "object") data = {};
	if (isSdkChildContext(data)) return;
	const cwd = hookCwd(data) || process.env["AGENTMEMORY_CWD"] || process.cwd();
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
		await fetch(`${REST_URL}/agentmemory/session/commit`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {}
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=post-commit.mjs.map