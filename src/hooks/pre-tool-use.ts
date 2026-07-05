#!/usr/bin/env node

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

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

type EnrichTarget = {
  files: string[];
  terms: string[];
  toolName: string;
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function extractCodexPatchFiles(patch: string): string[] {
  const files: string[] = [];
  for (const line of patch.split("\n")) {
    const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (match) files.push(match[1].trim());
  }
  return unique(files);
}

function extractCodexCommandTarget(command: string): EnrichTarget | undefined {
  const trimmed = command.trim();
  if (!trimmed || /[;&|`$<>]/.test(trimmed)) return undefined;

  const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const tokens = parts.map((part) => part.replace(/^["']|["']$/g, ""));
  const commandName = tokens[0]?.split("/").pop();
  if (!commandName) return undefined;

  if (commandName === "rg") {
    const positional = tokens.slice(1).filter((token) => !token.startsWith("-"));
    if (positional.length === 0) return undefined;
    const [pattern, ...paths] = positional;
    return {
      files: unique(paths),
      terms: pattern ? [pattern] : [],
      toolName: "grep",
    };
  }

  if (["sed", "cat", "head", "tail", "nl"].includes(commandName)) {
    const paths = tokens
      .slice(1)
      .filter((token) => !token.startsWith("-") && /[./]/.test(token));
    if (paths.length === 0) return undefined;
    return { files: unique(paths), terms: [], toolName: "read" };
  }

  if (["ls", "find"].includes(commandName)) {
    const paths = tokens.slice(1).filter((token) => !token.startsWith("-"));
    if (paths.length === 0) return undefined;
    return { files: unique(paths), terms: [], toolName: "glob" };
  }

  return undefined;
}

function enrichTargetForTool(
  toolName: string,
  toolInput: Record<string, unknown>,
): EnrichTarget | undefined {
  const normalizedToolName = toolName.toLowerCase();
  const fileTools = ["edit", "write", "create", "read", "view", "glob", "grep"];

  if (fileTools.includes(normalizedToolName)) {
    const files: string[] = [];
    const fileKeys =
      normalizedToolName === "grep"
        ? ["path", "file"]
        : ["file_path", "path", "file", "pattern"];
    for (const key of fileKeys) {
      const val = toolInput[key];
      if (typeof val === "string" && val.length > 0) files.push(val);
    }
    if (files.length === 0) return undefined;

    const terms: string[] = [];
    if (normalizedToolName === "grep" || normalizedToolName === "glob") {
      const pattern = toolInput["pattern"];
      if (typeof pattern === "string" && pattern.length > 0) {
        terms.push(pattern);
      }
    }

    return { files: unique(files), terms, toolName };
  }

  if (normalizedToolName === "apply_patch") {
    const patch = toolInput["patch"] ?? toolInput["input"] ?? toolInput["command"];
    if (typeof patch !== "string") return undefined;
    const files = extractCodexPatchFiles(patch);
    if (files.length === 0) return undefined;
    return { files, terms: [], toolName: "edit" };
  }

  if (["exec_command", "shell_command", "bash"].includes(normalizedToolName)) {
    const command = toolInput["cmd"] ?? toolInput["command"];
    if (typeof command !== "string") return undefined;
    return extractCodexCommandTarget(command);
  }

  return undefined;
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

  if (isSdkChildContext(data)) return;

  const toolName =
    typeof data.tool_name === "string"
      ? data.tool_name
      : typeof data.toolName === "string"
        ? data.toolName
        : undefined;
  if (!toolName) return;

  const rawToolInput = data.tool_input ?? data.toolArgs;
  const toolInput =
    typeof rawToolInput === "object" &&
    rawToolInput !== null &&
    !Array.isArray(rawToolInput)
      ? (rawToolInput as Record<string, unknown>)
      : {};

  const target = enrichTargetForTool(toolName, toolInput);
  if (!target) return;

  const rawSessionId = data.session_id || data.sessionId;
  const sessionId =
    typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "unknown";
  const project =
    typeof data.project === "string" && data.project.trim().length > 0
      ? data.project.trim()
      : undefined;

  try {
    const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        sessionId,
        files: target.files,
        terms: target.terms,
        toolName: target.toolName,
        ...(project !== undefined && { project }),
      }),
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
