import { fingerprintId } from "../../src/state/fingerprint.js";

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

interface Repository {
  id: number;
  full_name: string;
}

interface IssueSnapshot {
  eventId: string;
  hookType: "post_tool_use";
  sessionId: string;
  project: string;
  cwd: string;
  timestamp: string;
  data: {
    source: string;
    tool_name: string;
    tool_input: { repository: string; issue: number; url: string };
    tool_output: string;
  };
}

interface CachedPage {
  etag: string | null;
  snapshots: IssueSnapshot[];
  next: string | null;
}

const API = "https://api.github.com";

export class GitHubSyncError extends Error {
  progress: SyncProgress;
  details: { failedEventId?: string };

  constructor(message: string, progress: SyncProgress, details: { failedEventId?: string } = {}) {
    super(message);
    this.name = "GitHubSyncError";
    this.progress = { ...progress };
    this.details = details;
  }
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function destination(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("AgentMemory URL is invalid"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("AgentMemory URL must be HTTP(S), without credentials, query or fragment");
  }
  return `${url.href.replace(/\/+$/, "")}/agentmemory/observe`;
}

function issueSnapshot(repo: Repository, issue: unknown, project: string, cwd: string): IssueSnapshot {
  if (!isRecord(issue) || !positiveId(issue.id) || !positiveId(issue.number) || typeof issue.title !== "string" ||
      (issue.body !== null && typeof issue.body !== "string") ||
      typeof issue.state !== "string" || !["open", "closed"].includes(issue.state) || typeof issue.updated_at !== "string" ||
      !Number.isFinite(Date.parse(issue.updated_at))) {
    throw new Error("GitHub returned an invalid issue snapshot");
  }
  const url = `https://github.com/${repo.full_name}/issues/${issue.number}`;
  if (issue.html_url !== url) throw new Error("GitHub issue URL does not match the selected repository");
  const body = issue.body ?? "";
  const revision = JSON.stringify(["github-issues-v1", String(repo.id), String(issue.id), issue.updated_at,
    issue.title, body, issue.state]);
  return {
    eventId: fingerprintId("gh", revision, 64),
    hookType: "post_tool_use",
    sessionId: fingerprintId(`gh_${repo.id}_issue_${issue.id}`, JSON.stringify(["github-project-v1", project]), 64),
    project,
    cwd,
    timestamp: issue.updated_at,
    data: {
      source: "github-watcher",
      tool_name: "GitHubIssue",
      tool_input: { repository: repo.full_name, issue: issue.number, url },
      tool_output: `#${issue.number} ${issue.title}\nState: ${issue.state}\n${url}\n\n${body}`,
    },
  };
}

function nextPage(header: string | null, current: string, repo: Repository, initial: string): string | null {
  if (!header) return null;
  const links = header.split(/,(?=\s*<)/).map((part) => {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (!match) throw new Error("GitHub returned an invalid pagination link");
    return { url: match[1], rel: match[2] };
  });
  const next = links.filter((link) => link.rel.split(/\s+/).includes("next"));
  if (next.length > 1) throw new Error("GitHub returned multiple next pages");
  if (!next.length) return null;
  let url: URL;
  try { url = new URL(next[0].url, current); } catch { throw new Error("GitHub next page URL is invalid"); }
  const paths = [`/repos/${repo.full_name}/issues`, `/repositories/${repo.id}/issues`];
  if (url.origin !== API || url.username || url.password || url.hash || !paths.includes(url.pathname)) {
    throw new Error("GitHub next page escaped the selected repository");
  }
  const page = url.searchParams.get("page");
  if (!page || !/^[1-9]\d*$/.test(page)) throw new Error("GitHub next page has an invalid page number");
  const expected = new URL(initial).searchParams;
  for (const [key, value] of expected) {
    if (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value) {
      throw new Error("GitHub next page changed the selected query");
    }
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "page" && !expected.has(key)) throw new Error("GitHub next page added an unexpected query");
  }
  if (url.searchParams.getAll("page").length !== 1) throw new Error("GitHub next page repeated its page number");
  return url.href;
}

async function readJson(response: Response, source: string): Promise<unknown> {
  try { return await response.json(); } catch { throw new Error(`${source} returned invalid JSON`); }
}

export class GitHubIssueWatcher {
  #cache = new Map<string, CachedPage>();
  #running = false;
  #repo: string;
  #project: string;
  #cwd: string;
  #observeUrl: string;
  #githubToken: string;
  #secret: string;
  #fetch: typeof globalThis.fetch;
  #since: string | undefined;
  #maxPages: number;

  constructor(options: WatcherOptions) {
    const { repo, project, cwd, baseUrl = "http://localhost:3111", githubToken = "",
      secret = "", since, maxPages = 10, fetch: transport = globalThis.fetch } = options ?? {};
    if (typeof repo !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo) ||
        [".", ".."].includes(repo.split("/")[1])) {
      throw new Error("repo must be one owner/repository name");
    }
    this.#repo = repo;
    this.#project = requiredText(project, "project");
    this.#cwd = requiredText(cwd, "cwd");
    this.#observeUrl = destination(baseUrl);
    if (typeof githubToken !== "string" || typeof secret !== "string") throw new Error("Credentials must be strings");
    this.#githubToken = githubToken.trim();
    this.#secret = secret.trim();
    if (since !== undefined && (typeof since !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(since) ||
        !Number.isFinite(Date.parse(since)))) throw new Error("since must be an ISO UTC timestamp");
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error("maxPages must be an integer from 1 to 100");
    if (typeof transport !== "function") throw new Error("A fetch transport is required");
    this.#since = since;
    this.#maxPages = maxPages;
    this.#fetch = transport;
  }

  async #github(url: string, etag?: string | null, authenticated = false): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2026-03-10" };
    if (authenticated && this.#githubToken) headers.authorization = `Bearer ${this.#githubToken}`;
    if (etag) headers["if-none-match"] = etag;
    try {
      return await this.#fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new Error("GitHub request failed; no automatic retry");
    }
  }

  async syncOnce(): Promise<SyncProgress & { complete: true }> {
    if (this.#running) throw new Error("A sync is already running");
    this.#running = true;
    const progress = { pages: 0, issues: 0, completed: 0, duplicates: 0, notModifiedPages: 0 };
    let failedEventId: string | undefined;
    try {
      const response = await this.#github(`${API}/repos/${this.#repo}`, undefined, true);
      if (response.status !== 200) throw new Error(`GitHub repository read returned HTTP ${response.status}; no automatic retry`);
      const metadata = await readJson(response, "GitHub repository");
      if (!isRecord(metadata) || metadata.private !== false) throw new Error("This prototype accepts public repositories only");
      if (!positiveId(metadata.id) || typeof metadata.full_name !== "string" ||
          metadata.full_name.toLowerCase() !== this.#repo.toLowerCase()) throw new Error("GitHub repository identity mismatch");
      const repo: Repository = { id: metadata.id, full_name: metadata.full_name };
      const initial = new URL(`${API}/repos/${repo.full_name}/issues`);
      initial.searchParams.set("state", "all");
      initial.searchParams.set("sort", "updated");
      initial.searchParams.set("direction", "asc");
      initial.searchParams.set("per_page", "100");
      if (this.#since) initial.searchParams.set("since", this.#since);
      const cache = new Map<string, CachedPage>();
      const seen = new Set<string>();
      let url: string | null = initial.href;
      while (url) {
        if (seen.has(url)) throw new Error("GitHub returned a pagination cycle");
        if (progress.pages >= this.#maxPages) throw new Error("Page bound reached; sync incomplete, no checkpoint advanced");
        seen.add(url);
        const previous = this.#cache.get(url);
        let page = await this.#github(url, previous?.etag);
        let entry: CachedPage | undefined;
        if (page.status === 304) {
          if (!previous) throw new Error("GitHub returned 304 without a completed cached page");
          progress.notModifiedPages++;
          const link = page.headers.get("link");
          if (link) entry = { ...previous, next: nextPage(link, url, repo, initial.href) };
          else if (previous.next) entry = previous;
          else page = await this.#github(url);
        }
        if (!entry) {
          if (page.status !== 200) throw new Error(`GitHub issue read returned HTTP ${page.status}; no automatic retry`);
          const rows = await readJson(page, "GitHub issue page");
          if (!Array.isArray(rows) || rows.length > 100) throw new Error("GitHub returned an invalid issue page");
          const snapshots: IssueSnapshot[] = [];
          for (const row of rows) {
            if (!isRecord(row)) throw new Error("GitHub returned an invalid issue row");
            if (row.pull_request) continue;
            snapshots.push(issueSnapshot(repo, row, this.#project, this.#cwd));
          }
          entry = { etag: page.headers.get("etag"), snapshots,
            next: nextPage(page.headers.get("link"), url, repo, initial.href) };
        }
        progress.pages++;
        for (const snapshot of entry.snapshots) {
          progress.issues++;
          failedEventId = snapshot.eventId;
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (this.#secret) headers.authorization = `Bearer ${this.#secret}`;
          let capture: Response;
          let ack: unknown;
          try {
            capture = await this.#fetch(this.#observeUrl, { method: "POST", headers,
              body: JSON.stringify(snapshot), redirect: "error", signal: AbortSignal.timeout(15_000) });
            ack = await capture.json();
          } catch {
            throw new Error("Capture outcome unknown; retain this identity and inspect the destination before rerunning");
          }
          if (!capture.ok || !isRecord(ack) || ack.eventId !== snapshot.eventId || ack.state !== "completed" ||
              typeof ack.status !== "string" || !["accepted", "duplicate"].includes(ack.status)) {
            throw new Error("Capture is not confirmed completed; no checkpoint advanced");
          }
          if (ack.status === "accepted") progress.completed++;
          else progress.duplicates++;
          failedEventId = undefined;
        }
        cache.set(url, entry);
        url = entry.next;
      }
      this.#cache = cache;
      return { complete: true, ...progress };
    } catch (error) {
      const safe = error instanceof SyntaxError ? "Invalid JSON response; sync incomplete" :
        error instanceof Error ? error.message : "Sync failed";
      throw new GitHubSyncError(safe, progress, failedEventId ? { failedEventId } : {});
    } finally {
      this.#running = false;
    }
  }
}
