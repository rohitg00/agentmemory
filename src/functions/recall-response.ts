import type { CompactSearchResult, SearchResult } from "../types.js";

export type RecallFormat = "full" | "compact" | "narrative";

type ClippedResult = { content_truncated?: true };
type FullResult = SearchResult & ClippedResult;
type CompactResult = CompactSearchResult & ClippedResult;
type NarrativeResult = Omit<CompactResult, "type"> & { narrative: string };
type RecallResult = FullResult | CompactResult | NarrativeResult;

interface RecallMetadata {
  tokens_used: number;
  tokens_budget?: number;
  truncated: boolean;
  matched_count: number;
  excluded_by_budget: number;
  excluded_results: Array<{ obsId: string; sessionId: string; title: string }>;
  excluded_results_truncated: boolean;
  minimum_budget?: number;
}

export type RecallResponse = RecallMetadata & (
  | { format: "full"; results: FullResult[] }
  | { format: "compact"; results: CompactResult[] }
  | { format: "narrative"; results: NarrativeResult[]; text: string }
);

function estimateTokens(value: unknown): number {
  return Math.max(1, Math.ceil(JSON.stringify(value).length / 3));
}

function prefix(text: string, length: number): string {
  let end = Math.min(length, text.length);
  if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end);
}

function fitText<T>(text: string, budget: number, makeResult: (text: string) => T): T {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTokens(makeResult(prefix(text, middle))) <= budget) low = middle;
    else high = middle - 1;
  }
  return makeResult(prefix(text, low));
}

function formatResult(result: SearchResult, format: RecallFormat): RecallResult {
  if (format === "full") return result;
  const observation = result.observation;
  const compact: CompactResult = {
    obsId: observation.id,
    sessionId: result.sessionId,
    title: observation.title,
    type: observation.type,
    score: result.score,
    timestamp: observation.timestamp,
    ...(result.layer !== undefined && { layer: result.layer }),
  };
  if (format === "compact") return compact;
  const { type: _type, ...narrative } = compact;
  return { ...narrative, narrative: observation.narrative };
}

function clipResult(
  result: SearchResult,
  format: RecallFormat,
  budget: number,
): { result?: RecallResult; minimum: number } {
  const observation = result.observation;
  const layer = result.layer !== undefined ? { layer: result.layer } : {};
  if (format === "compact") {
    const base: CompactResult = {
      obsId: observation.id,
      sessionId: result.sessionId,
      title: "",
      type: observation.type,
      score: result.score,
      timestamp: observation.timestamp,
      ...layer,
      content_truncated: true,
    };
    const minimum = estimateTokens(base);
    if (minimum > budget) return { minimum };
    return {
      result: fitText(observation.title, budget, (title) => ({ ...base, title })),
      minimum,
    };
  }

  const makeResult = (title: string, narrative: string): FullResult | NarrativeResult => {
    if (format === "narrative") {
      return {
        obsId: observation.id,
        sessionId: result.sessionId,
        title,
        narrative,
        score: result.score,
        timestamp: observation.timestamp,
        ...layer,
        content_truncated: true,
      };
    }
    return {
      observation: {
        id: observation.id,
        sessionId: observation.sessionId,
        timestamp: observation.timestamp,
        type: observation.type,
        title,
        facts: [],
        narrative,
        concepts: [],
        files: [],
        importance: observation.importance,
        ...(observation.confidence !== undefined && { confidence: observation.confidence }),
        ...(observation.agentId !== undefined && { agentId: observation.agentId }),
        ...(observation.origin && {
          origin: { channel: observation.origin.channel, capturedAt: observation.origin.capturedAt },
        }),
      },
      score: result.score,
      sessionId: result.sessionId,
      ...layer,
      content_truncated: true,
    };
  };
  const minimum = estimateTokens(makeResult("", ""));
  if (minimum > budget) return { minimum };

  const titleResult = fitText(prefix(observation.title, 120), budget, (title) => makeResult(title, ""));
  const title = "observation" in titleResult ? titleResult.observation.title : titleResult.title;
  const narrative = observation.narrative || observation.facts.join("\n");
  return {
    result: fitText(narrative, budget, (text) => makeResult(title, text)),
    minimum,
  };
}

export function buildRecallResponse(
  results: SearchResult[],
  format: RecallFormat,
  tokenBudget?: number,
): RecallResponse {
  const selected: RecallResult[] = [];
  let used = 0;
  let clipped = false;
  let minimumBudget: number | undefined;
  for (const result of results) {
    const formatted = formatResult(result, format);
    const tokens = estimateTokens(formatted);
    if (tokenBudget === undefined || used + tokens <= tokenBudget) {
      selected.push(formatted);
      used += tokens;
      continue;
    }
    if (selected.length === 0) {
      const preview = clipResult(result, format, tokenBudget);
      if (preview.result) {
        selected.push(preview.result);
        used = estimateTokens(preview.result);
        clipped = true;
        continue;
      } else {
        minimumBudget = Math.min(preview.minimum, tokens);
      }
    }
    break;
  }

  const excluded = results.slice(selected.length);
  const metadata: RecallMetadata = {
    tokens_used: used,
    tokens_budget: tokenBudget,
    truncated: clipped || excluded.length > 0,
    matched_count: results.length,
    excluded_by_budget: excluded.length,
    excluded_results: excluded.slice(0, 10).map((result) => ({
      obsId: result.observation.id,
      sessionId: result.sessionId,
      title: prefix(result.observation.title, 120),
    })),
    excluded_results_truncated: excluded.length > 10,
    ...(minimumBudget !== undefined && { minimum_budget: minimumBudget }),
  };
  if (format === "narrative") {
    const narrativeResults = selected as NarrativeResult[];
    return {
      ...metadata,
      format,
      results: narrativeResults,
      text: narrativeResults.map((result, index) => `${index + 1}. ${result.title}\n${result.narrative}`).join("\n\n"),
    };
  }
  if (format === "compact") return { ...metadata, format, results: selected as CompactResult[] };
  return { ...metadata, format, results: selected as FullResult[] };
}
