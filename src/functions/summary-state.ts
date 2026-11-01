import { createHash, randomUUID } from "node:crypto";
import type { CompressedObservation, Session, SessionSummary, SessionSummaryRepair } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { isKeyedLockHeld, withKeyedLock } from "../state/keyed-mutex.js";

export function summaryObservations(observations: CompressedObservation[]): CompressedObservation[] {
  return observations.filter((row) => row.title).sort((a, b) =>
    (a.compressedAt ?? a.timestamp).localeCompare(b.compressedAt ?? b.timestamp) || a.id.localeCompare(b.id));
}

export function summaryFingerprint(session: Session, observations: CompressedObservation[]): string {
  return createHash("sha256").update(JSON.stringify([
    session.id, session.project, session.cwd, session.agentId, session.startedAt,
    observations.map((row) => [row.id, row.type, row.title, row.narrative, row.facts, row.files, row.concepts]),
  ])).digest("hex");
}

export function summaryCovers(session: Session, observations: CompressedObservation[], summary: SessionSummary | null): boolean {
  return Boolean(summary?.coveredFingerprint && summary.observationCount === observations.length &&
    summary.coveredFingerprint === summaryFingerprint(session, observations));
}

export async function requestSummaryRefresh(kv: StateKV, sessionId: string, dueAt = Date.now()): Promise<void> {
  const save = async () => {
    const session = await kv.get<Session>(KV.sessions, sessionId);
    if (!session || session.id !== sessionId) return;
    await kv.set<SessionSummaryRepair>(KV.summaryRepairs, sessionId, {
      sessionId, token: randomUUID(), dueAt, attempts: 0,
    });
  };
  if (isKeyedLockHeld(`obs:${sessionId}`)) await save();
  else await withKeyedLock(`obs:${sessionId}`, save);
}
