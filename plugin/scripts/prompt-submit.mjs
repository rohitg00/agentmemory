#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
//#region src/hooks/_project.ts
const identityCache = /* @__PURE__ */ new Map();
function parseRemoteSlug(url) {
	let cleaned = url.trim();
	if (cleaned.endsWith(".git")) cleaned = cleaned.slice(0, -4);
	cleaned = cleaned.replace(/^(https?|git|ssh):\/\//, "");
	if (cleaned.includes("@")) cleaned = cleaned.split("@")[1];
	cleaned = cleaned.replace(/^([^/:]+):\d+\//, "$1/");
	cleaned = cleaned.replace(/:/g, "/");
	const segments = cleaned.split("/").map((s) => s.trim()).filter(Boolean);
	if (segments.length === 0) return "unknown";
	const host = segments[0].toLowerCase();
	const rest = segments.slice(1).join("-").toLowerCase();
	return (rest ? `${host}-${rest}` : host).replace(/[^a-z0-9.-]/gi, "-").replace(/-+/g, "-");
}
function resolveWorkspaceIdentity(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	const rawDir = cwd && cwd.trim() ? resolve(cwd.trim()) : process.cwd();
	if (explicit && explicit.trim()) {
		const name = explicit.trim();
		return {
			projectKey: name,
			displayName: name,
			rootPath: rawDir
		};
	}
	let dir = rawDir;
	try {
		dir = realpathSync(rawDir);
	} catch {}
	const cached = identityCache.get(dir);
	if (cached) return cached;
	let rootPath = dir;
	let displayName = basename(dir);
	let subpath;
	let remoteUrl;
	try {
		const top = execSync("git rev-parse --show-toplevel", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim();
		if (top) {
			let resolvedTop = top;
			try {
				resolvedTop = realpathSync(top);
			} catch {}
			rootPath = resolvedTop;
			displayName = basename(resolvedTop);
			if (dir !== resolvedTop) {
				const rel = relative(resolvedTop, dir).replace(/\\/g, "/");
				if (rel && rel !== ".") subpath = rel;
			}
			try {
				remoteUrl = execSync("git config --get remote.upstream.url", {
					cwd: dir,
					stdio: [
						"ignore",
						"pipe",
						"ignore"
					],
					timeout: 500
				}).toString().trim();
			} catch {}
			if (!remoteUrl) try {
				remoteUrl = execSync("git config --get remote.origin.url", {
					cwd: dir,
					stdio: [
						"ignore",
						"pipe",
						"ignore"
					],
					timeout: 500
				}).toString().trim();
			} catch {}
		}
	} catch {}
	let projectKey;
	if (remoteUrl) projectKey = parseRemoteSlug(remoteUrl);
	else {
		const hash = createHash("sha256").update(rootPath).digest("hex").slice(0, 8);
		projectKey = `${displayName.toLowerCase()}-${hash}`;
	}
	const identity = {
		projectKey,
		displayName,
		rootPath,
		subpath
	};
	identityCache.set(dir, identity);
	identityCache.set(rawDir, identity);
	return identity;
}
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	return resolveWorkspaceIdentity(cwd).displayName;
}
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
//#region src/hooks/prompt-submit.ts
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
	if (!data || typeof data !== "object") return;
	if (isSdkChildContext(data)) return;
	const sessionId = data.session_id || data.sessionId || data.conversation_id || "unknown";
	const cwd = hookCwd(data) || process.cwd();
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hookType: "prompt_submit",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: { prompt: data.prompt ?? data.userPrompt }
		}),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 500).unref();
}
main().catch(() => process.exit(0));
//#endregion
export {};

//# sourceMappingURL=prompt-submit.mjs.map