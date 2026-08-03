import type {
  EmbeddingProvider,
  Lesson,
  LessonClaimType,
  LessonEvidenceVerdict,
  LessonReadModel,
  LessonScopeRing,
  LessonSensitivity,
} from "../types.js";
import { getEnvVar } from "../config.js";
import { fingerprintId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { clipEmbedInput, getEmbeddingProvider } from "./search.js";
import {
  canReadLesson,
  lessonAccessContextFromPayload,
  type LessonAccessContext,
} from "./lesson-access.js";
import {
  normalizeLessonStructuredFacets,
  toLessonReadModel,
} from "./lesson-model.js";

const MAX_QUERY_LENGTH = 2_048;
const MAX_PROJECT_LENGTH = 512;
const MAX_RECALL_LIMIT = 50;
const MAX_FILTER_TAGS = 32;
const MAX_FILTER_TAG_LENGTH = 256;
const MAX_SEMANTIC_CANDIDATES = 256;
const EMBEDDING_BATCH_SIZE = 32;
const MAX_CACHED_LESSON_EMBEDDINGS = 4_096;
const COMPACT_CONTENT_CHARS = 400;
const COMPACT_CLAIM_CHARS = 300;
const COMPACT_CONDITIONS = 2;
const COMPACT_CONDITION_CHARS = 160;
const COMPACT_FACET_DIMENSIONS = 6;
const COMPACT_FACET_VALUES = 3;
const COMPACT_FACET_VALUE_CHARS = 64;
const COMPACT_TAGS = 8;
const COMPACT_TAG_CHARS = 64;
const COMPACT_MAX_UTF8_BYTES = 6_000;
const RRF_K = 60;
const MIN_SEMANTIC_SCORE = 0.2;
const SEMANTIC_TIMEOUT_MS = 5_000;

const CLAIM_TYPES = new Set<LessonClaimType>([
  "causal",
  "predictive",
  "procedural",
  "constraint",
  "descriptive",
]);
const EVIDENCE_VERDICTS = new Set<LessonEvidenceVerdict>([
  "supported",
  "refuted",
  "mixed",
  "unverified",
]);
const SCOPE_RINGS = new Set<LessonScopeRing>([
  "worktree",
  "repo",
  "initiative",
  "domain",
  "global",
]);
const SENSITIVITIES = new Set<LessonSensitivity>([
  "public",
  "internal",
  "confidential",
  "restricted",
]);

export type LessonRetrievalMode = "lexical" | "hybrid";

export interface LessonRecallInput {
  query: string;
  project?: string;
  minConfidence: number;
  limit: number;
  retrievalMode: LessonRetrievalMode;
  compact: boolean;
  mechanismId?: string;
  claimType?: LessonClaimType;
  evidenceVerdicts: LessonEvidenceVerdict[];
  structuredFacets: Record<string, string[]>;
  tags: string[];
  scopeRing?: LessonScopeRing;
  sensitivity?: LessonSensitivity;
  accessContext?: LessonAccessContext;
}

export type LessonRecallInputResult =
  | { success: true; value: LessonRecallInput }
  | { success: false; error: string };

export interface LessonRetrievalDiagnostics {
  requestedMode: LessonRetrievalMode;
  usedMode: LessonRetrievalMode;
  returnedCount: number;
  fallbackCode?: string;
  noticeCode?: string;
}

export interface RankedLesson {
  lesson: LessonReadModel;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  rankingScore: number;
}

export interface CompactRetrievedLesson {
  lessonId: string;
  content: string;
  claim?: string;
  mechanismId?: string;
  claimType?: LessonClaimType;
  evidenceVerdict: LessonEvidenceVerdict;
  lifecycle: "active";
  contradicted: boolean;
  confidence: number;
  score: number;
  applicabilityConditions: string[];
  nonApplicabilityConditions: string[];
  falsificationConditions: string[];
  structuredFacets: Record<string, string[]>;
  scope: {
    ring: LessonScopeRing;
    scopeId?: string;
  };
  sensitivity: LessonSensitivity;
  project?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

let providerEmbeddingCaches = new WeakMap<
  EmbeddingProvider,
  Map<string, Float32Array>
>();

export function resetLessonRetrievalCacheForTests(): void {
  providerEmbeddingCaches = new WeakMap();
}

export function parseLessonRecallInput(raw: unknown): LessonRecallInputResult {
  try {
    const record = requireRecord(raw);
    const query = requiredString(record.query, "query", MAX_QUERY_LENGTH);
    const project = optionalString(
      record.project,
      "project",
      MAX_PROJECT_LENGTH,
    );
    const minConfidence =
      record.minConfidence === undefined
        ? 0.1
        : finiteNumber(record.minConfidence, "minConfidence");
    if (minConfidence < 0 || minConfidence > 1) {
      throw new Error("minConfidence must be between 0 and 1");
    }
    const limit =
      record.limit === undefined
        ? 10
        : positiveInteger(record.limit, "limit");
    if (limit > MAX_RECALL_LIMIT) {
      throw new Error(`limit must be at most ${MAX_RECALL_LIMIT}`);
    }
    const retrievalMode =
      record.retrievalMode === undefined
        ? "lexical"
        : enumValue(
            record.retrievalMode,
            "retrievalMode",
            new Set<LessonRetrievalMode>(["lexical", "hybrid"]),
          );
    const compact =
      record.compact === undefined
        ? false
        : booleanValue(record.compact, "compact");
    const mechanismId = optionalString(
      record.mechanismId,
      "mechanismId",
      128,
    )?.toLowerCase();
    if (
      mechanismId &&
      !/^[a-z0-9][a-z0-9._:/-]*$/.test(mechanismId)
    ) {
      throw new Error(
        "mechanismId must use lowercase letters, numbers, dot, underscore, colon, slash, or hyphen",
      );
    }
    const claimType =
      record.claimType === undefined
        ? undefined
        : enumValue(record.claimType, "claimType", CLAIM_TYPES);
    const evidenceVerdicts = stringArray(
      record.evidenceVerdicts,
      "evidenceVerdicts",
      4,
      32,
    ).map((value) =>
      enumValue(value, "evidenceVerdicts", EVIDENCE_VERDICTS),
    );
    const structuredFacets = normalizeLessonStructuredFacets(
      record.structuredFacets,
    );
    if (
      Object.values(structuredFacets).some((values) => values.length === 0)
    ) {
      throw new Error(
        "structuredFacets filters must contain at least one value per dimension",
      );
    }
    const tags = stringArray(
      record.tags,
      "tags",
      MAX_FILTER_TAGS,
      MAX_FILTER_TAG_LENGTH,
    );
    const scopeRing =
      record.scopeRing === undefined
        ? undefined
        : enumValue(record.scopeRing, "scopeRing", SCOPE_RINGS);
    const sensitivity =
      record.sensitivity === undefined
        ? undefined
        : enumValue(record.sensitivity, "sensitivity", SENSITIVITIES);

    return {
      success: true,
      value: {
        query,
        project,
        minConfidence,
        limit,
        retrievalMode,
        compact,
        mechanismId,
        claimType,
        evidenceVerdicts,
        structuredFacets,
        tags,
        scopeRing,
        sensitivity,
        accessContext: record.accessContext as LessonAccessContext | undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function selectLessonRecallCandidates(
  storedLessons: Lesson[],
  input: LessonRecallInput,
): LessonReadModel[] {
  const accessContext = lessonAccessContextFromPayload(input.accessContext);
  const normalized = storedLessons.map((lesson) => toLessonReadModel(lesson));
  if (new Set(normalized.map((lesson) => lesson.id)).size !== normalized.length) {
    throw new Error("lesson_state_unavailable");
  }
  return normalized
    .filter(
      (lesson) =>
        !lesson.deleted &&
        lesson.lifecycle === "active",
    )
    .filter((lesson) => canReadLesson(lesson, accessContext))
    .filter((lesson) => lesson.confidence >= input.minConfidence)
    .filter((lesson) => !input.project || lesson.project === input.project)
    .filter(
      (lesson) =>
        !input.mechanismId ||
        lesson.mechanismId === input.mechanismId ||
        lesson.mechanismAliases.includes(input.mechanismId),
    )
    .filter(
      (lesson) => !input.claimType || lesson.claimType === input.claimType,
    )
    .filter(
      (lesson) =>
        input.evidenceVerdicts.length === 0 ||
        input.evidenceVerdicts.includes(lesson.evidenceVerdict),
    )
    .filter(
      (lesson) =>
        !input.scopeRing || lesson.scope.ring === input.scopeRing,
    )
    .filter(
      (lesson) =>
        !input.sensitivity || lesson.sensitivity === input.sensitivity,
    )
    .filter((lesson) => matchesTags(lesson.tags, input.tags))
    .filter((lesson) =>
      matchesStructuredFacets(
        lesson.structuredFacets,
        input.structuredFacets,
      ),
    );
}

export async function rankLessonRecallCandidates(
  candidates: LessonReadModel[],
  input: LessonRecallInput,
): Promise<{
  ranked: RankedLesson[];
  diagnostics: LessonRetrievalDiagnostics;
}> {
  const lexical = lexicalRanks(candidates, input.query);
  const lexicalOnly = (
    fallbackCode?: string,
  ): {
    ranked: RankedLesson[];
    diagnostics: LessonRetrievalDiagnostics;
  } => {
    const ranked = lexical
      .filter((item) => item.lexicalScore > 0)
      .sort(compareRankedLessons)
      .slice(0, input.limit);
    return {
      ranked,
      diagnostics: {
        requestedMode: input.retrievalMode,
        usedMode: "lexical",
        returnedCount: ranked.length,
        ...(fallbackCode ? { fallbackCode } : {}),
      },
    };
  };

  if (input.retrievalMode === "lexical") return lexicalOnly();
  if (candidates.length === 0) {
    return {
      ranked: [],
      diagnostics: {
        requestedMode: "hybrid",
        usedMode: "hybrid",
        returnedCount: 0,
      },
    };
  }
  if (candidates.length > MAX_SEMANTIC_CANDIDATES) {
    return lexicalOnly("semantic_candidate_limit_exceeded");
  }

  const provider = getEmbeddingProvider();
  if (!provider) {
    return lexicalOnly("embedding_provider_unavailable");
  }
  const policy = embeddingPolicy(provider, candidates);
  if ("failureCode" in policy) {
    return lexicalOnly(policy.failureCode);
  }

  let semantic: Map<string, number>;
  const budget: SemanticBudget = {
    deadlineMs: Date.now() + SEMANTIC_TIMEOUT_MS,
    cancelled: false,
  };
  try {
    semantic = await withTimeout(
      semanticScores(
        provider,
        policy.semanticEligible,
        input.query,
        budget,
      ),
      SEMANTIC_TIMEOUT_MS,
      () => {
        budget.cancelled = true;
      },
    );
  } catch {
    return lexicalOnly("embedding_failed");
  }

  const lexicalRank = new Map(
    lexical
      .filter((item) => item.lexicalScore > 0)
      .sort(
        (left, right) =>
          right.rankingScore - left.rankingScore ||
          left.lesson.id.localeCompare(right.lesson.id),
      )
      .map((item, index) => [item.lesson.id, index + 1]),
  );
  const semanticRank = new Map(
    [...semantic.entries()]
      .filter(([, score]) => score >= MIN_SEMANTIC_SCORE)
      .sort(
        ([leftId, leftScore], [rightId, rightScore]) =>
          rightScore - leftScore || leftId.localeCompare(rightId),
      )
      .map(([lessonId], index) => [lessonId, index + 1]),
  );
  if (semanticRank.size === 0) {
    return lexicalOnly("semantic_no_signal");
  }
  const ranked = lexical
    .filter(
      (item) =>
        lexicalRank.has(item.lesson.id) ||
        semanticRank.has(item.lesson.id),
    )
    .map((item) => {
      const lesson = item.lesson;
      const lexicalPosition = lexicalRank.get(lesson.id);
      const semanticPosition = semanticRank.get(lesson.id);
      const lexicalRrf = lexicalPosition
        ? 0.4 / (RRF_K + lexicalPosition)
        : 0;
      const semanticRrf = semanticPosition
        ? 0.6 / (RRF_K + semanticPosition)
        : 0;
      const normalizedRrf =
        (lexicalRrf + semanticRrf) / (1 / (RRF_K + 1));
      const confidenceWeight = 0.65 + 0.35 * lesson.confidence;
      return {
        lesson,
        lexicalScore: item.lexicalScore,
        semanticScore: semantic.get(lesson.id) ?? 0,
        score: roundScore(normalizedRrf * confidenceWeight),
        rankingScore: normalizedRrf * confidenceWeight,
      };
    })
    .sort(compareRankedLessons)
    .slice(0, input.limit);

  return {
    ranked,
    diagnostics: {
      requestedMode: "hybrid",
      usedMode: "hybrid",
      returnedCount: ranked.length,
      ...(policy.noticeCode ? { noticeCode: policy.noticeCode } : {}),
    },
  };
}

export function compactRetrievedLesson(
  ranked: RankedLesson,
): CompactRetrievedLesson {
  const lesson = ranked.lesson;
  return enforceCompactSize({
    lessonId: lesson.id,
    content: truncateText(lesson.content, COMPACT_CONTENT_CHARS),
    claim: lesson.claim
      ? truncateText(lesson.claim, COMPACT_CLAIM_CHARS)
      : undefined,
    mechanismId: lesson.mechanismId,
    claimType: lesson.claimType,
    evidenceVerdict: lesson.evidenceVerdict,
    lifecycle: "active",
    contradicted: lesson.computedFlags.contradicted,
    confidence: lesson.confidence,
    score: ranked.score,
    applicabilityConditions: compactStrings(
      lesson.applicabilityConditions,
      COMPACT_CONDITIONS,
      COMPACT_CONDITION_CHARS,
    ),
    nonApplicabilityConditions: compactStrings(
      lesson.nonApplicabilityConditions,
      COMPACT_CONDITIONS,
      COMPACT_CONDITION_CHARS,
    ),
    falsificationConditions: compactStrings(
      lesson.falsificationConditions,
      COMPACT_CONDITIONS,
      COMPACT_CONDITION_CHARS,
    ),
    structuredFacets: compactFacets(lesson.structuredFacets),
    scope: {
      ring: lesson.scope.ring,
      scopeId: lesson.scope.scopeId,
    },
    sensitivity: lesson.sensitivity,
    project: lesson.project,
    tags: compactStrings(lesson.tags, COMPACT_TAGS, COMPACT_TAG_CHARS),
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  });
}

function lexicalRanks(
  candidates: LessonReadModel[],
  query: string,
): RankedLesson[] {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  const nowMs = Date.now();
  return candidates.map((lesson) => {
    const text = legacyLexicalText(lesson).toLowerCase();
    const matched = queryTerms.filter((term) => text.includes(term)).length;
    const relevance =
      queryTerms.length === 0 ? 0 : matched / queryTerms.length;
    const baseline = lesson.lastReinforcedAt ?? lesson.createdAt;
    const baselineMs = Date.parse(baseline);
    const daysSinceReinforced = Number.isFinite(baselineMs)
      ? (nowMs - baselineMs) / (1_000 * 60 * 60 * 24)
      : 0;
    const recencyBoost = 1 / (1 + daysSinceReinforced * 0.01);
    const rankingScore = lesson.confidence * relevance * recencyBoost;
    return {
      lesson,
      lexicalScore: relevance,
      semanticScore: 0,
      score: roundLegacyScore(rankingScore),
      rankingScore,
    };
  });
}

async function semanticScores(
  provider: EmbeddingProvider,
  candidates: LessonReadModel[],
  query: string,
  budget: SemanticBudget,
): Promise<Map<string, number>> {
  assertSemanticBudget(budget);
  const queryEmbedding = await provider.embed(clipEmbedInput(query));
  assertSemanticBudget(budget);
  ensureEmbeddingDimensions(queryEmbedding, provider);

  const cache = embeddingCache(provider);
  const publicCandidates = candidates.filter(
    (lesson) => lesson.sensitivity === "public",
  );
  if (publicCandidates.length > 0) {
    await withKeyedLock(
      `lesson-retrieval-public-cache:${provider.name}:${provider.dimensions}`,
      async () => {
        assertSemanticBudget(budget);
        const missing = publicCandidates.filter(
          (lesson) => !cache.has(embeddingCacheKey(lesson)),
        );
        for (
          let offset = 0;
          offset < missing.length;
          offset += EMBEDDING_BATCH_SIZE
        ) {
          assertSemanticBudget(budget);
          const batch = missing.slice(offset, offset + EMBEDDING_BATCH_SIZE);
          const embeddings = await embedLessonBatch(
            provider,
            batch,
            budget,
          );
          for (let index = 0; index < batch.length; index++) {
            setCachedEmbedding(
              cache,
              embeddingCacheKey(batch[index]),
              embeddings[index],
            );
          }
        }
      },
    );
  }

  const protectedEmbeddings = new Map<string, Float32Array>();
  const protectedCandidates = candidates.filter(
    (lesson) => lesson.sensitivity !== "public",
  );
  for (
    let offset = 0;
    offset < protectedCandidates.length;
    offset += EMBEDDING_BATCH_SIZE
  ) {
    assertSemanticBudget(budget);
    const batch = protectedCandidates.slice(
      offset,
      offset + EMBEDDING_BATCH_SIZE,
    );
    const embeddings = await embedLessonBatch(provider, batch, budget);
    for (let index = 0; index < batch.length; index++) {
      protectedEmbeddings.set(
        batch[index].id,
        new Float32Array(embeddings[index]),
      );
    }
  }

  assertSemanticBudget(budget);
  return new Map(
    candidates.map((lesson) => {
      const embedding =
        lesson.sensitivity === "public"
          ? cache.get(embeddingCacheKey(lesson))
          : protectedEmbeddings.get(lesson.id);
      if (!embedding) throw new Error("lesson embedding cache miss");
      return [lesson.id, cosineSimilarity(queryEmbedding, embedding)];
    }),
  );
}

async function embedLessonBatch(
  provider: EmbeddingProvider,
  batch: LessonReadModel[],
  budget: SemanticBudget,
): Promise<Float32Array[]> {
  const embeddings = await provider.embedBatch(
    batch.map((lesson) => clipEmbedInput(lessonRetrievalText(lesson))),
  );
  assertSemanticBudget(budget);
  if (embeddings.length !== batch.length) {
    throw new Error("embedding provider returned an invalid batch length");
  }
  for (const embedding of embeddings) {
    ensureEmbeddingDimensions(embedding, provider);
  }
  return embeddings;
}

function legacyLexicalText(lesson: LessonReadModel): string {
  const facets = Object.entries(lesson.structuredFacets)
    .flatMap(([dimension, values]) => [dimension, ...values])
    .join(" ");
  return [
    lesson.content,
    lesson.context,
    lesson.claim,
    lesson.mechanismId,
    ...lesson.mechanismAliases,
    ...lesson.applicabilityConditions,
    ...lesson.nonApplicabilityConditions,
    ...lesson.falsificationConditions,
    facets,
    ...lesson.tags,
  ]
    .filter(Boolean)
    .join(" ");
}

function lessonRetrievalText(lesson: LessonReadModel): string {
  const facets = Object.entries(lesson.structuredFacets)
    .flatMap(([dimension, values]) => [dimension, ...values])
    .join(" ");
  return [
    lesson.claim,
    lesson.content,
    lesson.mechanismId,
    lesson.mechanismVersion,
    ...lesson.mechanismAliases,
    lesson.claimType,
    lesson.evidenceVerdict,
    ...lesson.applicabilityConditions,
    ...lesson.nonApplicabilityConditions,
    ...lesson.falsificationConditions,
    facets,
    ...lesson.tags,
  ]
    .filter(Boolean)
    .join(" ");
}

function embeddingCache(
  provider: EmbeddingProvider,
): Map<string, Float32Array> {
  let cache = providerEmbeddingCaches.get(provider);
  if (!cache) {
    cache = new Map();
    providerEmbeddingCaches.set(provider, cache);
  }
  return cache;
}

function setCachedEmbedding(
  cache: Map<string, Float32Array>,
  key: string,
  embedding: Float32Array,
): void {
  cache.delete(key);
  cache.set(key, new Float32Array(embedding));
  while (cache.size > MAX_CACHED_LESSON_EMBEDDINGS) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
}

function embeddingCacheKey(lesson: LessonReadModel): string {
  return `${lesson.id}\u0000${fingerprintId(
    "lrt",
    lessonRetrievalText(lesson),
  )}`;
}

function ensureEmbeddingDimensions(
  embedding: Float32Array,
  provider: EmbeddingProvider,
): void {
  if (
    embedding.length !== provider.dimensions ||
    [...embedding].some((value) => !Number.isFinite(value))
  ) {
    throw new Error("embedding provider returned invalid dimensions");
  }
}

function cosineSimilarity(
  left: Float32Array,
  right: Float32Array,
): number {
  if (left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
}

function matchesTags(lessonTags: string[], requestedTags: string[]): boolean {
  if (requestedTags.length === 0) return true;
  const available = new Set(lessonTags.map(normalizeText));
  return requestedTags.every((tag) => available.has(normalizeText(tag)));
}

function matchesStructuredFacets(
  lessonFacets: Record<string, string[]>,
  requestedFacets: Record<string, string[]>,
): boolean {
  return Object.entries(requestedFacets).every(([dimension, values]) => {
    const available = new Set(
      (lessonFacets[dimension] ?? []).map(normalizeText),
    );
    return (
      values.length > 0 &&
      values.some((value) => available.has(normalizeText(value)))
    );
  });
}

function compareRankedLessons(
  left: RankedLesson,
  right: RankedLesson,
): number {
  return (
    right.rankingScore - left.rankingScore ||
    right.semanticScore - left.semanticScore ||
    right.lexicalScore - left.lexicalScore ||
    left.lesson.id.localeCompare(right.lesson.id)
  );
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function roundLegacyScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function compactStrings(
  values: string[],
  maxItems: number,
  maxChars: number,
): string[] {
  return values
    .slice(0, maxItems)
    .map((value) => truncateText(value, maxChars));
}

function compactFacets(
  facets: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(facets)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, COMPACT_FACET_DIMENSIONS)
      .map(([dimension, values]) => [
        dimension,
        compactStrings(
          values,
          COMPACT_FACET_VALUES,
          COMPACT_FACET_VALUE_CHARS,
        ),
      ]),
  );
}

function truncateText(value: string, maxChars: number): string {
  return value.length > maxChars
    ? `${value.slice(0, Math.max(0, maxChars - 1))}…`
    : value;
}

function enforceCompactSize(
  compact: CompactRetrievedLesson,
): CompactRetrievedLesson {
  const fits = () =>
    Buffer.byteLength(JSON.stringify(compact), "utf8") <=
    COMPACT_MAX_UTF8_BYTES;
  if (fits()) return compact;

  while (compact.tags.length > 0 && !fits()) compact.tags.pop();

  const facetDimensions = Object.keys(compact.structuredFacets).sort().reverse();
  for (const dimension of facetDimensions) {
    const values = compact.structuredFacets[dimension];
    while (values.length > 0 && !fits()) values.pop();
    if (values.length === 0) delete compact.structuredFacets[dimension];
    if (fits()) return compact;
  }

  for (const conditions of [
    compact.nonApplicabilityConditions,
    compact.falsificationConditions,
    compact.applicabilityConditions,
  ]) {
    while (conditions.length > 0 && !fits()) conditions.pop();
    if (fits()) return compact;
  }

  while (compact.content.length > 80 && !fits()) {
    compact.content = truncateText(
      compact.content,
      Math.max(80, compact.content.length - 32),
    );
  }
  while ((compact.claim?.length ?? 0) > 80 && !fits()) {
    compact.claim = truncateText(
      compact.claim!,
      Math.max(80, compact.claim!.length - 32),
    );
  }
  if (!fits()) delete compact.project;
  if (!fits()) delete compact.scope.scopeId;
  if (!fits()) delete compact.mechanismId;
  if (!fits()) compact.content = "";
  if (!fits()) delete compact.claim;
  return compact;
}

type SemanticBudget = {
  deadlineMs: number;
  cancelled: boolean;
};

function assertSemanticBudget(budget: SemanticBudget): void {
  if (budget.cancelled || Date.now() >= budget.deadlineMs) {
    throw new Error("lesson semantic retrieval timed out");
  }
}

function embeddingPolicy(
  provider: EmbeddingProvider,
  candidates: LessonReadModel[],
):
  | {
      semanticEligible: LessonReadModel[];
      noticeCode?: string;
    }
  | { failureCode: string } {
  if (provider.name === "local") {
    return { semanticEligible: candidates };
  }
  if (getEnvVar("AGENTMEMORY_LESSON_REMOTE_EMBEDDINGS") !== "true") {
    return { failureCode: "remote_embedding_disabled" };
  }
  const configuredCeiling =
    getEnvVar("AGENTMEMORY_LESSON_EMBED_MAX_SENSITIVITY") ?? "public";
  if (!SENSITIVITIES.has(configuredCeiling as LessonSensitivity)) {
    return { failureCode: "embedding_policy_invalid" };
  }
  const rank: Record<LessonSensitivity, number> = {
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
  };
  const ceiling = rank[configuredCeiling as LessonSensitivity];
  const semanticEligible = candidates.filter(
    (lesson) => rank[lesson.sensitivity] <= ceiling,
  );
  if (semanticEligible.length === 0) {
    return { failureCode: "embedding_sensitivity_blocked" };
  }
  return {
    semanticEligible,
    ...(semanticEligible.length < candidates.length
      ? { noticeCode: "embedding_sensitivity_filtered" }
      : {}),
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => {
            onTimeout();
            reject(new Error("lesson semantic retrieval timed out"));
          },
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("lesson recall input must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const parsed = optionalString(value, field, maxLength);
  if (!parsed) throw new Error(`${field} is required`);
  return parsed;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const parsed = value.trim();
  if (!parsed) return undefined;
  if (parsed.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`);
  }
  return parsed;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value as number;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function stringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  if (value.length > maxItems) {
    throw new Error(`${field} must contain at most ${maxItems} items`);
  }
  const parsed = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`${field} must contain only strings`);
    }
    const text = item.trim();
    if (!text) throw new Error(`${field} must not contain empty strings`);
    if (text.length > maxLength) {
      throw new Error(`${field} items must be at most ${maxLength} characters`);
    }
    return text;
  });
  return [...new Set(parsed)];
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: Set<T>,
): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(
      `${field} must be one of ${[...allowed].join(", ")}`,
    );
  }
  return value as T;
}
