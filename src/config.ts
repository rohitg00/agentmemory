import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  AgentMemoryConfig,
  ProviderConfig,
  EmbeddingConfig,
  FallbackConfig,
} from "./types.js";

const DATA_DIR = join(homedir(), ".agentmemory");
const ENV_FILE = join(DATA_DIR, ".env");

function loadEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const content = readFileSync(ENV_FILE, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function detectProvider(env: Record<string, string>): ProviderConfig {
  const maxTokens = parseInt(env["MAX_TOKENS"] || "4096", 10);

  if (env["ANTHROPIC_API_KEY"]) {
    return {
      provider: "anthropic",
      model: env["ANTHROPIC_MODEL"] || "claude-sonnet-4-20250514",
      maxTokens,
    };
  }
  if (env["GEMINI_API_KEY"]) {
    return {
      provider: "gemini",
      model: env["GEMINI_MODEL"] || "gemini-2.0-flash",
      maxTokens,
    };
  }
  if (env["OPENROUTER_API_KEY"]) {
    return {
      provider: "openrouter",
      model: env["OPENROUTER_MODEL"] || "anthropic/claude-sonnet-4-20250514",
      maxTokens,
    };
  }
  return {
    provider: "agent-sdk",
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
  };
}

export function loadConfig(): AgentMemoryConfig {
  const env = getMergedEnv();

  const provider = detectProvider(env);

  return {
    engineUrl: env["III_ENGINE_URL"] || "ws://localhost:49134",
    restPort: parseInt(env["III_REST_PORT"] || "3111", 10),
    streamsPort: parseInt(env["III_STREAMS_PORT"] || "3112", 10),
    provider,
    tokenBudget: parseInt(env["TOKEN_BUDGET"] || "2000", 10),
    maxObservationsPerSession: parseInt(
      env["MAX_OBS_PER_SESSION"] || "500",
      10,
    ),
    compressionModel: provider.model,
    dataDir: DATA_DIR,
  };
}

function getMergedEnv(
  overrides?: Record<string, string>,
): Record<string, string> {
  const fileEnv = loadEnvFile();
  return { ...fileEnv, ...process.env, ...overrides } as Record<string, string>;
}

export function getEnvVar(key: string): string | undefined {
  return getMergedEnv()[key];
}

export function loadEmbeddingConfig(): EmbeddingConfig {
  const env = getMergedEnv();
  return {
    provider: env["EMBEDDING_PROVIDER"] || undefined,
    bm25Weight: parseFloat(env["BM25_WEIGHT"] || "0.4"),
    vectorWeight: parseFloat(env["VECTOR_WEIGHT"] || "0.6"),
  };
}

export function detectEmbeddingProvider(
  env?: Record<string, string>,
): string | null {
  const merged = getMergedEnv(env);
  const forced = merged["EMBEDDING_PROVIDER"];
  if (forced) return forced;

  if (merged["GEMINI_API_KEY"]) return "gemini";
  if (merged["OPENAI_API_KEY"]) return "openai";
  if (merged["VOYAGE_API_KEY"]) return "voyage";
  if (merged["COHERE_API_KEY"]) return "cohere";
  if (merged["OPENROUTER_API_KEY"]) return "openrouter";
  return null;
}

export function loadFallbackConfig(): FallbackConfig {
  const env = getMergedEnv();
  const raw = env["FALLBACK_PROVIDERS"] || "";
  const providers = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean) as FallbackConfig["providers"];
  return { providers };
}
