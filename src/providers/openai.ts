import OpenAI from "openai";
import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";
import { normalizeBaseUrl } from "./_openai-shared.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export class OpenAIProvider implements MemoryProvider {
  name = "openai";
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private reasoningEffort?: "none" | "low" | "medium" | "high";
  private timeoutMs: number;

  constructor(apiKey: string, model: string, maxTokens: number, baseURL?: string) {
    this.model = model;
    this.maxTokens = maxTokens;
    this.timeoutMs = resolveTimeout();

    const reasoningEffort = getEnvVar("OPENAI_REASONING_EFFORT");
    if (reasoningEffort) {
      if (!isReasoningEffort(reasoningEffort)) {
        throw new Error(`Invalid OPENAI_REASONING_EFFORT: ${reasoningEffort}`);
      }
      this.reasoningEffort = reasoningEffort;
    }

    const url = new URL(normalizeBaseUrl(baseURL || getEnvVar("OPENAI_BASE_URL")));
    if (url.pathname === "/") url.pathname = "/v1";
    this.client = new OpenAI({
      apiKey,
      baseURL: url.toString().replace(/\/+$/, ""),
      timeout: this.timeoutMs,
    });
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          instructions: systemPrompt,
          input: userPrompt,
          max_output_tokens: this.maxTokens,
          store: false,
          ...(this.reasoningEffort && { reasoning: { effort: this.reasoningEffort } }),
        },
        { signal: controller.signal },
      );

      if (response.status !== "completed") {
        throw new Error(
          `OpenAI response ${response.status}: ${response.error?.message ?? response.incomplete_details?.reason ?? "no completed output"}`,
        );
      }
      if (!response.output_text.trim()) {
        const refusal = response.output
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content)
          .find((content) => content.type === "refusal");
        throw new Error(
          `OpenAI returned no output text${refusal ? `: ${refusal.refusal}` : ""}`,
        );
      }
      return response.output_text;
    } catch (err) {
      if (controller.signal.aborted || err instanceof OpenAI.APIConnectionTimeoutError) {
        throw new Error(
          `OpenAI API request timed out after ${this.timeoutMs}ms — set OPENAI_TIMEOUT_MS (or AGENTMEMORY_LLM_TIMEOUT_MS) to raise the bound or check the provider status.`,
          { cause: err },
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isReasoningEffort(value: string): value is "none" | "low" | "medium" | "high" {
  return value === "none" || value === "low" || value === "medium" || value === "high";
}

function resolveTimeout(): number {
  const openai = parsePositiveInt(getEnvVar("OPENAI_TIMEOUT_MS"));
  if (openai !== undefined) return openai;

  const globalMs = parsePositiveInt(getEnvVar("AGENTMEMORY_LLM_TIMEOUT_MS"));
  if (globalMs !== undefined) return globalMs;

  return DEFAULT_TIMEOUT_MS;
}

function parsePositiveInt(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
