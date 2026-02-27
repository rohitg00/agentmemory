import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  CompressedObservation,
  Session,
  ProjectProfile,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerProfileFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::profile",
      description: "Generate or retrieve a project profile from aggregated data",
    },
    async (data: { project: string; refresh?: boolean }) => {
      const ctx = getContext();

      if (!data.refresh) {
        const cached = await kv
          .get<ProjectProfile>(KV.profiles, data.project)
          .catch(() => null);
        if (cached) {
          const age = Date.now() - new Date(cached.updatedAt).getTime();
          if (age < 3600_000) {
            return { profile: cached, cached: true };
          }
        }
      }

      const sessions = await kv.list<Session>(KV.sessions);
      const projectSessions = sessions.filter(
        (s) => s.project === data.project,
      );

      if (projectSessions.length === 0) {
        return { profile: null, reason: "no_sessions" };
      }

      const conceptFreq = new Map<string, number>();
      const fileFreq = new Map<string, number>();
      const errors: string[] = [];
      const recentActivity: string[] = [];
      let totalObs = 0;

      const sortedSessions = projectSessions.sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

      for (const session of sortedSessions.slice(0, 20)) {
        const observations = await kv.list<CompressedObservation>(
          KV.observations(session.id),
        );
        totalObs += observations.length;

        for (const obs of observations) {
          for (const concept of obs.concepts || []) {
            conceptFreq.set(concept, (conceptFreq.get(concept) || 0) + 1);
          }
          for (const file of obs.files || []) {
            fileFreq.set(file, (fileFreq.get(file) || 0) + 1);
          }
          if (obs.type === "error") {
            errors.push(obs.title);
          }
        }

        const important = observations
          .filter((o) => o.importance >= 7)
          .sort((a, b) => b.importance - a.importance);
        if (important.length > 0) {
          recentActivity.push(
            `[${session.startedAt.slice(0, 10)}] ${important[0].title}`,
          );
        }
      }

      const topConcepts = Array.from(conceptFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([concept, frequency]) => ({ concept, frequency }));

      const topFiles = Array.from(fileFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([file, frequency]) => ({ file, frequency }));

      const uniqueErrors = [...new Set(errors)].slice(0, 10);

      const profile: ProjectProfile = {
        project: data.project,
        updatedAt: new Date().toISOString(),
        topConcepts,
        topFiles,
        conventions: extractConventions(topConcepts, topFiles),
        commonErrors: uniqueErrors,
        recentActivity: recentActivity.slice(0, 10),
        sessionCount: projectSessions.length,
        totalObservations: totalObs,
      };

      await kv.set(KV.profiles, data.project, profile);

      ctx.logger.info("Profile generated", {
        project: data.project,
        sessions: projectSessions.length,
        observations: totalObs,
      });
      return { profile, cached: false };
    },
  );
}

function extractConventions(
  concepts: Array<{ concept: string; frequency: number }>,
  files: Array<{ file: string; frequency: number }>,
): string[] {
  const conventions: string[] = [];

  const tsFiles = files.filter((f) => f.file.endsWith(".ts")).length;
  const jsFiles = files.filter((f) => f.file.endsWith(".js")).length;
  if (tsFiles > jsFiles && tsFiles > 0) {
    conventions.push("TypeScript project");
  }

  const srcFiles = files.filter((f) => f.file.includes("/src/")).length;
  if (srcFiles > files.length * 0.5) {
    conventions.push("Standard src/ directory structure");
  }

  const testFiles = files.filter(
    (f) => f.file.includes("test") || f.file.includes("spec"),
  ).length;
  if (testFiles > 0) {
    conventions.push("Has test files");
  }

  for (const { concept, frequency } of concepts.slice(0, 5)) {
    if (frequency >= 3) {
      conventions.push(`Frequently uses: ${concept}`);
    }
  }

  return conventions;
}
