import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";
import { resolveDimensions } from "./_dimensions.js";
import { resolveCredential } from "../../orcarouter/credentials.js";
import { embeddingsUrl, resolveOrigins } from "../../orcarouter/origins.js";

const DEFAULT_MODEL = "openai/text-embedding-3-small";

/**
 * OrcaRouter embedding provider.
 *
 * Same OpenAI-compatible `/embeddings` shape as the OpenRouter sibling, but on
 * OrcaRouter's own relay and resolving its credential through the shared
 * OrcaRouter seam, so a PKCE-issued key works here exactly like a pasted one.
 */
export class OrcaRouterEmbeddingProvider implements EmbeddingProvider {
  readonly name = "orcarouter";
  readonly dimensions: number;
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(apiKey?: string) {
    const resolved = apiKey || resolveCredential()?.apiKey || "";
    if (!resolved) {
      throw new Error(
        "ORCAROUTER_API_KEY is required for the orcarouter embedding provider",
      );
    }
    this.apiKey = resolved;
    this.model = getEnvVar("ORCAROUTER_EMBEDDING_MODEL") || DEFAULT_MODEL;
    this.endpoint = embeddingsUrl(resolveOrigins());
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("ORCAROUTER_EMBEDDING_DIMENSIONS"),
      "ORCAROUTER_EMBEDDING_DIMENSIONS",
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetchWithTimeout(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `OrcaRouter embedding failed (${response.status}): ${err.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
