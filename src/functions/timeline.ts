import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  CompressedObservation,
  Session,
  TimelineEntry,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerTimelineFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::timeline",
      description: "Get chronological observations around an anchor point",
    },
    async (data: {
      anchor: string;
      project?: string;
      before?: number;
      after?: number;
    }) => {
      const ctx = getContext();
      const before = Math.max(0, Math.floor(data.before ?? 5));
      const after = Math.max(0, Math.floor(data.after ?? 5));

      if (!data.anchor || typeof data.anchor !== "string") {
        return { entries: [], anchor: data.anchor, reason: "invalid_anchor" };
      }

      let anchorTime: number;
      const isoPattern = /^\d{4}-\d{2}-\d{2}/;
      if (isoPattern.test(data.anchor)) {
        anchorTime = new Date(data.anchor).getTime();
        if (isNaN(anchorTime)) {
          return { entries: [], anchor: data.anchor, reason: "invalid_date" };
        }
      } else {
        const searchResults = await findByKeyword(
          kv,
          data.anchor,
          data.project,
        );
        if (searchResults.length === 0) {
          return { entries: [], anchor: data.anchor, reason: "no_match" };
        }
        anchorTime = new Date(searchResults[0].timestamp).getTime();
      }

      const sessions = await kv.list<Session>(KV.sessions);
      const filtered = data.project
        ? sessions.filter((s) => s.project === data.project)
        : sessions;

      const allObs: Array<CompressedObservation & { sid: string }> = [];
      for (const session of filtered) {
        const observations = await kv.list<CompressedObservation>(
          KV.observations(session.id),
        );
        for (const obs of observations) {
          if (obs.title && obs.timestamp) {
            allObs.push({ ...obs, sid: session.id });
          }
        }
      }

      allObs.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      let anchorIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < allObs.length; i++) {
        const dist = Math.abs(
          new Date(allObs[i].timestamp).getTime() - anchorTime,
        );
        if (dist < minDist) {
          minDist = dist;
          anchorIdx = i;
        }
      }

      const startIdx = Math.max(0, anchorIdx - before);
      const endIdx = Math.min(allObs.length - 1, anchorIdx + after);
      const entries: TimelineEntry[] = [];

      for (let i = startIdx; i <= endIdx; i++) {
        const obs = allObs[i];
        const { sid, ...observation } = obs;
        entries.push({
          observation,
          sessionId: sid,
          relativePosition: i - anchorIdx,
        });
      }

      ctx.logger.info("Timeline retrieved", {
        anchor: data.anchor,
        entries: entries.length,
      });
      return { entries, anchorIndex: anchorIdx - startIdx };
    },
  );
}

async function findByKeyword(
  kv: StateKV,
  keyword: string,
  project?: string,
): Promise<CompressedObservation[]> {
  const sessions = await kv.list<Session>(KV.sessions);
  const filtered = project
    ? sessions.filter((s) => s.project === project)
    : sessions;

  const lower = keyword.toLowerCase();
  const matches: CompressedObservation[] = [];

  for (const session of filtered) {
    const observations = await kv.list<CompressedObservation>(
      KV.observations(session.id),
    );
    for (const obs of observations) {
      if (
        obs.title?.toLowerCase().includes(lower) ||
        obs.narrative?.toLowerCase().includes(lower) ||
        obs.concepts?.some((c) => c.toLowerCase().includes(lower))
      ) {
        matches.push(obs);
      }
    }
  }

  return matches.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
