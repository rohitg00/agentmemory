import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
//#region src/index.ts
const DEFAULTS = {
	url: "http://localhost:3111",
	secret: "",
	agentId: "dsh",
	injectInstructions: true,
	injectContext: true,
	injectMaxChars: 6e3,
	observeToolCalls: true,
	compactionBridge: true,
	summarizeOnDispose: true
};
const PROMPT_MAX_CHARS = 8e3;
const TOOL_INPUT_MAX_CHARS = 4e3;
const COMPACTION_MAX_CHARS = 6e3;
const OBSERVE_TIMEOUT_MS = 1500;
const SESSION_START_TIMEOUT_MS = 2e3;
const CONTEXT_TIMEOUT_MS = 3e3;
const REMEMBER_TIMEOUT_MS = 5e3;
const SESSION_END_TIMEOUT_MS = 3e4;
const INSTRUCTIONS = [
	"<agentmemory-instructions>",
	"You have persistent cross-session long-term memory via agentmemory. Tools are namespaced `mcp__agentmemory__*` (memory_recall / memory_save / memory_smart_search / memory_sessions / ...).",
	"- At the START of a task, call `mcp__agentmemory__memory_recall` (or `memory_smart_search`) to load relevant past decisions, fixes, and user preferences; do not re-ask.",
	"- When you learn something durable (a decision, a fix, a gotcha, a preference, a project convention), call `mcp__agentmemory__memory_save` (concepts: 2-5 comma-separated keywords).",
	"- Prefer recall over re-deriving; save concise reusable facts, not transcripts.",
	"- If the user asks to forget/delete something, use `memory_governance_delete` (comma-separated memoryIds).",
	"- Tool results are JSON — inspect them before presenting to the user.",
	"</agentmemory-instructions>"
].join("\n");
function makeRestClient(url, secret, debug = false) {
	function headers() {
		const h = { "Content-Type": "application/json" };
		if (secret) h["Authorization"] = `Bearer ${secret}`;
		return h;
	}
	async function post(path, body, timeoutMs = 3e3) {
		try {
			const res = await fetch(`${url}/agentmemory${path}`, {
				method: "POST",
				headers: headers(),
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (!res.ok) return null;
			return await res.json();
		} catch (err) {
			if (debug) console.error(`[agentmemory] POST ${path} failed:`, err.message);
			return null;
		}
	}
	function fire(path, body, timeoutMs = 1500) {
		post(path, body, timeoutMs);
	}
	return {
		post,
		fire
	};
}
function resolveProjectName(cwd, env = process.env) {
	const explicit = env["AGENTMEMORY_PROJECT_NAME"]?.trim();
	if (explicit) return explicit;
	try {
		const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			encoding: "utf8"
		}).trim();
		if (top) return basename(top);
	} catch {}
	return basename(cwd) || cwd;
}
function isAgentmemoryTool(name) {
	return name.startsWith("mcp__agentmemory__") || name.startsWith("agentmemory_");
}
function eventTextContent(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((block) => {
		if (typeof block === "string") return block;
		if (block && typeof block === "object") {
			const b = block;
			if (b.type === "text" && typeof b.text === "string") return b.text;
		}
		return "";
	}).join("\n");
	return "";
}
function userMessagePrompt(event, maxChars) {
	if (event.type !== "user/message") return null;
	const text = eventTextContent(event.data?.content);
	if (!text.trim()) return null;
	return text.slice(0, maxChars);
}
function toolCallObservation(event, maxChars) {
	if (event.type !== "tool/call") return null;
	const data = event.data ?? {};
	const name = typeof data.name === "string" ? data.name : "";
	if (!name || isAgentmemoryTool(name)) return null;
	let input;
	try {
		input = JSON.stringify(data.arguments ?? {}).slice(0, maxChars);
	} catch {
		input = String(data.arguments ?? "").slice(0, maxChars);
	}
	return {
		tool_name: name,
		call_id: typeof data.callId === "string" ? data.callId : null,
		tool_input: input
	};
}
function compactionSummary(event, maxChars) {
	if (event.type !== "compaction/summary") return null;
	const data = event.data ?? {};
	const summary = (typeof data.summary === "string" && data.summary ? data.summary : void 0) ?? (typeof data.text === "string" && data.text ? data.text : void 0) ?? (typeof data.content === "string" && data.content ? data.content : void 0);
	if (!summary) return null;
	return summary.slice(0, maxChars);
}
const name = "agentmemory";
function apply(ctx, rawConfig = {}) {
	const cfg = {
		...DEFAULTS,
		...rawConfig
	};
	const debug = process.env["AGENTMEMORY_DSH_DEBUG"] === "1";
	const rest = makeRestClient(cfg.url, cfg.secret, debug);
	const logger = ctx.logger;
	const startContextCache = /* @__PURE__ */ new Map();
	const injectedSessions = /* @__PURE__ */ new Set();
	const sessionInfos = /* @__PURE__ */ new Map();
	const projectNameCache = /* @__PURE__ */ new Map();
	const pendingCalls = /* @__PURE__ */ new Set();
	function sessionCwd(session) {
		return session.header?.cwd || process.cwd();
	}
	function cachedProjectName(cwd) {
		let project = projectNameCache.get(cwd);
		if (project === void 0) {
			project = resolveProjectName(cwd);
			projectNameCache.set(cwd, project);
		}
		return project;
	}
	function trackSession(session) {
		if (!session || typeof session.id !== "string") return void 0;
		const cwd = sessionCwd(session);
		const info = {
			cwd,
			project: cachedProjectName(cwd)
		};
		sessionInfos.set(session.id, info);
		return info;
	}
	function fireObserve(sid, info, hookType, data) {
		const call = rest.post("/observe", {
			hookType,
			sessionId: sid,
			project: info.project,
			cwd: info.cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data
		}, OBSERVE_TIMEOUT_MS).catch(() => {});
		pendingCalls.add(call);
		call.then(() => pendingCalls.delete(call));
	}
	ctx.on("session/created", (session) => {
		if (!session || typeof session.id !== "string") return;
		const sid = session.id;
		const info = trackSession(session);
		if (!info) return;
		const call = rest.post("/session/start", {
			sessionId: sid,
			project: info.project,
			cwd: info.cwd,
			agentId: cfg.agentId
		}, SESSION_START_TIMEOUT_MS).then((result) => {
			const context = result?.context;
			if (typeof context === "string" && context.length > 0) startContextCache.set(sid, context);
		}).catch(() => {});
		pendingCalls.add(call);
		call.then(() => pendingCalls.delete(call));
	});
	ctx.on("session/event", (session, event) => {
		if (!session || !event || typeof event.type !== "string") return;
		const sid = session.id;
		if (!sid) return;
		let info = sessionInfos.get(sid);
		if (!info) {
			info = trackSession(session);
			if (!info) return;
		}
		const prompt = userMessagePrompt(event, PROMPT_MAX_CHARS);
		if (prompt !== null) {
			fireObserve(sid, info, "prompt_submit", { userPrompt: prompt });
			return;
		}
		const tool = toolCallObservation(event, TOOL_INPUT_MAX_CHARS);
		if (tool !== null && cfg.observeToolCalls) {
			fireObserve(sid, info, "post_tool_use", tool);
			return;
		}
		if (cfg.compactionBridge) {
			const summary = compactionSummary(event, COMPACTION_MAX_CHARS);
			if (summary !== null) {
				const call = rest.post("/remember", {
					content: `[dsh compaction] ${summary}`,
					type: "fact",
					concepts: ["compaction"],
					project: info.project
				}, REMEMBER_TIMEOUT_MS).catch(() => {});
				pendingCalls.add(call);
				call.then(() => pendingCalls.delete(call));
			}
		}
	});
	ctx.on("agent/pre-step", async ({ agent, messages, step, signal }, next) => {
		const decision = await next();
		const session = agent?.session;
		if (!session || typeof session.id !== "string") return decision;
		const sid = session.id;
		if (step !== 1 || injectedSessions.has(sid)) return decision;
		if (decision.kind !== "enter" || !Array.isArray(decision.messages) || decision.messages.length === 0) return decision;
		if (signal.aborted) return decision;
		const project = (sessionInfos.get(sid) ?? trackSession(session))?.project ?? cachedProjectName(sessionCwd(session));
		const parts = [];
		if (cfg.injectInstructions) parts.push(INSTRUCTIONS);
		if (cfg.injectContext) {
			let context = startContextCache.get(sid);
			if (!context) {
				const result = await rest.post("/context", {
					sessionId: sid,
					project
				}, CONTEXT_TIMEOUT_MS);
				context = typeof result?.context === "string" ? result.context : "";
			} else startContextCache.delete(sid);
			if (context) parts.push(context);
		}
		if (parts.length === 0) return decision;
		const text = parts.join("\n\n").slice(0, cfg.injectMaxChars);
		const message = {
			id: randomUUID(),
			role: "user",
			content: [{
				type: "text",
				text
			}],
			source: {
				kind: "agentmemory",
				form: "memory-context"
			}
		};
		injectedSessions.add(sid);
		const lastClaimedIndex = decision.messages.length - 1 - [...decision.messages].reverse().findIndex((m) => messages.includes(m));
		const nextMessages = decision.messages.slice();
		nextMessages.splice(lastClaimedIndex + 1, 0, message);
		return {
			...decision,
			messages: nextMessages
		};
	});
	const APPROVAL_FIELDS = [
		"permission",
		"pattern",
		"title",
		"tool_call_id",
		"metadata"
	];
	ctx.on("approval/asked", (req) => {
		const data = req ?? {};
		const sid = typeof data.sessionId === "string" ? data.sessionId : void 0;
		if (!sid) return;
		const info = sessionInfos.get(sid);
		if (!info) return;
		const payload = { notification_type: "permission_prompt" };
		for (const key of APPROVAL_FIELDS) {
			const value = data[key];
			if (value === void 0) continue;
			let text;
			if (typeof value === "string") text = value;
			else try {
				text = JSON.stringify(value);
			} catch {
				text = String(value);
			}
			payload[key] = text.slice(0, 2e3);
		}
		fireObserve(sid, info, "notification", payload);
	});
	ctx.on("session/disposed", (session) => {
		if (!session || typeof session.id !== "string") return;
		const sid = session.id;
		if (cfg.summarizeOnDispose) {
			const call = rest.post("/session/end", { sessionId: sid }, SESSION_END_TIMEOUT_MS).catch(() => {});
			pendingCalls.add(call);
			call.then(() => pendingCalls.delete(call));
		}
		startContextCache.delete(sid);
		injectedSessions.delete(sid);
		sessionInfos.delete(sid);
	});
	ctx.effect(() => () => {
		startContextCache.clear();
		injectedSessions.clear();
		sessionInfos.clear();
		projectNameCache.clear();
	}, "agentmemory.dsh.memory");
	if (debug) logger.info(`[agentmemory] dsh plugin active: url=${cfg.url} agentId=${cfg.agentId} inject=${cfg.injectContext} observe=${cfg.observeToolCalls} compactionBridge=${cfg.compactionBridge}`);
}
//#endregion
export { apply, compactionSummary, eventTextContent, isAgentmemoryTool, makeRestClient, name, resolveProjectName, toolCallObservation, userMessagePrompt };
