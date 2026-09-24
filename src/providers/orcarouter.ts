// OrcaRouter provider.
//
// OrcaRouter is an OpenAI-compatible gateway: the relay lives at
// `https://api.orcarouter.ai/v1` and speaks the standard chat-completions wire
// shape with `Authorization: Bearer sk-orca-…`. That makes this a sibling of
// the OpenRouter provider, not a variant of it — it carries its own name, its
// own env vars, and its own base URL, and it is selected as a first-class
// provider rather than through a generic custom-endpoint escape hatch.
//
// The credential is read through the shared seam (see orcarouter/credentials),
// so a key pasted by hand and a key minted by the PKCE login are handled
// identically here.

import type { MemoryProvider } from "../types.js";
import { fetchWithTimeout } from "./_fetch.js";
import { getEnvVar } from "../config.js";
import {
  type OrcaRouterCredential,
  markNeedsReauth,
  resolveCredential,
} from "../orcarouter/credentials.js";
import { type OrcaRouterOrigins, chatCompletionsUrl, resolveOrigins } from "../orcarouter/origins.js";

/** Raised when the relay rejects the credential outright. */
export class OrcaRouterAuthRejection extends Error {
  readonly credentialGeneration: number;
  constructor(message: string, generation: number) {
    super(message);
    this.name = "OrcaRouterAuthRejection";
    this.credentialGeneration = generation;
  }
}

export class OrcaRouterProvider implements MemoryProvider {
  name = "orcarouter";
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private endpoint: string;
  private credentialGeneration: number;

  constructor(
    apiKey: string,
    model: string,
    maxTokens: number,
    endpoint: string,
    credentialGeneration = 0,
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.endpoint = endpoint;
    this.credentialGeneration = credentialGeneration;
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
  }

  /**
   * Multimodal understanding. The image travels as an OpenAI-style
   * `image_url` data URI, which is the shape the gateway accepts.
   */
  async describeImage(
    imageData: string,
    mimeType: string,
    prompt: string,
  ): Promise<string> {
    return this.call({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageData}` },
            },
          ],
        },
      ],
    });
  }

  private async call(body: {
    messages: unknown[];
  }): Promise<string> {
    const response = await fetchWithTimeout(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: body.messages,
      }),
    });

    if (response.status === 401) {
      // A revoked or invalid key is terminal, not transient. Mark the exact
      // generation that made this request so a late failure cannot poison a
      // credential the user has since replaced. There is no refresh grant to
      // run — the PKCE flow returns a durable key, not a refresh token.
      markNeedsReauth({
        generation: this.credentialGeneration,
        reason:
          "OrcaRouter rejected this API key. It may have been revoked from the authorized-apps console.",
      });
      throw new OrcaRouterAuthRejection(
        "OrcaRouter rejected the API key (401). Reconnect OrcaRouter from Settings to issue a new key; " +
          "a revoked key cannot be refreshed.",
        this.credentialGeneration,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `${this.name} API error (${response.status}): ${text.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices as
      | Array<{
          message?: {
            content?: string;
            reasoning?: string;
            reasoning_content?: string;
          };
        }>
      | undefined;
    const message = choices?.[0]?.message;
    const content = message?.content;
    if (content) return content;
    // Thinking models routed through the gateway can return reasoning with an
    // empty `content` (DeepSeek V4, Qwen3, GLM and Kimi use `reasoning_content`;
    // some compatibles use `reasoning`). Same fallback the OpenAI provider
    // already applies, so an OrcaRouter-selected reasoning model is usable
    // rather than looking like a malformed response.
    const reasoning = message?.reasoning ?? message?.reasoning_content;
    if (reasoning) return reasoning;
    throw new Error(
      `${this.name} returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
}

/**
 * Build the provider from the shared credential seam. Either adapter may have
 * supplied the key; this function cannot tell them apart and does not need to.
 */
export function createOrcaRouterProvider(
  model: string,
  maxTokens: number,
  origins: OrcaRouterOrigins = resolveOrigins(),
): OrcaRouterProvider {
  const credential: OrcaRouterCredential | null = resolveCredential();
  if (!credential || !credential.apiKey) {
    throw new Error(
      "ORCAROUTER_API_KEY is required for the orcarouter provider. " +
        "Set it in ~/.agentmemory/.env, or connect an OrcaRouter account from the viewer Settings tab " +
        "(or run `agentmemory connect orcarouter`).",
    );
  }
  if (credential.status === "needsReauth") {
    throw new OrcaRouterAuthRejection(
      credential.needsReauthReason ||
        "The stored OrcaRouter credential is no longer valid. Reconnect OrcaRouter to continue.",
      credential.generation,
    );
  }
  return new OrcaRouterProvider(
    credential.apiKey,
    model,
    maxTokens,
    chatCompletionsUrl(origins),
    credential.generation,
  );
}

/** Env-driven default model, mirroring the repo's `<PROVIDER>_MODEL` idiom. */
export function orcaRouterModel(): string {
  return getEnvVar("ORCAROUTER_MODEL") || "orcarouter/auto";
}
