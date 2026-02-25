export interface Session {
  id: string;
  project: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "completed" | "abandoned";
  observationCount: number;
  model?: string;
  tags?: string[];
}

export interface RawObservation {
  id: string;
  sessionId: string;
  timestamp: string;
  hookType: HookType;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  assistantResponse?: string;
  raw: unknown;
}

export interface CompressedObservation {
  id: string;
  sessionId: string;
  timestamp: string;
  type: ObservationType;
  title: string;
  subtitle?: string;
  facts: string[];
  narrative: string;
  concepts: string[];
  files: string[];
  importance: number;
}

export type ObservationType =
  | "file_read"
  | "file_write"
  | "file_edit"
  | "command_run"
  | "search"
  | "web_fetch"
  | "conversation"
  | "error"
  | "decision"
  | "discovery"
  | "subagent"
  | "notification"
  | "task"
  | "other";

export interface Memory {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: "pattern" | "preference" | "architecture" | "bug" | "workflow" | "fact";
  title: string;
  content: string;
  concepts: string[];
  files: string[];
  sessionIds: string[];
  strength: number;
}

export interface SessionSummary {
  sessionId: string;
  project: string;
  createdAt: string;
  title: string;
  narrative: string;
  keyDecisions: string[];
  filesModified: string[];
  concepts: string[];
  observationCount: number;
}

export type HookType =
  | "session_start"
  | "prompt_submit"
  | "pre_tool_use"
  | "post_tool_use"
  | "post_tool_failure"
  | "pre_compact"
  | "subagent_start"
  | "subagent_stop"
  | "notification"
  | "task_completed"
  | "stop"
  | "session_end";

export interface HookPayload {
  hookType: HookType;
  sessionId: string;
  project: string;
  cwd: string;
  timestamp: string;
  data: unknown;
}

export interface ProviderConfig {
  provider: ProviderType;
  model: string;
  maxTokens: number;
}

export type ProviderType = "agent-sdk" | "anthropic" | "gemini" | "openrouter";

export interface MemoryProvider {
  name: string;
  compress(systemPrompt: string, userPrompt: string): Promise<string>;
  summarize(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface AgentMemoryConfig {
  engineUrl: string;
  restPort: number;
  streamsPort: number;
  provider: ProviderConfig;
  tokenBudget: number;
  maxObservationsPerSession: number;
  compressionModel: string;
  dataDir: string;
}

export interface SearchResult {
  observation: CompressedObservation;
  score: number;
  sessionId: string;
}

export interface ContextBlock {
  type: "summary" | "observation" | "memory";
  content: string;
  tokens: number;
  recency: number;
}
