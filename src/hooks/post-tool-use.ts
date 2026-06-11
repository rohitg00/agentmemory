#!/usr/bin/env node
import { resolveProject } from "./_project.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function main() {
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

  const sessionId = ((data.session_id || data.sessionId) as string) || "unknown";
  const toolName = data.tool_name ?? data.toolName;
  const toolInput = data.tool_input ?? data.toolArgs;

  const { imageData, cleanOutput } = extractImageData(toolOutput(data));

  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "post_tool_use",
      sessionId,
      project: resolveProject(data.cwd as string | undefined),
      cwd: (data.cwd as string | undefined) || process.cwd(),
      timestamp: new Date().toISOString(),
      data: {
        tool_name: toolName,
        tool_input: toolInput,
        tool_output: truncate(cleanOutput, 8000),
        ...(imageData ? { image_data: imageData } : {}),
      },
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

function toolOutput(data: Record<string, unknown>): unknown {
  if (data.tool_response !== undefined) return data.tool_response;
  if (data.tool_output !== undefined) return data.tool_output;
  const result = data.tool_result ?? data.toolResult;
  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    return obj.text_result_for_llm ?? obj.textResultForLlm ?? result;
  }
  return result;
}

function isBase64Image(val: unknown): val is string {
  return typeof val === "string" && (
    val.startsWith("data:image/") ||
    val.startsWith("iVBORw0KGgo") ||
    val.startsWith("/9j/")
  );
}

function extractImageData(output: unknown): { imageData: string | undefined; cleanOutput: unknown } {
  if (isBase64Image(output)) {
    return { imageData: output, cleanOutput: "[image data extracted]" };
  }

  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    let imageData: string | undefined;
    const clean: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (!imageData && isBase64Image(val)) {
        imageData = val;
        clean[key] = "[image data extracted]";
      } else {
        clean[key] = val;
      }
    }

    return { imageData, cleanOutput: clean };
  }

  return { imageData: undefined, cleanOutput: output };
}

function truncate(value: unknown, max: number): unknown {
  if (typeof value === "string" && value.length > max) {
    return value.slice(0, max) + "\n[...truncated]";
  }
  if (typeof value === "object" && value !== null) {
    const str = JSON.stringify(value);
    if (str.length > max) return str.slice(0, max) + "...[truncated]";
    return value;
  }
  return value;
}

main();
