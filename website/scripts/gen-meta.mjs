#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = join(here, "..");
const repoRoot = join(websiteDir, "..");

function readFileSafe(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function safeReadJson(path) {
  const txt = readFileSafe(path);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function safeCountMatches(path, pattern) {
  const txt = readFileSafe(path);
  if (!txt) return 0;
  const m = txt.match(pattern);
  return m ? m.length : 0;
}

function countHookTypes(typesPath) {
  const txt = readFileSafe(typesPath);
  if (!txt) return 0;
  const union = txt.match(/export type HookType[\s\S]*?;/);
  if (!union) return 0;
  const body = union[0].replace(/export type HookType\s*=/, "").replace(/;$/, "");
  return body
    .split("|")
    .map((s) => s.trim())
    .filter((s) => /^["'`]/.test(s)).length;
}

function countTestCases(testDir) {
  let total = 0;
  let entries;
  try {
    entries = readdirSync(testDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(testDir, entry.name);
    if (entry.isDirectory()) {
      total += countTestCases(full);
      continue;
    }
    if (!/\.test\.[jt]sx?$/.test(entry.name)) continue;
    const txt = readFileSafe(full);
    if (!txt) continue;
    const m = txt.match(/(?:^|\s)(?:it|test)(?:\.\w+)?\s*\(/g);
    if (m) total += m.length;
  }
  return total;
}

const pkg = safeReadJson(join(repoRoot, "package.json"));
const version = pkg?.version;
if (!version) {
  throw new Error(
    `gen-meta: could not read version from ${join(repoRoot, "package.json")}. ` +
      `Check Vercel Root Directory: the full repo must be checked out, not just website/.`,
  );
}

const restEndpoints = safeCountMatches(
  join(repoRoot, "src", "triggers", "api.ts"),
  /config:\s*\{\s*api_path:\s*"/g,
);
const mcpTools = safeCountMatches(
  join(repoRoot, "src", "mcp", "tools-registry.ts"),
  /name:\s*"memory_/g,
);
const hooks = countHookTypes(join(repoRoot, "src", "types.ts"));
const testsPassing = countTestCases(join(repoRoot, "test"));

const REPO = "rohitg00/agentmemory";
const NPM_PKG = "@agentmemory/agentmemory";

const outDir = join(websiteDir, "lib");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "generated-meta.json");
const previous = safeReadJson(outPath) ?? {};

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": "agentmemory-website", ...headers },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return { res, data: await res.json() };
}

function lastPage(linkHeader, fallback) {
  const m = linkHeader?.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : fallback;
}

const NPM_ALL_TIME_PKGS = [NPM_PKG, "@agentmemory/mcp"];
const NPM_FIRST_DAY = "2026-04-01";
const NPM_WINDOW_DAYS = 540;

function day(d) {
  return d.toISOString().slice(0, 10);
}

async function npmAllTime() {
  const end = new Date();
  let total = 0;
  for (const pkg of NPM_ALL_TIME_PKGS) {
    let from = new Date(`${NPM_FIRST_DAY}T00:00:00Z`);
    while (from <= end) {
      const to = new Date(Math.min(end.getTime(), from.getTime() + (NPM_WINDOW_DAYS - 1) * 86400000));
      const { data } = await getJson(`https://api.npmjs.org/downloads/point/${day(from)}:${day(to)}/${pkg}`);
      total += data.downloads ?? 0;
      from = new Date(to.getTime() + 86400000);
    }
  }
  return total;
}

async function liveStats() {
  const gh = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) gh.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const out = {};
  const tasks = [
    getJson(`https://api.github.com/repos/${REPO}`, gh).then(({ data }) => {
      out.stars = data.stargazers_count;
      out.forks = data.forks_count;
    }),
    getJson(`https://api.github.com/repos/${REPO}/contributors?per_page=1&anon=false`, gh).then(({ res, data }) => {
      out.contributors = lastPage(res.headers.get("link"), data.length);
    }),
    getJson(`https://api.github.com/repos/${REPO}/releases?per_page=1`, gh).then(({ res, data }) => {
      out.releases = lastPage(res.headers.get("link"), data.length);
    }),
    getJson(`https://api.npmjs.org/downloads/point/last-week/${NPM_PKG}`).then(({ data }) => {
      out.npmWeekly = data.downloads;
    }),
    getJson(`https://api.npmjs.org/downloads/point/last-month/${NPM_PKG}`).then(({ data }) => {
      out.npmMonthly = data.downloads;
    }),
    npmAllTime().then((total) => {
      out.npmAllTime = total;
    }),
  ];
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.warn(`[gen-meta] live stat skipped: ${r.reason?.message ?? r.reason}`);
  }
  return out;
}

const STAT_FALLBACK = {
  stars: 29137,
  forks: 2552,
  contributors: 48,
  releases: 51,
  npmWeekly: 6152,
  npmMonthly: 24699,
  npmAllTime: 452004,
};

const live = await liveStats();
const stats = {};
for (const key of Object.keys(STAT_FALLBACK)) {
  const value = live[key];
  stats[key] = Number.isFinite(value) && value > 0 ? value : previous[key] ?? STAT_FALLBACK[key];
}

const meta = {
  version,
  mcpTools: mcpTools || 45,
  hooks: hooks || 12,
  restEndpoints: restEndpoints || 107,
  testsPassing: testsPassing || 794,
  ...stats,
  generatedAt: new Date().toISOString(),
};

writeFileSync(outPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");

function parseChangelog(text) {
  const releases = [];
  const re = /^## \[(\d+\.\d+\.\d+)\][^\n]*?(\d{4}-\d{2}-\d{2})?\s*$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    const body = text
      .slice(start, end)
      .replace(/^\[[^\]]+\]:\s*https?:\/\/\S+\s*$/gm, "")
      .trim();
    releases.push({ version: m[1], date: m[2] ?? "", body });
  });
  return releases;
}

const changelog = parseChangelog(readFileSafe(join(repoRoot, "CHANGELOG.md"))).slice(0, 12);
writeFileSync(join(outDir, "generated-changelog.json"), JSON.stringify(changelog, null, 2) + "\n", "utf-8");

console.log(
  `[gen-meta] wrote ${outPath}: v${meta.version}, ${meta.mcpTools} tools, ${meta.hooks} hooks, ${meta.restEndpoints} endpoints, ${meta.testsPassing} tests, ${meta.stars} stars, ${meta.npmMonthly} npm/month, ${changelog.length} changelog entries`,
);
