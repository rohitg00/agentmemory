#!/usr/bin/env node

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

type CursorPayload = {
  session_id?: string;
  conversation_id?: string;
  cwd?: string;
  workspace_roots?: string[];
  hook_event_name?: string;
  prompt?: string;
  command?: string;
  file_path?: string;
  mcp_server_name?: string;
  mcp_tool_name?: string;
  mcp_tool_input?: Record<string, unknown>;
  mcp_tool_output?: unknown;
  old_content?: string;
  new_content?: string;
  reason?: string;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

function inferEvent(payload: CursorPayload): string {
  if (typeof payload.hook_event_name === "string" && payload.hook_event_name) {
    return payload.hook_event_name;
  }
  if (typeof payload.prompt === "string" && payload.prompt) return "beforeSubmitPrompt";
  if (typeof payload.file_path === "string" && payload.file_path) return "afterFileEdit";
  if (typeof payload.command === "string" && payload.command) return "afterShellExecution";
  if (payload.mcp_server_name || payload.mcp_tool_name) return "afterMCPExecution";
  if (payload.reason) return "stop";
  return "sessionStart";
}

async function readJsonFromStdin<T>(): Promise<T | null> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function sessionId(payload: CursorPayload): string {
  return payload.session_id || payload.conversation_id || `cursor-${Date.now().toString(36)}`;
}

function projectRoot(payload: CursorPayload): string {
  return payload.cwd || payload.workspace_roots?.[0] || process.cwd();
}

async function postObserve(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // hooks must never block the host
  }
}

async function postSessionStart(body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = (await res.json()) as { context?: string };
      if (typeof data.context === "string" && data.context) {
        process.stdout.write(data.context);
      }
    }
  } catch {
    // hooks must never block the host
  }
}

async function main(): Promise<void> {
  const payload = await readJsonFromStdin<CursorPayload>();
  if (!payload) return;

  const sid = sessionId(payload);
  const root = projectRoot(payload);
  const event = inferEvent(payload);

  switch (event) {
    case "sessionStart":
      await postSessionStart({ sessionId: sid, project: root, cwd: root });
      return;
    case "beforeSubmitPrompt":
      await postObserve({
        hookType: "prompt_submit",
        sessionId: sid,
        project: root,
        cwd: root,
        timestamp: new Date().toISOString(),
        data: { prompt: payload.prompt || "" },
      });
      return;
    case "afterFileEdit":
      await postObserve({
        hookType: "post_tool_use",
        sessionId: sid,
        project: root,
        cwd: root,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: "CursorEdit",
          tool_input: {
            file_path: payload.file_path || "",
            old_content: payload.old_content,
            new_content: payload.new_content,
          },
          tool_output: `Edited ${payload.file_path || "file"}`,
        },
      });
      return;
    case "afterShellExecution":
    case "beforeShellExecution":
      await postObserve({
        hookType: "post_tool_use",
        sessionId: sid,
        project: root,
        cwd: root,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: "Bash",
          tool_input: { command: payload.command || "" },
          tool_output: payload.reason || "shell execution",
        },
      });
      return;
    case "afterMCPExecution":
    case "beforeMCPExecution":
      await postObserve({
        hookType: "post_tool_use",
        sessionId: sid,
        project: root,
        cwd: root,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: payload.mcp_tool_name || payload.mcp_server_name || "MCP",
          tool_input: payload.mcp_tool_input || {},
          tool_output: payload.mcp_tool_output ?? "MCP execution",
        },
      });
      return;
    case "stop":
    case "sessionEnd":
      try {
        await fetch(`${REST_URL}/agentmemory/session/end`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionId: sid }),
          signal: AbortSignal.timeout(1500),
        });
      } catch {
        // ignore
      }
      return;
    default:
      return;
  }
}

main();
