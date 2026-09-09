import type { Session, SessionSummary } from "../types.js";

export interface SessionListOptions {
  limit?: number;
  cursor?: string;
  project?: string;
  status?: Session["status"];
  since?: string;
  format?: "compact" | "full";
  includePrompt?: boolean;
  includeMalformed?: boolean;
}

export interface SessionPage {
  sessions: Array<
    Omit<Partial<Session>, "summary"> &
      Pick<Session, "id" | "project" | "status"> & {
        issues?: string[];
        summary?: string | SessionSummary;
      }
  >;
  pagination: {
    total: number;
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
    malformedExcluded: number;
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const offset = Number(raw);
    if (!Number.isInteger(offset) || offset < 0) throw new Error("invalid offset");
    return offset;
  } catch {
    throw new Error("cursor must be a valid session-page cursor");
  }
}

function normalizedLimit(value?: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function sessionTimestamp(session: Session): string {
  return session.updatedAt || session.startedAt || "";
}

export function sessionIssues(session: Session): string[] {
  const issues: string[] = [];
  if (typeof session?.id !== "string" || !session.id.trim()) issues.push("missing_id");
  if (typeof session?.project !== "string" || !session.project.trim()) issues.push("missing_project");
  if (typeof session?.cwd !== "string" || !session.cwd.trim()) issues.push("missing_cwd");
  if (typeof session?.startedAt !== "string" || Number.isNaN(Date.parse(session.startedAt))) {
    issues.push("invalid_started_at");
  }
  if (!["active", "completed", "abandoned"].includes(session?.status)) issues.push("invalid_status");
  return issues;
}

function compactSession(session: Session): SessionPage["sessions"][number] {
  const issues = sessionIssues(session);
  return {
    id: typeof session.id === "string" ? session.id : "",
    project: typeof session.project === "string" ? session.project : "",
    status: ["active", "completed", "abandoned"].includes(session.status)
      ? session.status
      : "abandoned",
    observationCount: session.observationCount,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    contextUpdatedAt: session.contextUpdatedAt,
    endedAt: session.endedAt,
    agentId: session.agentId,
    repoRoot: session.repoRoot,
    scopeType: session.scopeType,
    worktree: session.worktree,
    branch: session.branch,
    taskSlug: session.taskSlug,
    projectAliases: session.projectAliases,
    canonicalRepoId: session.canonicalRepoId,
    repoRemote: session.repoRemote,
    terminalSession: session.terminalSession,
    missionId: session.missionId,
    missionTitle: session.missionTitle,
    missionRole: session.missionRole,
    parentSession: session.parentSession,
    commitSha: session.commitSha,
    ...(issues.length > 0 ? { issues } : {}),
  };
}

function fullSession(session: Session, includePrompt: boolean): Session {
  if (includePrompt) return { ...session };
  const { firstPrompt: _firstPrompt, ...safe } = session;
  return safe as Session;
}

export function selectSessionPage(
  input: Session[],
  options: SessionListOptions = {},
): SessionPage {
  const limit = normalizedLimit(options.limit);
  const offset = decodeCursor(options.cursor);
  const format = options.format ?? "compact";
  if (format !== "compact" && format !== "full") {
    throw new Error("format must be compact or full");
  }
  if (options.status && !["active", "completed", "abandoned"].includes(options.status)) {
    throw new Error("status must be active, completed, or abandoned");
  }
  const sinceMs = options.since ? Date.parse(options.since) : null;
  if (options.since && Number.isNaN(sinceMs)) {
    throw new Error("since must be a valid ISO timestamp");
  }

  const malformed = input.filter((session) => sessionIssues(session).length > 0);
  const candidates = options.includeMalformed
    ? input
    : input.filter((session) => sessionIssues(session).length === 0);
  const filtered = candidates
    .filter((session) => {
      if (
        options.project &&
        session.project !== options.project &&
        !(Array.isArray(session.projectAliases) && session.projectAliases.includes(options.project))
      ) {
        return false;
      }
      if (options.status && session.status !== options.status) return false;
      if (sinceMs !== null && Date.parse(sessionTimestamp(session)) < sinceMs) return false;
      return true;
    })
    .sort((left, right) => {
      const byTime = sessionTimestamp(right).localeCompare(sessionTimestamp(left));
      return byTime || String(right.id || "").localeCompare(String(left.id || ""));
    });

  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < filtered.length;
  return {
    sessions: page.map((session) =>
      format === "full" ? fullSession(session, options.includePrompt === true) : compactSession(session),
    ),
    pagination: {
      total: filtered.length,
      limit,
      nextCursor: hasMore ? encodeCursor(nextOffset) : null,
      hasMore,
      malformedExcluded: options.includeMalformed ? 0 : malformed.length,
    },
  };
}
