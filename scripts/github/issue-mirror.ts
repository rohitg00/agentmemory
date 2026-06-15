export const SOURCE_REPO = "rohitg00/agentmemory";
export const TARGET_REPO = "wbugitlab1/agentmemory";
export const MAX_COMMENT_CHARS = 60000;
export const MAX_ISSUE_BODY_CHARS = 60000;

export type GitHubLabel = {
  name: string;
  color?: string;
  description?: string | null;
};

export type GitHubUser = {
  login: string;
  html_url?: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  user: GitHubUser | null;
  body: string | null;
  labels: GitHubLabel[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
};

export type GitHubComment = {
  id: number;
  user: GitHubUser | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

export type ImportedCommentMarker = {
  upstreamNumber: number;
  upstreamCommentId: number;
  chunk: number;
  totalChunks: number;
};

export type ExistingMirror = {
  upstreamNumber: number;
  targetNumber: number;
  targetState: "open" | "closed";
  targetBody: string;
  targetLabels: string[];
  importedCommentMarkers: ImportedCommentMarker[];
};

export type PlannedAction =
  | { type: "create-label"; label: GitHubLabel }
  | { type: "create-issue"; upstreamNumber: number; title: string; body: string; labels: string[] }
  | { type: "update-issue"; upstreamNumber: number; targetNumber: number; title: string; body: string; labels: string[] }
  | {
      type: "create-comment";
      upstreamNumber: number;
      upstreamCommentId: number | null;
      targetNumber: number | null;
      body: string;
      commentKind?: "overflow" | "imported" | "summary";
    }
  | { type: "close-issue"; upstreamNumber: number; targetNumber: number | null }
  | { type: "skip-issue"; upstreamNumber: number; targetNumber: number; reason: string }
  | { type: "duplicate-marker"; upstreamNumber: number; targetNumbers: number[] }
  | { type: "invalid-marker"; targetNumber: number; reason: string }
  | { type: "rate-limit-stop"; operation: string; retryAfterSeconds: number | null; message: string };

export type MarkerParseIssue = {
  targetNumber: number;
  reason: string;
};

export type DuplicateMarker = {
  upstreamNumber: number;
  targetNumbers: number[];
};

export type ParseExistingMirrorMarkersResult = {
  mirrors: ExistingMirror[];
  duplicates: DuplicateMarker[];
  invalidMarkers: MarkerParseIssue[];
  invalidUpstreamNumbers: number[];
};

export type MirrorIssueBodyPlan = {
  body: string;
  overflowComments: string[];
};

export type ImportedCommentChunk = {
  upstreamNumber: number;
  upstreamCommentId: number;
  chunk: number;
  totalChunks: number;
  body: string;
};

export type PlanIssueActionsInput = {
  sourceIssues: GitHubIssue[];
  targetIssues: GitHubIssue[];
  sourceCommentsByIssue?: Map<number, GitHubComment[]>;
  targetCommentsByIssue?: Map<number, GitHubComment[]>;
  targetLabels?: GitHubLabel[];
};

export type VerificationInput = Required<PlanIssueActionsInput>;

export type VerificationResult = {
  ok: boolean;
  failures: string[];
};

const legacyIssueMarkerPattern = /<!--\s*upstream-issue:\s*([^#\s]+)#([0-9]+)\s*-->/g;
const neutralIssueMarkerPattern = /<!--\s*upstream-issue-neutral:\s*source=([^\s]+)\s+number=([0-9]+)\s*-->/g;
const anyIssueMarkerPattern = /<!--\s*upstream-issue(?:-neutral)?:[\s\S]*?-->/g;
const containedSourceIssueNumberPattern = /rohitg00\/agentmemory#([0-9]+)/g;
const containedNeutralSourceIssueNumberPattern = /source=rohitg00\/agentmemory\s+number=([0-9]+)/g;
const legacyCommentMarkerPattern =
  /<!--\s*upstream-comment:\s*([^#\s]+)#([0-9]+)\s+id=([0-9]+)\s+chunk=([0-9]+)\/([0-9]+)\s*-->/g;
const neutralCommentMarkerPattern =
  /<!--\s*upstream-comment-neutral:\s*source=([^\s]+)\s+number=([0-9]+)\s+id=([0-9]+)\s+chunk=([0-9]+)\/([0-9]+)\s*-->/g;
const anyCommentMarkerPattern = /<!--\s*upstream-comment(?:-neutral)?:[\s\S]*?-->/g;
const legacyOverflowMarkerPattern = /<!--\s*upstream-overflow:\s*([^#\s]+)#([0-9]+)\s+chunk=([0-9]+)\/([0-9]+)\s*-->/g;
const neutralOverflowMarkerPattern = /<!--\s*upstream-overflow-neutral:\s*source=([^\s]+)\s+number=([0-9]+)\s+chunk=([0-9]+)\/([0-9]+)\s*-->/g;
const legacyImportedCommentsSummaryPattern = /<!--\s*upstream-comments-imported:\s*([^#\s]+)#([0-9]+)\s+count=([0-9]+)\s*-->/g;
const neutralImportedCommentsSummaryPattern = /<!--\s*upstream-comments-imported-neutral:\s*source=([^\s]+)\s+number=([0-9]+)\s+count=([0-9]+)\s*-->/g;

export function isPullRequestItem(issue: GitHubIssue): boolean {
  return issue.pull_request !== undefined && issue.pull_request !== null;
}

export function buildUpstreamMarker(upstreamNumber: number): string {
  return `<!-- upstream-issue-neutral: source=${SOURCE_REPO} number=${upstreamNumber} -->`;
}

export function buildImportedCommentMarker(upstreamNumber: number, upstreamCommentId: number, chunk: number, totalChunks: number): string {
  return `<!-- upstream-comment-neutral: source=${SOURCE_REPO} number=${upstreamNumber} id=${upstreamCommentId} chunk=${chunk}/${totalChunks} -->`;
}

export function buildOverflowMarker(upstreamNumber: number, chunk: number, totalChunks: number): string {
  return `<!-- upstream-overflow-neutral: source=${SOURCE_REPO} number=${upstreamNumber} chunk=${chunk}/${totalChunks} -->`;
}

export function buildImportedCommentsSummaryMarker(upstreamNumber: number, count: number): string {
  return `<!-- upstream-comments-imported-neutral: source=${SOURCE_REPO} number=${upstreamNumber} count=${count} -->`;
}

export function sanitizeImportedMarkdown(markdown: string | null): string {
  const input = markdown ?? "";
  let output = "";
  let index = 0;

  while (index < input.length) {
    const repoReference = readRepoReference(input, index);
    if (repoReference) {
      output += repoReference.value;
      index = repoReference.end;
      continue;
    }

    const ghReference = readGhReference(input, index);
    if (ghReference) {
      output += ghReference.value;
      index = ghReference.end;
      continue;
    }

    const mention = readMention(input, index);
    if (mention) {
      output += mention.value;
      index = mention.end;
      continue;
    }

    const issueReference = readIssueReference(input, index);
    if (issueReference) {
      output += issueReference.value;
      index = issueReference.end;
      continue;
    }

    const word = readWord(input, index);
    if (word) {
      output += breakClosingKeyword(word.value);
      index = word.end;
      continue;
    }

    output += input[index];
    index += 1;
  }

  return output;
}

export function parseExistingMirrorMarkers(targetIssues: GitHubIssue[]): ParseExistingMirrorMarkersResult {
  const mirrors: ExistingMirror[] = [];
  const invalidMarkers: MarkerParseIssue[] = [];
  const byUpstream = new Map<number, number[]>();
  const invalidUpstreamNumbers = new Set<number>();

  for (const issue of targetIssues) {
    if (isPullRequestItem(issue)) continue;

    const body = issue.body ?? "";
    const rawMarkers = Array.from(body.matchAll(anyIssueMarkerPattern));
    const validMarkers = parseSourceNumberMarkers(body, legacyIssueMarkerPattern, neutralIssueMarkerPattern);

    if (rawMarkers.length === 0) continue;
    if (rawMarkers.length > 1) {
      invalidMarkers.push({ targetNumber: issue.number, reason: "multiple upstream issue markers" });
      addContainedSourceIssueNumbers(rawMarkers, invalidUpstreamNumbers);
      continue;
    }

    const malformedCount = rawMarkers.length - validMarkers.length;
    if (malformedCount > 0) {
      invalidMarkers.push({ targetNumber: issue.number, reason: "malformed upstream issue marker" });
      addContainedSourceIssueNumbers(rawMarkers, invalidUpstreamNumbers);
    }
    if (validMarkers.length === 0) continue;

    const upstreamNumber = validMarkers[0];
    mirrors.push({
      upstreamNumber,
      targetNumber: issue.number,
      targetState: issue.state,
      targetBody: body,
      targetLabels: issue.labels.map((label) => label.name),
      importedCommentMarkers: parseImportedCommentMarkers(body),
    });
    byUpstream.set(upstreamNumber, [...(byUpstream.get(upstreamNumber) ?? []), issue.number]);
  }

  return {
    mirrors,
    duplicates: Array.from(byUpstream.entries())
      .filter(([, targetNumbers]) => targetNumbers.length > 1)
      .map(([upstreamNumber, targetNumbers]) => ({ upstreamNumber, targetNumbers })),
    invalidMarkers,
    invalidUpstreamNumbers: Array.from(invalidUpstreamNumbers).sort((left, right) => left - right),
  };
}

export function buildMirrorIssueBody(issue: GitHubIssue): MirrorIssueBodyPlan {
  const metadata = [
    buildUpstreamMarker(issue.number),
    "",
    `Source repository: ${SOURCE_REPO}`,
    `Source issue number: ${issue.number}`,
    "Source URL: intentionally omitted to avoid GitHub cross-references",
    `Author: ${issue.user?.login ?? "unknown"}`,
    `State: ${issue.state}`,
    `Created: ${issue.created_at}`,
    `Updated: ${issue.updated_at}`,
    `Closed: ${issue.closed_at ?? "not closed"}`,
    `Original labels: ${issue.labels.map((label) => label.name).join(", ") || "none"}`,
    "",
    "Imported upstream body:",
    "",
  ].join("\n");
  const sanitizedBody = sanitizeImportedMarkdown(issue.body);
  const overflowComments: string[] = [];

  if (metadata.length + sanitizedBody.length <= MAX_ISSUE_BODY_CHARS) {
    return { body: `${metadata}${sanitizedBody}`, overflowComments };
  }

  const availableBodyChars = Math.max(0, MAX_ISSUE_BODY_CHARS - metadata.length - "\n\n[Upstream body truncated; overflow imported as comments.]".length);
  const retainedBody = sanitizedBody.slice(0, availableBodyChars);
  const overflow = sanitizedBody.slice(availableBodyChars);
  overflowComments.push(
    ...chunkTextWithHeader(`Overflow from upstream issue number ${issue.number}\n\n`, overflow, MAX_COMMENT_CHARS, (chunk, total) =>
      `${buildOverflowMarker(issue.number, chunk, total)}\n\n`,
    ),
  );

  return {
    body: `${metadata}${retainedBody}\n\n[Upstream body truncated; overflow imported as comments.]`,
    overflowComments,
  };
}

export function planLabelActions(sourceIssues: GitHubIssue[], targetLabels: GitHubLabel[]): PlannedAction[] {
  const targetNames = new Set(targetLabels.map((label) => normalizeLabelName(label.name)));
  const seen = new Set<string>();
  const actions: PlannedAction[] = [];

  for (const issue of sourceIssues.filter((sourceIssue) => !isPullRequestItem(sourceIssue))) {
    for (const label of issue.labels) {
      const normalized = normalizeLabelName(label.name);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      if (!targetNames.has(normalized)) actions.push({ type: "create-label", label });
    }
  }

  return actions;
}

export function chunkImportedComments(upstreamNumber: number, comments: GitHubComment[]): ImportedCommentChunk[] {
  const chunks: ImportedCommentChunk[] = [];

  for (const sourceComment of comments) {
    const sanitized = sanitizeImportedMarkdown(sourceComment.body);
    const header = [
      `Source repository: ${SOURCE_REPO}`,
      `Source issue number: ${upstreamNumber}`,
      `Source comment id: ${sourceComment.id}`,
      "Source URL: intentionally omitted to avoid GitHub cross-references",
      `Author: ${sourceComment.user?.login ?? "unknown"}`,
      `Created: ${sourceComment.created_at}`,
      `Updated: ${sourceComment.updated_at}`,
      "",
    ].join("\n");
    const firstPassChunks = chunkTextWithHeader(header, sanitized, MAX_COMMENT_CHARS, (index, total) =>
      `${buildImportedCommentMarker(upstreamNumber, sourceComment.id, index, total)}\n\n`,
    );
    const totalChunks = firstPassChunks.length;

    firstPassChunks.forEach((body, index) => {
      const chunk = index + 1;
      const marker = buildImportedCommentMarker(upstreamNumber, sourceComment.id, chunk, totalChunks);
      chunks.push({ upstreamNumber, upstreamCommentId: sourceComment.id, chunk, totalChunks, body: body.replace(anyCommentMarkerPattern, marker) });
    });
  }

  return chunks;
}

export function planIssueActions(input: PlanIssueActionsInput): PlannedAction[] {
  const targetCommentsByIssue = input.targetCommentsByIssue ?? new Map<number, GitHubComment[]>();
  const sourceCommentsByIssue = input.sourceCommentsByIssue ?? new Map<number, GitHubComment[]>();
  const parseResult = parseExistingMirrorMarkers(input.targetIssues);
  const actions: PlannedAction[] = [
    ...parseResult.invalidMarkers.map((marker) => ({ type: "invalid-marker" as const, targetNumber: marker.targetNumber, reason: marker.reason })),
    ...parseResult.duplicates.map((duplicate) => ({
      type: "duplicate-marker" as const,
      upstreamNumber: duplicate.upstreamNumber,
      targetNumbers: duplicate.targetNumbers,
    })),
  ];
  const duplicateNumbers = new Set(parseResult.duplicates.map((duplicate) => duplicate.upstreamNumber));
  const invalidNumbers = new Set(parseResult.invalidUpstreamNumbers);
  const mirrorByUpstream = new Map<number, ExistingMirror>();

  for (const mirror of parseResult.mirrors) {
    if (!mirrorByUpstream.has(mirror.upstreamNumber)) mirrorByUpstream.set(mirror.upstreamNumber, mirror);
  }

  for (const sourceIssue of input.sourceIssues.filter((issue) => !isPullRequestItem(issue))) {
    if (duplicateNumbers.has(sourceIssue.number) || invalidNumbers.has(sourceIssue.number)) continue;

    const mirror = mirrorByUpstream.get(sourceIssue.number);
    const bodyPlan = buildMirrorIssueBody(sourceIssue);
    const labels = sourceIssue.labels.map((label) => label.name);
    if (!mirror) {
      actions.push({ type: "create-issue", upstreamNumber: sourceIssue.number, title: sourceIssue.title, body: bodyPlan.body, labels });
      for (const body of bodyPlan.overflowComments) {
        actions.push({ type: "create-comment", upstreamNumber: sourceIssue.number, upstreamCommentId: null, targetNumber: null, body, commentKind: "overflow" });
      }
      for (const chunk of chunkImportedComments(sourceIssue.number, sourceCommentsByIssue.get(sourceIssue.number) ?? [])) {
        actions.push({
          type: "create-comment",
          upstreamNumber: sourceIssue.number,
          upstreamCommentId: chunk.upstreamCommentId,
          targetNumber: null,
          body: chunk.body,
          commentKind: "imported",
        });
      }
      const summary = missingImportedCommentsSummary(sourceIssue, null, null, sourceCommentsByIssue, targetCommentsByIssue);
      if (summary) {
        actions.push({ type: "create-comment", upstreamNumber: sourceIssue.number, upstreamCommentId: null, targetNumber: null, body: summary, commentKind: "summary" });
      }
      if (sourceIssue.state === "closed") {
        actions.push({ type: "close-issue", upstreamNumber: sourceIssue.number, targetNumber: null });
      }
      continue;
    }

    const needsUpdate =
      mirror.targetBody !== bodyPlan.body ||
      !sameLabelSet(mirror.targetLabels, labels) ||
      input.targetIssues.find((targetIssue) => targetIssue.number === mirror.targetNumber)?.title !== sourceIssue.title;

    if (needsUpdate) {
      actions.push({ type: "update-issue", upstreamNumber: sourceIssue.number, targetNumber: mirror.targetNumber, title: sourceIssue.title, body: bodyPlan.body, labels });
    } else {
      actions.push({ type: "skip-issue", upstreamNumber: sourceIssue.number, targetNumber: mirror.targetNumber, reason: "already synchronized" });
    }

    for (const body of missingOverflowComments(sourceIssue.number, mirror.targetNumber, bodyPlan.overflowComments, targetCommentsByIssue)) {
      actions.push({ type: "create-comment", upstreamNumber: sourceIssue.number, upstreamCommentId: null, targetNumber: mirror.targetNumber, body, commentKind: "overflow" });
    }

    for (const chunk of missingImportedCommentChunks(sourceIssue.number, mirror.targetNumber, sourceCommentsByIssue, targetCommentsByIssue)) {
      actions.push({
        type: "create-comment",
        upstreamNumber: sourceIssue.number,
        upstreamCommentId: chunk.upstreamCommentId,
        targetNumber: mirror.targetNumber,
        body: chunk.body,
        commentKind: "imported",
      });
    }

    const summary = missingImportedCommentsSummary(sourceIssue, mirror.targetNumber, mirror.targetBody, sourceCommentsByIssue, targetCommentsByIssue);
    if (summary) {
      actions.push({
        type: "create-comment",
        upstreamNumber: sourceIssue.number,
        upstreamCommentId: null,
        targetNumber: mirror.targetNumber,
        body: summary,
        commentKind: "summary",
      });
    }

    if (sourceIssue.state === "closed" && mirror.targetState !== "closed") {
      actions.push({ type: "close-issue", upstreamNumber: sourceIssue.number, targetNumber: mirror.targetNumber });
    }
  }

  return actions;
}

function missingOverflowComments(
  upstreamNumber: number,
  targetNumber: number,
  expectedOverflowComments: string[],
  targetCommentsByIssue: Map<number, GitHubComment[]>,
): string[] {
  const existingMarkers = new Set(
    (targetCommentsByIssue.get(targetNumber) ?? [])
      .flatMap((comment) => parseOverflowMarkers(comment.body ?? ""))
      .filter((marker) => marker.upstreamNumber === upstreamNumber)
      .map((marker) => overflowMarkerKey(marker)),
  );
  return expectedOverflowComments.filter((body) => parseOverflowMarkers(body).some((marker) => !existingMarkers.has(overflowMarkerKey(marker))));
}

export function planVerification(input: VerificationInput): VerificationResult {
  const failures: string[] = [];
  const parseResult = parseExistingMirrorMarkers(input.targetIssues);
  const mirrorByUpstream = new Map<number, ExistingMirror>();
  const targetIssueByNumber = new Map(input.targetIssues.map((issue) => [issue.number, issue]));
  const availableTargetLabels = new Set(input.targetLabels.map((label) => normalizeLabelName(label.name)));

  for (const invalid of parseResult.invalidMarkers) {
    failures.push(`${invalid.reason} in target issue ${invalid.targetNumber}`);
  }
  for (const duplicate of parseResult.duplicates) {
    failures.push(`duplicate marker for upstream issue ${duplicate.upstreamNumber}: target issues ${duplicate.targetNumbers.join(", ")}`);
  }
  for (const mirror of parseResult.mirrors) {
    if (!mirrorByUpstream.has(mirror.upstreamNumber)) mirrorByUpstream.set(mirror.upstreamNumber, mirror);
  }

  for (const sourceIssue of input.sourceIssues.filter((issue) => !isPullRequestItem(issue))) {
    const expectedLabels = sourceIssue.labels.map((label) => label.name);
    for (const label of expectedLabels) {
      if (!availableTargetLabels.has(normalizeLabelName(label))) failures.push(`missing target label: ${label}`);
    }

    const mirror = mirrorByUpstream.get(sourceIssue.number);
    if (!mirror) {
      failures.push(`missing mirror for upstream issue ${sourceIssue.number}`);
      continue;
    }

    const targetIssue = targetIssueByNumber.get(mirror.targetNumber);
    if (!targetIssue) {
      failures.push(`missing target issue ${mirror.targetNumber} for upstream issue ${sourceIssue.number}`);
      continue;
    }

    if (targetIssue.title !== sourceIssue.title) failures.push(`title mismatch for upstream issue ${sourceIssue.number}`);
    if (targetIssue.state !== sourceIssue.state) failures.push(`state mismatch for upstream issue ${sourceIssue.number}`);
    if (targetIssue.body !== buildMirrorIssueBody(sourceIssue).body) {
      failures.push(`body marker mismatch for upstream issue ${sourceIssue.number}`);
    }
    if (!sameLabelSet(mirror.targetLabels, expectedLabels)) failures.push(`label mismatch for upstream issue ${sourceIssue.number}`);

    const expectedOverflowMarkers = buildMirrorIssueBody(sourceIssue).overflowComments.flatMap((body) => parseOverflowMarkers(body));
    const expectedChunks = chunkImportedComments(sourceIssue.number, input.sourceCommentsByIssue.get(sourceIssue.number) ?? []);
    const targetComments = input.targetCommentsByIssue.get(mirror.targetNumber) ?? [];
    const targetOverflowMarkers = targetComments
      .flatMap((comment) => parseOverflowMarkers(comment.body ?? ""))
      .filter((marker) => marker.upstreamNumber === sourceIssue.number);
    const targetOverflowMarkerCount = targetOverflowMarkers.length;
    const targetOverflowMarkerKeys = new Set(targetOverflowMarkers.map((marker) => overflowMarkerKey(marker)));
    const targetMarkers = [
      ...parseImportedCommentMarkers(targetIssue.body ?? ""),
      ...targetComments.flatMap((comment) => parseImportedCommentMarkers(comment.body ?? "")),
    ];
    const targetSummaryMarkers = [
      ...parseImportedCommentsSummaryMarkers(targetIssue.body ?? ""),
      ...targetComments.flatMap((comment) => parseImportedCommentsSummaryMarkers(comment.body ?? "")),
    ];

    for (const marker of expectedOverflowMarkers) {
      if (!targetOverflowMarkerKeys.has(overflowMarkerKey(marker))) {
        failures.push(`missing overflow marker for upstream issue ${sourceIssue.number} chunk ${marker.chunk}/${marker.totalChunks}`);
      }
    }
    if (targetOverflowMarkerCount !== expectedOverflowMarkers.length) {
      failures.push(
        `overflow-count mismatch for upstream issue ${sourceIssue.number}: expected ${expectedOverflowMarkers.length}, found ${targetOverflowMarkerCount}`,
      );
    }

    for (const chunk of expectedChunks) {
      const hasMarker = targetMarkers.some(
        (marker) =>
          marker.upstreamNumber === chunk.upstreamNumber &&
          marker.upstreamCommentId === chunk.upstreamCommentId &&
          marker.chunk === chunk.chunk &&
          marker.totalChunks === chunk.totalChunks,
      );
      if (!hasMarker) failures.push(`missing imported comment marker for upstream issue ${sourceIssue.number} comment ${chunk.upstreamCommentId}`);
    }

    const expectedImportedCommentIds = new Set(expectedChunks.map((chunk) => chunk.upstreamCommentId));
    const importedCommentIds = new Set(targetMarkers.map((marker) => marker.upstreamCommentId));
    if (importedCommentIds.size !== expectedImportedCommentIds.size) {
      failures.push(`comment-count mismatch for upstream issue ${sourceIssue.number}: expected ${expectedImportedCommentIds.size}, found ${importedCommentIds.size}`);
    }
    if (sourceIssue.comments > 0) {
      const hasSummary = targetSummaryMarkers.some((marker) => marker.upstreamNumber === sourceIssue.number && marker.count === sourceIssue.comments);
      if (!hasSummary) failures.push(`missing imported-comments summary marker for upstream issue ${sourceIssue.number} count ${sourceIssue.comments}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

function missingImportedCommentsSummary(
  sourceIssue: GitHubIssue,
  targetNumber: number | null,
  targetBody: string | null,
  sourceCommentsByIssue: Map<number, GitHubComment[]>,
  targetCommentsByIssue: Map<number, GitHubComment[]>,
): string | null {
  if (sourceIssue.comments === 0 || !sourceCommentsByIssue.has(sourceIssue.number)) return null;
  if (targetNumber !== null) {
    const existing = [
      ...parseImportedCommentsSummaryMarkers(targetBody ?? ""),
      ...(targetCommentsByIssue.get(targetNumber) ?? []).flatMap((comment) => parseImportedCommentsSummaryMarkers(comment.body ?? "")),
    ];
    if (existing.some((marker) => marker.upstreamNumber === sourceIssue.number && marker.count === sourceIssue.comments)) return null;
  }
  return buildImportedCommentsSummaryMarker(sourceIssue.number, sourceIssue.comments);
}

function parseImportedCommentMarkers(body: string): ImportedCommentMarker[] {
  return [
    ...Array.from(body.matchAll(legacyCommentMarkerPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => ({
        upstreamNumber: Number(match[2]),
        upstreamCommentId: Number(match[3]),
        chunk: Number(match[4]),
        totalChunks: Number(match[5]),
      })),
    ...Array.from(body.matchAll(neutralCommentMarkerPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => ({
        upstreamNumber: Number(match[2]),
        upstreamCommentId: Number(match[3]),
        chunk: Number(match[4]),
        totalChunks: Number(match[5]),
      })),
  ];
}

function parseImportedCommentsSummaryMarkers(body: string): Array<{ upstreamNumber: number; count: number }> {
  return [
    ...Array.from(body.matchAll(legacyImportedCommentsSummaryPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => ({
        upstreamNumber: Number(match[2]),
        count: Number(match[3]),
      })),
    ...Array.from(body.matchAll(neutralImportedCommentsSummaryPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => ({
        upstreamNumber: Number(match[2]),
        count: Number(match[3]),
      })),
  ];
}

function addContainedSourceIssueNumbers(markers: RegExpMatchArray[], target: Set<number>): void {
  for (const marker of markers) {
    for (const upstreamNumber of marker[0].matchAll(containedSourceIssueNumberPattern)) {
      target.add(Number(upstreamNumber[1]));
    }
    for (const upstreamNumber of marker[0].matchAll(containedNeutralSourceIssueNumberPattern)) {
      target.add(Number(upstreamNumber[1]));
    }
  }
}

function parseOverflowMarkers(body: string): Array<{ upstreamNumber: number; chunk: number; totalChunks: number }> {
  return [
    ...Array.from(body.matchAll(legacyOverflowMarkerPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => ({
        upstreamNumber: Number(match[2]),
        chunk: Number(match[3]),
        totalChunks: Number(match[4]),
      })),
    ...Array.from(body.matchAll(neutralOverflowMarkerPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => ({
        upstreamNumber: Number(match[2]),
        chunk: Number(match[3]),
        totalChunks: Number(match[4]),
      })),
  ];
}

function parseSourceNumberMarkers(body: string, legacyPattern: RegExp, neutralPattern: RegExp): number[] {
  return [
    ...Array.from(body.matchAll(legacyPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => Number(match[2])),
    ...Array.from(body.matchAll(neutralPattern))
      .filter((match) => match[1] === SOURCE_REPO)
      .map((match) => Number(match[2])),
  ];
}

function missingImportedCommentChunks(
  upstreamNumber: number,
  targetNumber: number,
  sourceCommentsByIssue: Map<number, GitHubComment[]>,
  targetCommentsByIssue: Map<number, GitHubComment[]>,
): ImportedCommentChunk[] {
  const expectedChunks = chunkImportedComments(upstreamNumber, sourceCommentsByIssue.get(upstreamNumber) ?? []);
  const existingMarkers = new Set(
    (targetCommentsByIssue.get(targetNumber) ?? [])
      .flatMap((comment) => parseImportedCommentMarkers(comment.body ?? ""))
      .map((marker) => commentMarkerKey(marker)),
  );
  return expectedChunks.filter((chunk) => !existingMarkers.has(commentMarkerKey(chunk)));
}

function commentMarkerKey(marker: ImportedCommentMarker): string {
  return `${marker.upstreamNumber}:${marker.upstreamCommentId}:${marker.chunk}:${marker.totalChunks}`;
}

function overflowMarkerKey(marker: { upstreamNumber: number; chunk: number; totalChunks: number }): string {
  return `${marker.upstreamNumber}:${marker.chunk}:${marker.totalChunks}`;
}

function readRepoReference(input: string, start: number): { value: string; end: number } | null {
  const owner = readNameSegment(input, start, isRepoNameChar);
  if (!owner || input[owner.end] !== "/") return null;

  const repo = readNameSegment(input, owner.end + 1, isRepoNameChar);
  if (!repo || input[repo.end] !== "#") return null;

  const number = readDigits(input, repo.end + 1);
  if (!number) return null;

  return { value: `${owner.value}/${repo.value}#<!-- -->${number.value}`, end: number.end };
}

function readGhReference(input: string, start: number): { value: string; end: number } | null {
  if (input[start]?.toLowerCase() !== "g" || input[start + 1]?.toLowerCase() !== "h" || input[start + 2] !== "-") return null;

  const number = readDigits(input, start + 3);
  if (!number) return null;

  return { value: `${input.slice(start, start + 3)}<!-- -->${number.value}`, end: number.end };
}

function readMention(input: string, start: number): { value: string; end: number } | null {
  if (input[start] !== "@" || !isAlphaNumeric(input[start + 1])) return null;

  const user = readNameSegment(input, start + 1, isMentionNameChar);
  if (!user) return null;

  let value = user.value;
  let end = user.end;
  if (input[end] === "/" && isAlphaNumeric(input[end + 1])) {
    const team = readNameSegment(input, end + 1, isMentionNameChar);
    if (team) {
      value = `${value}/${team.value}`;
      end = team.end;
    }
  }

  return { value: `@<!-- -->${value}`, end };
}

function readIssueReference(input: string, start: number): { value: string; end: number } | null {
  if (input[start] !== "#" || isWordChar(input[start - 1])) return null;

  const number = readDigits(input, start + 1);
  if (!number) return null;

  return { value: `#<!-- -->${number.value}`, end: number.end };
}

function readWord(input: string, start: number): { value: string; end: number } | null {
  if (!isAsciiLetter(input[start]) || isWordChar(input[start - 1])) return null;

  let end = start + 1;
  while (isAsciiLetter(input[end])) end += 1;

  if (isWordChar(input[end])) return null;
  return { value: input.slice(start, end), end };
}

function readNameSegment(input: string, start: number, isAllowed: (char: string | undefined) => boolean): { value: string; end: number } | null {
  if (!isAlphaNumeric(input[start])) return null;

  let end = start + 1;
  while (isAllowed(input[end])) end += 1;

  return { value: input.slice(start, end), end };
}

function readDigits(input: string, start: number): { value: string; end: number } | null {
  if (!isDigit(input[start])) return null;

  let end = start + 1;
  while (isDigit(input[end])) end += 1;

  return { value: input.slice(start, end), end };
}

function chunkTextWithHeader(
  header: string,
  text: string,
  limit: number,
  markerFactory: (chunk: number, total: number) => string = () => "",
): string[] {
  let total = 1;
  let payloadSize = 0;
  while (true) {
    const markerAllowance = markerFactory(total, total).length;
    payloadSize = limit - header.length - markerAllowance;
    if (payloadSize <= 0) throw new Error("Header is too large to fit within chunk limit");

    const nextTotal = Math.max(1, Math.ceil(text.length / payloadSize));
    if (nextTotal === total) break;
    total = nextTotal;
  }

  const chunks: string[] = [];
  for (let index = 0; index < total; index += 1) {
    const marker = markerFactory(index + 1, total);
    const start = index * payloadSize;
    chunks.push(`${marker}${header}${text.slice(start, start + payloadSize)}`);
  }
  return chunks;
}

function breakClosingKeyword(keyword: string): string {
  const lower = keyword.toLowerCase();
  if (lower.startsWith("fix")) return `${keyword.slice(0, 3)}<!-- -->${keyword.slice(3)}`;
  if (lower.startsWith("resolv")) return `${keyword.slice(0, 6)}<!-- -->${keyword.slice(6)}`;
  if (lower.startsWith("clos")) return `${keyword.slice(0, 4)}<!-- -->${keyword.slice(4)}`;
  return keyword;
}

function sameLabelSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map(normalizeLabelName));
  const rightSet = new Set(right.map(normalizeLabelName));
  if (leftSet.size !== rightSet.size) return false;
  return Array.from(leftSet).every((label) => rightSet.has(label));
}

function normalizeLabelName(label: string): string {
  return label.trim().toLowerCase();
}

function isMentionNameChar(char: string | undefined): boolean {
  return isAlphaNumeric(char) || char === "-";
}

function isRepoNameChar(char: string | undefined): boolean {
  return isAlphaNumeric(char) || char === "-" || char === "_" || char === ".";
}

function isWordChar(char: string | undefined): boolean {
  return isAlphaNumeric(char) || char === "_";
}

function isAlphaNumeric(char: string | undefined): boolean {
  return char !== undefined && ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || isDigit(char));
}

function isAsciiLetter(char: string | undefined): boolean {
  return char !== undefined && ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z"));
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}
