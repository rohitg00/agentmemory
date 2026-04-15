import type { ISdk } from "iii-sdk";
import type { CompressedObservation, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { recordAccessBatch } from "./access-tracker.js";
import { logger } from "../logger.js";

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
  sdk.registerFunction("mem::file-context", 
    async (
      data: { sessionId?: string; files?: string[]; project?: string } | undefined,
    ) => {
      const sessionId =
        data && typeof data.sessionId === "string" ? data.sessionId.trim() : "";
      const normalizedProject =
        typeof data?.project === "string" ? data.project.trim() : undefined;
      const files = Array.isArray(data?.files)
        ? data!.files
            .map((file) => (typeof file === "string" ? file.trim() : ""))
            .filter(Boolean)
        : [];
      if (files.length === 0) {
        await recordAudit(kv, "observe", "mem::file-context", [sessionId || "unknown"], {
          error: "invalid_payload",
          hasSessionId: !!sessionId,
          hasProject: !!normalizedProject,
          fileCount: files.length,
        });
        return { context: "", files: [] };
      }
      const results: FileHistory[] = [];

      const sessions = await kv.list<Session>(KV.sessions);
      let otherSessions = sessionId
        ? sessions.filter((s) => s.id !== sessionId)
        : sessions;
      if (normalizedProject) {
        otherSessions = otherSessions.filter((s) => s.project === normalizedProject);
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

      for (const file of files) {
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

      const accessedIds: string[] = [];
      for (const fh of results) {
        for (const obs of fh.observations) accessedIds.push(obs.obsId);
      }
      void recordAccessBatch(kv, accessedIds);

      const context = lines.join("\n");
      logger.info("File context generated", {
        files: files.length,
        results: results.length,
      });
      return { context };
    },
  );
}
