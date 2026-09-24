import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const DEFAULT_MODEL = "cohere.embed-v4:0";

/**
 * Known embedding dimensions by Bedrock model ID. Override in any case via
 * AWS_BEDROCK_EMBEDDING_DIMENSIONS. Models not listed here REQUIRE that override
 * — we refuse to guess, because a wrong dimension silently corrupts the vector
 * index (see withDimensionGuard).
 *
 * Cohere v4 + Titan v2 are Matryoshka models (selectable output dims); the
 * default of 1024 is sent in the request body, not just reported.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "cohere.embed-v4:0": 1024,
  "cohere.embed-english-v3": 1024,
  "cohere.embed-multilingual-v3": 1024,
  "amazon.titan-embed-text-v2:0": 1024,
  "amazon.titan-embed-text-v1": 1536,
};

// Titan has no native batch endpoint — embedBatch fans out one InvokeModel call
// per input. Bound the in-flight count to stay within Bedrock rate limits while
// keeping throughput reasonable (mirrors summarize.ts's chunk concurrency).
const TITAN_BATCH_CONCURRENCY = 6;

// Cohere caps texts at 96 per InvokeModel call.
const COHERE_MAX_BATCH = 96;

/**
 * Strip a leading cross-region inference-profile geo prefix (`us.`, `eu.`,
 * `apac.`, `global.`) so model-family detection and the known-dimensions lookup
 * work against the underlying model ID. Bedrock requires the prefixed profile ID
 * for models that don't support on-demand throughput (e.g. cohere.embed-v4:0 in
 * us-east-2 → us.cohere.embed-v4:0), but the family/dims are the same model.
 */
function stripInferenceProfilePrefix(model: string): string {
  return model.replace(/^(?:us|eu|apac|global)\./, "");
}

function resolveDimensions(model: string, override: string | undefined): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = parseInt(override, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `AWS_BEDROCK_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  const known = MODEL_DIMENSIONS[stripInferenceProfilePrefix(model)];
  if (known === undefined) {
    throw new Error(
      `Unknown Bedrock embedding model "${model}" — set AWS_BEDROCK_EMBEDDING_DIMENSIONS ` +
        `to its output dimension (a wrong value silently corrupts the vector index).`,
    );
  }
  return known;
}

type ModelFamily = "cohere" | "titan";

function familyOf(model: string): ModelFamily {
  const base = stripInferenceProfilePrefix(model);
  if (base.startsWith("cohere.")) return "cohere";
  if (base.startsWith("amazon.titan-embed")) return "titan";
  throw new Error(
    `Unsupported Bedrock embedding model "${model}" — expected a "cohere." or ` +
      `"amazon.titan-embed" model ID (optionally with a us./eu./apac./global. ` +
      `inference-profile prefix).`,
  );
}

/**
 * AWS Bedrock embedding provider (Cohere / Amazon Titan embeddings on Bedrock).
 *
 * Uses the AWS Bedrock Runtime InvokeModel API (not the Anthropic bedrock-sdk,
 * which has no embeddings). Credentials resolve via the AWS default provider
 * chain — env / IAM role / SSO cache (select with AWS_PROFILE) — exactly like
 * the Bedrock LLM provider, so no key env var is needed. Static keys are honored
 * only when both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.
 *
 * Required env:
 *   AWS_REGION                      — Bedrock region (shared with the LLM provider).
 *
 * Optional:
 *   AWS_BEDROCK_EMBEDDING_MODEL      — model ID (default: cohere.embed-v4:0).
 *   AWS_BEDROCK_EMBEDDING_DIMENSIONS — output dims (default 1024; required for
 *                                      models not in the known-dims table).
 *   AWS_PROFILE / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
 *                                    — same credential knobs as the LLM provider.
 */
export class BedrockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "bedrock";
  readonly dimensions: number;
  private client: BedrockRuntimeClient;
  private model: string;
  private family: ModelFamily;

  constructor() {
    const region = getEnvVar("AWS_REGION");
    if (!region) {
      throw new Error("AWS_REGION is required for the bedrock embedding provider");
    }
    this.model = getEnvVar("AWS_BEDROCK_EMBEDDING_MODEL") || DEFAULT_MODEL;
    this.family = familyOf(this.model);
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("AWS_BEDROCK_EMBEDDING_DIMENSIONS"),
    );

    const accessKeyId = getEnvVar("AWS_ACCESS_KEY_ID");
    const secretAccessKey = getEnvVar("AWS_SECRET_ACCESS_KEY");
    const sessionToken = getEnvVar("AWS_SESSION_TOKEN");
    // Pass explicit creds only when both halves are present; otherwise omit so
    // the AWS provider chain (env / IAM role / SSO cache) resolves them.
    this.client =
      accessKeyId && secretAccessKey
        ? new BedrockRuntimeClient({
            region,
            credentials: {
              accessKeyId,
              secretAccessKey,
              ...(sessionToken ? { sessionToken } : {}),
            },
          })
        : new BedrockRuntimeClient({ region });
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return this.family === "cohere"
      ? this.embedCohere(texts)
      : this.embedTitan(texts);
  }

  // Cohere: native batch, up to 96 texts per call. Request a single float
  // embedding type, which yields the keyed-by-type response shape
  // { embeddings: { float: [[...]] } }.
  private async embedCohere(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += COHERE_MAX_BATCH) {
      const slice = texts.slice(i, i + COHERE_MAX_BATCH);
      const body: Record<string, unknown> = {
        input_type: "search_document",
        texts: slice,
        embedding_types: ["float"],
      };
      // Only Cohere v4 accepts output_dimension; v3 is fixed at 1024.
      if (this.model.includes("embed-v4")) body.output_dimension = this.dimensions;

      const json = await this.invoke(body);
      // v4 (embedding_types specified) → { embeddings: { float: [[...]] } }.
      // v3 → { embeddings: [[...]] }.
      const embeddings =
        (json.embeddings as { float?: number[][] } | number[][] | undefined) ?? [];
      const rows = Array.isArray(embeddings)
        ? (embeddings as number[][])
        : (embeddings.float ?? []);
      // Fail fast on a cardinality mismatch: fewer rows than inputs would
      // silently misalign texts to vectors downstream (withDimensionGuard only
      // checks each vector's length, not the batch count).
      if (rows.length !== slice.length) {
        throw new Error(
          `Bedrock embedding returned ${rows.length} vectors for ${slice.length} inputs ` +
            `(model "${this.model}") — refusing to misalign texts to vectors.`,
        );
      }
      for (const row of rows) out.push(new Float32Array(row));
    }
    return out;
  }

  // Titan: one input per call, no batch endpoint — fan out with bounded concurrency.
  private async embedTitan(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = new Array(texts.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < texts.length) {
        const idx = next++;
        const json = await this.invoke({
          inputText: texts[idx],
          dimensions: this.dimensions,
          normalize: true,
        });
        results[idx] = new Float32Array((json.embedding as number[]) ?? []);
      }
    };
    const workers = Array.from(
      { length: Math.min(TITAN_BATCH_CONCURRENCY, texts.length) },
      () => worker(),
    );
    await Promise.all(workers);
    return results;
  }

  private async invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.model,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(body),
        }),
      );
      const text = new TextDecoder().decode(response.body);
      return JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      throw this.explainError(err);
    }
  }

  /**
   * Turn an opaque Bedrock model-access / validation 4xx into an actionable
   * error, mirroring the LLM provider's guidance.
   */
  private explainError(err: unknown): unknown {
    const status =
      (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
    const message = err instanceof Error ? err.message : String(err);
    if (
      status === 403 ||
      status === 400 ||
      /access|not authorized|inference profile|on-demand|ValidationException|AccessDenied/i.test(
        message,
      )
    ) {
      return new Error(
        `Bedrock embedding model "${this.model}" could not be invoked (${message}). ` +
          `Check that: (1) model access is enabled for this account in the Bedrock console, ` +
          `(2) AWS_REGION offers this embedding model, and ` +
          `(3) AWS_BEDROCK_EMBEDDING_MODEL is a valid Bedrock embedding model ID.`,
      );
    }
    return err;
  }
}
