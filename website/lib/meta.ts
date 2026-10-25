import "server-only";
import generated from "./generated-meta.json" with { type: "json" };
import { REPO } from "./site";

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

const LIVE_STATS_REVALIDATE_SECONDS = 3600;
const NPM_PACKAGES = ["@agentmemory/agentmemory", "@agentmemory/mcp"];
const NPM_FIRST_DAY = "2026-04-01";
const NPM_RANGE_DAYS = 540;
const DAY_MS = 86_400_000;

async function liveFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, {
    headers: { "user-agent": "agentmemory-website", ...headers },
    next: { revalidate: LIVE_STATS_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res;
}

function lastPage(link: string | null): number | undefined {
  const m = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : undefined;
}

async function npmAllTime(): Promise<number> {
  const end = Date.now();
  const ranges: string[] = [];
  for (let from = Date.parse(`${NPM_FIRST_DAY}T00:00:00Z`); from <= end; from += NPM_RANGE_DAYS * DAY_MS) {
    const to = Math.min(end, from + (NPM_RANGE_DAYS - 1) * DAY_MS);
    ranges.push(`${new Date(from).toISOString().slice(0, 10)}:${new Date(to).toISOString().slice(0, 10)}`);
  }
  const counts = await Promise.all(
    NPM_PACKAGES.flatMap((pkg) =>
      ranges.map(async (range) => {
        const data = (await (await liveFetch(`https://api.npmjs.org/downloads/point/${range}/${pkg}`)).json()) as { downloads?: number };
        return data.downloads ?? 0;
      }),
    ),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

export async function getLiveProjectMeta(): Promise<ProjectMeta> {
  const base = getProjectMeta();
  const gh: Record<string, string> = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) gh.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const [stars, contributors, npm] = await Promise.allSettled([
    liveFetch(`https://api.github.com/repos/${REPO}`, gh).then(async (res) => ((await res.json()) as { stargazers_count?: number }).stargazers_count),
    liveFetch(`https://api.github.com/repos/${REPO}/contributors?per_page=1&anon=false`, gh).then((res) => lastPage(res.headers.get("link"))),
    npmAllTime(),
  ]);
  const pick = (result: PromiseSettledResult<number | undefined>, fallback: number) =>
    result.status === "fulfilled" && Number.isFinite(result.value) && (result.value ?? 0) > 0 ? (result.value as number) : fallback;
  return {
    ...base,
    stars: pick(stars, base.stars),
    contributors: pick(contributors, base.contributors),
    npmAllTime: Math.max(pick(npm, base.npmAllTime), base.npmAllTime),
  };
}

export function compact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(n);
}
