export interface SyncProgress {
  pages: number;
  issues: number;
  completed: number;
  duplicates: number;
  notModifiedPages: number;
}

export interface WatcherOptions {
  repo: string;
  project: string;
  cwd: string;
  baseUrl?: string;
  githubToken?: string;
  secret?: string;
  since?: string;
  maxPages?: number;
  fetch?: typeof globalThis.fetch;
}

export class GitHubSyncError extends Error {
  progress: SyncProgress;
  details: { failedEventId?: string };
  constructor(message: string, progress: SyncProgress, details?: { failedEventId?: string });
}

export class GitHubIssueWatcher {
  constructor(options: WatcherOptions);
  syncOnce(): Promise<SyncProgress & { complete: true }>;
}
