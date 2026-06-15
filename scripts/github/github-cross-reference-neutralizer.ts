export type NeutralizationCounts = {
  markers: number;
  urls: number;
  repoReferences: number;
};

export type NeutralizationResult = {
  text: string;
  changed: boolean;
  beforeActiveReferences: number;
  afterActiveReferences: number;
  counts: NeutralizationCounts;
};

export type NeutralizationIssueInput = {
  number: number;
  body: string | null;
  comments: Array<{ id: number; body: string | null }>;
};

export type NeutralizationUpdate = {
  issueNumber: number;
  commentId?: number;
  before: string;
  after: string;
  beforeActiveReferences: number;
  afterActiveReferences: number;
  counts: NeutralizationCounts;
};

export type NeutralizationPlan = {
  issueUpdates: NeutralizationUpdate[];
  commentUpdates: NeutralizationUpdate[];
  scannedIssues: number;
  scannedComments: number;
  beforeActiveReferences: number;
  afterActiveReferences: number;
};

const legacyIssueMarkerPattern = /<!--\s*upstream-issue:\s*([^#\s]+)#([0-9]+)\s*-->/g;
const legacyPrMarkerPattern = /<!--\s*upstream-pr:\s*([^#\s]+)#([0-9]+)\s*-->/g;
const legacyCommentMarkerPattern = /<!--\s*upstream-comment:\s*([^#\s]+)#([0-9]+)\s+id=([0-9]+)\s+chunk=([0-9]+)\/([0-9]+)\s*-->/g;
const legacyOverflowMarkerPattern = /<!--\s*upstream-overflow:\s*([^#\s]+)#([0-9]+)\s+chunk=([0-9]+)\/([0-9]+)\s*-->/g;
const legacySummaryMarkerPattern = /<!--\s*upstream-comments-imported:\s*([^#\s]+)#([0-9]+)\s+count=([0-9]+)\s*-->/g;
const sourceIssueCommentUrlPattern = /https?:\/\/github\.com\/([^/\s)]+\/[^/\s)#]+)\/issues\/([0-9]+)#issuecomment-([0-9]+)/g;
const sourceIssueUrlPattern = /https?:\/\/github\.com\/([^/\s)]+\/[^/\s)#]+)\/issues\/([0-9]+)/g;
const sourcePullUrlPattern = /https?:\/\/github\.com\/([^/\s)]+\/[^/\s)#]+)\/pull\/([0-9]+)/g;
const sourceRepoReferencePattern = /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([0-9]+)\b/g;

export function activeSourceReferenceCount(text: string | null, sourceRepo: string): number {
  const value = text ?? "";
  return (
    countMatchingRepo(value, sourceIssueCommentUrlPattern, sourceRepo, 1) +
    countMatchingRepo(value, sourceIssueUrlPattern, sourceRepo, 1) +
    countMatchingRepo(value, sourcePullUrlPattern, sourceRepo, 1) +
    countMatchingRepo(value, sourceRepoReferencePattern, sourceRepo, 1)
  );
}

export function neutralizeGithubCrossReferences(text: string | null, sourceRepo: string): NeutralizationResult {
  const input = text ?? "";
  const counts: NeutralizationCounts = { markers: 0, urls: 0, repoReferences: 0 };
  let output = input;

  output = replaceRepoCounting(output, legacyIssueMarkerPattern, counts, "markers", sourceRepo, 1, (match) =>
    `<!-- upstream-issue-neutral: source=${sourceRepo} number=${match[2]} -->`,
  );
  output = replaceRepoCounting(output, legacyPrMarkerPattern, counts, "markers", sourceRepo, 1, (match) =>
    `<!-- upstream-pr-neutral: source=${sourceRepo} number=${match[2]} -->`,
  );
  output = replaceRepoCounting(
    output,
    legacyCommentMarkerPattern,
    counts,
    "markers",
    sourceRepo,
    1,
    (match) => `<!-- upstream-comment-neutral: source=${sourceRepo} number=${match[2]} id=${match[3]} chunk=${match[4]}/${match[5]} -->`,
  );
  output = replaceRepoCounting(
    output,
    legacyOverflowMarkerPattern,
    counts,
    "markers",
    sourceRepo,
    1,
    (match) => `<!-- upstream-overflow-neutral: source=${sourceRepo} number=${match[2]} chunk=${match[3]}/${match[4]} -->`,
  );
  output = replaceRepoCounting(
    output,
    legacySummaryMarkerPattern,
    counts,
    "markers",
    sourceRepo,
    1,
    (match) => `<!-- upstream-comments-imported-neutral: source=${sourceRepo} number=${match[2]} count=${match[3]} -->`,
  );

  output = replaceRepoCounting(
    output,
    sourceIssueCommentUrlPattern,
    counts,
    "urls",
    sourceRepo,
    1,
    (match) => `Source comment id: ${match[3]} for ${sourceRepo} issue number ${match[2]} (URL omitted to avoid GitHub cross-reference)`,
  );
  output = replaceRepoCounting(
    output,
    sourceIssueUrlPattern,
    counts,
    "urls",
    sourceRepo,
    1,
    (match) => `Source issue number: ${match[2]} in ${sourceRepo} (URL omitted to avoid GitHub cross-reference)`,
  );
  output = replaceRepoCounting(
    output,
    sourcePullUrlPattern,
    counts,
    "urls",
    sourceRepo,
    1,
    (match) => `Source pull request number: ${match[2]} in ${sourceRepo} (URL omitted to avoid GitHub cross-reference)`,
  );
  output = replaceRepoCounting(output, sourceRepoReferencePattern, counts, "repoReferences", sourceRepo, 1, (match) => `source=${sourceRepo} number=${match[2]}`);

  const beforeActiveReferences = activeSourceReferenceCount(input, sourceRepo);
  const afterActiveReferences = activeSourceReferenceCount(output, sourceRepo);

  return {
    text: output,
    changed: output !== input,
    beforeActiveReferences,
    afterActiveReferences,
    counts,
  };
}

export function planCrossReferenceNeutralization(input: { sourceRepo: string; issues: NeutralizationIssueInput[] }): NeutralizationPlan {
  const issueUpdates: NeutralizationUpdate[] = [];
  const commentUpdates: NeutralizationUpdate[] = [];
  let beforeActiveReferences = 0;
  let afterActiveReferences = 0;
  let scannedComments = 0;

  for (const issue of input.issues) {
    const issueResult = neutralizeGithubCrossReferences(issue.body, input.sourceRepo);
    beforeActiveReferences += issueResult.beforeActiveReferences;
    afterActiveReferences += issueResult.afterActiveReferences;
    if (issueResult.changed) {
      issueUpdates.push({
        issueNumber: issue.number,
        before: issue.body ?? "",
        after: issueResult.text,
        beforeActiveReferences: issueResult.beforeActiveReferences,
        afterActiveReferences: issueResult.afterActiveReferences,
        counts: issueResult.counts,
      });
    }

    for (const comment of issue.comments) {
      scannedComments += 1;
      const commentResult = neutralizeGithubCrossReferences(comment.body, input.sourceRepo);
      beforeActiveReferences += commentResult.beforeActiveReferences;
      afterActiveReferences += commentResult.afterActiveReferences;
      if (commentResult.changed) {
        commentUpdates.push({
          issueNumber: issue.number,
          commentId: comment.id,
          before: comment.body ?? "",
          after: commentResult.text,
          beforeActiveReferences: commentResult.beforeActiveReferences,
          afterActiveReferences: commentResult.afterActiveReferences,
          counts: commentResult.counts,
        });
      }
    }
  }

  return {
    issueUpdates,
    commentUpdates,
    scannedIssues: input.issues.length,
    scannedComments,
    beforeActiveReferences,
    afterActiveReferences,
  };
}

function replaceCounting(
  input: string,
  pattern: RegExp,
  counts: NeutralizationCounts,
  key: keyof NeutralizationCounts,
  replacement: (...args: string[]) => string,
): string {
  return input.replace(pattern, (...args: string[]) => {
    counts[key] += 1;
    return replacement(...args);
  });
}

function replaceRepoCounting(
  input: string,
  pattern: RegExp,
  counts: NeutralizationCounts,
  key: keyof NeutralizationCounts,
  sourceRepo: string,
  repoGroupIndex: number,
  replacement: (match: string[]) => string,
): string {
  return input.replace(pattern, (...args: string[]) => {
    const match = args.slice(0, -2);
    if (match[repoGroupIndex] !== sourceRepo) return match[0];
    counts[key] += 1;
    return replacement(match);
  });
}

function countMatchingRepo(input: string, pattern: RegExp, sourceRepo: string, repoGroupIndex: number): number {
  return Array.from(input.matchAll(pattern)).filter((match) => match[repoGroupIndex] === sourceRepo).length;
}
