import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const BATCH_LIMIT = 100;
const MODEL = "models/gemini-embedding-001";
const API_BASE = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents`;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly dimensions = 768;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("GEMINI_API_KEY") || "";
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is required");
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
      const chunk = texts.slice(i, i + BATCH_LIMIT);
      const response = await fetch(`${API_BASE}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map((t) => ({
            model: MODEL,
            content: { parts: [{ text: t }] },
            outputDimensionality: this.dimensions,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini embedding failed (${response.status}): ${err}`);
      }

      const data = (await response.json()) as {
        embeddings: Array<{ values: number[] }>;
      };

      for (const emb of data.embeddings) {
        results.push(l2Normalize(new Float32Array(emb.values)));
      }
    }

    return results;
  }
}

let zeroNormWarned = false;

function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sum);
  if (norm === 0) {
    if (!zeroNormWarned) {
      zeroNormWarned = true;
      process.stderr.write(
        `[agentmemory] warn: gemini-embedding-001 returned a zero-norm ` +
          `embedding (length=${vec.length}); leaving it un-normalized. ` +
          `Subsequent zero-norm vectors will not be reported.\n`,
      );
    }
    return vec;
  }
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm;
  return vec;
}
