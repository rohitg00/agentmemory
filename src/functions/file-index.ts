import type { IIIClient } from "iii-sdk";
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

function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/(.)\/+$/, "$1");
  return /^[A-Za-z]:\//.test(slashed) ? slashed.charAt(0).toLowerCase() + slashed.slice(1) : slashed;
}

function isAbsolutePath(path: string): boolean {
  const slashed = normalizePath(path);
  return slashed.startsWith("/") || /^[a-z]:\//.test(slashed);
}

// Windows file systems ignore case, so a path with a drive letter or a UNC prefix compares in any case.
function foldWindowsCase(a: string, b: string): [string, string] {
  const windows = (path: string) => /^[a-z]:\//.test(path) || path.startsWith("//");
  return windows(a) || windows(b) ? [a.toLowerCase(), b.toLowerCase()] : [a, b];
}

function samePath(a: string, b: string): boolean {
  const [left, right] = foldWindowsCase(a, b);
  return left === right;
}

// The project is the repository's directory name, so a session's repository root is the nearest
// directory at or above its cwd with that name; a renamed project falls back to the cwd.
function sessionRoot(cwd: string, project: string): string {
  const dir = normalizePath(cwd);
  for (let candidate = dir; candidate.includes("/"); candidate = candidate.slice(0, candidate.lastIndexOf("/"))) {
    if (samePath(candidate, `${candidate.slice(0, candidate.lastIndexOf("/") + 1)}${project}`)) return candidate;
  }
  return dir;
}

// A repository-relative query names one file exactly, so a bare `package.json` is the root one,
// not every `package.json` below it. A relative entry must equal it; an absolute entry from before
// relative capture must be that file under its session's repository root.
function matchesRelativeQuery(query: string, stored: string, session: Session): boolean {
  const entry = normalizePath(stored);
  if (!isAbsolutePath(entry)) return entry === query;
  return Boolean(session.cwd) && samePath(entry, `${sessionRoot(session.cwd, session.project)}/${query}`);
}

// A bug memory has no session to place an older absolute entry, so that entry matches by its ending
// at a path boundary; two relative paths must be equal.
export function bugFileMatches(stored: string, requested: string): boolean {
  const entry = normalizePath(stored);
  const query = normalizePath(requested);
  if (!isAbsolutePath(entry) && !isAbsolutePath(query)) return entry === query;
  const [left, right] = foldWindowsCase(entry, query);
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

export function registerFileIndexFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction("mem::file-context", 
    async (
      data:
        | { sessionId?: string; files?: string[]; project?: string; relativeFiles?: boolean }
        | undefined,
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
        const relativeQuery =
          data?.relativeFiles === true && !isAbsolutePath(file)
            ? normalizePath(normalizedFile)
            : undefined;

        for (const session of otherSessions) {
          const observations = obsCache.get(session.id) || [];

          for (const obs of observations) {
            if (!obs.files || !obs.title) continue;
            const matches = obs.files.some((f) =>
              relativeQuery !== undefined
                ? matchesRelativeQuery(relativeQuery, f, session)
                : f === file ||
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
