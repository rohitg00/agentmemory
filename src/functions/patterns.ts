import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { CompressedObservation, Session } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

interface Pattern {
  type: "co_change" | "error_repeat" | "workflow";
  description: string;
  files: string[];
  frequency: number;
  sessions: string[];
}

export function registerPatternsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::patterns" },
    async (data: { project?: string }) => {
      const ctx = getContext();
      const patterns: Pattern[] = [];

      const sessions = await kv.list<Session>(KV.sessions);
      const filtered = data.project
        ? sessions.filter((s) => s.project === data.project)
        : sessions;

      const fileCoOccurrences = new Map<string, number>();
      const fileSessionMap = new Map<string, Set<string>>();
      const errorPatterns = new Map<
        string,
        { count: number; sessions: Set<string> }
      >();

      for (const session of filtered) {
        const observations = await kv.list<CompressedObservation>(
          KV.observations(session.id),
        );
        if (!observations.length) continue;

        const sessionFiles = new Set<string>();
        for (const obs of observations) {
          if (!obs.files) continue;
          for (const f of obs.files) {
            sessionFiles.add(f);
            if (!fileSessionMap.has(f)) fileSessionMap.set(f, new Set());
            fileSessionMap.get(f)!.add(session.id);
          }

          if (obs.type === "error" && obs.title) {
            const key = obs.title.toLowerCase().slice(0, 80);
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
            fileCoOccurrences.set(pair, (fileCoOccurrences.get(pair) || 0) + 1);
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

      ctx.logger.info("Pattern detection complete", {
        patterns: patterns.length,
        sessions: filtered.length,
      });

      return { patterns: patterns.slice(0, 20) };
    },
  );

  sdk.registerFunction(
    { id: "mem::generate-rules" },
    async (data: { project?: string }) => {
      const ctx = getContext();
      const result = await sdk.trigger<
        { project?: string },
        { patterns: Pattern[] }
      >("mem::patterns", data);

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

      ctx.logger.info("Rules generated", { count: rules.length });
      return { rules };
    },
  );
}
