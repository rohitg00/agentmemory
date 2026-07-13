import type {
  HybridSearchResult,
  Memory,
  ProjectProfile,
  RecallConfig,
  RecallDecision,
  RecallItemKind,
  RecallItemTrace,
  RecallRequest,
  RecallScope,
  RecallTrace,
  Session,
  SessionSummary,
  MemorySlot,
  RetrievalChannelStatus,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { evaluateScope, memoryScope } from "./scope.js";
import { countTokens, getTokenEstimator } from "./tokens.js";
import { persistRecallTrace, redactQuery } from "./trace-store.js";
import type { HybridSearchResponse } from "../state/hybrid-search.js";
import { currentRecallTurn, isDuplicateInjection, recordInjection } from "./ledger.js";

interface RecallCandidate {
  id: string;
  kind: RecallItemKind;
  subkind?: RecallItemTrace["subkind"];
  content: string;
  score: number;
  bm25Score?: number;
  vectorScore?: number;
  graphScore?: number;
  recencyScore: number;
  scope: RecallScope;
  sourceSessionIds?: string[];
  sourceObservationIds?: string[];
  isLatest?: boolean;
  forgetAfter?: string;
  version?: number;
  bootstrap?: boolean;
}

export interface RecallResult {
  context: string;
  results: RecallItemTrace[];
  trace: RecallTrace;
}

export type HybridRecall = (query: string, limit: number) => Promise<HybridSearchResult[] | HybridSearchResponse>;

function unavailableRetrievalMode(): {
  bm25: RetrievalChannelStatus;
  vector: RetrievalChannelStatus;
  graph: RetrievalChannelStatus;
} {
  return {
    bm25: { status: "healthy", attempted: false },
    vector: { status: "disabled", attempted: false, reason: "hybrid retrieval was not configured" },
    graph: { status: "disabled", attempted: false, reason: "hybrid retrieval was not configured" },
  };
}

function lexicalScore(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  const hits = terms.filter((term) => haystack.includes(term)).length;
  return hits / terms.length;
}

function recencyScore(timestamp: string): number {
  const ageDays = Math.max(0, Date.now() - new Date(timestamp).getTime()) / 86_400_000;
  return Math.max(0, 0.03 * (1 / (1 + ageDays / 30)));
}

function renderProfile(profile: ProjectProfile): string {
  const parts: string[] = [];
  if (profile.summary) parts.push(profile.summary);
  if (profile.conventions.length > 0) parts.push(`Conventions: ${profile.conventions.join("; ")}`);
  if (profile.commonErrors.length > 0) parts.push(`Common errors: ${profile.commonErrors.join("; ")}`);
  return parts.join("\n");
}

function traceItem(candidate: RecallCandidate, decision: RecallDecision, reason: string, score = candidate.score): RecallItemTrace {
  return {
    id: candidate.id,
    kind: candidate.kind,
    ...(candidate.subkind ? { subkind: candidate.subkind } : {}),
    score,
    ...(candidate.bm25Score !== undefined ? { bm25Score: candidate.bm25Score } : {}),
    ...(candidate.vectorScore !== undefined ? { vectorScore: candidate.vectorScore } : {}),
    ...(candidate.graphScore !== undefined ? { graphScore: candidate.graphScore } : {}),
    recencyScore: candidate.recencyScore,
    tokenCount: countTokens(candidate.content),
    reason,
    ...(candidate.sourceSessionIds ? { sourceSessionIds: candidate.sourceSessionIds } : {}),
    ...(candidate.sourceObservationIds ? { sourceObservationIds: candidate.sourceObservationIds } : {}),
    decision,
  };
}

function normalizeDuplicate(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function boundedBudgetValue(requested: number | undefined, configured: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return configured;
  return Math.min(configured, Math.max(0, Math.floor(requested)));
}

export class RecallCore {
  constructor(
    private readonly kv: StateKV,
    private readonly config: RecallConfig,
    private readonly hybridRecall?: HybridRecall,
  ) {}

  async recall(request: RecallRequest): Promise<RecallResult> {
    const estimator = getTokenEstimator(request.tokenizerHint);
    const redactedQuery = await redactQuery(this.kv, request.query);
    const injectionState = request.outputMode === "prompt_injection"
      ? await currentRecallTurn(this.kv, request.sessionId, request.entryPoint === "prompt")
      : null;
    const dropped: RecallItemTrace[] = [];
    const droppedCounts: Partial<Record<RecallDecision, number>> = {};
    const drop = (candidate: RecallCandidate, decision: RecallDecision, reason: string) => {
      droppedCounts[decision] = (droppedCounts[decision] || 0) + 1;
      const sameDecision = dropped.filter((item) => item.decision === decision);
      if (sameDecision.length < this.config.trace.maxDroppedItemsPerReason) {
        dropped.push(traceItem(candidate, decision, reason));
      }
    };

    const bootstrap = request.outputMode === "bootstrap" || request.outputMode === "prompt_injection" || request.outputMode === "rendered_context"
      ? await this.collectBootstrap(request)
      : [];
    const semanticResponse = request.outputMode === "bootstrap"
      ? { candidates: [], retrievalMode: unavailableRetrievalMode() }
      : await this.collectSemantic(request);
    const semantic = semanticResponse.candidates;
    const allCandidates = [...bootstrap, ...semantic];

    const automatic = request.outputMode === "prompt_injection" || request.outputMode === "bootstrap" || request.entryPoint === "enrich";
    const allowUnknown = automatic
      ? this.config.scope.unknownAutoInjection
      : this.config.scope.unknownExplicitSearch;
    const surviving: RecallCandidate[] = [];
    for (const candidate of allCandidates) {
      if (candidate.isLatest === false) {
        drop(candidate, "superseded", "dropped because memory has been superseded");
        continue;
      }
      if (candidate.forgetAfter && new Date(candidate.forgetAfter).getTime() <= Date.now()) {
        drop(candidate, "stale", "dropped because memory has expired");
        continue;
      }
      const scope = evaluateScope(candidate.scope, request, allowUnknown);
      if (!scope.eligible) {
        drop(candidate, "scope_mismatch", scope.reason);
        continue;
      }
      candidate.score += scope.score + candidate.recencyScore + this.kindBoost(candidate);
      surviving.push(candidate);
    }

    const bootstrapCandidates = surviving
      .filter((candidate) => candidate.bootstrap)
      .sort((left, right) => this.bootstrapOrder(left) - this.bootstrapOrder(right));
    const semanticCandidates = surviving
      .filter((candidate) => !candidate.bootstrap)
      .sort((left, right) => right.score - left.score);
    const effectiveBudget = {
      maxContextTokens: boundedBudgetValue(request.budget?.maxContextTokens, this.config.budget.maxContextTokens),
      maxSemanticTokens: boundedBudgetValue(request.budget?.maxSemanticTokens, this.config.budget.maxSemanticTokens),
      maxMemories: boundedBudgetValue(request.budget?.maxMemories, this.config.budget.maxMemories),
      maxSessionSummaries: boundedBudgetValue(request.budget?.maxSessionSummaries, this.config.budget.maxSessionSummaries),
      maxObservations: boundedBudgetValue(request.budget?.maxObservations, this.config.budget.maxObservations),
      maxContinuityItems: boundedBudgetValue(request.budget?.maxContinuityItems, this.config.budget.maxContinuityItems),
    };
    const selected: RecallItemTrace[] = [];
    const selectedContent: string[] = [];
    const usedContents = new Set<string>();
    const maxContext = effectiveBudget.maxContextTokens;
    const opening = request.outputMode === "bootstrap"
      ? `<agentmemory-bootstrap project="${request.projectId || ""}">`
      : `<agentmemory-context project="${request.projectId || ""}">`;
    const closing = request.outputMode === "bootstrap" ? "</agentmemory-bootstrap>" : "</agentmemory-context>";
    const wrapperTokens = countTokens(`${opening}\n${closing}`);
    let remaining = Math.max(0, maxContext - wrapperTokens);
    let bootstrapContinuity = 0;

    for (const candidate of bootstrapCandidates) {
      const item = traceItem(candidate, "selected", "selected as mandatory bootstrap");
      if (candidate.kind === "continuity" && bootstrapContinuity >= effectiveBudget.maxContinuityItems) {
        drop(candidate, "low_score", "dropped because the configured continuity limit was reached");
        continue;
      }
      if (usedContents.has(normalizeDuplicate(candidate.content))) {
        drop(candidate, "duplicate", "dropped because equivalent context was already selected");
        continue;
      }
      const packedTokens = countTokens(`${selectedContent.length > 0 ? "\n\n" : ""}${candidate.content}`);
      if (packedTokens > remaining) {
        drop(candidate, "over_budget", "dropped because mandatory bootstrap exceeded hard context budget");
        continue;
      }
      selected.push(item);
      selectedContent.push(candidate.content);
      usedContents.add(normalizeDuplicate(candidate.content));
      remaining -= packedTokens;
      if (candidate.kind === "continuity") bootstrapContinuity += 1;
    }

    if (request.outputMode !== "bootstrap") {
      const semanticLimit = Math.min(
        effectiveBudget.maxSemanticTokens,
        remaining,
      );
      let semanticUsed = 0;
      const kindCounts: Partial<Record<RecallItemKind, number>> = {};
      const rankedLimit = request.limit === undefined || !Number.isFinite(request.limit)
        ? 20
        : Math.max(0, Math.floor(request.limit));
      for (const candidate of semanticCandidates) {
        const item = traceItem(candidate, "selected", "selected by hybrid retrieval and bounded boosts");
        if (request.outputMode === "ranked_results" && selected.length >= rankedLimit) {
          drop(candidate, "low_score", "dropped because the requested result limit was reached");
          continue;
        }
        if (usedContents.has(normalizeDuplicate(candidate.content))) {
          drop(candidate, "duplicate", "dropped because equivalent context was already selected");
          continue;
        }
        if (await isDuplicateInjection(
          this.kv,
          injectionState,
          candidate.id,
          candidate.version,
          redactedQuery.queryFingerprint,
          this.config.injection,
        )) {
          drop(candidate, "duplicate", "dropped because this item/version/query was injected in the current context epoch");
          continue;
        }
        if (request.outputMode !== "ranked_results" && !this.withinKindCap(candidate, kindCounts, effectiveBudget)) {
          drop(candidate, "low_score", "dropped because the configured kind limit was reached");
          continue;
        }
        const packedTokens = countTokens(`${selectedContent.length > 0 ? "\n\n" : ""}${candidate.content}`);
        if (request.outputMode !== "ranked_results" && (packedTokens > remaining || semanticUsed + packedTokens > semanticLimit)) {
          drop(candidate, "over_budget", "dropped because semantic context budget was exhausted");
          continue;
        }
        selected.push(item);
        selectedContent.push(candidate.content);
        usedContents.add(normalizeDuplicate(candidate.content));
        kindCounts[candidate.kind] = (kindCounts[candidate.kind] || 0) + 1;
        semanticUsed += packedTokens;
        remaining -= request.outputMode === "ranked_results" ? 0 : packedTokens;
        await recordInjection(
          this.kv,
          injectionState,
          candidate.id,
          candidate.version,
          redactedQuery.queryFingerprint,
        );
      }
    }

    const context = request.outputMode === "ranked_results" || selectedContent.length === 0
      ? ""
      : `${opening}\n${selectedContent.join("\n\n")}\n${closing}`;
    const trace: RecallTrace = {
      id: generateId("rtr"),
      timestamp: new Date().toISOString(),
      entryPoint: request.entryPoint,
      outputMode: request.outputMode,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      ...(request.repoId ? { repoId: request.repoId } : {}),
      ...(request.checkoutId ? { checkoutId: request.checkoutId } : {}),
      ...redactedQuery,
      selected,
      dropped,
      droppedCountsByDecision: droppedCounts,
      totalCandidateCount: allCandidates.length,
      selectedTokenCount: selected.reduce((total, item) => total + item.tokenCount, 0),
      finalContextTokenCount: context ? countTokens(context) : 0,
      tokenEstimator: estimator,
      retrievalMode: semanticResponse.retrievalMode,
    };
    await persistRecallTrace(this.kv, trace, this.config.trace);
    return { context, results: selected, trace };
  }

  private async collectBootstrap(request: RecallRequest): Promise<RecallCandidate[]> {
    if (!request.projectId) return [];
    const candidates: RecallCandidate[] = [];
    const profile = await this.kv.get<ProjectProfile>(KV.profiles, request.projectId).catch(() => null);
    if (profile) {
      const content = renderProfile(profile);
      if (content) {
        candidates.push({
          id: `profile:${request.projectId}`,
          kind: "memory",
          subkind: "project_rule",
          content: `## Project Rules\n${content}`,
          score: 1,
          recencyScore: recencyScore(profile.updatedAt),
          scope: { level: "project", projectId: request.projectId, ...(request.repoId ? { repoId: request.repoId } : {}) },
          bootstrap: true,
        });
      }
    }
    const [projectSlots, globalSlots] = await Promise.all([
      this.kv.list<MemorySlot>(KV.slots).catch(() => []),
      this.kv.list<MemorySlot>(KV.globalSlots).catch(() => []),
    ]);
    for (const slot of projectSlots) {
      if (!slot.pinned || slot.projectId !== request.projectId) continue;
      if (slot.repoId && request.repoId && slot.repoId !== request.repoId) continue;
      if (!slot.content.trim()) continue;
      candidates.push({
        id: `slot:${slot.label}:${slot.projectId}`,
        kind: slot.label === "pending_items" ? "continuity" : "memory",
        ...(slot.label === "pending_items" ? {} : { subkind: "project_rule" as const }),
        content: `## ${slot.label}\n${slot.content}`,
        score: 1,
        recencyScore: recencyScore(slot.updatedAt),
        scope: { level: "project", projectId: slot.projectId, ...(slot.repoId ? { repoId: slot.repoId } : {}) },
        bootstrap: true,
      });
    }
    for (const slot of globalSlots) {
      if (!slot.pinned || !slot.repoId || slot.repoId !== request.repoId || !slot.content.trim()) continue;
      candidates.push({
        id: `slot:${slot.label}:${slot.repoId}`,
        kind: "memory",
        subkind: "repo_instruction",
        content: `## ${slot.label}\n${slot.content}`,
        score: 1,
        recencyScore: recencyScore(slot.updatedAt),
        scope: { level: "repo", repoId: slot.repoId },
        bootstrap: true,
      });
    }
    return candidates;
  }

  private async collectSemantic(request: RecallRequest): Promise<{
    candidates: RecallCandidate[];
    retrievalMode: ReturnType<typeof unavailableRetrievalMode>;
  }> {
    if (!request.query?.trim()) return { candidates: [], retrievalMode: unavailableRetrievalMode() };
    const candidates: RecallCandidate[] = [];
    const sessionCache = new Map<string, Session | null>();
    const sessionFor = async (sessionId: string) => {
      if (!sessionCache.has(sessionId)) sessionCache.set(sessionId, await this.kv.get<Session>(KV.sessions, sessionId));
      return sessionCache.get(sessionId) || null;
    };
    const hybrid = this.hybridRecall
      ? await this.hybridRecall(
        request.query,
        Math.max((request.limit === undefined || !Number.isFinite(request.limit) ? 20 : Math.max(0, Math.floor(request.limit))) * 5, 50),
      )
      : [];
    const hits = Array.isArray(hybrid) ? hybrid : hybrid.results;
    const retrievalMode = Array.isArray(hybrid)
      ? {
          bm25: { status: "healthy" as const, attempted: true },
          vector: { status: "disabled" as const, attempted: false, reason: "legacy hybrid callback did not report vector health" },
          graph: { status: "disabled" as const, attempted: false, reason: "legacy hybrid callback did not report graph health" },
        }
      : hybrid.retrievalMode;
    for (const hit of hits) {
      const memory = await this.kv.get<Memory>(KV.memories, hit.observation.id).catch(() => null);
      const session = memory ? null : await sessionFor(hit.sessionId);
      const isMemory = Boolean(memory);
      const content = isMemory
        ? `## ${memory!.title}\n${memory!.content}`
        : `## ${hit.observation.title}\n${hit.observation.narrative}`;
      candidates.push({
        id: hit.observation.id,
        kind: isMemory ? "memory" : "observation",
        ...(isMemory ? { subkind: "durable_memory" as const } : {}),
        content,
        score: hit.combinedScore,
        bm25Score: hit.bm25Score,
        vectorScore: hit.vectorScore,
        graphScore: hit.graphScore,
        recencyScore: recencyScore(isMemory ? memory!.updatedAt : hit.observation.timestamp),
        scope: isMemory ? memoryScope(memory!) : { level: "project", projectId: session?.project || "" },
        ...(isMemory ? { sourceSessionIds: memory!.sessionIds, sourceObservationIds: memory!.sourceObservationIds } : { sourceSessionIds: [hit.sessionId], sourceObservationIds: [hit.observation.id] }),
        ...(isMemory ? { isLatest: memory!.isLatest, forgetAfter: memory!.forgetAfter, version: memory!.version } : {}),
      });
    }
    const summaries = await this.kv.list<SessionSummary>(KV.summaries).catch(() => []);
    for (const summary of summaries) {
      if (summary.project !== request.projectId) continue;
      const content = `## ${summary.title}\n${summary.narrative}\nDecisions: ${summary.keyDecisions.join("; ")}`;
      const score = lexicalScore(request.query, content);
      if (score <= 0) continue;
      candidates.push({
        id: `summary:${summary.sessionId}`,
        kind: "summary",
        content,
        score,
        recencyScore: recencyScore(summary.createdAt),
        scope: { level: "project", projectId: summary.project },
        sourceSessionIds: [summary.sessionId],
      });
    }
    return { candidates, retrievalMode };
  }

  private kindBoost(candidate: RecallCandidate): number {
    if (candidate.kind === "memory") return 0.03;
    if (candidate.kind === "summary") return 0.01;
    return 0;
  }

  private bootstrapOrder(candidate: RecallCandidate): number {
    if (candidate.subkind === "project_rule") return 0;
    if (candidate.subkind === "repo_instruction") return 1;
    return 2;
  }

  private withinKindCap(
    candidate: RecallCandidate,
    counts: Partial<Record<RecallItemKind, number>>,
    budget = this.config.budget,
  ): boolean {
    const cap = candidate.kind === "memory"
      ? budget.maxMemories
      : candidate.kind === "summary"
        ? budget.maxSessionSummaries
        : candidate.kind === "observation"
          ? budget.maxObservations
          : budget.maxContinuityItems;
    return (counts[candidate.kind] || 0) < cap;
  }
}
