import type { EmbeddingProvider } from "../../types.js";
import { detectEmbeddingProvider, getEnvVar } from "../../config.js";

function requireEnvVar(key: string): string {
  const value = getEnvVar(key);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. Set it in ~/.agentmemory/.env or as an environment variable.`,
    );
  }
  return value;
}

import { GeminiEmbeddingProvider } from "./gemini.js";
import { OpenAIEmbeddingProvider } from "./openai.js";
import { OpenRouterEmbeddingProvider } from "./openrouter.js";
import { VoyageEmbeddingProvider } from "./voyage.js";
import { CohereEmbeddingProvider } from "./cohere.js";
import { LocalEmbeddingProvider } from "./local.js";
import { ClipEmbeddingProvider } from "./clip.js";

export {
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  VoyageEmbeddingProvider,
  CohereEmbeddingProvider,
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
        getEnvVar("OPENAI_API_KEY"),
        getEnvVar("OPENAI_EMBEDDING_BASE_URL"),
        getEnvVar("OPENAI_EMBEDDING_MODEL"),
      );
    case "ollama":
      return new OpenAIEmbeddingProvider(
        "no-key-required",
        getEnvVar("OLLAMA_EMBEDDING_BASE_URL") || "http://localhost:11434/v1/embeddings",
        getEnvVar("OLLAMA_EMBEDDING_MODEL") || "llama3",
      );
    case "voyage":
      return new VoyageEmbeddingProvider(getEnvVar("VOYAGE_API_KEY")!);
    case "cohere":
      return new CohereEmbeddingProvider(getEnvVar("COHERE_API_KEY")!);
    case "openrouter":
      return new OpenRouterEmbeddingProvider(
        requireEnvVar("OPENROUTER_API_KEY"),
        getEnvVar("OPENROUTER_EMBEDDING_MODEL"),
      );
    case "local":
      return new LocalEmbeddingProvider();
    default:
      return null;
  }
}
