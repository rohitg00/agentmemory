#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/hooks/antigravity-bridge.ts
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_NAME_MAP = {
	view_file: "read",
	view_line_range: "read",
	view_code_item: "read",
	read_file: "read",
	read_url_content: "read",
	edit_file: "edit",
	replace_file_content: "edit",
	propose_code: "edit",
	write_to_file: "write",
	create_file: "write",
	grep_search: "grep",
	codebase_search: "grep",
	find_by_name: "glob",
	list_dir: "glob"
};
const ARG_KEY_MAP = {
	AbsolutePath: "file_path",
	TargetFile: "file_path",
	DirectoryPath: "path",
	SearchDirectory: "path",
	Pattern: "pattern",
	Query: "pattern",
	CommandLine: "command"
};
function asObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function firstString(...values) {
	for (const v of values) if (typeof v === "string" && v.length > 0) return v;
}
function normalizeToolArgs(args) {
	if (!args) return {};
	const out = { ...args };
	for (const [from, to] of Object.entries(ARG_KEY_MAP)) if (out[to] === void 0 && args[from] !== void 0) out[to] = args[from];
	return out;
}
/**
* Translate one Antigravity hook payload into the flat, snake_case shape
* the bundled hooks consume. Unknown fields are passed through so future
* Antigravity additions stay visible to the capture pipeline.
*/
function normalizePayload(event, raw) {
	const toolCall = asObject(raw["toolCall"]);
	const workspacePaths = Array.isArray(raw["workspacePaths"]) ? raw["workspacePaths"] : [];
	const sessionId = firstString(raw["conversationId"], raw["session_id"], raw["sessionId"]) ?? "unknown";
	const cwd = firstString(raw["cwd"], workspacePaths[0]) ?? process.cwd();
	const out = {
		...raw,
		session_id: sessionId,
		cwd,
		hook_event_name: event
	};
	const transcriptPath = firstString(raw["transcript_path"], raw["transcriptPath"]);
	if (transcriptPath) out["transcript_path"] = transcriptPath;
	if (toolCall) {
		const args = normalizeToolArgs(asObject(toolCall["args"]) ?? asObject(toolCall["toolArgs"]));
		const rawName = firstString(toolCall["name"], toolCall["toolName"], args["ToolName"], args["toolName"]);
		if (rawName) {
			out["tool_name"] = TOOL_NAME_MAP[rawName] ?? rawName;
			out["native_tool_name"] = rawName;
		}
		out["tool_input"] = args;
		const result = toolCall["result"] ?? raw["toolResult"] ?? raw["result"];
		if (result !== void 0) out["tool_result"] = result;
	}
	return out;
}
/**
* Map an Antigravity event to the bundled scripts it should drive.
*
* PreInvocation stands in for both SessionStart and UserPromptSubmit: the
* first invocation of a conversation opens the session, every later one is
* a fresh user turn. PostInvocation is deliberately unmapped — PostToolUse
* already captures the work, and firing again would double-record it.
*/
function targetsFor(event, raw) {
	switch (event) {
		case "PreInvocation": {
			const n = raw["invocationNum"];
			return typeof n !== "number" || n <= 1 ? ["session-start.mjs", "prompt-submit.mjs"] : ["prompt-submit.mjs"];
		}
		case "PreToolUse": return ["pre-tool-use.mjs"];
		case "PostToolUse": return ["post-tool-use.mjs"];
		case "Stop": return ["stop.mjs", "session-end.mjs"];
		default: return [];
	}
}
/**
* The stdout contract, per event.
*
* Antigravity documents `decision` as a *required* field of PreToolUse hook
* output, and agy treats a response that omits it as a denial: a bare `{}`
* on PreToolUse makes the agent refuse every matched tool call (reported
* against agy 1.0.5 in cmux#5358). A passive capture hook must therefore say
* `allow` explicitly. No other event carries a permission decision, so they
* stay on `{}` — emitting `decision` or `terminationBehavior` there would
* override the user's own settings.
*/
function responseFor(event) {
	return event === "PreToolUse" ? "{\"decision\":\"allow\"}" : "{}";
}
async function main() {
	const event = process.argv[2];
	if (!event) return;
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let raw;
	try {
		raw = JSON.parse(input);
	} catch {
		return;
	}
	if (!raw || typeof raw !== "object") return;
	const payload = JSON.stringify(normalizePayload(event, raw));
	for (const script of targetsFor(event, raw)) spawnSync(process.execPath, [join(SCRIPTS_DIR, script)], {
		input: payload,
		stdio: [
			"pipe",
			"ignore",
			"ignore"
		]
	});
}
if (process.argv[1] !== void 0 && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {}).finally(() => {
	process.stdout.write(responseFor(process.argv[2] ?? ""));
	process.exit(0);
});
//#endregion
export { normalizePayload, responseFor, targetsFor };

//# sourceMappingURL=antigravity-bridge.mjs.map