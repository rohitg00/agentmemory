import type { IIIClient } from "iii-sdk";
import type { CompressedObservation, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { logger } from "../logger.js";

interface Pattern {
  type: "co_change" | "error_repeat" | "workflow";
  description: string;
  files: string[];
  frequency: number;
  sessions: string[];
}

const DEFAULT_SESSION_LIMIT = 50;
const MAX_SESSION_LIMIT = 500;
const MAX_OBSERVATIONS_SCANNED = 5_000;

function resolveSessionLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SESSION_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_SESSION_LIMIT);
}

export function registerPatternsFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction("mem::patterns",
    async (data?: { project?: string; limit?: number }) => {
      const { project, limit } = data ?? {};
      const patterns: Pattern[] = [];
      const sessionLimit = resolveSessionLimit(limit);

      const sessions = await kv.list<Session>(KV.sessions);
      const filtered = (project
        ? sessions.filter((s) => s.project === project)
        : sessions
      )
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, sessionLimit);

      const fileCoOccurrences = new Map<string, number>();
      const fileSessionMap = new Map<string, Set<string>>();
      const errorPatterns = new Map<
        string,
        { count: number; sessions: Set<string> }
      >();

      let observationsScanned = 0;
      let sessionsProcessed = 0;
      const sessionsSkipped: string[] = [];
      for (let batch = 0; batch < filtered.length; batch += 10) {
        if (observationsScanned >= MAX_OBSERVATIONS_SCANNED) break;
        const remainingBudget = MAX_OBSERVATIONS_SCANNED - observationsScanned;
        const chunk = filtered.slice(batch, batch + 10);
        const eligible: Session[] = [];
        for (const session of chunk) {
          if ((session.observationCount || 0) > remainingBudget) {
            sessionsSkipped.push(session.id);
          } else {
            eligible.push(session);
          }
        }

        const loaded = await Promise.all(
          eligible.map(async (session) => ({
            session,
            observations: await kv.list<CompressedObservation>(
              KV.observations(session.id),
            ),
          })),
        );

        for (const { session, observations } of loaded) {
          if (observationsScanned >= MAX_OBSERVATIONS_SCANNED) break;
          sessionsProcessed++;
          if (!observations.length) continue;
          const remaining = MAX_OBSERVATIONS_SCANNED - observationsScanned;
          const bounded =
            observations.length > remaining
              ? observations.slice(0, remaining)
              : observations;
          observationsScanned += bounded.length;

          const sessionFiles = new Set<string>();
          for (const obs of bounded) {
            if (!obs.files) continue;
            for (const f of obs.files) {
              sessionFiles.add(f);
              if (!fileSessionMap.has(f)) fileSessionMap.set(f, new Set());
              fileSessionMap.get(f)!.add(session.id);
            }

            if (obs.type === "error" && obs.title) {
              const key = obs.title.toLowerCase();
              if (!errorPatterns.has(key)) {
                errorPatterns.set(key, { count: 0, sessions: new Set() });
              }
              const ep = errorPatterns.get(key)!;
              ep.count++;
              ep.sessions.add(session.id);
            }
          }

          const fileList = [...sessionFiles].sort();
          for (let i = 0; i < fileList.length; i++) {
            for (let j = i + 1; j < fileList.length; j++) {
              const pair = `${fileList[i]}::${fileList[j]}`;
              fileCoOccurrences.set(
                pair,
                (fileCoOccurrences.get(pair) || 0) + 1,
              );
            }
          }
        }
      }

      for (const [pair, count] of fileCoOccurrences) {
        if (count < 3) continue;
        const [fileA, fileB] = pair.split("::");
        const sessionsA = fileSessionMap.get(fileA) || new Set();
        const sessionsB = fileSessionMap.get(fileB) || new Set();
        const commonSessions = [...sessionsA].filter((s) => sessionsB.has(s));

        patterns.push({
          type: "co_change",
          description: `${fileA} and ${fileB} are frequently modified together`,
          files: [fileA, fileB],
          frequency: count,
          sessions: commonSessions,
        });
      }

      for (const [
        errorKey,
        { count, sessions: errorSessions },
      ] of errorPatterns) {
        if (count < 2) continue;
        patterns.push({
          type: "error_repeat",
          description: `Recurring error: ${errorKey}`,
          files: [],
          frequency: count,
          sessions: [...errorSessions],
        });
      }

      patterns.sort((a, b) => b.frequency - a.frequency);

      logger.info("Pattern detection complete", {
        patterns: patterns.length,
        sessionsInScope: filtered.length,
        sessionsProcessed,
        sessionsSkipped: sessionsSkipped.length,
        sessionLimit,
        observationsScanned,
      });

      return {
        patterns: patterns.slice(0, 20),
        sessionsInScope: filtered.length,
        sessionsProcessed,
        sessionsSkipped,
        sessionLimit,
        observationsScanned,
      };
    },
  );

  sdk.registerFunction("mem::generate-rules", 
    async (data: { project?: string }) => {
      const result = await sdk.trigger<
        { project?: string },
        { patterns: Pattern[] }
      >({ function_id: "mem::patterns", payload: data });

      const rules: string[] = [];

      for (const pattern of result.patterns) {
        if (pattern.type === "co_change" && pattern.frequency >= 4) {
          rules.push(
            `When modifying ${pattern.files[0]}, also check ${pattern.files[1]} (co-changed ${pattern.frequency} times).`,
          );
        }
        if (pattern.type === "error_repeat" && pattern.frequency >= 3) {
          rules.push(
            `Watch for: ${pattern.description} (occurred ${pattern.frequency} times across ${pattern.sessions.length} sessions).`,
          );
        }
      }

      logger.info("Rules generated", { count: rules.length });
      return { rules };
    },
  );
}
