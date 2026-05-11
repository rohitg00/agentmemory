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
  firstPrompt?: string;
  summary?: string;
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
  modality?: "text" | "image" | "mixed";
  imageData?: string;
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
  confidence?: number;
  imageRef?: string;
  imageData?: string;
  imageDescription?: string;
  modality?: "text" | "image" | "mixed";

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
  | "image"
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
  sourceObservationIds?: string[];
  isLatest: boolean;
  forgetAfter?: string;
  imageRef?: string;
  imageData?: string;
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
  /** Optional base URL override (e.g. for Anthropic-compatible APIs or local proxies) */
  baseURL?: string;
}

export type ProviderType = "agent-sdk" | "anthropic" | "gemini" | "openrouter" | "minimax" | "noop";

export interface MemoryProvider {
  name: string;
  compress(systemPrompt: string, userPrompt: string): Promise<string>;
  summarize(systemPrompt: string, userPrompt: string): Promise<string>;
  describeImage?(imageData: string, mimeType: string, prompt: string): Promise<string>;
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
  sourceIds?: string[];
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
  kvConnectivity?: { status: string; latencyMs?: number; error?: string };
  status: "healthy" | "degraded" | "critical";
  alerts: string[];
  notes?: string[];
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailureAt: number | null;
  openedAt: number | null;
}

export interface MemorySlot {
  label: string;
  content: string;
  sizeLimit: number;
  description: string;
  pinned: boolean;
  readOnly: boolean;
  scope: "project" | "global";
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  embedImage?(src: string): Promise<Float32Array>;
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
  graphScore: number;
  combinedScore: number;
  sessionId: string;
  graphContext?: string;
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

export interface ExportPagination {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ExportData {
  version: "0.3.0" | "0.4.0" | "0.5.0" | "0.6.0" | "0.6.1" | "0.7.0" | "0.7.2" | "0.7.3" | "0.7.4" | "0.7.5" | "0.7.6" | "0.7.7" | "0.7.9" | "0.8.0" | "0.8.1" | "0.8.2" | "0.8.3" | "0.8.4" | "0.8.5" | "0.8.6" | "0.8.7" | "0.8.8" | "0.8.9" | "0.8.10" | "0.8.11" | "0.8.12" | "0.8.13" | "0.9.0" | "0.9.1" | "0.9.2" | "0.9.3" | "0.9.4" | "0.9.5" | "0.9.6" | "0.9.7" | "0.9.8";
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
  actions?: Action[];
  actionEdges?: ActionEdge[];
  routines?: Routine[];
  signals?: Signal[];
  checkpoints?: Checkpoint[];
  sentinels?: Sentinel[];
  sketches?: Sketch[];
  crystals?: Crystal[];
  facets?: Facet[];
  lessons?: Lesson[];
  insights?: Insight[];
  accessLogs?: AccessLogExport[];
  pagination?: ExportPagination;
}

export interface AccessLogExport {
  memoryId: string;
  count: number;
  lastAt: string;
  recent: number[];
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

export type GraphNodeType =
  | "file"
  | "function"
  | "concept"
  | "error"
  | "decision"
  | "pattern"
  | "library"
  | "person"
  | "project"
  | "preference"
  | "location"
  | "organization"
  | "event";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  properties: Record<string, unknown>;
  sourceObservationIds: string[];
  createdAt: string;
  updatedAt?: string;
  aliases?: string[];
  stale?: boolean;
}

export type GraphEdgeType =
  | "uses"
  | "imports"
  | "modifies"
  | "causes"
  | "fixes"
  | "depends_on"
  | "related_to"
  | "works_at"
  | "prefers"
  | "blocked_by"
  | "caused_by"
  | "optimizes_for"
  | "rejected"
  | "avoids"
  | "located_in"
  | "succeeded_by";

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
  sourceObservationIds: string[];
  createdAt: string;
  tcommit?: string;
  tvalid?: string;
  tvalidEnd?: string;
  context?: EdgeContext;
  version?: number;
  supersededBy?: string;
  isLatest?: boolean;
  stale?: boolean;
}

export interface EdgeContext {
  reasoning?: string;
  sentiment?: string;
  alternatives?: string[];
  situationalFactors?: string[];
  confidence?: number;
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
  expectedOutcome?: string;
  frequency: number;
  sourceSessionIds: string[];
  sourceObservationIds?: string[];
  tags?: string[];
  concepts?: string[];
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
    | "export"
    | "action_create"
    | "action_update"
    | "lease_acquire"
    | "lease_release"
    | "routine_run"
    | "signal_send"
    | "checkpoint_resolve"
    | "mesh_sync"
    | "relation_create"
    | "relation_update"
    | "sentinel_create"
    | "sentinel_trigger"
    | "sketch_create"
    | "sketch_promote"
    | "retention_score"
    | "sketch_discard"
    | "crystallize"
    | "diagnose"
    | "heal"
    | "facet_tag"
    | "lesson_save"
    | "lesson_recall"
    | "lesson_strengthen"
    | "obsidian_export"
    | "reflect"
    | "insight_search"
    | "skill_extract"
    | "core_add"
    | "core_remove"
    | "auto_page"
    | "vision_embed"
    | "slot_append"
    | "slot_replace"
    | "slot_create"
    | "slot_delete"
    | "slot_reflect";
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

export interface Action {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "done" | "blocked" | "cancelled";
  priority: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assignedTo?: string;
  project?: string;
  tags: string[];
  sourceObservationIds: string[];
  sourceMemoryIds: string[];
  result?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
  sketchId?: string;
  crystallizedInto?: string;
}

export type ActionEdgeType =
  | "requires"
  | "unlocks"
  | "spawned_by"
  | "gated_by"
  | "conflicts_with";

export interface ActionEdge {
  id: string;
  type: ActionEdgeType;
  sourceActionId: string;
  targetActionId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface Lease {
  id: string;
  actionId: string;
  agentId: string;
  acquiredAt: string;
  expiresAt: string;
  renewedAt?: string;
  status: "active" | "expired" | "released";
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  steps: RoutineStep[];
  createdAt: string;
  updatedAt: string;
  frozen: boolean;
  tags: string[];
  sourceProceduralIds: string[];
}

export interface RoutineStep {
  order: number;
  title: string;
  description: string;
  actionTemplate: Partial<Action>;
  dependsOn: number[];
}

export interface RoutineRun {
  id: string;
  routineId: string;
  status: "running" | "completed" | "failed" | "paused";
  startedAt: string;
  completedAt?: string;
  actionIds: string[];
  stepStatus: Record<number, "pending" | "active" | "done" | "failed">;
  initiatedBy: string;
}

export interface Signal {
  id: string;
  from: string;
  to?: string;
  threadId?: string;
  replyTo?: string;
  type: "info" | "request" | "response" | "alert" | "handoff";
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
  expiresAt?: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  description: string;
  status: "pending" | "passed" | "failed" | "expired";
  type: "ci" | "approval" | "deploy" | "external" | "timer";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  result?: unknown;
  expiresAt?: string;
  linkedActionIds: string[];
}

export interface Sketch {
  id: string;
  title: string;
  description: string;
  status: "active" | "promoted" | "discarded";
  actionIds: string[];
  project?: string;
  createdAt: string;
  expiresAt: string;
  promotedAt?: string;
  discardedAt?: string;
}

export interface Facet {
  id: string;
  targetId: string;
  targetType: "action" | "memory" | "observation";
  dimension: string;
  value: string;
  createdAt: string;
}

export interface Sentinel {
  id: string;
  name: string;
  type: "webhook" | "timer" | "threshold" | "pattern" | "approval" | "custom";
  status: "watching" | "triggered" | "cancelled" | "expired";
  config: Record<string, unknown>;
  result?: unknown;
  createdAt: string;
  triggeredAt?: string;
  expiresAt?: string;
  linkedActionIds: string[];
  escalatedAt?: string;
}

export interface Crystal {
  id: string;
  narrative: string;
  keyOutcomes: string[];
  filesAffected: string[];
  lessons: string[];
  sourceActionIds: string[];
  sessionId?: string;
  project?: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  content: string;
  context: string;
  confidence: number;
  reinforcements: number;
  source: "crystal" | "manual" | "consolidation";
  sourceIds: string[];
  project?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastReinforcedAt?: string;
  lastDecayedAt?: string;
  decayRate: number;
  deleted?: boolean;
}

export interface Insight {
  id: string;
  title: string;
  content: string;
  confidence: number;
  reinforcements: number;
  sourceConceptCluster: string[];
  sourceMemoryIds: string[];
  sourceLessonIds: string[];
  sourceCrystalIds: string[];
  project?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastReinforcedAt?: string;
  lastDecayedAt?: string;
  decayRate: number;
  deleted?: boolean;
}

export interface DiagnosticCheck {
  name: string;
  category: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fixable: boolean;
}

export interface MeshPeer {
  id: string;
  url: string;
  name: string;
  lastSyncAt?: string;
  status: "connected" | "disconnected" | "syncing" | "error";
  sharedScopes: string[];
  syncFilter?: { project?: string };
}


export interface EnrichedChunk {
  id: string;
  originalObsId: string;
  sessionId: string;
  content: string;
  resolvedEntities: Record<string, string>;
  preferences: string[];
  contextBridges: string[];
  windowStart: number;
  windowEnd: number;
  createdAt: string;
}

export interface LatentEmbedding {
  obsId: string;
  contentEmbedding: string;
  latentEmbedding: string;
  sessionId: string;
}

export interface QueryExpansion {
  original: string;
  reformulations: string[];
  temporalConcretizations: string[];
  entityExtractions: string[];
}

export interface TripleStreamResult {
  observation: CompressedObservation;
  vectorScore: number;
  bm25Score: number;
  graphScore: number;
  combinedScore: number;
  sessionId: string;
  graphContext?: string;
}

export interface TemporalQuery {
  entityName: string;
  asOf?: string;
  from?: string;
  to?: string;
  includeHistory?: boolean;
}

export interface TemporalState {
  entity: GraphNode;
  currentEdges: GraphEdge[];
  historicalEdges: GraphEdge[];
  timeline: Array<{
    edge: GraphEdge;
    validFrom: string;
    validTo?: string;
    context?: EdgeContext;
  }>;
}

export interface RetentionScore {
  memoryId: string;
  // Which KV scope this row came from. Needed by mem::retention-evict
  // so the delete loop routes to KV.memories or KV.semantic correctly.
  // Missing on pre-0.8.10 rows — callers must treat `undefined` as
  // "unknown" and probe both scopes for backwards-compat. See #124.
  source?: "episodic" | "semantic";
  score: number;
  salience: number;
  temporalDecay: number;
  reinforcementBoost: number;
  lastAccessed: string;
  accessCount: number;
  source?: "episodic" | "semantic";
}

export interface DecayConfig {
  lambda: number;
  sigma: number;
  tierThresholds: {
    hot: number;
    warm: number;
    cold: number;
  };
}

/**
 * KV.state scope — long-lived system counters + flags keyed by string.
 * Keep keys/types in sync with the state-scope callers (e.g.,
 * disk-size-manager) so TypeScript enforces consistent value shapes
 * instead of every caller using ad-hoc `<number>` generics.
 */
export interface StateScope {
  "system:currentDiskSize": number;
}

export type StateScopeKey = keyof StateScope;
