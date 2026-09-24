export const CONSOLIDATION_LAST_RUN_KEY = "consolidation:lastPipelineRun";
export const SEMANTIC_MIN_SUMMARIES = 5;
export const PROCEDURAL_MIN_PATTERNS = 2;
export const PROCEDURAL_MIN_SESSIONS_PER_PATTERN = 2;

export type TierState = "off" | "waiting" | "ready" | "ran" | "error";

export interface ConsolidationRunRecord {
  at: string;
  tier: string;
  results: Record<string, { skipped?: boolean; reason?: string; error?: string; [key: string]: unknown } | undefined>;
}

export interface ConsolidationStatusInput {
  now: Date;
  enabled: boolean;
  llmConfigured: boolean;
  summaries: number;
  recurringPatterns: number;
  semanticFacts: number;
  procedures: number;
  relations: number;
  lastRun: ConsolidationRunRecord | null;
}

export interface ConsolidationTier {
  id: "semantic" | "procedural" | "relations";
  label: string;
  from: string;
  count: number;
  state: TierState;
  detail: string;
}

export interface ConsolidationStatus {
  enabled: boolean;
  llmConfigured: boolean;
  lastRunAt: string | null;
  tiers: ConsolidationTier[];
}

function ago(now: Date, iso: string): string {
  const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (Number.isNaN(seconds)) return "at an unknown time";
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function fromLastRun(
  input: ConsolidationStatusInput,
  tier: "semantic" | "procedural",
): { state: TierState; detail: string } | null {
  const result = input.lastRun?.results?.[tier];
  if (!input.lastRun || !result) return null;
  const when = ago(input.now, input.lastRun.at);
  if (result.error) return { state: "error", detail: `Last run ${when} failed: ${result.error}` };
  if (result.skipped) return null;
  const made =
    tier === "semantic"
      ? `${Number(result["newFacts"] ?? 0)} new facts`
      : `${Number(result["newProcedures"] ?? 0)} new procedures`;
  return { state: "ran", detail: `Last run ${when}: ${made}.` };
}

export function describeConsolidation(input: ConsolidationStatusInput): ConsolidationStatus {
  const off = !input.enabled || !input.llmConfigured;
  const offDetail = !input.llmConfigured
    ? "Off: add an LLM provider key to ~/.agentmemory/.env and restart; consolidation turns on with it."
    : "Off: CONSOLIDATION_ENABLED is set to false; remove it or set it to true and restart.";

  const semanticWaiting = input.summaries < SEMANTIC_MIN_SUMMARIES;
  const semantic: ConsolidationTier = {
    id: "semantic",
    label: "Semantic facts",
    from: "Durable facts distilled from session summaries",
    count: input.semanticFacts,
    ...(off
      ? { state: "off", detail: offDetail }
      : fromLastRun(input, "semantic") ??
        (semanticWaiting
          ? {
              state: "waiting",
              detail: `Waiting: ${input.summaries} of ${SEMANTIC_MIN_SUMMARIES} session summaries needed.`,
            }
          : { state: "ready", detail: "Ready: runs when the next session ends." }))
  };

  const proceduralWaiting = input.recurringPatterns < PROCEDURAL_MIN_PATTERNS;
  const procedural: ConsolidationTier = {
    id: "procedural",
    label: "Procedures",
    from: "Repeatable workflows, from finished sessions and from patterns that recur across sessions",
    count: input.procedures,
    ...(off
      ? { state: "off", detail: offDetail }
      : fromLastRun(input, "procedural") ??
        (proceduralWaiting
          ? {
              state: "waiting",
              detail:
                `Extracted from each finished session with a summary and 3+ observations. ` +
                `The cross-session pass also needs ${PROCEDURAL_MIN_PATTERNS} pattern memories seen in ` +
                `${PROCEDURAL_MIN_SESSIONS_PER_PATTERN}+ sessions (you have ${input.recurringPatterns}).`,
            }
          : { state: "ready", detail: "Ready: runs when the next session ends." }))
  };

  const relations: ConsolidationTier = {
    id: "relations",
    label: "Relations",
    from: "Links between memories (supersedes, extends, contradicts)",
    count: input.relations,
    state: input.relations > 0 ? "ran" : "waiting",
    detail:
      input.relations > 0
        ? `${input.relations} links saved.`
        : "None yet: links are saved when a memory updates or relates to another.",
  };

  return {
    enabled: input.enabled,
    llmConfigured: input.llmConfigured,
    lastRunAt: input.lastRun?.at ?? null,
    tiers: [semantic, procedural, relations],
  };
}
