import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";
import {
  CLOUDFLARE_DEFAULT_EMBEDDING_MODEL,
  buildHeaders,
  parsePositiveInt,
  resolveEndpoint,
  resolveGatewayId,
} from "../_cloudflare-shared.js";

/**
 * Known Workers AI embedding model dimensions. Extend as new models ship.
 *
 * A model absent from this table reports DEFAULT_DIMENSIONS rather than
 * throwing; if that guess is wrong, withDimensionGuard rejects the first embed
 * with the real size in the message. Set CLOUDFLARE_EMBEDDING_DIMENSIONS to
 * skip that round trip.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "@cf/baai/bge-small-en-v1.5": 384,
  "@cf/baai/bge-base-en-v1.5": 768,
  "@cf/baai/bge-large-en-v1.5": 1024,
  "@cf/baai/bge-m3": 1024,
  "@cf/qwen/qwen3-embedding-0.6b": 1024,
  "@cf/google/embeddinggemma-300m": 768,
};

const DEFAULT_DIMENSIONS = MODEL_DIMENSIONS[CLOUDFLARE_DEFAULT_EMBEDDING_MODEL] ?? 768;

function resolveDimensions(model: string, override: string | undefined): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = parsePositiveInt(override);
    if (parsed === undefined) {
      throw new Error(
        `CLOUDFLARE_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  return MODEL_DIMENSIONS[model] ?? DEFAULT_DIMENSIONS;
}

/**
 * Cloudflare Workers AI embedding provider.
 *
 * Talks to the OpenAI-compatible `/ai/v1/embeddings` endpoint, so the request
 * and response shapes match `OpenAIEmbeddingProvider`.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN            — Workers AI API token
 *   CLOUDFLARE_ACCOUNT_ID           — used to build the endpoint URL; not
 *                                     needed when CLOUDFLARE_EMBEDDING_BASE_URL
 *                                     is set
 *
 * Optional:
 *   CLOUDFLARE_EMBEDDING_MODEL      — model name (default:
 *                                     CLOUDFLARE_DEFAULT_EMBEDDING_MODEL)
 *   CLOUDFLARE_EMBEDDING_DIMENSIONS — override reported dimensions; set it for
 *                                     models absent from the MODEL_DIMENSIONS
 *                                     table above, which otherwise report the
 *                                     default size
 *   CLOUDFLARE_EMBEDDING_BASE_URL   — full embedding endpoint override
 *   CLOUDFLARE_AI_GATEWAY_ID        — route through a named AI Gateway; shared
 *                                     with the chat provider, selected by the
 *                                     cf-aig-gateway-id header
 */
export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  readonly name = "cloudflare";
  readonly dimensions: number;
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private gatewayId: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("CLOUDFLARE_API_TOKEN") || "";
    if (!this.apiKey) {
      throw new Error("CLOUDFLARE_API_TOKEN is required");
    }
    this.model =
      getEnvVar("CLOUDFLARE_EMBEDDING_MODEL") || CLOUDFLARE_DEFAULT_EMBEDDING_MODEL;
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("CLOUDFLARE_EMBEDDING_DIMENSIONS"),
    );
    this.baseUrl = resolveEndpoint(
      "embeddings",
      "CLOUDFLARE_EMBEDDING_BASE_URL",
      "embedding",
    );
    this.gatewayId = resolveGatewayId();
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetchWithTimeout(this.baseUrl, {
      method: "POST",
      headers: buildHeaders(this.apiKey, this.gatewayId),
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cloudflare embedding failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
