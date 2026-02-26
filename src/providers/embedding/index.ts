import type { EmbeddingProvider } from "../../types.js";
import { detectEmbeddingProvider, getEnvVar } from "../../config.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import { OpenAIEmbeddingProvider } from "./openai.js";
import { VoyageEmbeddingProvider } from "./voyage.js";
import { CohereEmbeddingProvider } from "./cohere.js";
import { OpenRouterEmbeddingProvider } from "./openrouter.js";
import { LocalEmbeddingProvider } from "./local.js";

export {
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  VoyageEmbeddingProvider,
  CohereEmbeddingProvider,
  OpenRouterEmbeddingProvider,
  LocalEmbeddingProvider,
};

export function createEmbeddingProvider(): EmbeddingProvider | null {
  const detected = detectEmbeddingProvider();
  if (!detected) return null;

  switch (detected) {
    case "gemini":
      return new GeminiEmbeddingProvider(getEnvVar("GEMINI_API_KEY")!);
    case "openai":
      return new OpenAIEmbeddingProvider(getEnvVar("OPENAI_API_KEY")!);
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
