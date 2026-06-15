import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  MANAGED_LABELS,
  SOURCE_REPO,
  TARGET_REPO,
  actionId,
  buildPrMarker,
  buildTrackerIssueTitle,
  isPullRequestEndpointItem,
  parseExistingPrMarkers,
  planPrIssueActions,
  planPrVerification,
  stablePlanHash,
  type ManagedLabel,
  type PlannedPrAction,
  type PrPlanFailure,
  type SanitizationTelemetry,
  type SourcePull,
  type TargetIssue,
} from "./upstream-pr-issue-tracker.js";

const execFileAsync = promisify(execFile);
const githubApiVersion = "2022-11-28";

export type PrTrackerMode = "dry-run" | "apply" | "verify";
export type PrTrackerReadMode = "public-read" | "read-with-gh";
export type PrTrackerState = "open" | "closed" | "all";

export type PrTrackerCliOptions = {
  source: string;
  target: string;
  state: PrTrackerState;
  mode: PrTrackerMode;
  readMode: PrTrackerReadMode;
  fromReport: string | null;
  report: string | null;
  confirmCredentialedReads: boolean;
  confirmRemoteWrites: boolean;
  createMissingOnly: boolean;
  writeDelayMs: number;
};

export type PrTrackerReader = {
  listPulls(input: { repo: string; state: PrTrackerState }): Promise<SourcePull[]>;
  listTargetIssues(input: { repo: string }): Promise<TargetIssue[]>;
  listLabels(input: { repo: string }): Promise<Array<{ name: string; color?: string; description?: string | null }>>;
};

export type PrTrackerWriter = {
  createLabel(action: Extract<PlannedPrAction, { type: "create-label" }>): Promise<{ url: string | null }>;
  createIssue(action: Extract<PlannedPrAction, { type: "create-issue" }>): Promise<{ number: number; url: string }>;
  updateIssue(action: Extract<PlannedPrAction, { type: "update-issue" }>): Promise<{ number: number; url: string }>;
};

export type StopCondition = {
  classification: "rate-limit" | "spam-abuse" | "authentication" | "permission" | "validation" | "unknown";
  statusCode: number | null;
  endpoint: string | null;
  retryAfterSeconds: number | null;
  resetAt: string | null;
  message: string;
};

export type TrackerActionDetail = {
  id: string;
  type: PlannedPrAction["type"];
  upstreamNumber?: number;
  targetNumber?: number | null;
  labelName?: string;
  title?: string;
  labels?: string[];
  targetNumbers?: number[];
  reason?: string;
  bodyLength?: number;
  bodySha256?: string;
  url?: string | null;
};

export type TrackerReport = {
  source: string;
  target: string;
  mode: PrTrackerMode;
  state: PrTrackerState;
  sourcePulls: number;
  targetIssues: number;
  targetIssueEndpointItems: number;
  targetPullRequestItemsExcluded: number;
  targetNormalIssues: number;
  targetLabels: number;
  targetMirrorCount: number;
  plannedActions: TrackerActionDetail[];
  planHash: string;
  appliedActions: TrackerActionDetail[];
  skippedActions: TrackerActionDetail[];
  failedAction: TrackerActionDetail | null;
  stopCondition: StopCondition | null;
  sanitization: SanitizationTelemetry;
  failures: PrPlanFailure[];
  wroteRemote: boolean;
  generatedAt: string;
};

export type GhIssuePayloadRequest = {
  args: string[];
  payloadPath: string;
};

export class PrTrackerStopError extends Error {
  stopCondition: StopCondition;

  constructor(stopCondition: StopCondition) {
    super(stopCondition.message);
    this.name = "PrTrackerStopError";
    this.stopCondition = stopCondition;
  }
}

export function parseCliArgs(args: string[]): PrTrackerCliOptions {
  const options: PrTrackerCliOptions = {
    source: SOURCE_REPO,
    target: TARGET_REPO,
    state: "all",
    mode: "dry-run",
    readMode: "public-read",
    fromReport: null,
    report: null,
    confirmCredentialedReads: false,
    confirmRemoteWrites: false,
    createMissingOnly: false,
    writeDelayMs: 1000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--source") options.source = requireValue(args, ++index, arg);
    else if (arg === "--target") options.target = requireValue(args, ++index, arg);
    else if (arg === "--state") options.state = parseState(requireValue(args, ++index, arg));
    else if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--apply") options.mode = "apply";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--from-report") options.fromReport = requireValue(args, ++index, arg);
    else if (arg === "--report") options.report = requireValue(args, ++index, arg);
    else if (arg === "--public-read") options.readMode = "public-read";
    else if (arg === "--read-with-gh") options.readMode = "read-with-gh";
    else if (arg === "--confirm-credentialed-reads") options.confirmCredentialedReads = true;
    else if (arg === "--confirm-remote-writes") options.confirmRemoteWrites = true;
    else if (arg === "--create-missing-only") options.createMissingOnly = true;
    else if (arg === "--write-delay-ms") options.writeDelayMs = parsePositiveInteger(requireValue(args, ++index, arg), arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.mode === "apply") options.readMode = "read-with-gh";

  const errors = validateCliOptions(options);
  if (errors.length > 0) throw new Error(errors[0]);
  return options;
}

export async function runPrTracker(options: {
  mode: PrTrackerMode;
  source: string;
  target: string;
  state: PrTrackerState;
  fromReport?: string;
  report: string;
  confirmCredentialedReads: boolean;
  confirmRemoteWrites: boolean;
  createMissingOnly?: boolean;
  reader: PrTrackerReader;
  writer?: PrTrackerWriter;
  checkpointReport?: (report: TrackerReport) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  writeDelayMs?: number;
}): Promise<TrackerReport> {
  const checkpointReport = options.checkpointReport ?? ((report) => writeJsonReport(options.report, report));
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const inventory = await readInventory(options.reader, options.source, options.target, options.state);
  const plan = planPrIssueActions({
    sourcePulls: inventory.sourcePulls,
    targetIssues: inventory.targetIssues,
    targetLabels: inventory.targetLabels,
  });
  const verification = buildVerification(inventory);
  const actions = options.createMissingOnly && options.mode !== "verify" ? createMissingOnlyActions(plan.actions) : plan.actions;
  const report = buildReport(options, inventory, actions, options.mode === "verify" ? verification.failures : plan.failures);

  if (options.mode === "verify") {
    await writeJsonReport(options.report, report);
    return report;
  }

  if (options.mode === "dry-run") {
    await writeJsonReport(options.report, report);
    return report;
  }

  if (!options.confirmCredentialedReads || !options.confirmRemoteWrites) {
    report.failures.push({ type: "plan-drift", reason: "apply requires credentialed reads and remote writes confirmation" });
    await writeJsonReport(options.report, report);
    return report;
  }
  if (!options.fromReport) {
    report.failures.push({ type: "plan-drift", reason: "apply requires a reviewed dry-run report" });
    await writeJsonReport(options.report, report);
    return report;
  }
  if (!options.writer) {
    report.failures.push({ type: "plan-drift", reason: "apply requires a writer" });
    await writeJsonReport(options.report, report);
    return report;
  }

  const reviewedReport = JSON.parse(await readFile(options.fromReport, "utf8")) as TrackerReport;
  const drift = compareReviewedPlan(reviewedReport, report);
  if (drift) {
    report.failures.push({ type: "plan-drift", reason: drift });
    await writeJsonReport(options.report, report);
    return report;
  }
  if (report.failures.length > 0) {
    await writeJsonReport(options.report, report);
    return report;
  }

  for (const action of actions) {
    const detail = actionDetail(action);
    if (action.type === "skip-issue") {
      report.skippedActions.push(detail);
      continue;
    }
    if (action.type === "duplicate-marker" || action.type === "invalid-marker") {
      report.failedAction = detail;
      report.stopCondition = {
        classification: "validation",
        statusCode: null,
        endpoint: null,
        retryAfterSeconds: null,
        resetAt: null,
        message: "Apply stopped because tracker markers are invalid.",
      };
      await checkpointReport(report);
      break;
    }

    try {
      if (action.type === "create-label") {
        const result = await options.writer.createLabel(action);
        report.appliedActions.push({ ...detail, url: result.url });
      } else if (action.type === "create-issue") {
        const result = await options.writer.createIssue(action);
        report.appliedActions.push({ ...detail, targetNumber: result.number, url: result.url });
      } else if (action.type === "update-issue") {
        const result = await options.writer.updateIssue(action);
        report.appliedActions.push({ ...detail, targetNumber: result.number, url: result.url });
      }
      report.wroteRemote = true;
      await checkpointReport(report);
      await sleep(options.writeDelayMs ?? 1000);
    } catch (error) {
      report.failedAction = detail;
      report.stopCondition = error instanceof PrTrackerStopError ? error.stopCondition : unknownStopCondition(error);
      await checkpointReport(report);
      break;
    }
  }

  await writeJsonReport(options.report, report);
  return report;
}

function createMissingOnlyActions(actions: PlannedPrAction[]): PlannedPrAction[] {
  return actions.filter((action) => action.type === "create-label" || action.type === "create-issue");
}

export function createPublicGitHubReader(fetchImpl: typeof fetch = fetch): PrTrackerReader {
  return {
    async listPulls({ repo, state }) {
      const pulls = await getPaginated<RawPull>(fetchImpl, `/repos/${repo}/pulls?state=${state}&per_page=100`);
      return pulls.map(mapRawPull);
    },
    async listTargetIssues({ repo }) {
      const issues = await getPaginated<RawIssue>(fetchImpl, `/repos/${repo}/issues?state=all&per_page=100`);
      return issues.map(mapRawIssue);
    },
    async listLabels({ repo }) {
      return getPaginated(fetchImpl, `/repos/${repo}/labels?per_page=100`);
    },
  };
}

export function createGhGitHubClient(): PrTrackerReader & PrTrackerWriter {
  return {
    async listPulls({ repo, state }) {
      const pulls = await ghGetPaginated<RawPull>(`/repos/${repo}/pulls?state=${state}&per_page=100`);
      return pulls.map(mapRawPull);
    },
    async listTargetIssues({ repo }) {
      const issues = await ghGetPaginated<RawIssue>(`/repos/${repo}/issues?state=all&per_page=100`);
      return issues.map(mapRawIssue);
    },
    async listLabels({ repo }) {
      return ghGetPaginated(`/repos/${repo}/labels?per_page=100`);
    },
    async createLabel(action) {
      const result = await ghApiJson<{ html_url?: string }>([
        "api",
        "--method",
        "POST",
        `/repos/${TARGET_REPO}/labels`,
        "--field",
        `name=${action.label.name}`,
        "--field",
        `color=${action.label.color}`,
        "--field",
        `description=${action.label.description}`,
      ]);
      return { url: result.html_url ?? null };
    },
    async createIssue(action) {
      return writeIssuePayload(TARGET_REPO, action);
    },
    async updateIssue(action) {
      return writeIssuePayload(TARGET_REPO, action);
    },
  };
}

export async function buildGhIssuePayloadRequest(
  targetRepo: string,
  action: Extract<PlannedPrAction, { type: "create-issue" | "update-issue" }>,
  directory: string,
): Promise<GhIssuePayloadRequest> {
  const marker = buildPrMarker(action.upstreamNumber);
  const payload = {
    title: action.title,
    body: action.body,
    labels: action.labels,
  };
  validateIssuePayload(payload, marker);
  const payloadPath = join(directory, `upstream-pr-${action.upstreamNumber}-${action.type}.json`);
  await writeFile(payloadPath, JSON.stringify(payload, null, 2));
  const endpoint = action.type === "create-issue" ? `/repos/${targetRepo}/issues` : `/repos/${targetRepo}/issues/${action.targetNumber}`;
  const method = action.type === "create-issue" ? "POST" : "PATCH";
  return { args: ["api", "--method", method, endpoint, "--input", payloadPath], payloadPath };
}

export function flattenGhSlurpPages<T>(pages: unknown): T[] {
  if (!Array.isArray(pages)) throw new Error("Expected gh api --slurp output to be an array of pages.");
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) throw new Error("Expected each gh api --slurp page to be an array.");
    return page as T[];
  });
}

async function readInventory(reader: PrTrackerReader, source: string, target: string, state: PrTrackerState) {
  const [sourcePulls, targetIssues, targetLabels] = await Promise.all([
    reader.listPulls({ repo: source, state }),
    reader.listTargetIssues({ repo: target }),
    reader.listLabels({ repo: target }),
  ]);
  return { sourcePulls, targetIssues, targetLabels };
}

function buildVerification(inventory: { sourcePulls: SourcePull[]; targetIssues: TargetIssue[]; targetLabels: Array<{ name: string }> }) {
  const parsed = parseExistingPrMarkers(inventory.targetIssues);
  return planPrVerification({
    upstreamNumbers: inventory.sourcePulls.map((sourcePull) => sourcePull.number),
    markerMap: parsed.markerMap,
    duplicates: parsed.duplicates,
    invalidMarkers: parsed.invalidMarkers,
    targetLabels: inventory.targetLabels,
    sourcePulls: inventory.sourcePulls,
    targetIssues: inventory.targetIssues.filter((issue) => !isPullRequestEndpointItem(issue)),
  });
}

function buildReport(
  options: { mode: PrTrackerMode; source: string; target: string; state: PrTrackerState },
  inventory: { sourcePulls: SourcePull[]; targetIssues: TargetIssue[]; targetLabels: Array<{ name: string }> },
  actions: PlannedPrAction[],
  failures: PrPlanFailure[],
): TrackerReport {
  const targetNormalIssues = inventory.targetIssues.filter((issue) => !isPullRequestEndpointItem(issue));
  const parsed = parseExistingPrMarkers(inventory.targetIssues);
  const plan = planPrIssueActions({ sourcePulls: inventory.sourcePulls, targetIssues: inventory.targetIssues, targetLabels: inventory.targetLabels });
  return {
    source: options.source,
    target: options.target,
    mode: options.mode,
    state: options.state,
    sourcePulls: inventory.sourcePulls.length,
    targetIssues: targetNormalIssues.length,
    targetIssueEndpointItems: inventory.targetIssues.length,
    targetPullRequestItemsExcluded: inventory.targetIssues.length - targetNormalIssues.length,
    targetNormalIssues: targetNormalIssues.length,
    targetLabels: inventory.targetLabels.length,
    targetMirrorCount: parsed.markerMap.size,
    plannedActions: actions.map(actionDetail),
    planHash: stablePlanHash(actions),
    appliedActions: [],
    skippedActions: [],
    failedAction: null,
    stopCondition: null,
    sanitization: plan.report.sanitization,
    failures,
    wroteRemote: false,
    generatedAt: new Date().toISOString(),
  };
}

function compareReviewedPlan(reviewed: TrackerReport, current: TrackerReport): string | null {
  if (reviewed.mode !== "dry-run") return "reviewed report is not a dry-run report";
  if (reviewed.sourcePulls !== current.sourcePulls) return "source PR count differs from reviewed dry-run report";
  if (reviewed.targetNormalIssues !== current.targetNormalIssues) return "target issue count differs from reviewed dry-run report";
  if (reviewed.targetLabels !== current.targetLabels) return "target label count differs from reviewed dry-run report";
  const reviewedIds = reviewed.plannedActions.map((action) => action.id).sort();
  const currentIds = current.plannedActions.map((action) => action.id).sort();
  if (JSON.stringify(reviewedIds) !== JSON.stringify(currentIds)) return "planned action IDs differ from reviewed dry-run report";
  if (reviewed.planHash !== current.planHash) return "plan hash differs from reviewed dry-run report";
  return null;
}

function actionDetail(action: PlannedPrAction): TrackerActionDetail {
  return {
    id: actionId(action),
    type: action.type,
    upstreamNumber: "upstreamNumber" in action ? action.upstreamNumber : undefined,
    targetNumber: "targetNumber" in action ? action.targetNumber : null,
    labelName: action.type === "create-label" ? action.label.name : undefined,
    title: "title" in action ? action.title : undefined,
    labels: "labels" in action ? action.labels : undefined,
    targetNumbers: action.type === "duplicate-marker" ? action.targetNumbers : undefined,
    reason: "reason" in action ? action.reason : undefined,
    bodyLength: "body" in action ? action.body.length : undefined,
    bodySha256: "body" in action ? `sha256:${sha256(action.body)}` : undefined,
  };
}

async function getPaginated<T>(fetchImpl: typeof fetch, endpoint: string): Promise<T[]> {
  let url: string | null = `https://api.github.com${endpoint}`;
  const results: T[] = [];
  while (url) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": githubApiVersion,
        "User-Agent": "agentmemory-upstream-pr-tracker",
      },
    });
    if (!response.ok) throw await classifyHttpError(`GET ${endpoint}`, response);
    const page = (await response.json()) as T[];
    results.push(...page);
    url = nextLink(response.headers.get("link"));
  }
  return results;
}

async function ghGetPaginated<T>(endpoint: string): Promise<T[]> {
  const pages = await ghApiJson<unknown>(["api", "--paginate", "--slurp", endpoint]);
  return flattenGhSlurpPages<T>(pages);
}

async function ghApiJson<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync("gh", args, { maxBuffer: 1024 * 1024 * 20 });
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw classifyGhError(ghOperation(args), error);
  }
}

async function execGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gh exited with code ${code}\n${stderr}\n${stdout}`));
    });
  });
}

async function writeIssuePayload(
  targetRepo: string,
  action: Extract<PlannedPrAction, { type: "create-issue" | "update-issue" }>,
): Promise<{ number: number; url: string }> {
  const dir = await mkdtemp(join(tmpdir(), "agentmemory-pr-tracker-"));
  try {
    const request = await buildGhIssuePayloadRequest(targetRepo, action, dir);
    const stdout = await execGh(request.args);
    const result = JSON.parse(stdout) as { number: number; html_url: string };
    return { number: result.number, url: result.html_url };
  } catch (error) {
    throw classifyGhError(action.type === "create-issue" ? `POST /repos/${targetRepo}/issues` : `PATCH /repos/${targetRepo}/issues/${action.targetNumber}`, error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validateIssuePayload(payload: { title: string; body: string; labels: string[] }, marker: string): void {
  if (!payload.title.trim()) throw new Error("Issue payload title must be nonempty.");
  if (!Array.isArray(payload.labels) || !payload.labels.every((label) => typeof label === "string")) throw new Error("Issue payload labels must be strings.");
  if (typeof payload.body !== "string") throw new Error("Issue payload body must be a string.");
  const markerCount = payload.body.split(marker).length - 1;
  if (markerCount !== 1) throw new Error("Issue payload body must contain exactly one upstream PR marker.");
  const rendered = stripSafeGeneratedText(`${payload.title}\n${payload.body}`);
  if (/(^|[^A-Za-z0-9_`])@[A-Za-z0-9][A-Za-z0-9-]{0,38}\b/.test(rendered)) throw new Error("Issue payload contains an unsafe mention.");
  if (/(^|[^\w/])#[0-9]+\b/.test(rendered)) throw new Error("Issue payload contains an unsafe same-repository reference.");
  if (/(^|\n)\s*(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b/i.test(rendered)) {
    throw new Error("Issue payload contains an unsafe closing keyword.");
  }
}

function stripSafeGeneratedText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "_")
    .replace(/https:\/\/github\.com\/[^\s)]+/g, " ")
    .replace(/\bupstream PR [0-9]+\b/g, " ")
    .replace(/^Closed:.*$/gm, " ")
    .replace(/\bOriginal PR body:\b/g, " ")
    .replace(/\bFork decision:\b/g, " ")
    .replace(/\bState:\b/g, " ")
    .replace(/\(not closed\)/g, " ");
}

function mapRawPull(raw: RawPull): SourcePull {
  return {
    number: Number(raw.number),
    title: String(raw.title ?? ""),
    state: raw.state === "closed" ? "closed" : "open",
    draft: Boolean(raw.draft),
    merged: Boolean(raw.merged_at ?? raw.merged),
    html_url: String(raw.html_url ?? ""),
    user: raw.user && typeof raw.user.login === "string" ? { login: raw.user.login } : null,
    body: typeof raw.body === "string" ? raw.body : null,
    head: {
      repoFullName: raw.head?.repo?.full_name ?? raw.head?.repoFullName ?? null,
      ref: String(raw.head?.ref ?? ""),
      sha: String(raw.head?.sha ?? ""),
    },
    base: { ref: String(raw.base?.ref ?? ""), sha: String(raw.base?.sha ?? "") },
    labels: Array.isArray(raw.labels) ? raw.labels.map((label) => ({ name: String(label.name ?? ""), color: label.color, description: label.description })) : [],
    changedFiles: Number(raw.changed_files ?? raw.changedFiles ?? 0),
    commits: Number(raw.commits ?? 0),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    closed_at: typeof raw.closed_at === "string" ? raw.closed_at : null,
    merged_at: typeof raw.merged_at === "string" ? raw.merged_at : null,
  };
}

function mapRawIssue(raw: RawIssue): TargetIssue {
  return {
    number: Number(raw.number),
    title: String(raw.title ?? ""),
    body: typeof raw.body === "string" ? raw.body : null,
    labels: Array.isArray(raw.labels) ? raw.labels.map((label) => (typeof label === "string" ? label : String(label.name ?? ""))) : [],
    state: raw.state === "closed" ? "closed" : "open",
    pull_request: raw.pull_request,
  };
}

async function writeJsonReport(path: string, report: TrackerReport): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}

function validateCliOptions(options: PrTrackerCliOptions): string[] {
  const errors: string[] = [];
  if (options.readMode === "read-with-gh" && !options.confirmCredentialedReads) errors.push("--read-with-gh requires --confirm-credentialed-reads");
  if (options.mode === "apply" && !options.confirmCredentialedReads) errors.push("--apply requires --confirm-credentialed-reads");
  if (options.mode === "apply" && !options.confirmRemoteWrites) errors.push("--apply requires --confirm-remote-writes");
  if (options.mode === "apply" && !options.fromReport) errors.push("--apply requires --from-report");
  if ((options.mode === "apply" || options.mode === "verify") && !options.report) errors.push(`--${options.mode} requires --report`);
  return errors;
}

function parseState(value: string): PrTrackerState {
  if (value === "open" || value === "closed" || value === "all") return value;
  throw new Error(`Invalid --state value: ${value}`);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} requires a positive integer`);
  return parsed;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2] === "next") return match[1];
  }
  return null;
}

async function classifyHttpError(operation: string, response: Response): Promise<Error> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
  const resetAt = response.headers.get("x-ratelimit-reset") ? new Date(Number(response.headers.get("x-ratelimit-reset")) * 1000).toISOString() : null;
  const text = await response.text();
  return new PrTrackerStopError({
    classification: classifyStop(response.status, text),
    statusCode: response.status,
    endpoint: operation,
    retryAfterSeconds,
    resetAt,
    message: safeMessage(text || response.statusText),
  });
}

function classifyGhError(operation: string, error: unknown): Error {
  const text = error instanceof Error ? error.message : String(error);
  const status = Number(text.match(/\b(401|403|422|429|500)\b/)?.[1] ?? 0) || null;
  if (status || /secondary rate limit|rate limit|retry-after|spam|abuse|validation|permission|authentication/i.test(text)) {
    return new PrTrackerStopError({
      classification: classifyStop(status, text),
      statusCode: status,
      endpoint: operation,
      retryAfterSeconds: Number(text.match(/retry-after:?\s*([0-9]+)/i)?.[1] ?? 0) || null,
      resetAt: null,
      message: safeMessage(text),
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}

function classifyStop(statusCode: number | null, text: string): StopCondition["classification"] {
  if (statusCode === 401 || /authentication|bad credentials/i.test(text)) return "authentication";
  if (statusCode === 422 || /validation/i.test(text)) return "validation";
  if (/spam|abuse/i.test(text)) return "spam-abuse";
  if (statusCode === 429 || /secondary rate limit|rate limit|retry-after/i.test(text)) return "rate-limit";
  if (statusCode === 403 || /permission|forbidden/i.test(text)) return "permission";
  return "unknown";
}

function unknownStopCondition(error: unknown): StopCondition {
  return {
    classification: "unknown",
    statusCode: null,
    endpoint: null,
    retryAfterSeconds: null,
    resetAt: null,
    message: safeMessage(error instanceof Error ? error.message : String(error)),
  };
}

function safeMessage(text: string): string {
  return text.replace(/[A-Za-z0-9_=-]{20,}/g, "[redacted]").slice(0, 500);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ghOperation(args: string[]): string {
  const methodIndex = args.indexOf("--method");
  const method = methodIndex === -1 ? "GET" : args[methodIndex + 1];
  const endpoint = args.find((arg) => arg.startsWith("/repos/")) ?? "unknown endpoint";
  return `${method} ${endpoint}`;
}

type RawPull = {
  number?: number;
  title?: string;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  html_url?: string;
  user?: { login?: string } | null;
  body?: string | null;
  head?: { repo?: { full_name?: string } | null; repoFullName?: string | null; ref?: string; sha?: string };
  base?: { ref?: string; sha?: string };
  labels?: Array<{ name?: string; color?: string; description?: string | null }>;
  changed_files?: number;
  changedFiles?: number;
  commits?: number;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
};

type RawIssue = {
  number?: number;
  title?: string;
  body?: string | null;
  labels?: Array<string | { name?: string }>;
  state?: string;
  pull_request?: unknown;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const reader = options.readMode === "read-with-gh" ? createGhGitHubClient() : createPublicGitHubReader();
  const writer = options.mode === "apply" ? createGhGitHubClient() : undefined;
  const report = await runPrTracker({
    mode: options.mode,
    source: options.source,
    target: options.target,
    state: options.state,
    fromReport: options.fromReport ?? undefined,
    report: options.report ?? "pr-tracker-report.json",
    confirmCredentialedReads: options.confirmCredentialedReads,
    confirmRemoteWrites: options.confirmRemoteWrites,
    createMissingOnly: options.createMissingOnly,
    reader,
    writer,
    writeDelayMs: options.writeDelayMs,
  });
  process.exitCode = report.failures.length === 0 && report.stopCondition === null ? 0 : 1;
}

if (process.argv[1]?.endsWith("track-upstream-prs-as-issues.ts")) {
  main().catch((error: unknown) => {
    console.error(safeMessage(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
