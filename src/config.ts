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
    const quoteChar = val[0] === '"' || val[0] === "'" ? val[0] : "";
    if (quoteChar) {
      const closeIdx = val.indexOf(quoteChar, 1);
      if (closeIdx !== -1) val = val.slice(1, closeIdx);
    } else {
      const hashIdx = val.indexOf(" #");
      if (hashIdx !== -1) val = val.slice(0, hashIdx).trim();
    }
    vars[key] = val;
  }
  return vars;
}

function hasRealValue(v: string | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function detectProvider(env: Record<string, string>): ProviderConfig {
  const maxTokens = parseInt(env["MAX_TOKENS"] || "4096", 10);

  // MiniMax: Anthropic-compatible API, requires raw fetch to avoid SDK stainless headers
  if (hasRealValue(env["MINIMAX_API_KEY"])) {
    return {
      provider: "minimax",
      model: env["MINIMAX_MODEL"] || "MiniMax-M2.7",
      maxTokens,
    };
  }

  if (hasRealValue(env["ANTHROPIC_API_KEY"])) {
    return {
      provider: "anthropic",
      model: env["ANTHROPIC_MODEL"] || "claude-sonnet-4-20250514",
      maxTokens,
      baseURL: env["ANTHROPIC_BASE_URL"],
    };
  }
  if (hasRealValue(env["GEMINI_API_KEY"]) || hasRealValue(env["GOOGLE_API_KEY"])) {
    if (!hasRealValue(env["GEMINI_API_KEY"]) && hasRealValue(env["GOOGLE_API_KEY"])) {
      process.stderr.write(
        "[agentmemory] GOOGLE_API_KEY detected — treating as GEMINI_API_KEY. " +
          "Set GEMINI_API_KEY in ~/.agentmemory/.env to silence this warning.\n",
      );
    }
    return {
      provider: "gemini",
      model: env["GEMINI_MODEL"] || "gemini-2.5-flash",
      maxTokens,
    };
  }
  if (hasRealValue(env["OPENROUTER_API_KEY"])) {
    return {
      provider: "openrouter",
      model: env["OPENROUTER_MODEL"] || "anthropic/claude-sonnet-4-20250514",
      maxTokens,
    };
  }

  const allowAgentSdk = env["AGENTMEMORY_ALLOW_AGENT_SDK"] === "true";
  if (!allowAgentSdk) {
    process.stderr.write(
      "[agentmemory] No LLM provider key found " +
        "(ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, MINIMAX_API_KEY). " +
        "LLM-backed compression and summarization are DISABLED — using no-op provider. " +
        "This is the safe default: the agent-sdk fallback used to spawn Claude Agent SDK " +
        "child sessions which inherit Claude Code's plugin hooks and cause infinite Stop-hook " +
        "recursion (#149 follow-up). To opt in to the agent-sdk fallback anyway, set both " +
        "AGENTMEMORY_AUTO_COMPRESS=true AND AGENTMEMORY_ALLOW_AGENT_SDK=true — but be aware " +
        "it will burn your Claude Pro allocation and may still recurse if you use it from " +
        "inside Claude Code itself.\n",
    );
    return {
      provider: "noop",
      model: "noop",
      maxTokens,
    };
  }

  process.stderr.write(
    "[agentmemory] WARNING: agent-sdk fallback enabled via AGENTMEMORY_ALLOW_AGENT_SDK=true. " +
      "This spawns @anthropic-ai/claude-agent-sdk child sessions that can trigger the Stop-hook " +
      "recursion loop (#149 follow-up). A SDK-child env marker is set to block re-entry, " +
      "but prefer setting a real API key in ~/.agentmemory/.env instead.\n",
  );
  return {
    provider: "agent-sdk",
    model: "claude-sonnet-4-20250514",
    maxTokens,
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

export function detectLlmProviderKind(): "llm" | "noop" {
  const env = getMergedEnv();
  if (
    hasRealValue(env["ANTHROPIC_API_KEY"]) ||
    hasRealValue(env["GEMINI_API_KEY"]) ||
    hasRealValue(env["GOOGLE_API_KEY"]) ||
    hasRealValue(env["OPENROUTER_API_KEY"]) ||
    hasRealValue(env["MINIMAX_API_KEY"])
  ) {
    return "llm";
  }
  return "noop";
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

// Per-observation LLM compression is OFF by default as of 0.8.8 (see #138).
// When disabled, observations are captured and indexed via a synthetic
// (zero-LLM) compression path so recall/search still works. Users who want
// richer LLM-generated summaries can set AGENTMEMORY_AUTO_COMPRESS=true in
// ~/.agentmemory/.env — but should expect their Claude API token usage to
// climb proportionally with session tool-use frequency.
export function isAutoCompressEnabled(): boolean {
  return getMergedEnv()["AGENTMEMORY_AUTO_COMPRESS"] === "true";
}

// Hook-level context injection into Claude Code's conversation is OFF by
// default as of 0.8.10 (see #143). When disabled, pre-tool-use and
// session-start hooks still POST observations for background capture, but
// never write context to stdout — so Claude Code doesn't inject an extra
// ~4000-char blob into every tool turn. 0.8.8 stopped the agentmemory-side
// Claude calls (via ANTHROPIC_API_KEY); this stops the Claude Code-side
// token burn where every tool call silently grew the model input window.
// Users who want the in-conversation context injection explicitly opt in
// with AGENTMEMORY_INJECT_CONTEXT=true and get a loud startup warning.
export function isContextInjectionEnabled(): boolean {
  return getMergedEnv()["AGENTMEMORY_INJECT_CONTEXT"] === "true";
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
  "minimax",
]);

export function loadFallbackConfig(): FallbackConfig {
  const env = getMergedEnv();
  const raw = env["FALLBACK_PROVIDERS"] || "";
  const allowAgentSdk = env["AGENTMEMORY_ALLOW_AGENT_SDK"] === "true";
  const providers = raw
    .split(",")
    .map((p) => p.trim())
    .filter(
      (p): p is FallbackConfig["providers"][number] =>
        Boolean(p) && VALID_PROVIDERS.has(p),
    )
    .filter((p) => {
      // Honor the same safety gate as detectProvider: agent-sdk is only
      // permitted as a fallback target when the user has explicitly opted
      // in. Without this filter, a user could set FALLBACK_PROVIDERS=agent-sdk
      // and re-introduce the Stop-hook recursion loop even though
      // detectProvider() returned the noop provider.
      if (p === "agent-sdk" && !allowAgentSdk) {
        process.stderr.write(
          "[agentmemory] Ignoring FALLBACK_PROVIDERS entry 'agent-sdk' " +
            "(AGENTMEMORY_ALLOW_AGENT_SDK is not 'true'). The agent-sdk " +
            "fallback can spawn Claude Agent SDK child sessions that trigger " +
            "the Stop-hook recursion loop (#149 follow-up). Opt in explicitly " +
            "with AGENTMEMORY_ALLOW_AGENT_SDK=true if this is intentional.\n",
        );
        return false;
      }
      return true;
    });
  return { providers };
}
