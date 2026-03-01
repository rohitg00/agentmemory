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
  confidence?: number;
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
  version: "0.3.0" | "0.4.0";
  exportedAt: string;
  sessions: Session[];
  observations: Record<string, CompressedObservation[]>;
  memories: Memory[];
  summaries: SessionSummary[];
  profiles?: ProjectProfile[];
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
  semanticMemories?: SemanticMemory[];
  proceduralMemories?: ProceduralMemory[];
}

export interface EmbeddingConfig {
  provider?: string;
  bm25Weight: number;
  vectorWeight: number;
}

export interface FallbackConfig {
  providers: ProviderType[];
}

export interface ClaudeBridgeConfig {
  enabled: boolean;
  projectPath: string;
  memoryFilePath: string;
  lineBudget: number;
}

export interface StandaloneConfig {
  dataDir: string;
  persistPath: string;
  agentType?: string;
}

export interface GraphNode {
  id: string;
  type:
    | "file"
    | "function"
    | "concept"
    | "error"
    | "decision"
    | "pattern"
    | "library"
    | "person";
  name: string;
  properties: Record<string, string>;
  sourceObservationIds: string[];
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  type:
    | "uses"
    | "imports"
    | "modifies"
    | "causes"
    | "fixes"
    | "depends_on"
    | "related_to";
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
  sourceObservationIds: string[];
  createdAt: string;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

export type ConsolidationTier =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural";

export interface SemanticMemory {
  id: string;
  fact: string;
  confidence: number;
  sourceSessionIds: string[];
  sourceMemoryIds: string[];
  accessCount: number;
  lastAccessedAt: string;
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProceduralMemory {
  id: string;
  name: string;
  steps: string[];
  triggerCondition: string;
  frequency: number;
  sourceSessionIds: string[];
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamConfig {
  teamId: string;
  userId: string;
  mode: "shared" | "private";
}

export interface TeamSharedItem {
  id: string;
  sharedBy: string;
  sharedAt: string;
  type: "observation" | "memory" | "pattern";
  content: unknown;
  project: string;
  visibility: "shared" | "private";
}

export interface TeamProfile {
  teamId: string;
  members: string[];
  topConcepts: Array<{ concept: string; frequency: number }>;
  topFiles: Array<{ file: string; frequency: number }>;
  sharedPatterns: string[];
  totalSharedItems: number;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  operation:
    | "observe"
    | "compress"
    | "remember"
    | "forget"
    | "evolve"
    | "consolidate"
    | "share"
    | "delete"
    | "import"
    | "export";
  userId?: string;
  functionId: string;
  targetIds: string[];
  details: Record<string, unknown>;
  qualityScore?: number;
}

export interface GovernanceFilter {
  type?: string[];
  dateFrom?: string;
  dateTo?: string;
  project?: string;
  qualityBelow?: number;
}

export interface SnapshotMeta {
  id: string;
  commitHash: string;
  createdAt: string;
  message: string;
  stats: {
    sessions: number;
    observations: number;
    memories: number;
    graphNodes: number;
  };
}

export interface SnapshotDiff {
  fromCommit: string;
  toCommit: string;
  added: { memories: number; observations: number; graphNodes: number };
  removed: { memories: number; observations: number; graphNodes: number };
}
