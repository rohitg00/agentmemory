import type { ProjectSessionIndexEntry, Session } from "../types.js";
import { KV } from "./schema.js";
import { StateKV } from "./kv.js";
import { withKeyedLock } from "./keyed-mutex.js";

const PROJECT_SESSION_INDEX_CAP = 50;
const MIN_ENTRIES_PER_AGENT = 10;

function sortByStartedAtDesc(
  entries: ProjectSessionIndexEntry[],
): ProjectSessionIndexEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

function capWithAgentFairness(
  entries: ProjectSessionIndexEntry[],
): ProjectSessionIndexEntry[] {
  const sorted = sortByStartedAtDesc(entries);
  if (sorted.length <= PROJECT_SESSION_INDEX_CAP) return sorted;

  const perAgentSeen = new Map<string, number>();
  const kept: ProjectSessionIndexEntry[] = [];
  const overflow: ProjectSessionIndexEntry[] = [];
  for (const entry of sorted) {
    if (kept.length >= PROJECT_SESSION_INDEX_CAP) {
      overflow.push(entry);
      continue;
    }
    const agentKey = entry.agentId ?? "";
    const seen = perAgentSeen.get(agentKey) ?? 0;
    if (seen < MIN_ENTRIES_PER_AGENT) {
      kept.push(entry);
      perAgentSeen.set(agentKey, seen + 1);
    } else {
      overflow.push(entry);
    }
  }

  const remainingSlots = PROJECT_SESSION_INDEX_CAP - kept.length;
  if (remainingSlots > 0) kept.push(...overflow.slice(0, remainingSlots));
  return sortByStartedAtDesc(kept);
}

async function loadStoredProjectSessionEntries(
  kv: StateKV,
  project: string,
): Promise<ProjectSessionIndexEntry[]> {
  const sessions = await kv.list<Session>(KV.sessions);
  return sessions
    .filter((s) => s.project === project)
    .map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      ...(s.agentId ? { agentId: s.agentId } : {}),
    }));
}

export async function getProjectSessionIndex(
  kv: StateKV,
  project: string,
): Promise<ProjectSessionIndexEntry[] | null> {
  return kv
    .get<ProjectSessionIndexEntry[]>(KV.projectSessionsIndex, project)
    .catch(() => null);
}

export async function addSessionToProjectIndex(
  kv: StateKV,
  project: string,
  entry: ProjectSessionIndexEntry,
): Promise<void> {
  await withKeyedLock(`project-session-index:${project}`, async () => {
    const existing = await getProjectSessionIndex(kv, project);
    const base = existing ?? (await loadStoredProjectSessionEntries(kv, project));
    const merged = base.filter((e) => e.id !== entry.id);
    merged.push(entry);
    await kv.set(KV.projectSessionsIndex, project, capWithAgentFairness(merged));
  });
}

export async function removeSessionFromProjectIndex(
  kv: StateKV,
  project: string,
  sessionId: string,
): Promise<void> {
  await withKeyedLock(`project-session-index:${project}`, async () => {
    const existing = await getProjectSessionIndex(kv, project);
    if (!existing) return;
    const next = existing.filter((e) => e.id !== sessionId);
    if (next.length === existing.length) return;
    await kv.set(KV.projectSessionsIndex, project, next);
  });
}

export function buildProjectSessionIndex(
  sessions: ProjectSessionIndexEntry[],
): ProjectSessionIndexEntry[] {
  return capWithAgentFairness(sessions);
}

export async function ensureProjectSessionIndex(
  kv: StateKV,
  project: string,
  fallbackSessions: ProjectSessionIndexEntry[],
): Promise<ProjectSessionIndexEntry[]> {
  return withKeyedLock(`project-session-index:${project}`, async () => {
    const existing = await getProjectSessionIndex(kv, project);
    if (existing !== null) return existing;
    const next = buildProjectSessionIndex(fallbackSessions);
    await kv.set(KV.projectSessionsIndex, project, next).catch(() => {});
    return next;
  });
}

export async function rebuildAllProjectSessionIndexes(
  kv: StateKV,
): Promise<{ projects: number; sessions: number }> {
  const sessions = await kv.list<Session>(KV.sessions);
  const byProject = new Map<string, ProjectSessionIndexEntry[]>();
  for (const session of sessions) {
    if (!session.project) continue;
    const entry: ProjectSessionIndexEntry = {
      id: session.id,
      startedAt: session.startedAt,
      ...(session.agentId ? { agentId: session.agentId } : {}),
    };
    const bucket = byProject.get(session.project);
    if (bucket) bucket.push(entry);
    else byProject.set(session.project, [entry]);
  }
  for (const [project, entries] of byProject) {
    await withKeyedLock(`project-session-index:${project}`, () =>
      kv.set(KV.projectSessionsIndex, project, buildProjectSessionIndex(entries)),
    );
  }
  return { projects: byProject.size, sessions: sessions.length };
}

const SESSION_INDEX_GENERATION_KEY = "session-index-generation";
const SESSION_INDEX_GENERATION = 1;

export async function rebuildSessionIndexIfStale(
  kv: StateKV,
): Promise<{ projects: number; sessions: number } | null> {
  const marker = await kv.get<number>(KV.config, SESSION_INDEX_GENERATION_KEY);
  if (marker === SESSION_INDEX_GENERATION) return null;
  const result = await rebuildAllProjectSessionIndexes(kv);
  await kv.set(KV.config, SESSION_INDEX_GENERATION_KEY, SESSION_INDEX_GENERATION);
  return result;
}
