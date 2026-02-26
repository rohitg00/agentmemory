export function scoreCompression(obs: {
  type?: string;
  title?: string;
  facts?: string[];
  narrative?: string;
  concepts?: string[];
  importance?: number;
}): number {
  let score = 0;
  if (obs.facts && obs.facts.length > 0) score += 25;
  if (obs.facts && obs.facts.length >= 3) score += 10;
  if (obs.narrative && obs.narrative.length >= 20) score += 20;
  if (obs.narrative && obs.narrative.length >= 50) score += 5;
  if (obs.title && obs.title.length >= 5 && obs.title.length <= 120) score += 15;
  if (obs.concepts && obs.concepts.length > 0) score += 15;
  if (obs.importance && obs.importance >= 1 && obs.importance <= 10) score += 10;
  return Math.min(100, score);
}

export function scoreSummary(summary: {
  title?: string;
  narrative?: string;
  keyDecisions?: string[];
  filesModified?: string[];
  concepts?: string[];
}): number {
  let score = 0;
  if (summary.title && summary.title.length >= 5) score += 20;
  if (summary.narrative && summary.narrative.length >= 20) score += 25;
  if (summary.narrative && summary.narrative.length >= 100) score += 5;
  if (summary.keyDecisions && summary.keyDecisions.length > 0) score += 20;
  if (summary.filesModified && summary.filesModified.length > 0) score += 15;
  if (summary.concepts && summary.concepts.length > 0) score += 15;
  return Math.min(100, score);
}

export function scoreContextRelevance(
  context: string,
  project: string,
): number {
  let score = 0;
  if (context.length > 0) score += 20;
  if (project && context.toLowerCase().includes(project.toLowerCase())) score += 20;
  if (context.includes("<")) score += 15;
  const sectionCount = (context.match(/<\w+>/g) || []).length;
  if (sectionCount >= 2) score += 15;
  if (sectionCount >= 4) score += 10;
  if (context.length >= 100) score += 10;
  if (context.length >= 500) score += 10;
  return Math.min(100, score);
}
