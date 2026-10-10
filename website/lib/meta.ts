import "server-only";
import generated from "./generated-meta.json" with { type: "json" };

export interface ProjectMeta {
  version: string;
  mcpTools: number;
  hooks: number;
  restEndpoints: number;
  testsPassing: number;
  stars: number;
  forks: number;
  contributors: number;
  releases: number;
  npmWeekly: number;
  npmMonthly: number;
  npmAllTime: number;
  generatedAt: string;
}

export function getProjectMeta(): ProjectMeta {
  return generated as ProjectMeta;
}

export function compact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(n);
}
