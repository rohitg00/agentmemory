#!/usr/bin/env node

// Pre-tool-use enrichment hook.
//
// THIS HOOK IS A NO-OP BY DEFAULT AS OF 0.8.10 (#143). Previously it
// fired /agentmemory/enrich on every Edit/Write/Read/Glob/Grep tool call
// and wrote up to 4000 chars of context to stdout. Claude Code reads
// PreToolUse stdout and prepends it to the model's next turn, which meant
// agentmemory was silently injecting ~1000 tokens into every tool turn
// via the user's Claude Code session. On Claude Pro that burned entire
// allocations in a handful of messages (@adrianricardo, #143).
//
// Users who explicitly want pre-tool enrichment opt in with:
//   AGENTMEMORY_INJECT_CONTEXT=true   in ~/.agentmemory/.env
// and restart Claude Code. Expect your session input token count to grow
// proportionally with the number of file-touching tool calls per turn.
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function main() {
  // Default off: exit immediately so we don't even open stdin. This keeps
  // Claude Code's tool-call hot path as cheap as possible.
  if (!INJECT_CONTEXT) return;

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  const toolName = data.tool_name as string;
  if (!toolName) return;

  const fileTools = ["Edit", "Write", "Read", "Glob", "Grep"];
  if (!fileTools.includes(toolName)) return;

  const toolInput = (data.tool_input || {}) as Record<string, unknown>;
  const files: string[] = [];
  const fileKeys =
    toolName === "Grep"
      ? ["path", "file"]
      : ["file_path", "path", "file", "pattern"];
  for (const key of fileKeys) {
    const val = toolInput[key];
    if (typeof val === "string" && val.length > 0) files.push(val);
  }
  if (files.length === 0) return;

  const terms: string[] = [];
  if (toolName === "Grep" || toolName === "Glob") {
    const pattern = toolInput["pattern"];
    if (typeof pattern === "string" && pattern.length > 0) {
      terms.push(pattern);
    }
  }

  const sessionId = (data.session_id as string) || "unknown";

  try {
    const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId, files, terms, toolName }),
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      const result = (await res.json()) as { context?: string };
      if (result.context) {
        process.stdout.write(result.context);
      }
    }
  } catch {
    // don't block tool execution
  }
}

main();
