export function pickRawToolOutput(data: Record<string, unknown>): unknown {
  const toolResult = data.tool_result;
  if (
    toolResult &&
    typeof toolResult === "object" &&
    "text_result_for_llm" in toolResult
  ) {
    return (toolResult as { text_result_for_llm?: unknown }).text_result_for_llm;
  }
  return data.tool_response ?? data.tool_output;
}
