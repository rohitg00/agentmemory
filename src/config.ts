import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  AgentMemoryConfig,
  ProviderConfig,
  EmbeddingConfig,
  FallbackConfig,
  ClaudeBridgeConfig,
  TeamConfig,
} from "./types.js";

function safeParseInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

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
    restPort: parseInt(env["III_REST_PORT"] || "3111", 10) || 3111,
    streamsPort: parseInt(env["III_STREAMS_PORT"] || "3112", 10) || 3112,
    provider,
    tokenBudget: safeParseInt(env["TOKEN_BUDGET"], 2000),
    maxObservationsPerSession: safeParseInt(env["MAX_OBS_PER_SESSION"], 500),
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
  let bm25Weight = parseFloat(env["BM25_WEIGHT"] || "0.4");
  let vectorWeight = parseFloat(env["VECTOR_WEIGHT"] || "0.6");
  bm25Weight =
    isNaN(bm25Weight) || bm25Weight < 0 ? 0.4 : Math.min(bm25Weight, 1);
  vectorWeight =
    isNaN(vectorWeight) || vectorWeight < 0 ? 0.6 : Math.min(vectorWeight, 1);
  return {
    provider: env["EMBEDDING_PROVIDER"] || undefined,
    bm25Weight,
    vectorWeight,
  };
}

export function detectEmbeddingProvider(
  env?: Record<string, string>,
): string | null {
  const source = env ?? getMergedEnv();
  const forced = source["EMBEDDING_PROVIDER"];
  if (forced) return forced;

  if (source["GEMINI_API_KEY"]) return "gemini";
  if (source["OPENAI_API_KEY"]) return "openai";
  if (source["VOYAGE_API_KEY"]) return "voyage";
  if (source["COHERE_API_KEY"]) return "cohere";
  if (source["OPENROUTER_API_KEY"]) return "openrouter";
  return null;
}

export function loadClaudeBridgeConfig(): ClaudeBridgeConfig {
  const env = getMergedEnv();
  const enabled = env["CLAUDE_MEMORY_BRIDGE"] === "true";
  const projectPath = env["CLAUDE_PROJECT_PATH"] || "";
  const lineBudget = safeParseInt(env["CLAUDE_MEMORY_LINE_BUDGET"], 200);
  let memoryFilePath = "";
  if (enabled && projectPath) {
    const safePath = projectPath.replace(/[/\\]/g, "-").replace(/^-/, "");
    memoryFilePath = join(
      homedir(),
      ".claude",
      "projects",
      safePath,
      "memory",
      "MEMORY.md",
    );
  }
  return { enabled, projectPath, memoryFilePath, lineBudget };
}

export function loadTeamConfig(): TeamConfig | null {
  const env = getMergedEnv();
  const teamId = env["TEAM_ID"];
  const userId = env["USER_ID"];
  if (!teamId || !userId) return null;
  const mode = env["TEAM_MODE"] === "shared" ? "shared" : "private";
  return { teamId, userId, mode };
}

export function loadSnapshotConfig(): {
  enabled: boolean;
  interval: number;
  dir: string;
} {
  const env = getMergedEnv();
  return {
    enabled: env["SNAPSHOT_ENABLED"] === "true",
    interval: safeParseInt(env["SNAPSHOT_INTERVAL"], 3600),
    dir: env["SNAPSHOT_DIR"] || join(homedir(), ".agentmemory", "snapshots"),
  };
}

export function isGraphExtractionEnabled(): boolean {
  return getMergedEnv()["GRAPH_EXTRACTION_ENABLED"] === "true";
}

export function getGraphBatchSize(): number {
  return safeParseInt(getMergedEnv()["GRAPH_EXTRACTION_BATCH_SIZE"], 10);
}

export function isConsolidationEnabled(): boolean {
  return getMergedEnv()["CONSOLIDATION_ENABLED"] === "true";
}

export function getConsolidationDecayDays(): number {
  return safeParseInt(getMergedEnv()["CONSOLIDATION_DECAY_DAYS"], 30);
}

export function isStandaloneMcp(): boolean {
  return getMergedEnv()["STANDALONE_MCP"] === "true";
}

export function getStandalonePersistPath(): string {
  const env = getMergedEnv();
  return (
    env["STANDALONE_PERSIST_PATH"] ||
    join(homedir(), ".agentmemory", "standalone.json")
  );
}

const VALID_PROVIDERS = new Set([
  "anthropic",
  "gemini",
  "openrouter",
  "agent-sdk",
]);

export function loadFallbackConfig(): FallbackConfig {
  const env = getMergedEnv();
  const raw = env["FALLBACK_PROVIDERS"] || "";
  const providers = raw
    .split(",")
    .map((p) => p.trim())
    .filter(
      (p): p is FallbackConfig["providers"][number] =>
        Boolean(p) && VALID_PROVIDERS.has(p),
    );
  return { providers };
}
