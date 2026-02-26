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
  version: number;
  parentId?: string;
  supersedes?: string[];
  relatedIds?: string[];
  isLatest: boolean;
  forgetAfter?: string;
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

export interface EvalResult {
  valid: boolean;
  errors: string[];
  qualityScore: number;
  latencyMs: number;
  functionId: string;
}

export interface FunctionMetrics {
  functionId: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  avgQualityScore: number;
}

export interface HealthSnapshot {
  connectionState: string;
  workers: Array<{ id: string; name: string; status: string }>;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  cpu: { userMicros: number; systemMicros: number; percent: number };
  eventLoopLagMs: number;
  uptimeSeconds: number;
  status: "healthy" | "degraded" | "critical";
  alerts: string[];
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailureAt: number | null;
  openedAt: number | null;
}

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface MemoryRelation {
  type: "supersedes" | "extends" | "derives" | "contradicts" | "related";
  sourceId: string;
  targetId: string;
  createdAt: string;
}

export interface HybridSearchResult {
  observation: CompressedObservation;
  bm25Score: number;
  vectorScore: number;
  combinedScore: number;
  sessionId: string;
}

export interface CompactSearchResult {
  obsId: string;
  sessionId: string;
  title: string;
  type: ObservationType;
  score: number;
  timestamp: string;
}

export interface TimelineEntry {
  observation: CompressedObservation;
  sessionId: string;
  relativePosition: number;
}

export interface ProjectProfile {
  project: string;
  updatedAt: string;
  topConcepts: Array<{ concept: string; frequency: number }>;
  topFiles: Array<{ file: string; frequency: number }>;
  conventions: string[];
  commonErrors: string[];
  recentActivity: string[];
  sessionCount: number;
  totalObservations: number;
  summary?: string;
}

export interface ExportData {
  version: "0.3.0";
  exportedAt: string;
  sessions: Session[];
  observations: Record<string, CompressedObservation[]>;
  memories: Memory[];
  summaries: SessionSummary[];
  profiles?: ProjectProfile[];
}

export interface EmbeddingConfig {
  provider?: string;
  bm25Weight: number;
  vectorWeight: number;
}

export interface FallbackConfig {
  providers: ProviderType[];
}
