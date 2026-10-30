#!/usr/bin/env node
import {
  captureOutputMax,
  shouldCaptureTool,
  truncateCaptureOutput,
} from "./_capture-filter.js";
import { resolveProject, hookCwd } from "./_project.js";
import { captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const OBSERVE_TIMEOUT_MS = 3000;
const EXIT_CAP_MS = 3500;

async function main() {
  if (isDrainChild()) return runDrainChild();
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

  if (!data || typeof data !== "object") return;
  if (isSdkChildContext(data)) return;

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";
  const toolName = data.tool_name ?? data.toolName;
  if (!shouldCaptureTool(toolName)) return;

  const toolInput = data.tool_input ?? data.toolArgs;

  const { imageData, cleanOutput } = extractImageData(toolOutput(data));
  const cwd = hookCwd(data) || process.cwd();
  const outputMax = captureOutputMax();

  const toolOutputText = truncateCaptureOutput(cleanOutput, outputMax);
  const body = withEventId(
    {
      hookType: "post_tool_use",
      sessionId,
      project: resolveProject(cwd),
      cwd,
      timestamp: new Date().toISOString(),
      data: {
        tool_name: toolName,
        tool_input: toolInput,
        tool_output: toolOutputText,
        ...(imageData ? { image_data: imageData } : {}),
      },
    },
    data,
    { tool_name: toolName, tool_input: toolInput, tool_output: toolOutputText, image_data: imageData },
  );
  void captureObservation(body, OBSERVE_TIMEOUT_MS);
  setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
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

main().catch(() => process.exit(0));
