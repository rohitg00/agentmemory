import type { MemoryProvider } from "../types.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/**
 * Builds fetch options for outbound HTTPS requests, routing through a corporate
 * HTTP CONNECT proxy when HTTP_PROXY/HTTPS_PROXY env vars are present.
 *
 * Node.js 18+ built-in fetch ignores proxy env vars, so this falls back to
 * node-fetch (v2, CJS) paired with a tunnel-agent CONNECT tunnel. Proxy
 * credentials are extracted from the proxy URL (user:pass@host:port) and
 * forwarded as Proxy-Authorization when present.
 *
 * Both packages are declared as `optionalDependencies` — if they cannot be loaded
 * a warning is emitted and the function falls back to global fetch (proxy bypassed).
 */
function buildFetchOptions(): { fetchFn: typeof fetch; agent?: unknown } {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
                   process.env.HTTP_PROXY  || process.env.http_proxy;
  if (!proxyUrl) return { fetchFn: fetch };
  try {
    const tunnel = require("tunnel-agent") as {
      httpsOverHttp: (opts: { proxy: { host: string; port: number; proxyAuth?: string } }) => unknown;
    };
    const nodeFetch = require("node-fetch") as typeof fetch;
    const parsed = new URL(proxyUrl);
    const proxyAuth =
      parsed.username
        ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`
        : undefined;
    const agent = tunnel.httpsOverHttp({
      proxy: {
        host: parsed.hostname,
        port: parseInt(parsed.port || "3128"),
        ...(proxyAuth ? { proxyAuth } : {}),
      },
    });
    return { fetchFn: nodeFetch, agent };
  } catch {
    process.stderr.write(
      "[agentmemory] azure-openai: proxy env vars detected but tunnel-agent/node-fetch " +
        "could not be loaded — falling back to global fetch (proxy will be bypassed). " +
        "Install optional deps to enable proxy support: npm install tunnel-agent node-fetch\n",
    );
    return { fetchFn: fetch };
  }
}

/**
 * MemoryProvider implementation for Azure-hosted LLMs.
 *
 * Supports two deployment types, auto-detected from the endpoint URL:
 * - **Azure OpenAI** (`{resource}.openai.azure.com`) — uses the OpenAI chat
 *   completions API with an `api-key` header.
 * - **Azure AI Foundry / Anthropic** (`{resource}.services.ai.azure.com/anthropic`) —
 *   uses the Anthropic Messages API with `x-api-key` and `anthropic-version`
 *   headers. Detected when the endpoint path contains `/anthropic`.
 */
export class AzureOpenAIProvider implements MemoryProvider {
  name = "azure-openai";
  private apiKey: string;
  private endpoint: string;
  private deploymentName: string;
  private apiVersion: string;
  private maxTokens: number;

  /**
   * @param apiKey - Azure API key (`api-key` for Azure OpenAI, `x-api-key` for Foundry).
   * @param endpoint - Base endpoint URL. Trailing slashes are stripped. For Foundry,
   *   pass either the base path (`…/anthropic`) or the full path (`…/anthropic/v1/messages`).
   * @param deploymentName - Deployment or model name sent in the request body.
   * @param maxTokens - Maximum tokens for the completion response.
   * @param apiVersion - Azure OpenAI API version string (ignored for Foundry endpoints).
   */
  constructor(
    apiKey: string,
    endpoint: string,
    deploymentName: string,
    maxTokens: number,
    apiVersion = "2024-08-01-preview",
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint.replace(/\/$/, "");
    this.deploymentName = deploymentName;
    this.maxTokens = maxTokens;
    this.apiVersion = apiVersion;
  }

  /** Compresses conversation context using the configured Azure LLM. */
  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  /** Summarizes an observation using the configured Azure LLM. */
  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  /**
   * Returns true when the endpoint targets an Azure AI Foundry Anthropic deployment.
   * Detection is based on the presence of `/anthropic` in the endpoint path.
   */
  private get isFoundry(): boolean {
    return this.endpoint.includes("/anthropic");
  }

  /**
   * Builds the request URL, headers, and body for the underlying API call.
   * Switches between Anthropic Messages API format (Foundry) and OpenAI chat
   * completions format (standard Azure OpenAI) based on `isFoundry`.
   * Foundry URLs are normalized to avoid double-appending `/v1/messages`.
   */
  private buildRequest(systemPrompt: string, userPrompt: string): { url: string; body: unknown; headers: Record<string, string> } {
    if (this.isFoundry) {
      const url = this.endpoint.endsWith("/v1/messages")
        ? this.endpoint
        : `${this.endpoint}/v1/messages`;
      return {
        url,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: this.deploymentName,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        },
      };
    }
    return {
      url: `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`,
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: {
        model: this.deploymentName,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
    };
  }

  /**
   * Extracts the text content from an API response object.
   * Handles both Foundry shape (`content[].text`) and Azure OpenAI shape
   * (`choices[].message.content`).
   */
  private extractContent(data: Record<string, unknown>): string | undefined {
    if (this.isFoundry) {
      const content = data.content as Array<{ type: string; text: string }> | undefined;
      return content?.find((b) => b.type === "text")?.text;
    }
    const choices = data.choices as Array<{ message: { content: string } }> | undefined;
    return choices?.[0]?.message?.content;
  }

  /**
   * Executes a single LLM request and returns the text response.
   * Builds the request via `buildRequest`, routes through a proxy tunnel
   * when env proxy vars are set, and validates the response status and shape.
   */
  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const { url, headers, body } = this.buildRequest(systemPrompt, userPrompt);

    const { fetchFn, agent } = buildFetchOptions();
    const response = await (fetchFn as (url: string, opts: Record<string, unknown>) => Promise<Response>)(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(agent ? { agent } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`azure-openai API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const content = this.extractContent(data);
    if (!content) {
      throw new Error(
        `azure-openai returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return content;
  }
}
