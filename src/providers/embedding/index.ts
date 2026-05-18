import type { EmbeddingProvider } from "../../types.js";
import { detectEmbeddingProvider, getEnvVar } from "../../config.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import { OpenAIEmbeddingProvider } from "./openai.js";
import { VoyageEmbeddingProvider } from "./voyage.js";
import { CohereEmbeddingProvider } from "./cohere.js";
import { OpenRouterEmbeddingProvider } from "./openrouter.js";
import { LocalEmbeddingProvider } from "./local.js";
import { ClipEmbeddingProvider } from "./clip.js";

export {
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  VoyageEmbeddingProvider,
  CohereEmbeddingProvider,
  OpenRouterEmbeddingProvider,
  LocalEmbeddingProvider,
  ClipEmbeddingProvider,
};

let imageEmbeddingProvider: EmbeddingProvider | null = null;

export function createImageEmbeddingProvider(): EmbeddingProvider | null {
  if (process.env["AGENTMEMORY_IMAGE_EMBEDDINGS"] !== "true") return null;
  if (imageEmbeddingProvider) return imageEmbeddingProvider;
  imageEmbeddingProvider = withDimensionGuard(new ClipEmbeddingProvider());
  return imageEmbeddingProvider;
}

export function createEmbeddingProvider(): EmbeddingProvider | null {
  const detected = detectEmbeddingProvider();
  if (!detected) return null;

  switch (detected) {
    case "gemini":
      return withDimensionGuard(new GeminiEmbeddingProvider(getEnvVar("GEMINI_API_KEY")!));
    case "openai":
      return withDimensionGuard(new OpenAIEmbeddingProvider(getEnvVar("OPENAI_API_KEY")!));
    case "voyage":
      return withDimensionGuard(new VoyageEmbeddingProvider(getEnvVar("VOYAGE_API_KEY")!));
    case "cohere":
      return withDimensionGuard(new CohereEmbeddingProvider(getEnvVar("COHERE_API_KEY")!));
    case "openrouter":
      return withDimensionGuard(new OpenRouterEmbeddingProvider(getEnvVar("OPENROUTER_API_KEY")!));
    case "local":
      return withDimensionGuard(new LocalEmbeddingProvider());
    default:
      return null;
  }
}

// Wrong-dimension vectors corrupt the index silently: vector-index.ts
// returns 0 from cosineSimilarity on length mismatch instead of throwing,
// so a bad vector is stored, never matches anything, and the memory
// becomes invisible without an error. Catch it at the boundary.
export function withDimensionGuard(provider: EmbeddingProvider): EmbeddingProvider {
  const expected = provider.dimensions;
  const check = (v: Float32Array, where: string): Float32Array => {
    if (v.length !== expected) {
      throw new Error(
        `Embedding dimension mismatch in ${provider.name}.${where}: expected ${expected}, got ${v.length}`,
      );
    }
    return v;
  };
  // Preserve the provider's prototype chain so `instanceof` checks
  // against concrete classes (e.g. GeminiEmbeddingProvider) keep working.
  const wrapped = Object.create(provider) as EmbeddingProvider;
  wrapped.embed = async (t) => check(await provider.embed(t), "embed");
  wrapped.embedBatch = async (ts) => {
    const out = await provider.embedBatch(ts);
    out.forEach((v, i) => check(v, `embedBatch[${i}]`));
    return out;
  };
  if (provider.embedImage) {
    wrapped.embedImage = async (s: string) =>
      check(await provider.embedImage!(s), "embedImage");
  }
  return wrapped;
}
