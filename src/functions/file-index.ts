import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { CompressedObservation, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

interface FileHistory {
  file: string;
  observations: Array<{
    sessionId: string;
    obsId: string;
    type: string;
    title: string;
    narrative: string;
    importance: number;
    timestamp: string;
  }>;
}

export function registerFileIndexFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::file-context" },
    async (data: { sessionId: string; files: string[]; project?: string }) => {
      const ctx = getContext();
      const results: FileHistory[] = [];

      const sessions = await kv.list<Session>(KV.sessions);
      let otherSessions = sessions.filter((s) => s.id !== data.sessionId);
      if (data.project) {
        otherSessions = otherSessions.filter((s) => s.project === data.project);
      }
      otherSessions = otherSessions
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, 15);

      const obsCache = new Map<string, CompressedObservation[]>();
      for (const session of otherSessions) {
        obsCache.set(
          session.id,
          await kv.list<CompressedObservation>(KV.observations(session.id)),
        );
      }

      for (const file of data.files) {
        const history: FileHistory = { file, observations: [] };
        const normalizedFile = file.replace(/^\.\//, "");

        for (const session of otherSessions) {
          const observations = obsCache.get(session.id) || [];

          for (const obs of observations) {
            if (!obs.files || !obs.title) continue;
            const matches = obs.files.some(
              (f) =>
                f === file ||
                f === normalizedFile ||
                f.endsWith(`/${normalizedFile}`) ||
                normalizedFile.endsWith(`/${f}`),
            );
            if (matches && obs.importance >= 4) {
              history.observations.push({
                sessionId: session.id,
                obsId: obs.id,
                type: obs.type,
                title: obs.title,
                narrative: obs.narrative,
                importance: obs.importance,
                timestamp: obs.timestamp,
              });
            }
          }
        }

        history.observations.sort((a, b) => b.importance - a.importance);
        history.observations = history.observations.slice(0, 5);

        if (history.observations.length > 0) {
          results.push(history);
        }
      }

      if (results.length === 0) {
        return { context: "" };
      }

      const lines: string[] = ["<agentmemory-file-context>"];
      for (const fh of results) {
        lines.push(`## ${fh.file}`);
        for (const obs of fh.observations) {
          lines.push(`- [${obs.type}] ${obs.title}: ${obs.narrative}`);
        }
      }
      lines.push("</agentmemory-file-context>");

      const context = lines.join("\n");
      ctx.logger.info("File context generated", {
        files: data.files.length,
        results: results.length,
      });
      return { context };
    },
  );
}
