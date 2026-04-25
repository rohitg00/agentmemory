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
  imageEmbeddingProvider = new ClipEmbeddingProvider();
  return imageEmbeddingProvider;
}

export function createEmbeddingProvider(): EmbeddingProvider | null {
  const detected = detectEmbeddingProvider();
  if (!detected) return null;

  switch (detected) {
    case "gemini":
      return new GeminiEmbeddingProvider(getEnvVar("GEMINI_API_KEY")!);
    case "openai":
      return new OpenAIEmbeddingProvider(
        getEnvVar("OPENAI_API_KEY") || null,
        getEnvVar("OPENAI_EMBEDDING_BASE_URL"),
        getEnvVar("OPENAI_EMBEDDING_MODEL"),
      );
    case "ollama":
      return new OpenAIEmbeddingProvider(
        null,
        getEnvVar("OLLAMA_EMBEDDING_BASE_URL") || "http://localhost:11434",
        getEnvVar("OLLAMA_EMBEDDING_MODEL") || "nomic-embed-text",
      );
    case "lmstudio":
      {
        const base = getEnvVar("LMSTUDIO_EMBEDDING_BASE_URL") || "http://localhost:1234";
        const model = getEnvVar("LMSTUDIO_EMBEDDING_MODEL");
        if (!model) throw new Error("LMSTUDIO_EMBEDDING_MODEL is required for the lmstudio embedding provider");
        return new OpenAIEmbeddingProvider(null, base, model);
      }
    case "vllm":
      {
        const base = getEnvVar("VLLM_EMBEDDING_BASE_URL");
        const model = getEnvVar("VLLM_EMBEDDING_MODEL");
        if (!base) throw new Error("VLLM_EMBEDDING_BASE_URL is required for the vllm embedding provider");
        if (!model) throw new Error("VLLM_EMBEDDING_MODEL is required for the vllm embedding provider");
        return new OpenAIEmbeddingProvider(null, base, model);
      }
    case "voyage":
      return new VoyageEmbeddingProvider(getEnvVar("VOYAGE_API_KEY")!);
    case "cohere":
      return new CohereEmbeddingProvider(getEnvVar("COHERE_API_KEY")!);
    case "openrouter":
      return new OpenRouterEmbeddingProvider(getEnvVar("OPENROUTER_API_KEY")!);
    case "local":
      return new LocalEmbeddingProvider();
    default:
      return null;
  }
}
