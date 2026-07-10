import { getXmlChildren, getXmlTag } from "../prompts/xml.js";
import { fingerprintId } from "../state/schema.js";
import type {
  DurableCandidate,
  DurableCandidateType,
  SessionSummary,
} from "../types.js";

export const DURABLE_CANDIDATE_MIN_CONFIDENCE = 0.55;
export const DURABLE_PROMOTE_MIN_CONFIDENCE = 0.7;
export const DURABLE_CANDIDATE_MAX_CONFIDENCE_WITHOUT_EVIDENCE = 0.6;

const DURABLE_CANDIDATE_TYPES = new Set<DurableCandidateType>([
  "pattern",
  "preference",
  "architecture",
  "bug",
  "workflow",
  "fact",
]);

const RELATIVE_TIME_PATTERNS: RegExp[] = [
  /\b(today|yesterday|tomorrow|this session|last session|just now|recently)\b/gi,
  /\b(earlier today|later today|last time)\b/gi,
  /(刚才|昨天|上次|这次会话|本次会话)/g,
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeStringList(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return Array.from(out);
}

function getXmlBlocks(xml: string, parentTag: string, childTag: string): string[] {
  const parent = getXmlTag(xml, parentTag);
  if (!parent) return [];
  const out: string[] = [];
  const re = new RegExp(`<${childTag}>([\\s\\S]*?)</${childTag}>`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(parent)) !== null) {
    out.push(match[1].trim());
  }
  return out;
}

function asDurableCandidateType(value: string | undefined): DurableCandidateType {
  if (value && DURABLE_CANDIDATE_TYPES.has(value as DurableCandidateType)) {
    return value as DurableCandidateType;
  }
  return "fact";
}

export function normalizeDurableText(value: string): string {
  let normalized = value.trim();
  for (const pattern of RELATIVE_TIME_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }
  normalized = normalized
    .replace(/\s+/g, " ")
    .replace(/[!?;,]+$/g, "")
    .replace(/\.+$/g, "")
    .trim();
  return normalized.toLowerCase();
}

export function buildDurableCandidateId(input: {
  sessionId: string;
  type: DurableCandidateType;
  title: string;
  content: string;
  sourceObservationIds: string[];
}): string {
  const canonical = [
    input.sessionId.trim(),
    normalizeDurableText(input.type),
    normalizeDurableText(input.title),
    normalizeDurableText(input.content),
    normalizeStringList(input.sourceObservationIds).sort().join(","),
  ].join("\n");
  return fingerprintId("cand", canonical);
}

export function bucketCandidateConfidence(confidence: number): string {
  if (confidence < DURABLE_PROMOTE_MIN_CONFIDENCE) return "0.55-0.69";
  if (confidence < 0.85) return "0.70-0.84";
  return "0.85-1.00";
}

export interface MaterializeDurableCandidateInput {
  sessionId: string;
  project?: string;
  type?: string;
  title?: string;
  content?: string;
  concepts?: string[];
  files?: string[];
  sourceObservationIds?: string[];
  confidence?: number;
  promotionReason?: string;
  createdAt: string;
  validObservationIds?: Set<string>;
}

export function materializeDurableCandidate(
  input: MaterializeDurableCandidateInput,
): DurableCandidate | null {
  const rawContent = typeof input.content === "string" ? input.content.trim() : "";
  if (!rawContent) return null;

  const rawTitle =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : rawContent;
  const validObservationIds = input.validObservationIds;
  const sourceObservationIds = normalizeStringList(
    (input.sourceObservationIds || []).filter((id) =>
      !validObservationIds || validObservationIds.has(id),
    ),
  );

  const cappedConfidence =
    sourceObservationIds.length === 0
      ? Math.min(
          clamp01(typeof input.confidence === "number" ? input.confidence : 0),
          DURABLE_CANDIDATE_MAX_CONFIDENCE_WITHOUT_EVIDENCE,
        )
      : clamp01(typeof input.confidence === "number" ? input.confidence : 0);

  if (cappedConfidence < DURABLE_CANDIDATE_MIN_CONFIDENCE) {
    return null;
  }

  const type = asDurableCandidateType(
    typeof input.type === "string" ? input.type.trim() : undefined,
  );
  const title = rawTitle.replace(/\s+/g, " ").trim().slice(0, 160);
  const content = rawContent.replace(/\s+/g, " ").trim();
  const concepts = normalizeStringList(input.concepts || []);
  const files = normalizeStringList(input.files || []);
  const promotionReason =
    typeof input.promotionReason === "string" && input.promotionReason.trim()
      ? input.promotionReason.trim().replace(/\s+/g, " ")
      : undefined;

  return {
    id: buildDurableCandidateId({
      sessionId: input.sessionId,
      type,
      title,
      content,
      sourceObservationIds,
    }),
    sessionId: input.sessionId,
    ...(input.project ? { project: input.project } : {}),
    type,
    title,
    content,
    concepts,
    files,
    sourceObservationIds,
    confidence: cappedConfidence,
    ...(promotionReason ? { promotionReason } : {}),
    createdAt: input.createdAt,
  };
}

export function parseDurableCandidatesXml(
  xml: string,
  input: {
    sessionId: string;
    project?: string;
    createdAt: string;
    validObservationIds?: Set<string>;
  },
): DurableCandidate[] {
  const merged = new Map<string, DurableCandidate>();
  for (const block of getXmlBlocks(xml, "durableCandidates", "candidate")) {
    const candidate = materializeDurableCandidate({
      sessionId: input.sessionId,
      project: input.project,
      createdAt: input.createdAt,
      validObservationIds: input.validObservationIds,
      type: getXmlTag(block, "type"),
      title: getXmlTag(block, "title"),
      content: getXmlTag(block, "content"),
      concepts: getXmlChildren(block, "concepts", "concept"),
      files: getXmlChildren(block, "files", "file"),
      sourceObservationIds: getXmlChildren(
        block,
        "sourceObservationIds",
        "id",
      ),
      confidence: Number(getXmlTag(block, "confidence")),
      promotionReason: getXmlTag(block, "promotionReason"),
    });
    if (!candidate) continue;
    const existing = merged.get(candidate.id);
    if (!existing) {
      merged.set(candidate.id, candidate);
      continue;
    }
    merged.set(candidate.id, {
      ...existing,
      confidence: Math.max(existing.confidence, candidate.confidence),
      concepts: normalizeStringList([...existing.concepts, ...candidate.concepts]),
      files: normalizeStringList([...existing.files, ...candidate.files]),
      sourceObservationIds: normalizeStringList([
        ...existing.sourceObservationIds,
        ...candidate.sourceObservationIds,
      ]),
      promotionReason:
        existing.promotionReason || candidate.promotionReason,
    });
  }
  return Array.from(merged.values());
}

export function mergeDurableCandidates(
  existing: DurableCandidate[] = [],
  incoming: DurableCandidate[] = [],
): DurableCandidate[] {
  const merged = new Map<string, DurableCandidate>();
  for (const candidate of [...existing, ...incoming]) {
    const current = merged.get(candidate.id);
    if (!current) {
      merged.set(candidate.id, candidate);
      continue;
    }
    merged.set(candidate.id, {
      ...current,
      ...candidate,
      confidence: Math.max(current.confidence, candidate.confidence),
      concepts: normalizeStringList([...current.concepts, ...candidate.concepts]),
      files: normalizeStringList([...current.files, ...candidate.files]),
      sourceObservationIds: normalizeStringList([
        ...current.sourceObservationIds,
        ...candidate.sourceObservationIds,
      ]),
      promotedMemoryId: candidate.promotedMemoryId ?? current.promotedMemoryId,
      promotedAt: candidate.promotedAt ?? current.promotedAt,
      promotionReason: current.promotionReason ?? candidate.promotionReason,
    });
  }
  return Array.from(merged.values());
}

export function updateSummaryCandidate(
  summary: SessionSummary,
  candidate: DurableCandidate,
): SessionSummary {
  return {
    ...summary,
    durableCandidates: mergeDurableCandidates(
      (summary.durableCandidates || []).filter((item) => item.id !== candidate.id),
      [candidate],
    ),
  };
}
