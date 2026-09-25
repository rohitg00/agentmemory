import type { ProjectSessionIndexEntry } from "../types.js";
import { KV } from "./schema.js";
import { StateKV } from "./kv.js";
import { withKeyedLock } from "./keyed-mutex.js";

const PROJECT_SESSION_INDEX_CAP = 50;

function sortByStartedAtDesc(
  entries: ProjectSessionIndexEntry[],
): ProjectSessionIndexEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
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
    const merged = (existing ?? []).filter((e) => e.id !== entry.id);
    merged.push(entry);
    const next = sortByStartedAtDesc(merged).slice(
      0,
      PROJECT_SESSION_INDEX_CAP,
    );
    await kv.set(KV.projectSessionsIndex, project, next);
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
    await kv.set(KV.projectSessionsIndex, project, next);
  });
}

export function buildProjectSessionIndex(
  sessions: ProjectSessionIndexEntry[],
): ProjectSessionIndexEntry[] {
  return sortByStartedAtDesc(sessions).slice(0, PROJECT_SESSION_INDEX_CAP);
}
