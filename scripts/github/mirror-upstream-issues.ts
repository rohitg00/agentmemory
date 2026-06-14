import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  SOURCE_REPO,
  TARGET_REPO,
  isPullRequestItem,
  parseExistingMirrorMarkers,
  planIssueActions,
  planLabelActions,
  planVerification,
  type GitHubComment,
  type GitHubIssue,
  type GitHubLabel,
  type PlannedAction,
} from "./issue-mirror.js";

const execFileAsync = promisify(execFile);
const githubApiVersion = "2022-11-28";

export type MirrorCliMode = "dry-run" | "apply" | "verify";
export type MirrorReadMode = "public-read" | "read-with-gh";
export type IssueState = "open" | "closed" | "all";

export type MirrorCliOptions = {
  source: string;
  target: string;
  state: IssueState;
  mode: MirrorCliMode;
  includeComments: boolean;
  readMode: MirrorReadMode;
  reportPath: string | null;
  confirmCredentialedReads: boolean;
  confirmRemoteWrites: boolean;
};

export type GitHubMirrorClient = {
  listIssues(repo: string, state: IssueState): Promise<GitHubIssue[]>;
  listLabels(repo: string): Promise<GitHubLabel[]>;
  listComments(repo: string, issueNumber: number): Promise<GitHubComment[]>;
  createLabel(repo: string, label: GitHubLabel): Promise<GitHubLabel>;
  createIssue(repo: string, payload: { title: string; body: string; labels: string[] }): Promise<GitHubIssue>;
  updateIssue(
    repo: string,
    issueNumber: number,
    payload: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" },
  ): Promise<GitHubIssue>;
  createComment(repo: string, issueNumber: number, body: string): Promise<GitHubComment>;
};

export type MirrorCliDeps = {
  publicReader?: GitHubMirrorClient;
  ghClient?: GitHubMirrorClient;
  writeReport?: (path: string, report: MirrorReport) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
};

export type RateLimitStop = {
  operation: string;
  retryAfterSeconds: number | null;
  message: string;
};

export type MirrorReport = {
  source: string;
  target: string;
  state: IssueState;
  mode: MirrorCliMode;
  readMode: MirrorReadMode;
  includeComments: boolean;
  applyConfirmed: boolean;
  credentialedReadsConfirmed: boolean;
  remoteWritesConfirmed: boolean;
  sourceIssueEndpointItems: number;
  sourcePullRequestItemsExcluded: number;
  sourceNonPrIssues: number;
  targetIssueEndpointItems: number;
  targetPullRequestItemsExcluded: number;
  targetNonPrIssues: number;
  targetMirrorCount: number;
  invalidMarkerCount: number;
  duplicateMarkerCount: number;
  plannedActionCounts: Record<string, number>;
  plannedActions: MirrorActionDetail[];
  appliedActions: MirrorActionDetail[];
  failedAction: MirrorActionDetail | null;
  plannedImportedCommentCount: number;
  missingTargetLabelCount: number;
  labelActionCount: number;
  verification: { ok: boolean; failureCount: number; failures: string[] };
  sanitizationCountsAvailable: boolean;
  sanitizationCounts: { mentions: number; references: number; closingKeywords: number };
  rateLimitStop: RateLimitStop | null;
  errors: string[];
};

export type MirrorActionDetail = {
  type: PlannedAction["type"];
  upstreamNumber?: number;
  targetNumber?: number | null;
  labelName?: string;
  title?: string;
  labels?: string[];
  upstreamCommentId?: number | null;
  commentKind?: "overflow" | "imported" | "summary";
  reason?: string;
  targetNumbers?: number[];
  bodyLength?: number;
  bodySha256?: string;
  bodyPreview?: string;
};

export type GhApiRequest = {
  args: string[];
  input?: string;
};

export class RateLimitStopError extends Error {
  operation: string;
  retryAfterSeconds: number | null;

  constructor(operation: string, retryAfterSeconds: number | null, message: string) {
    super(message);
    this.name = "RateLimitStopError";
    this.operation = operation;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function parseCliArgs(args: string[]): MirrorCliOptions {
  const options: MirrorCliOptions = {
    source: SOURCE_REPO,
    target: TARGET_REPO,
    state: "all",
    mode: "dry-run",
    includeComments: false,
    readMode: "public-read",
    reportPath: null,
    confirmCredentialedReads: false,
    confirmRemoteWrites: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--source") options.source = requireValue(args, ++index, arg);
    else if (arg === "--target") options.target = requireValue(args, ++index, arg);
    else if (arg === "--state") options.state = parseState(requireValue(args, ++index, arg));
    else if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--apply") options.mode = "apply";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--include-comments") options.includeComments = true;
    else if (arg === "--public-read") options.readMode = "public-read";
    else if (arg === "--read-with-gh") options.readMode = "read-with-gh";
    else if (arg === "--report") options.reportPath = requireValue(args, ++index, arg);
    else if (arg === "--confirm-credentialed-reads") options.confirmCredentialedReads = true;
    else if (arg === "--confirm-remote-writes") options.confirmRemoteWrites = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.mode === "apply") {
    options.includeComments = args.includes("--include-comments") ? options.includeComments : true;
    options.readMode = "read-with-gh";
  }

  return options;
}

export async function runMirrorCli(args: string[], deps: MirrorCliDeps = {}): Promise<{ exitCode: number; report: MirrorReport }> {
  const options = parseCliArgs(args);
  const report = emptyReport(options);
  const writeReport = deps.writeReport ?? writeJsonReport;

  const gateErrors = validateSafetyGates(options);
  if (gateErrors.length > 0) {
    report.errors.push(...gateErrors);
    await maybeWriteReport(options.reportPath, report, writeReport);
    return { exitCode: 1, report };
  }

  const client = selectClient(options, deps);

  try {
    const inventory = await readInventory(client, options);
    fillInventoryReport(report, inventory);

    const labelActions = planLabelActions(inventory.sourceIssues, inventory.targetLabels);
    const issueActions = planIssueActions({
      sourceIssues: inventory.sourceIssues,
      targetIssues: inventory.targetIssues,
      sourceCommentsByIssue: inventory.sourceCommentsByIssue,
      targetCommentsByIssue: inventory.targetCommentsByIssue,
      targetLabels: inventory.targetLabels,
    });
    const actions = [...labelActions, ...issueActions];
    fillPlannedReport(report, labelActions, actions, inventory);

    if (options.mode === "verify") {
      const verification = runVerification(inventory);
      report.verification = verification;
      await maybeWriteReport(options.reportPath, report, writeReport);
      return { exitCode: verification.ok ? 0 : 1, report };
    }

    if (options.mode === "dry-run") {
      await maybeWriteReport(options.reportPath, report, writeReport);
      return { exitCode: 0, report };
    }

    const markerErrors = actions.filter((action) => action.type === "invalid-marker" || action.type === "duplicate-marker");
    if (markerErrors.length > 0) {
      report.errors.push("Apply stopped because target mirror markers are invalid or duplicated.");
      await maybeWriteReport(options.reportPath, report, writeReport);
      return { exitCode: 1, report };
    }

    const applyResult = await applyActions(client, options, actions, deps.wait ?? sleep, report, writeReport);
    if (applyResult.rateLimited) return { exitCode: 2, report };

    const verifyInventory = await readInventory(client, { ...options, mode: "verify", includeComments: true });
    fillInventoryReport(report, verifyInventory);
    report.verification = runVerification(verifyInventory);
    await maybeWriteReport(options.reportPath, report, writeReport);
    return { exitCode: report.verification.ok ? 0 : 1, report };
  } catch (error) {
    if (error instanceof RateLimitStopError) {
      report.rateLimitStop = {
        operation: error.operation,
        retryAfterSeconds: error.retryAfterSeconds,
        message: error.message,
      };
      await maybeWriteReport(options.reportPath, report, writeReport);
      return { exitCode: 2, report };
    }
    report.errors.push(error instanceof Error ? error.message : String(error));
    await maybeWriteReport(options.reportPath, report, writeReport);
    return { exitCode: 1, report };
  }
}

export function createPublicGitHubReader(fetchImpl: typeof fetch = fetch): GitHubMirrorClient {
  return {
    async listIssues(repo, state) {
      return getPaginated(fetchImpl, `/repos/${repo}/issues?state=${state}&per_page=100`);
    },
    async listLabels(repo) {
      return getPaginated(fetchImpl, `/repos/${repo}/labels?per_page=100`);
    },
    async listComments(repo, issueNumber) {
      return getPaginated(fetchImpl, `/repos/${repo}/issues/${issueNumber}/comments?per_page=100`);
    },
    async createLabel() {
      throw new Error("PublicGitHubReader cannot write labels.");
    },
    async createIssue() {
      throw new Error("PublicGitHubReader cannot write issues.");
    },
    async updateIssue() {
      throw new Error("PublicGitHubReader cannot update issues.");
    },
    async createComment() {
      throw new Error("PublicGitHubReader cannot write comments.");
    },
  };
}

export function createGhGitHubClient(confirmations: { confirmCredentialedReads: boolean; confirmRemoteWrites: boolean }): GitHubMirrorClient {
  function ensureRead(operation: string): void {
    if (!confirmations.confirmCredentialedReads) throw new Error(`${operation} requires --confirm-credentialed-reads`);
  }

  function ensureWrite(operation: string): void {
    ensureRead(operation);
    if (!confirmations.confirmRemoteWrites) throw new Error(`${operation} requires --confirm-remote-writes`);
  }

  return {
    async listIssues(repo, state) {
      const endpoint = `/repos/${repo}/issues?state=${state}&per_page=100`;
      ensureRead(`GET ${endpoint}`);
      return ghGetPaginated(endpoint);
    },
    async listLabels(repo) {
      const endpoint = `/repos/${repo}/labels?per_page=100`;
      ensureRead(`GET ${endpoint}`);
      return ghGetPaginated(endpoint);
    },
    async listComments(repo, issueNumber) {
      const endpoint = `/repos/${repo}/issues/${issueNumber}/comments?per_page=100`;
      ensureRead(`GET ${endpoint}`);
      return ghGetPaginated(endpoint);
    },
    async createLabel(repo, label) {
      const endpoint = `/repos/${repo}/labels`;
      ensureWrite(`POST ${endpoint}`);
      return ghApiJson<GitHubLabel>(buildGhCreateLabelArgs(repo, label));
    },
    async createIssue(repo, payload) {
      const endpoint = `/repos/${repo}/issues`;
      ensureWrite(`POST ${endpoint}`);
      return ghApiJson<GitHubIssue>(buildGhCreateIssueArgs(repo, payload));
    },
    async updateIssue(repo, issueNumber, payload) {
      const endpoint = `/repos/${repo}/issues/${issueNumber}`;
      ensureWrite(`PATCH ${endpoint}`);
      return ghApiJson<GitHubIssue>(buildGhUpdateIssueRequest(repo, issueNumber, payload));
    },
    async createComment(repo, issueNumber, body) {
      const endpoint = `/repos/${repo}/issues/${issueNumber}/comments`;
      ensureWrite(`POST ${endpoint}`);
      return ghApiJson<GitHubComment>(buildGhCreateCommentArgs(repo, issueNumber, body));
    },
  };
}

export function buildGhCreateLabelArgs(repo: string, label: GitHubLabel): string[] {
  return [
    "api",
    `/repos/${repo}/labels`,
    "--method",
    "POST",
    "--raw-field",
    `name=${label.name}`,
    "--raw-field",
    `color=${label.color ?? "ededed"}`,
    "--raw-field",
    `description=${label.description ?? ""}`,
  ];
}

export function buildGhCreateIssueArgs(repo: string, payload: { title: string; body: string; labels: string[] }): string[] {
  const args = ["api", `/repos/${repo}/issues`, "--method", "POST", "--raw-field", `title=${payload.title}`, "--raw-field", `body=${payload.body}`];
  for (const label of payload.labels) args.push("--raw-field", `labels[]=${label}`);
  return args;
}

export function buildGhUpdateIssueArgs(
  repo: string,
  issueNumber: number,
  payload: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" },
): string[] {
  return buildGhUpdateIssueRequest(repo, issueNumber, payload).args;
}

export function buildGhUpdateIssueRequest(
  repo: string,
  issueNumber: number,
  payload: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" },
): GhApiRequest {
  const body: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" } = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.body !== undefined) body.body = payload.body;
  if (payload.state !== undefined) body.state = payload.state;
  if (payload.labels !== undefined) body.labels = payload.labels;
  return {
    args: ["api", `/repos/${repo}/issues/${issueNumber}`, "--method", "PATCH", "--input", "-"],
    input: JSON.stringify(body),
  };
}

export function buildGhCreateCommentArgs(repo: string, issueNumber: number, body: string): string[] {
  return ["api", `/repos/${repo}/issues/${issueNumber}/comments`, "--method", "POST", "--raw-field", `body=${body}`];
}

type Inventory = {
  sourceIssues: GitHubIssue[];
  targetIssues: GitHubIssue[];
  sourceLabels: GitHubLabel[];
  targetLabels: GitHubLabel[];
  sourceCommentsByIssue: Map<number, GitHubComment[]>;
  targetCommentsByIssue: Map<number, GitHubComment[]>;
};

async function readInventory(client: GitHubMirrorClient, options: MirrorCliOptions): Promise<Inventory> {
  const [sourceIssueItems, targetIssueItems, sourceLabels, targetLabels] = await Promise.all([
    client.listIssues(options.source, options.state),
    client.listIssues(options.target, options.state),
    client.listLabels(options.source),
    client.listLabels(options.target),
  ]);
  const sourceIssues = sourceIssueItems.filter((issue) => !isPullRequestItem(issue)).sort((left, right) => left.number - right.number);
  const targetIssues = targetIssueItems.filter((issue) => !isPullRequestItem(issue));
  const sourceCommentsByIssue = new Map<number, GitHubComment[]>();
  const targetCommentsByIssue = new Map<number, GitHubComment[]>();
  const mirrors = parseExistingMirrorMarkers(targetIssues).mirrors;
  const shouldFetchSourceComments = options.mode === "verify" || options.mode === "apply" || options.includeComments;
  const shouldFetchTargetComments = options.mode === "verify" || options.mode === "apply";

  if (shouldFetchSourceComments) {
    await Promise.all(
      sourceIssues
        .filter((issue) => issue.comments > 0)
        .map(async (issue) => {
          sourceCommentsByIssue.set(issue.number, await client.listComments(options.source, issue.number));
        }),
    );
  }

  if (shouldFetchTargetComments) {
    await Promise.all(
      mirrors.map(async (mirror) => {
        targetCommentsByIssue.set(mirror.targetNumber, await client.listComments(options.target, mirror.targetNumber));
      }),
    );
  }

  return { sourceIssues: sourceIssueItems, targetIssues: targetIssueItems, sourceLabels, targetLabels, sourceCommentsByIssue, targetCommentsByIssue };
}

async function applyActions(
  client: GitHubMirrorClient,
  options: MirrorCliOptions,
  actions: PlannedAction[],
  wait: (milliseconds: number) => Promise<void>,
  report: MirrorReport,
  writeReport: (path: string, report: MirrorReport) => Promise<void>,
): Promise<{ rateLimited: boolean }> {
  const createdTargets = new Map<number, number>();

  for (const action of sortActionsForExecution(actions)) {
    try {
      if (action.type === "create-label") {
        await client.createLabel(options.target, action.label);
        report.appliedActions.push(actionDetail(action));
        await maybeWriteReport(options.reportPath, report, writeReport);
        await wait(1000);
      } else if (action.type === "create-issue") {
        const created = await client.createIssue(options.target, { title: action.title, body: action.body, labels: action.labels });
        createdTargets.set(action.upstreamNumber, created.number);
        report.appliedActions.push(actionDetail(action, created.number));
        await maybeWriteReport(options.reportPath, report, writeReport);
        await wait(1000);
      } else if (action.type === "update-issue") {
        await client.updateIssue(options.target, action.targetNumber, { title: action.title, body: action.body, labels: action.labels });
        report.appliedActions.push(actionDetail(action));
        await maybeWriteReport(options.reportPath, report, writeReport);
        await wait(1000);
      } else if (action.type === "create-comment") {
        const targetNumber = action.targetNumber ?? createdTargets.get(action.upstreamNumber);
        if (targetNumber === undefined) throw new Error(`Cannot import comment for upstream issue ${action.upstreamNumber}; target issue is unknown.`);
        await client.createComment(options.target, targetNumber, action.body);
        report.appliedActions.push(actionDetail(action, targetNumber));
        await maybeWriteReport(options.reportPath, report, writeReport);
        await wait(1000);
      } else if (action.type === "close-issue") {
        const targetNumber = action.targetNumber ?? createdTargets.get(action.upstreamNumber);
        if (targetNumber === undefined) throw new Error(`Cannot close mirror for upstream issue ${action.upstreamNumber}; target issue is unknown.`);
        await client.updateIssue(options.target, targetNumber, { state: "closed" });
        report.appliedActions.push(actionDetail(action, targetNumber));
        await maybeWriteReport(options.reportPath, report, writeReport);
        await wait(1000);
      }
    } catch (error) {
      report.failedAction = actionDetail(action);
      if (error instanceof RateLimitStopError) {
        report.rateLimitStop = {
          operation: error.operation,
          retryAfterSeconds: error.retryAfterSeconds,
          message: error.message,
        };
        await maybeWriteReport(options.reportPath, report, writeReport);
        return { rateLimited: true };
      }
      await maybeWriteReport(options.reportPath, report, writeReport);
      throw error;
    }
  }

  if (options.reportPath) await writeReport(options.reportPath, report);
  return { rateLimited: false };
}

function sortActionsForExecution(actions: PlannedAction[]): PlannedAction[] {
  return [...actions].sort((left, right) => actionOrder(left) - actionOrder(right) || actionUpstream(left) - actionUpstream(right));
}

function actionOrder(action: PlannedAction): number {
  if (action.type === "create-label") return 1;
  if (action.type === "create-issue" || action.type === "update-issue" || action.type === "skip-issue") return 2;
  if (action.type === "create-comment") return 3;
  if (action.type === "close-issue") return 4;
  return 0;
}

function actionUpstream(action: PlannedAction): number {
  if ("upstreamNumber" in action) return action.upstreamNumber;
  return 0;
}

function actionDetail(action: PlannedAction, targetNumberOverride?: number): MirrorActionDetail {
  if (action.type === "create-label") {
    return { type: action.type, labelName: action.label.name };
  }
  if (action.type === "create-issue") {
    return withBodyEvidence({
      type: action.type,
      upstreamNumber: action.upstreamNumber,
      targetNumber: targetNumberOverride,
      title: action.title,
      labels: action.labels,
    }, action.body);
  }
  if (action.type === "update-issue") {
    return withBodyEvidence({
      type: action.type,
      upstreamNumber: action.upstreamNumber,
      targetNumber: targetNumberOverride ?? action.targetNumber,
      title: action.title,
      labels: action.labels,
    }, action.body);
  }
  if (action.type === "create-comment") {
    return withBodyEvidence({
      type: action.type,
      upstreamNumber: action.upstreamNumber,
      targetNumber: targetNumberOverride ?? action.targetNumber,
      upstreamCommentId: action.upstreamCommentId,
      commentKind: action.commentKind,
    }, action.body);
  }
  if (action.type === "close-issue") {
    return { type: action.type, upstreamNumber: action.upstreamNumber, targetNumber: targetNumberOverride ?? action.targetNumber };
  }
  if (action.type === "skip-issue") {
    return { type: action.type, upstreamNumber: action.upstreamNumber, targetNumber: action.targetNumber, reason: action.reason };
  }
  if (action.type === "duplicate-marker") {
    return { type: action.type, upstreamNumber: action.upstreamNumber, targetNumbers: action.targetNumbers };
  }
  if (action.type === "invalid-marker") {
    return { type: action.type, targetNumber: action.targetNumber, reason: action.reason };
  }
  return { type: action.type };
}

function withBodyEvidence(detail: MirrorActionDetail, body: string): MirrorActionDetail {
  return {
    ...detail,
    bodyLength: body.length,
    bodySha256: createHash("sha256").update(body).digest("hex"),
    bodyPreview: body.slice(0, 160),
  };
}

function runVerification(inventory: Inventory): MirrorReport["verification"] {
  const verification = planVerification({
    sourceIssues: inventory.sourceIssues,
    targetIssues: inventory.targetIssues,
    sourceCommentsByIssue: inventory.sourceCommentsByIssue,
    targetCommentsByIssue: inventory.targetCommentsByIssue,
    targetLabels: inventory.targetLabels,
  });
  return { ok: verification.ok, failureCount: verification.failures.length, failures: verification.failures };
}

function fillInventoryReport(report: MirrorReport, inventory: Inventory): void {
  const sourceNonPr = inventory.sourceIssues.filter((issue) => !isPullRequestItem(issue));
  const targetNonPr = inventory.targetIssues.filter((issue) => !isPullRequestItem(issue));
  const markers = parseExistingMirrorMarkers(targetNonPr);
  report.sourceIssueEndpointItems = inventory.sourceIssues.length;
  report.sourcePullRequestItemsExcluded = inventory.sourceIssues.length - sourceNonPr.length;
  report.sourceNonPrIssues = sourceNonPr.length;
  report.targetIssueEndpointItems = inventory.targetIssues.length;
  report.targetPullRequestItemsExcluded = inventory.targetIssues.length - targetNonPr.length;
  report.targetNonPrIssues = targetNonPr.length;
  report.targetMirrorCount = markers.mirrors.length;
  report.invalidMarkerCount = markers.invalidMarkers.length;
  report.duplicateMarkerCount = markers.duplicates.length;
  report.sanitizationCountsAvailable = true;
  report.sanitizationCounts = countInventorySanitizations(inventory);
}

function fillPlannedReport(report: MirrorReport, labelActions: PlannedAction[], actions: PlannedAction[], inventory: Inventory): void {
  report.plannedActionCounts = countActions(actions);
  report.plannedActions = sortActionsForExecution(actions).map((action) => actionDetail(action));
  report.missingTargetLabelCount = labelActions.length;
  report.labelActionCount = labelActions.length;
  report.plannedImportedCommentCount =
    report.mode === "dry-run"
      ? inventory.sourceIssues.filter((issue) => !isPullRequestItem(issue)).reduce((total, issue) => total + issue.comments, 0)
      : actions.filter((action) => action.type === "create-comment" && action.upstreamCommentId !== null).length;
}

function countActions(actions: PlannedAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of actions) counts[action.type] = (counts[action.type] ?? 0) + 1;
  return counts;
}

function emptyReport(options: MirrorCliOptions): MirrorReport {
  return {
    source: options.source,
    target: options.target,
    state: options.state,
    mode: options.mode,
    readMode: options.readMode,
    includeComments: options.includeComments,
    applyConfirmed: options.mode === "apply" && options.confirmCredentialedReads && options.confirmRemoteWrites,
    credentialedReadsConfirmed: options.confirmCredentialedReads,
    remoteWritesConfirmed: options.confirmRemoteWrites,
    sourceIssueEndpointItems: 0,
    sourcePullRequestItemsExcluded: 0,
    sourceNonPrIssues: 0,
    targetIssueEndpointItems: 0,
    targetPullRequestItemsExcluded: 0,
    targetNonPrIssues: 0,
    targetMirrorCount: 0,
    invalidMarkerCount: 0,
    duplicateMarkerCount: 0,
    plannedActionCounts: {},
    plannedActions: [],
    appliedActions: [],
    failedAction: null,
    plannedImportedCommentCount: 0,
    missingTargetLabelCount: 0,
    labelActionCount: 0,
    verification: { ok: false, failureCount: 0, failures: [] },
    sanitizationCountsAvailable: false,
    sanitizationCounts: { mentions: 0, references: 0, closingKeywords: 0 },
    rateLimitStop: null,
    errors: [],
  };
}

function validateSafetyGates(options: MirrorCliOptions): string[] {
  const errors: string[] = [];
  if (options.readMode === "read-with-gh" && !options.confirmCredentialedReads) errors.push("--read-with-gh requires --confirm-credentialed-reads");
  if (options.mode === "apply" && !options.confirmCredentialedReads) errors.push("--apply requires --confirm-credentialed-reads");
  if (options.mode === "apply" && !options.confirmRemoteWrites) errors.push("--apply requires --confirm-remote-writes");
  return errors;
}

function selectClient(options: MirrorCliOptions, deps: MirrorCliDeps): GitHubMirrorClient {
  if (options.readMode === "read-with-gh") {
    return deps.ghClient ?? createGhGitHubClient(options);
  }
  return deps.publicReader ?? createPublicGitHubReader();
}

async function getPaginated<T>(fetchImpl: typeof fetch, endpoint: string): Promise<T[]> {
  let url: string | null = `https://api.github.com${endpoint}`;
  const results: T[] = [];
  const operation = `GET ${endpoint}`;

  while (url) {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "agentmemory-issue-mirror",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": githubApiVersion,
      },
    });
    if (!response.ok) throw await classifyHttpError(operation, response);
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

async function ghApiJson<T>(request: string[] | GhApiRequest): Promise<T> {
  const args = Array.isArray(request) ? request : request.args;
  const operation = ghOperation(args);
  try {
    const { stdout } = Array.isArray(request)
      ? await execFileAsync("gh", args, { maxBuffer: 1024 * 1024 * 20 })
      : await execGhApiWithInput(args, request.input ?? "");
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw classifyGhError(operation, error);
  }
}

function execGhApiWithInput(args: string[], input: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });
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
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`gh exited with code ${code}\n${stderr}\n${stdout}`));
    });
    child.stdin.end(input);
  });
}

function classifyGhError(operation: string, error: unknown): Error {
  const maybe = error as { stderr?: string; stdout?: string; message?: string };
  const text = `${maybe.stderr ?? ""}\n${maybe.stdout ?? ""}\n${maybe.message ?? ""}`;
  const retryAfterMatch = text.match(/retry-after:?\s*([0-9]+)/i);
  const retryAfterSeconds = retryAfterMatch ? Number(retryAfterMatch[1]) : null;
  if (/\b(403|429)\b/.test(text) || /secondary rate limit|rate limit|retry-after/i.test(text)) {
    return new RateLimitStopError(operation, retryAfterSeconds, "GitHub rate limit or abuse limit stopped the mirror run.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

function ghOperation(args: string[]): string {
  const methodIndex = args.indexOf("--method");
  const method = methodIndex === -1 ? "GET" : args[methodIndex + 1];
  const endpoint = args.find((arg) => arg.startsWith("/repos/")) ?? "unknown endpoint";
  return `${method} ${endpoint}`;
}

export function flattenGhSlurpPages<T>(pages: unknown): T[] {
  if (!Array.isArray(pages)) throw new Error("Expected gh api --slurp output to be an array of pages.");
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) throw new Error("Expected each gh api --slurp page to be an array.");
    return page as T[];
  });
}

export function countSanitizations(markdown: string | null): { mentions: number; references: number; closingKeywords: number } {
  const input = markdown ?? "";
  return {
    mentions: countMatches(input, /(^|[^\w])@([A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9-]*)?)/g),
    references:
      countMatches(input, /(^|[^\w])#[0-9]+/g) +
      countMatches(input, /\bGH-[0-9]+/gi) +
      countMatches(input, /\b[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*#[0-9]+/g),
    closingKeywords:
      countMatches(input, /\bfix[a-z]*\b/gi) +
      countMatches(input, /\bresolv[a-z]*\b/gi) +
      countMatches(input, /\bclos[a-z]*\b/gi),
  };
}

function countInventorySanitizations(inventory: Inventory): { mentions: number; references: number; closingKeywords: number } {
  const counts = { mentions: 0, references: 0, closingKeywords: 0 };
  for (const issue of inventory.sourceIssues.filter((sourceIssue) => !isPullRequestItem(sourceIssue))) {
    addSanitizationCounts(counts, countSanitizations(issue.body));
    for (const comment of inventory.sourceCommentsByIssue.get(issue.number) ?? []) {
      addSanitizationCounts(counts, countSanitizations(comment.body));
    }
  }
  return counts;
}

function addSanitizationCounts(
  target: { mentions: number; references: number; closingKeywords: number },
  source: { mentions: number; references: number; closingKeywords: number },
): void {
  target.mentions += source.mentions;
  target.references += source.references;
  target.closingKeywords += source.closingKeywords;
}

function countMatches(input: string, pattern: RegExp): number {
  return Array.from(input.matchAll(pattern)).length;
}

async function classifyHttpError(operation: string, response: Response): Promise<Error> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
  const text = await response.text();
  const rateLimited =
    response.status === 429 ||
    response.headers.get("x-ratelimit-remaining") === "0" ||
    /secondary rate limit|rate limit|retry-after/i.test(text);
  if (response.status === 403 && rateLimited) {
    return new RateLimitStopError(operation, retryAfterSeconds, "GitHub public API rate limit stopped the mirror run.");
  }
  if (response.status === 429 || rateLimited) {
    return new RateLimitStopError(operation, retryAfterSeconds, "GitHub API rate limit stopped the mirror run.");
  }
  return new Error(`${operation} failed with ${response.status} ${response.statusText}.`);
}

function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function maybeWriteReport(path: string | null, report: MirrorReport, writer: (path: string, report: MirrorReport) => Promise<void>): Promise<void> {
  if (path) await writer(path, report);
}

async function writeJsonReport(path: string, report: MirrorReport): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseState(value: string): IssueState {
  if (value === "open" || value === "closed" || value === "all") return value;
  throw new Error(`Invalid --state value: ${value}`);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { exitCode, report } = await runMirrorCli(process.argv.slice(2));
  if (report.errors.length > 0) console.error(report.errors.join("\n"));
  if (report.rateLimitStop) console.error(`${report.rateLimitStop.operation}: ${report.rateLimitStop.message}`);
  process.exitCode = exitCode;
}
