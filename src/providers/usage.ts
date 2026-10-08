export interface LlmUsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

const totals: LlmUsageTotals = { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: null };

export function recordLlmUsage(usage: unknown): void {
  if (!usage || typeof usage !== "object") return;
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
  totals.calls += 1;
  if (typeof u.prompt_tokens === "number") totals.promptTokens += u.prompt_tokens;
  if (typeof u.completion_tokens === "number") totals.completionTokens += u.completion_tokens;
  if (typeof u.cost === "number") totals.costUsd = (totals.costUsd ?? 0) + u.cost;
}

export function getLlmUsage(): LlmUsageTotals {
  return { ...totals };
}

export function resetLlmUsageForTests(): void {
  totals.calls = 0;
  totals.promptTokens = 0;
  totals.completionTokens = 0;
  totals.costUsd = null;
}
