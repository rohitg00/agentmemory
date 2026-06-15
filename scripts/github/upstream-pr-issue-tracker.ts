import { createHash } from "node:crypto";

export const SOURCE_REPO = "rohitg00/agentmemory";
export const TARGET_REPO = "wbugitlab1/agentmemory";
export const PR_MARKER_PREFIX = "<!-- upstream-pr:";
export const MANAGED_SECTION_START = "<!-- upstream-pr-managed:start -->";
export const MANAGED_SECTION_END = "<!-- upstream-pr-managed:end -->";
export const WORKFLOW_SECTION_START = "<!-- fork-pr-workflow:start -->";
export const WORKFLOW_SECTION_END = "<!-- fork-pr-workflow:end -->";

export type SanitizationTelemetry = {
  neutralizedMentions: number;
  neutralizedReferences: number;
  neutralizedClosingKeywords: number;
};

export type SourcePull = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  html_url: string;
  user: { login: string } | null;
  body: string | null;
  head: { repoFullName: string | null; ref: string; sha: string };
  base: { ref: string; sha: string };
  labels: Array<{ name: string; color?: string; description?: string | null }>;
  changedFiles: number;
  commits: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
};

export type TargetIssue = {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  state?: "open" | "closed";
  pull_request?: unknown;
};

export type ManagedLabel = {
  name: string;
  color: string;
  description: string;
};

export type PlannedPrAction =
  | { type: "create-label"; label: ManagedLabel }
  | { type: "create-issue"; upstreamNumber: number; title: string; body: string; labels: string[] }
  | { type: "update-issue"; upstreamNumber: number; targetNumber: number; title: string; body: string; labels: string[] }
  | { type: "skip-issue"; upstreamNumber: number; targetNumber: number; reason: string }
  | { type: "duplicate-marker"; upstreamNumber: number; targetNumbers: number[] }
  | { type: "invalid-marker"; targetNumber: number; reason: string };

export type ExistingPrMarker = {
  upstreamNumber: number;
  targetNumber: number;
  targetTitle: string;
  targetBody: string;
  targetLabels: string[];
};

export type DuplicatePrMarker = {
  upstreamNumber: number;
  targetNumbers: number[];
};

export type MarkerParseFailure = {
  targetNumber: number;
  reason: string;
};

export type ParseExistingPrMarkersResult = {
  markers: ExistingPrMarker[];
  markerMap: Map<number, ExistingPrMarker>;
  duplicates: DuplicatePrMarker[];
  invalidMarkers: MarkerParseFailure[];
};

export type PrPlanFailure =
  | { type: "duplicate-marker"; upstreamNumber: number; targetNumbers: number[] }
  | { type: "invalid-marker"; targetNumber: number; reason: string }
  | { type: "malformed-section"; targetNumber: number; reason: string }
  | { type: "missing"; upstreamNumber: number }
  | { type: "title-mismatch"; upstreamNumber: number; targetNumber: number }
  | { type: "marker-mismatch"; upstreamNumber: number; targetNumber: number }
  | { type: "missing-label"; label: string }
  | { type: "plan-drift"; reason: string };

export type PlanPrIssueActionsInput = {
  sourcePulls: SourcePull[];
  targetIssues: TargetIssue[];
  targetLabels: Array<{ name: string; color?: string; description?: string | null }>;
};

export type PlanPrIssueActionsResult = {
  actions: PlannedPrAction[];
  failures: PrPlanFailure[];
  report: {
    sourcePulls: number;
    targetIssueEndpointItems: number;
    targetPullRequestItemsExcluded: number;
    targetNormalIssues: number;
    targetMirrorCount: number;
    missingManagedLabelCount: number;
    sanitization: SanitizationTelemetry;
  };
};

export type PlanPrVerificationInput = {
  upstreamNumbers: number[];
  markerMap: Map<number, ExistingPrMarker>;
  duplicates: DuplicatePrMarker[];
  invalidMarkers?: MarkerParseFailure[];
  targetLabels?: Array<{ name: string }>;
  sourcePulls?: SourcePull[];
  targetIssues?: TargetIssue[];
};

export type PlanPrVerificationResult = {
  ok: boolean;
  failures: PrPlanFailure[];
};

export class MalformedSectionError extends Error {
  reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "MalformedSectionError";
    this.reason = reason;
  }
}

export const MANAGED_LABELS: ManagedLabel[] = [
  { name: "upstream-pr", color: "0366d6", description: "Tracks an upstream pull request" },
  { name: "upstream-open", color: "2ea44f", description: "Upstream pull request is open" },
  { name: "upstream-closed", color: "6a737d", description: "Upstream pull request is closed unmerged" },
  { name: "upstream-merged", color: "6f42c1", description: "Upstream pull request is merged upstream" },
  { name: "upstream-draft", color: "a371f7", description: "Upstream pull request is a draft" },
  { name: "decision-candidate", color: "fbca04", description: "Fork decision has not been made" },
  { name: "decision-imported", color: "0e8a16", description: "Fork imported the upstream PR branch or patch" },
  { name: "decision-adopted", color: "0e8a16", description: "Fork adopted the upstream change" },
  { name: "decision-modified", color: "1d76db", description: "Fork adopted a modified version" },
  { name: "decision-rejected", color: "b60205", description: "Fork rejected the upstream PR" },
  { name: "decision-upstream-merged", color: "6f42c1", description: "Upstream merged before fork action" },
];

const prMarkerPattern = /<!--\s*upstream-pr:\s*([^#\s]+)#([0-9]+)\s*-->/g;
const anyPrMarkerPattern = /<!--\s*upstream-pr:[\s\S]*?-->/g;
const decisionLabelPattern = /^decision-/;
const upstreamManagedLabelPattern = /^upstream-(pr|open|closed|merged|draft)$/;
const issueReferencePattern = /(^|[^\w/])#([0-9]+)\b/g;
const repoReferencePattern = /\brohitg00\/agentmemory#([0-9]+)\b/g;
const mentionPattern = /(^|[^A-Za-z0-9_`])@([A-Za-z0-9][A-Za-z0-9-]{0,38})\b/g;
const closingKeywordPattern = /\b(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b/gi;

export function buildPrMarker(upstreamNumber: number): string {
  return `${PR_MARKER_PREFIX} ${SOURCE_REPO}#${upstreamNumber} -->`;
}

export function sanitizeImportedMarkdown(markdown: string | null): string {
  return sanitizeWithTelemetry(markdown ?? "").text;
}

export function sanitizeImportedMarkdownWithTelemetry(markdown: string | null): { text: string; telemetry: SanitizationTelemetry } {
  return sanitizeWithTelemetry(markdown ?? "");
}

export function sanitizeRenderedGitHubText(text: string | null): string {
  return sanitizeWithTelemetry(text ?? "").text;
}

export function buildDecisionLabels(existingLabels: string[], upstreamState: "open" | "closed", merged: boolean, draft: boolean): string[] {
  const result = ["upstream-pr", merged ? "upstream-merged" : upstreamState === "open" ? "upstream-open" : "upstream-closed"];
  if (draft) result.push("upstream-draft");

  const existingDecisionLabels = uniqueSorted(existingLabels.filter((label) => decisionLabelPattern.test(label)));
  result.push(...(existingDecisionLabels.length > 0 ? existingDecisionLabels : ["decision-candidate"]));

  const customLabels = existingLabels.filter((label) => !upstreamManagedLabelPattern.test(label) && !decisionLabelPattern.test(label));
  result.push(...uniqueSorted(customLabels));
  return unique(result);
}

export function buildTrackerIssueTitle(sourcePull: SourcePull): string {
  return `[upstream PR ${sourcePull.number}] ${sanitizeRenderedGitHubText(sourcePull.title)}`;
}

export function buildTrackerIssueBody(sourcePull: SourcePull): string {
  return [buildManagedSection(sourcePull), buildWorkflowSection()].join("\n\n");
}

export function mergeTrackerIssueBody(existingBody: string | null, sourcePull: SourcePull): string {
  const body = existingBody ?? "";
  const managed = readDelimitedSection(body, MANAGED_SECTION_START, MANAGED_SECTION_END, "managed");
  const workflow = readDelimitedSection(body, WORKFLOW_SECTION_START, WORKFLOW_SECTION_END, "workflow");
  if (managed.startIndex > workflow.startIndex) throw new MalformedSectionError("managed section must precede workflow section");
  return [buildManagedSection(sourcePull), workflow.fullText].join("\n\n");
}

export function parseExistingPrMarkers(targetIssues: TargetIssue[]): ParseExistingPrMarkersResult {
  const markers: ExistingPrMarker[] = [];
  const invalidMarkers: MarkerParseFailure[] = [];
  const byUpstream = new Map<number, number[]>();

  for (const issue of targetIssues) {
    if (isPullRequestEndpointItem(issue)) continue;

    const body = issue.body ?? "";
    const rawMarkers = Array.from(body.matchAll(anyPrMarkerPattern));
    const validMarkers = Array.from(body.matchAll(prMarkerPattern)).filter((match) => match[1] === SOURCE_REPO);
    if (rawMarkers.length === 0) continue;
    if (rawMarkers.length > 1) {
      invalidMarkers.push({ targetNumber: issue.number, reason: "multiple upstream PR markers" });
      continue;
    }
    if (validMarkers.length !== 1) {
      invalidMarkers.push({ targetNumber: issue.number, reason: "malformed upstream PR marker" });
      continue;
    }

    const upstreamNumber = Number(validMarkers[0][2]);
    markers.push({
      upstreamNumber,
      targetNumber: issue.number,
      targetTitle: issue.title,
      targetBody: body,
      targetLabels: issue.labels,
    });
    const targets = byUpstream.get(upstreamNumber) ?? [];
    targets.push(issue.number);
    byUpstream.set(upstreamNumber, targets);
  }

  const duplicates = Array.from(byUpstream.entries())
    .filter(([, targetNumbers]) => targetNumbers.length > 1)
    .map(([upstreamNumber, targetNumbers]) => ({ upstreamNumber, targetNumbers: targetNumbers.sort((a, b) => a - b) }));

  const duplicateNumbers = new Set(duplicates.map((duplicate) => duplicate.upstreamNumber));
  const markerMap = new Map<number, ExistingPrMarker>();
  for (const marker of markers) {
    if (!duplicateNumbers.has(marker.upstreamNumber)) markerMap.set(marker.upstreamNumber, marker);
  }

  return { markers, markerMap, duplicates, invalidMarkers };
}

export function planPrIssueActions(input: PlanPrIssueActionsInput): PlanPrIssueActionsResult {
  const targetNormalIssues = input.targetIssues.filter((issue) => !isPullRequestEndpointItem(issue));
  const parseResult = parseExistingPrMarkers(input.targetIssues);
  const failures: PrPlanFailure[] = [
    ...parseResult.duplicates.map((failure) => ({ type: "duplicate-marker" as const, ...failure })),
    ...parseResult.invalidMarkers.map((failure) => ({ type: "invalid-marker" as const, ...failure })),
  ];
  const sanitization = totalSanitization(input.sourcePulls);

  const missingLabels = MANAGED_LABELS.filter((label) => !input.targetLabels.some((targetLabel) => targetLabel.name === label.name));

  if (failures.length > 0) {
    return planResult(input, parseResult, missingLabels, sanitization, [], failures);
  }

  const actions: PlannedPrAction[] = [];
  for (const label of missingLabels) actions.push({ type: "create-label", label });

  for (const sourcePull of input.sourcePulls) {
    const marker = parseResult.markerMap.get(sourcePull.number);
    const title = buildTrackerIssueTitle(sourcePull);
    if (!marker) {
      actions.push({
        type: "create-issue",
        upstreamNumber: sourcePull.number,
        title,
        body: buildTrackerIssueBody(sourcePull),
        labels: buildDecisionLabels([], sourcePull.state, sourcePull.merged, sourcePull.draft),
      });
      continue;
    }

    let body: string;
    try {
      body = mergeTrackerIssueBody(marker.targetBody, sourcePull);
    } catch (error) {
      if (error instanceof MalformedSectionError) {
        failures.push({ type: "malformed-section", targetNumber: marker.targetNumber, reason: error.reason });
        continue;
      }
      throw error;
    }

    const labels = buildDecisionLabels(marker.targetLabels, sourcePull.state, sourcePull.merged, sourcePull.draft);
    if (marker.targetTitle === title && marker.targetBody === body && sameStringSet(marker.targetLabels, labels)) {
      actions.push({ type: "skip-issue", upstreamNumber: sourcePull.number, targetNumber: marker.targetNumber, reason: "already synchronized" });
    } else {
      actions.push({ type: "update-issue", upstreamNumber: sourcePull.number, targetNumber: marker.targetNumber, title, body, labels });
    }
  }

  if (failures.length > 0) {
    return planResult(input, parseResult, missingLabels, sanitization, actions.filter((action) => action.type === "skip-issue"), failures);
  }

  return planResult(input, parseResult, missingLabels, sanitization, actions, failures);
}

export function planPrVerification(input: PlanPrVerificationInput): PlanPrVerificationResult {
  const failures: PrPlanFailure[] = [
    ...input.duplicates.map((failure) => ({ type: "duplicate-marker" as const, ...failure })),
    ...(input.invalidMarkers ?? []).map((failure) => ({ type: "invalid-marker" as const, ...failure })),
  ];

  for (const upstreamNumber of input.upstreamNumbers) {
    if (!input.markerMap.has(upstreamNumber)) failures.push({ type: "missing", upstreamNumber });
  }

  if (input.targetLabels) {
    const labels = new Set(input.targetLabels.map((label) => label.name));
    for (const label of MANAGED_LABELS) {
      if (!labels.has(label.name)) failures.push({ type: "missing-label", label: label.name });
    }
  }

  if (input.sourcePulls && input.targetIssues) {
    const targetByNumber = new Map(input.targetIssues.map((issue) => [issue.number, issue]));
    for (const sourcePull of input.sourcePulls) {
      const marker = input.markerMap.get(sourcePull.number);
      if (!marker) continue;
      const targetIssue = targetByNumber.get(marker.targetNumber);
      if (!targetIssue) {
        failures.push({ type: "marker-mismatch", upstreamNumber: sourcePull.number, targetNumber: marker.targetNumber });
        continue;
      }
      if (targetIssue.title !== buildTrackerIssueTitle(sourcePull)) {
        failures.push({ type: "title-mismatch", upstreamNumber: sourcePull.number, targetNumber: marker.targetNumber });
      }
      if (!(targetIssue.body ?? "").includes(buildPrMarker(sourcePull.number))) {
        failures.push({ type: "marker-mismatch", upstreamNumber: sourcePull.number, targetNumber: marker.targetNumber });
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

export function actionId(action: PlannedPrAction): string {
  if (action.type === "create-label") return `create-label:${action.label.name}`;
  if (action.type === "create-issue") return `create-issue:${action.upstreamNumber}`;
  if (action.type === "update-issue") return `update-issue:${action.upstreamNumber}:${action.targetNumber}`;
  if (action.type === "skip-issue") return `skip-issue:${action.upstreamNumber}:${action.targetNumber}`;
  if (action.type === "duplicate-marker") return `duplicate-marker:${action.upstreamNumber}:${action.targetNumbers.join(",")}`;
  return `invalid-marker:${action.targetNumber}:${action.reason}`;
}

export function stablePlanHash(actions: PlannedPrAction[]): string {
  const material = actions
    .map((planAction) => ({
      id: actionId(planAction),
      type: planAction.type,
      upstreamNumber: "upstreamNumber" in planAction ? planAction.upstreamNumber : undefined,
      targetNumber: "targetNumber" in planAction ? planAction.targetNumber : undefined,
      labelName: planAction.type === "create-label" ? planAction.label.name : undefined,
      title: "title" in planAction ? planAction.title : undefined,
      labels: "labels" in planAction ? planAction.labels : undefined,
      bodySha256: "body" in planAction ? sha256(planAction.body) : undefined,
      reason: "reason" in planAction ? planAction.reason : undefined,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return `sha256:${sha256(JSON.stringify(material))}`;
}

export function isPullRequestEndpointItem(issue: TargetIssue): boolean {
  return issue.pull_request !== undefined && issue.pull_request !== null;
}

function buildManagedSection(sourcePull: SourcePull): string {
  const labels = sourcePull.labels.map((label) => sanitizeRenderedGitHubText(label.name)).join(", ") || "(none)";
  const original = sanitizeImportedMarkdown(sourcePull.body);
  return [
    MANAGED_SECTION_START,
    buildPrMarker(sourcePull.number),
    "",
    `Source: ${sourcePull.html_url}`,
    `Title: ${sanitizeRenderedGitHubText(sourcePull.title)}`,
    `Author: ${sanitizeRenderedGitHubText(sourcePull.user?.login ?? "unknown")}`,
    `State: ${sourcePull.state}`,
    `Draft: ${sourcePull.draft ? "yes" : "no"}`,
    `Merged: ${sourcePull.merged ? "yes" : "no"}`,
    `Head: ${sanitizeRenderedGitHubText(sourcePull.head.repoFullName ?? "unknown")}:${sanitizeRenderedGitHubText(sourcePull.head.ref)} @ ${sourcePull.head.sha}`,
    `Base: ${sanitizeRenderedGitHubText(sourcePull.base.ref)} @ ${sourcePull.base.sha}`,
    `Labels: ${labels}`,
    `Changed files: ${sourcePull.changedFiles}`,
    `Commits: ${sourcePull.commits}`,
    `Created: ${sourcePull.created_at}`,
    `Updated: ${sourcePull.updated_at}`,
    `Closed: ${sourcePull.closed_at ?? "(not closed)"}`,
    `Merged at: ${sourcePull.merged_at ?? "(not merged)"}`,
    "",
    "Original PR body:",
    "",
    original || "(empty)",
    MANAGED_SECTION_END,
  ].join("\n");
}

function buildWorkflowSection(): string {
  return [
    WORKFLOW_SECTION_START,
    "Local branch:",
    "Fork PR:",
    "Fork decision:",
    "Verification:",
    "Notes:",
    WORKFLOW_SECTION_END,
  ].join("\n");
}

function readDelimitedSection(body: string, start: string, end: string, label: string): { startIndex: number; endIndex: number; fullText: string } {
  const starts = allIndexes(body, start);
  const ends = allIndexes(body, end);
  if (starts.length === 0 && label === "workflow") throw new MalformedSectionError("workflow section missing");
  if (starts.length === 0 || ends.length === 0 || starts.length !== 1 || ends.length !== 1) {
    throw new MalformedSectionError(`${label} section delimiter mismatch`);
  }
  if (starts[0] > ends[0]) throw new MalformedSectionError(`${label} section delimiter order invalid`);
  const endIndex = ends[0] + end.length;
  return { startIndex: starts[0], endIndex, fullText: body.slice(starts[0], endIndex) };
}

function sanitizeWithTelemetry(input: string): { text: string; telemetry: SanitizationTelemetry } {
  const telemetry = { neutralizedMentions: 0, neutralizedReferences: 0, neutralizedClosingKeywords: 0 };
  let text = input.replace(repoReferencePattern, (_match, number: string) => {
    telemetry.neutralizedReferences += 1;
    return `rohitg00/agentmemory#<!-- -->${number}`;
  });
  text = text.replace(issueReferencePattern, (match, prefix: string, number: string) => {
    telemetry.neutralizedReferences += 1;
    return `${prefix}#<!-- -->${number}`;
  });
  text = text.replace(mentionPattern, (_match, prefix: string, login: string) => {
    telemetry.neutralizedMentions += 1;
    return `${prefix}@<!-- -->${login}`;
  });
  text = text.replace(closingKeywordPattern, (keyword: string) => {
    telemetry.neutralizedClosingKeywords += 1;
    return breakWord(keyword);
  });
  return { text, telemetry };
}

function totalSanitization(sourcePulls: SourcePull[]): SanitizationTelemetry {
  const total = { neutralizedMentions: 0, neutralizedReferences: 0, neutralizedClosingKeywords: 0 };
  for (const sourcePull of sourcePulls) {
    const { telemetry } = sanitizeImportedMarkdownWithTelemetry(sourcePull.body);
    total.neutralizedMentions += telemetry.neutralizedMentions;
    total.neutralizedReferences += telemetry.neutralizedReferences;
    total.neutralizedClosingKeywords += telemetry.neutralizedClosingKeywords;
  }
  return total;
}

function planResult(
  input: PlanPrIssueActionsInput,
  parseResult: ParseExistingPrMarkersResult,
  missingLabels: ManagedLabel[],
  sanitization: SanitizationTelemetry,
  actions: PlannedPrAction[],
  failures: PrPlanFailure[],
): PlanPrIssueActionsResult {
  return {
    actions,
    failures,
    report: {
      sourcePulls: input.sourcePulls.length,
      targetIssueEndpointItems: input.targetIssues.length,
      targetPullRequestItemsExcluded: input.targetIssues.filter(isPullRequestEndpointItem).length,
      targetNormalIssues: input.targetIssues.filter((issue) => !isPullRequestEndpointItem(issue)).length,
      targetMirrorCount: parseResult.markerMap.size,
      missingManagedLabelCount: missingLabels.length,
      sanitization,
    },
  };
}

function allIndexes(text: string, needle: string): number[] {
  const indexes: number[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    indexes.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return indexes;
}

function breakWord(word: string): string {
  if (word.length <= 3) return `${word[0]}<!-- -->${word.slice(1)}`;
  return `${word.slice(0, 3)}<!-- -->${word.slice(3)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueSorted(values: string[]): string[] {
  return unique(values).sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
