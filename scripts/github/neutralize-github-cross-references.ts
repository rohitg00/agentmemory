import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  planCrossReferenceNeutralization,
  type NeutralizationIssueInput,
  type NeutralizationPlan,
  type NeutralizationUpdate,
} from "./github-cross-reference-neutralizer.js";

const execFileAsync = promisify(execFile);

export type CrossReferenceNeutralizerMode = "dry-run" | "apply" | "verify";

export type CrossReferenceNeutralizerOptions = {
  source: string;
  target: string;
  mode: CrossReferenceNeutralizerMode;
  report: string | null;
  confirmCredentialedReads: boolean;
  confirmRemoteWrites: boolean;
  writeDelayMs: number;
};

export type CrossReferenceNeutralizerClient = {
  listIssues(repo: string): Promise<Array<{ number: number; body: string | null; comments: number; pull_request?: unknown }>>;
  listComments(repo: string, issueNumber: number): Promise<Array<{ id: number; body: string | null }>>;
  updateIssue(repo: string, issueNumber: number, body: string): Promise<void>;
  updateComment(repo: string, commentId: number, body: string): Promise<void>;
};

export type CrossReferenceNeutralizerReport = {
  source: string;
  target: string;
  mode: CrossReferenceNeutralizerMode;
  generatedAt: string;
  scannedIssues: number;
  scannedComments: number;
  issueUpdateCount: number;
  commentUpdateCount: number;
  beforeActiveReferences: number;
  afterActiveReferences: number;
  plannedIssueUpdates: NeutralizationUpdateDetail[];
  plannedCommentUpdates: NeutralizationUpdateDetail[];
  appliedIssueUpdates: NeutralizationUpdateDetail[];
  appliedCommentUpdates: NeutralizationUpdateDetail[];
  failedUpdate: NeutralizationUpdateDetail | null;
  wroteRemote: boolean;
  errors: string[];
};

export type NeutralizationUpdateDetail = {
  issueNumber: number;
  commentId?: number;
  beforeActiveReferences: number;
  afterActiveReferences: number;
  markers: number;
  urls: number;
  repoReferences: number;
  beforeLength: number;
  afterLength: number;
};

export type CrossReferenceNeutralizerDeps = {
  client?: CrossReferenceNeutralizerClient;
  writeReport?: (path: string, report: CrossReferenceNeutralizerReport) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
};

export function parseCliArgs(args: string[]): CrossReferenceNeutralizerOptions {
  const options: CrossReferenceNeutralizerOptions = {
    source: "rohitg00/agentmemory",
    target: "wbugitlab1/agentmemory",
    mode: "dry-run",
    report: null,
    confirmCredentialedReads: false,
    confirmRemoteWrites: false,
    writeDelayMs: 1000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--source") options.source = requireValue(args, ++index, arg);
    else if (arg === "--target") options.target = requireValue(args, ++index, arg);
    else if (arg === "--report") options.report = requireValue(args, ++index, arg);
    else if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--apply") options.mode = "apply";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--confirm-credentialed-reads") options.confirmCredentialedReads = true;
    else if (arg === "--confirm-remote-writes") options.confirmRemoteWrites = true;
    else if (arg === "--write-delay-ms") options.writeDelayMs = parsePositiveInteger(requireValue(args, ++index, arg), arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.mode === "apply" && !options.confirmCredentialedReads) throw new Error("--apply requires --confirm-credentialed-reads");
  if (options.mode === "apply" && !options.confirmRemoteWrites) throw new Error("--apply requires --confirm-remote-writes");
  if (options.mode === "verify" && !options.confirmCredentialedReads) throw new Error("--verify requires --confirm-credentialed-reads");
  return options;
}

export async function runCrossReferenceNeutralizer(
  args: string[],
  deps: CrossReferenceNeutralizerDeps = {},
): Promise<{ exitCode: number; report: CrossReferenceNeutralizerReport }> {
  const options = parseCliArgs(args);
  const client = deps.client ?? createGhNeutralizerClient();
  const writeReport = deps.writeReport ?? writeJsonReport;
  const wait = deps.wait ?? sleep;
  const report = emptyReport(options);

  if (!options.confirmCredentialedReads) {
    report.errors.push("Credentialed target reads require --confirm-credentialed-reads.");
    await maybeWriteReport(options.report, report, writeReport);
    return { exitCode: 1, report };
  }

  try {
    const inventory = await readInventory(client, options.target);
    const plan = planCrossReferenceNeutralization({ sourceRepo: options.source, issues: inventory });
    fillReport(report, plan);

    if (options.mode === "dry-run") {
      await maybeWriteReport(options.report, report, writeReport);
      return { exitCode: 0, report };
    }

    if (options.mode === "verify") {
      await maybeWriteReport(options.report, report, writeReport);
      return { exitCode: plan.afterActiveReferences === 0 ? 0 : 1, report };
    }

    for (const update of plan.issueUpdates) {
      const detail = updateDetail(update);
      try {
        await client.updateIssue(options.target, update.issueNumber, update.after);
        report.appliedIssueUpdates.push(detail);
        report.wroteRemote = true;
        await maybeWriteReport(options.report, report, writeReport);
        await wait(options.writeDelayMs);
      } catch (error) {
        report.failedUpdate = detail;
        report.errors.push(error instanceof Error ? error.message : String(error));
        await maybeWriteReport(options.report, report, writeReport);
        return { exitCode: 2, report };
      }
    }

    for (const update of plan.commentUpdates) {
      const detail = updateDetail(update);
      try {
        if (update.commentId === undefined) throw new Error(`Missing comment id for issue ${update.issueNumber}.`);
        await client.updateComment(options.target, update.commentId, update.after);
        report.appliedCommentUpdates.push(detail);
        report.wroteRemote = true;
        await maybeWriteReport(options.report, report, writeReport);
        await wait(options.writeDelayMs);
      } catch (error) {
        report.failedUpdate = detail;
        report.errors.push(error instanceof Error ? error.message : String(error));
        await maybeWriteReport(options.report, report, writeReport);
        return { exitCode: 2, report };
      }
    }

    const verifyInventory = await readInventory(client, options.target);
    const verifyPlan = planCrossReferenceNeutralization({ sourceRepo: options.source, issues: verifyInventory });
    fillReport(report, verifyPlan);
    await maybeWriteReport(options.report, report, writeReport);
    return { exitCode: verifyPlan.afterActiveReferences === 0 ? 0 : 1, report };
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    await maybeWriteReport(options.report, report, writeReport);
    return { exitCode: 1, report };
  }
}

export function createGhNeutralizerClient(): CrossReferenceNeutralizerClient {
  return {
    async listIssues(repo) {
      const issues = await ghGetPaginated<RawIssue>(`/repos/${repo}/issues?state=all&per_page=100`);
      return issues.map((issue) => ({
        number: Number(issue.number),
        body: typeof issue.body === "string" ? issue.body : null,
        comments: Number(issue.comments ?? 0),
        pull_request: issue.pull_request,
      }));
    },
    async listComments(repo, issueNumber) {
      const comments = await ghGetPaginated<RawComment>(`/repos/${repo}/issues/${issueNumber}/comments?per_page=100`);
      return comments.map((comment) => ({ id: Number(comment.id), body: typeof comment.body === "string" ? comment.body : null }));
    },
    async updateIssue(repo, issueNumber, body) {
      await writePatchPayload(`/repos/${repo}/issues/${issueNumber}`, { body });
    },
    async updateComment(repo, commentId, body) {
      await writePatchPayload(`/repos/${repo}/issues/comments/${commentId}`, { body });
    },
  };
}

async function readInventory(client: CrossReferenceNeutralizerClient, target: string): Promise<NeutralizationIssueInput[]> {
  const issues = (await client.listIssues(target)).filter((issue) => issue.pull_request === undefined || issue.pull_request === null);
  return Promise.all(
    issues.map(async (issue) => ({
      number: issue.number,
      body: issue.body,
      comments: issue.comments > 0 ? await client.listComments(target, issue.number) : [],
    })),
  );
}

function fillReport(report: CrossReferenceNeutralizerReport, plan: NeutralizationPlan): void {
  report.scannedIssues = plan.scannedIssues;
  report.scannedComments = plan.scannedComments;
  report.issueUpdateCount = plan.issueUpdates.length;
  report.commentUpdateCount = plan.commentUpdates.length;
  report.beforeActiveReferences = plan.beforeActiveReferences;
  report.afterActiveReferences = plan.afterActiveReferences;
  report.plannedIssueUpdates = plan.issueUpdates.map(updateDetail);
  report.plannedCommentUpdates = plan.commentUpdates.map(updateDetail);
}

function updateDetail(update: NeutralizationUpdate): NeutralizationUpdateDetail {
  return {
    issueNumber: update.issueNumber,
    commentId: update.commentId,
    beforeActiveReferences: update.beforeActiveReferences,
    afterActiveReferences: update.afterActiveReferences,
    markers: update.counts.markers,
    urls: update.counts.urls,
    repoReferences: update.counts.repoReferences,
    beforeLength: update.before.length,
    afterLength: update.after.length,
  };
}

function emptyReport(options: CrossReferenceNeutralizerOptions): CrossReferenceNeutralizerReport {
  return {
    source: options.source,
    target: options.target,
    mode: options.mode,
    generatedAt: new Date().toISOString(),
    scannedIssues: 0,
    scannedComments: 0,
    issueUpdateCount: 0,
    commentUpdateCount: 0,
    beforeActiveReferences: 0,
    afterActiveReferences: 0,
    plannedIssueUpdates: [],
    plannedCommentUpdates: [],
    appliedIssueUpdates: [],
    appliedCommentUpdates: [],
    failedUpdate: null,
    wroteRemote: false,
    errors: [],
  };
}

async function writePatchPayload(endpoint: string, payload: { body: string }): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "agentmemory-neutralize-"));
  const payloadPath = join(dir, "payload.json");
  try {
    await writeFile(payloadPath, JSON.stringify(payload, null, 2));
    await execFileAsync("gh", ["api", "--method", "PATCH", endpoint, "--input", payloadPath], { maxBuffer: 1024 * 1024 * 10 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function ghGetPaginated<T>(endpoint: string): Promise<T[]> {
  const { stdout } = await execFileAsync("gh", ["api", "--paginate", "--slurp", endpoint], { maxBuffer: 1024 * 1024 * 30 });
  const pages = JSON.parse(stdout) as unknown;
  if (!Array.isArray(pages)) throw new Error("Expected gh api --slurp output to be an array of pages.");
  return pages.flatMap((page) => {
    if (!Array.isArray(page)) throw new Error("Expected each gh api --slurp page to be an array.");
    return page as T[];
  });
}

async function writeJsonReport(path: string, report: CrossReferenceNeutralizerReport): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}

async function maybeWriteReport(
  path: string | null,
  report: CrossReferenceNeutralizerReport,
  writeReport: (path: string, report: CrossReferenceNeutralizerReport) => Promise<void>,
): Promise<void> {
  if (path) await writeReport(path, report);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

type RawIssue = {
  number?: number;
  body?: string | null;
  comments?: number;
  pull_request?: unknown;
};

type RawComment = {
  id?: number;
  body?: string | null;
};

if (process.argv[1]?.endsWith("neutralize-github-cross-references.ts")) {
  runCrossReferenceNeutralizer(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
