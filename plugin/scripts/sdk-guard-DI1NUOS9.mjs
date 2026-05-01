//#region src/hooks/sdk-guard.ts
/**
* Recursion guard shared by every hook script.
*
* A Claude Code session spawned via @anthropic-ai/claude-agent-sdk inherits
* the same plugin hooks as the parent CC session. If any hook script in that
* child session calls back into /agentmemory/* (e.g. Stop → /summarize →
* provider.summarize() → another child session), we get unbounded recursion
* that burns tokens and fills .claude/projects/ with ghost sessions
* (#149 follow-up; see reported loop under v0.9.1).
*
* Two signals identify a SDK-child context:
*   1. AGENTMEMORY_SDK_CHILD=1 env var — set by our agent-sdk provider
*      before it spawns `query()`. Inherited by child processes.
*   2. payload.entrypoint === "sdk-ts" — CC writes this into the hook
*      stdin jsonl when the session was spawned by the Agent SDK.
*
* Hook scripts must call isSdkChildContext(payload) EARLY and return
* silently when it is true.
*/
function isSdkChildContext(payload) {
	if (process.env.AGENTMEMORY_SDK_CHILD === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	if (payload["entrypoint"] === "sdk-ts") return true;
	return false;
}

//#endregion
export { isSdkChildContext as t };
//# sourceMappingURL=sdk-guard-DI1NUOS9.mjs.map