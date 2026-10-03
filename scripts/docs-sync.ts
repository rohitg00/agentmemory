import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESSENTIAL_TOOLS, getAllTools } from "../src/mcp/tools-registry.js";

const ROOT = join(import.meta.dirname, "..");
const STATE_PATH = "scripts/docs-sync.state.json";
const CHECK = process.argv.includes("--check");
const REPO_URL = "https://github.com/rohitg00/agentmemory";

type State = { version: string; facts: Record<string, string[]> };

interface Fact {
  key: string;
  label: string;
  value: () => string | null;
  nouns: string[];
  before?: string;
  badge?: string;
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf-8" }).split("\n").filter(Boolean);
}

function countMatches(path: string, pattern: RegExp): number {
  return read(path).match(pattern)?.length ?? 0;
}

function floorTo(n: number, step: number): number {
  return Math.floor(n / step) * step;
}

function countHookTypes(): number {
  const union = read("src/types.ts").match(/export type HookType\s*=([\s\S]*?);/);
  return union ? union[1].split("|").filter((s) => /^\s*["'`]/.test(s)).length : 0;
}

function countKvScopes(): number {
  const src = read("src/state/schema.ts");
  const body = src.slice(src.indexOf("export const KV = {"));
  return (body.slice(0, body.indexOf("\n};")).match(/^ {2}\w+:/gm) ?? []).length;
}

function countFallbackTools(): number {
  const src = read("src/mcp/standalone.ts");
  const body = src.slice(src.indexOf("const IMPLEMENTED_TOOLS = new Set(["));
  return (body.slice(0, body.indexOf("]);")).match(/"memory_\w+"/g) ?? []).length;
}

function sourceFiles(): string[] {
  return trackedFiles().filter((f) => f.startsWith("src/") && f.endsWith(".ts"));
}

function countTests(): number | null {
  try {
    const out = execFileSync(
      process.execPath,
      [join(ROOT, "node_modules/vitest/vitest.mjs"), "list", "--json", "--exclude", "test/integration.test.ts"],
      { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    return (JSON.parse(out) as unknown[]).length;
  } catch {
    return null;
  }
}

const TOOL_NOUNS = [
  "MCP tools", "MCP-Tools", "memory tools", "tools", "tool", "outils", "herramientas", "ferramentas",
  "Werkzeuge", "инструмент", "ツール", "个工具", "個工具", "工具", "개의 도구", "개 도구", "araç", "टूल",
];

const FACTS: Fact[] = [
  {
    key: "mcpTools",
    label: "MCP tools",
    value: () => String(getAllTools().length),
    nouns: [...TOOL_NOUNS, "个", "個", "개", "'ü"],
    badge: "stat-tools.svg",
  },
  {
    key: "coreTools",
    label: "core tools",
    value: () => String(ESSENTIAL_TOOLS.size),
    nouns: ["core tools", "visible by default", "个必备工具", ...TOOL_NOUNS],
    before: "(?:\"core\" \\(|core\\) \\(|AGENTMEMORY_TOOLS=core`[^\\n]{0,40}?|lean |The |\\()",
  },
  {
    key: "fallbackTools",
    label: "local fallback tools",
    value: () => String(countFallbackTools()),
    nouns: [...TOOL_NOUNS, "个工具", "-Tool"],
  },
  {
    key: "restEndpoints",
    label: "REST endpoints",
    value: () => String(countMatches("src/triggers/api.ts", /api_path:\s*["`]/g)),
    nouns: [
      "REST endpoints", "REST API endpoints", "endpoints", "endpoint", "Endpunkte", "эндпоинт",
      "个端点", "個端點", "개 엔드포인트", "개의 엔드포인트", "エンドポイント", "uç nokta", "एंडपॉइंट",
    ],
  },
  {
    key: "skills",
    label: "skills",
    value: () => String(trackedFiles().filter((f) => /^plugin\/skills\/[^/_][^/]*\/SKILL\.md$/.test(f)).length),
    nouns: ["native skills", "skills", "skill", "SKILL", "個の skills", "個 skills", "個 Skills", "개의 skills", "개 skills", "навык"],
  },
  {
    key: "hooks",
    label: "hooks",
    value: () => String(countHookTypes()),
    nouns: [
      "auto hooks", "hooks", "hook", "-hook", "scripts de hooks", "Hook-Skripte", "хук", "скриптов хуков",
      "フック", "훅",
    ],
    badge: "stat-hooks.svg",
  },
  {
    key: "tests",
    label: "tests",
    value: () => {
      const n = countTests();
      return n === null ? null : `${floorTo(n, 100)}+`;
    },
    nouns: ["tests passing", "tests", "Tests", "test", "个测试", "個測試", "testes", "pruebas", "тест", "テスト", "测试", "測試", "테스트"],
    badge: "stat-tests.svg",
  },
  {
    key: "functions",
    label: "iii functions",
    value: () => String(sourceFiles().reduce((n, f) => n + (read(f).match(/registerFunction\(/g)?.length ?? 0), 0)),
    nouns: ["iii functions", "functions", "funciones", "funções", "fonctions", "Funktionen", "функци", "個函式", "个函数", "개 함수", "개의 함수", "fonksiyon"],
  },
  {
    key: "sourceFiles",
    label: "source files",
    value: () => String(sourceFiles().length),
    nouns: ["source files", "fichiers sources", "ficheros de código", "arquivos de código", "archivos fuente", "arquivos-fonte", "arquivos fonte", "fichiers source", "Quelldateien", "исходных файл", "個原始檔", "个源文件", "개 소스 파일", "개의 소스 파일", "ソースファイル", "kaynak dosya"],
  },
  {
    key: "loc",
    label: "lines of code",
    value: () => String(floorTo(sourceFiles().reduce((n, f) => n + read(f).split("\n").length, 0), 1000)),
    nouns: ["LOC", "行程式碼", "行代码", "行のコード"],
    before: "~",
  },
  {
    key: "kvScopes",
    label: "KV scopes",
    value: () => String(countKvScopes()),
    nouns: ["KV scopes", "KV-Scopes", "KV scope", "KV-scope", "scopes KV", "scopes de KV", "escopos KV", "областей KV", "個 KV", "个 KV", "개 KV", "KV スコープ", "KV kapsam"],
  },
];

const EXCLUDED = [
  /^CHANGELOG\.md$/,
  /^test\//,
  /^benchmark\//,
  /^docs\/benchmarks\//,
  /^eval\//,
  /^website\/lib\/generated-meta\.json$/,
  /(^|\/)package-lock\.json$/,
  /^scripts\/docs-sync/,
];
const TEXT_FILE = /\.(md|mdx|json|ts|tsx|mjs|yml|yaml|html)$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberPattern(display: string): string {
  const digits = display.replace(/\D/g, "");
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return groups.join("[,.\\u00a0\\u202f ]?");
}

function formatLike(matched: string, next: string): string {
  const separator = matched.match(/\d([,.   ])\d{3}(?!\d)/)?.[1];
  const digits = next.replace(/\D/g, "");
  if (!separator || digits.length < 4) return digits;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function factRegex(fact: Fact, old: string): RegExp {
  const nouns = [...fact.nouns].sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
  const before = fact.before ? `(?<=${fact.before})` : "";
  return new RegExp(
    `${before}(?<![\\w.,])(${numberPattern(old)})(\\+?)(?=(?:[\\s\\u00a0]+|-|')?(?:${nouns}))`,
    "giu",
  );
}

function replaceFact(text: string, fact: Fact, olds: string[], next: string): string {
  let out = text;
  for (const old of olds) {
    if (old === next) continue;
    out = out.replace(factRegex(fact, old), (_m, num: string, plus: string) => {
      const formatted = formatLike(num, next);
      return next.endsWith("+") ? `${formatted}+` : `${formatted}${plus}`;
    });
    if (fact.badge) {
      out = out.replace(new RegExp(`>${escapeRegex(old)}\\+?<`, "g"), `>${next}<`);
    }
  }
  return out;
}

const VERSION_FILES: Array<{ file: RegExp; pattern: (v: string) => RegExp; replace: (v: string) => string }> = [
  { file: /(^|\/)(package|plugin|openclaw\.plugin)\.json$/, pattern: (v) => new RegExp(`("version":\\s*")${escapeRegex(v)}(")`), replace: (v) => `$1${v}$2` },
  { file: /^integrations\/hermes\/plugin\.yaml$/, pattern: (v) => new RegExp(`^(version:\\s*)${escapeRegex(v)}$`, "m"), replace: (v) => `$1${v}` },
  { file: /^deploy\/.*(Dockerfile|\.ya?ml)$/, pattern: (v) => new RegExp(`(AGENTMEMORY_VERSION[=:]\\s*"?|value:\\s*")${escapeRegex(v)}\\b`, "g"), replace: (v) => `$1${v}` },
  { file: /^src\/version\.ts$/, pattern: (v) => new RegExp(`(VERSION = ")${escapeRegex(v)}(")`), replace: (v) => `$1${v}$2` },
  { file: /^AGENTS\.md$/, pattern: (v) => new RegExp(`(## Current Stats \\(v)${escapeRegex(v)}(\\))`), replace: (v) => `$1${v}$2` },
];

function syncVersion(files: Map<string, string>, from: string, to: string): void {
  for (const [path, text] of files) {
    const rule = VERSION_FILES.find((r) => r.file.test(path));
    if (rule) files.set(path, text.replace(rule.pattern(from), rule.replace(to)));
  }
  const types = files.get("src/types.ts");
  if (types && !types.includes(`"${to}"`)) {
    files.set("src/types.ts", types.replace(new RegExp(`(version: [^\\n]*"${escapeRegex(from)}")`), `$1 | "${to}"`));
  }
  const exportImport = files.get("src/functions/export-import.ts");
  if (exportImport && !exportImport.includes(`"${to}"`)) {
    files.set(
      "src/functions/export-import.ts",
      exportImport.replace(new RegExp(`(supportedVersions = new Set\\(\\[[^\\]]*"${escapeRegex(from)}")`), `$1, "${to}"`),
    );
  }
  const changelog = files.get("CHANGELOG.md");
  if (changelog && !changelog.includes(`## [${to}]`)) {
    const date = new Date().toISOString().slice(0, 10);
    let next = changelog.replace(/^## \[Unreleased\]\s*$/m, `## [Unreleased]\n\n## [${to}] — ${date}`);
    next = next.replace(/^(\[[0-9][^\]]*\]: )/m, `[${to}]: ${REPO_URL}/compare/v${from}...v${to}\n$1`);
    files.set("CHANGELOG.md", next);
  }
}

function main(): void {
  const state = JSON.parse(read(STATE_PATH)) as State;
  const paths = trackedFiles().filter((f) => (TEXT_FILE.test(f) || /Dockerfile$/.test(f) || /stat-[a-z]+\.svg$/.test(f)) && !EXCLUDED.some((r) => r.test(f)));
  const files = new Map(paths.map((p) => [p, read(p)] as const));
  const original = new Map(files);
  const nextState: State = { version: state.version, facts: { ...state.facts } };
  const report: string[] = [];

  const version = (JSON.parse(read("package.json")) as { version: string }).version;
  if (version !== state.version) {
    for (const extra of ["src/types.ts", "src/functions/export-import.ts", "CHANGELOG.md"]) {
      if (!files.has(extra)) files.set(extra, read(extra));
      if (!original.has(extra)) original.set(extra, read(extra));
    }
    syncVersion(files, state.version, version);
    report.push(`version: ${state.version} -> ${version}`);
    nextState.version = version;
  }

  for (const fact of FACTS) {
    const next = fact.value();
    if (next === null) {
      report.push(`${fact.label}: skipped (could not compute)`);
      continue;
    }
    const olds = state.facts[fact.key] ?? [];
    if (olds.length === 1 && olds[0] === next) continue;
    for (const [path, text] of files) {
      if (fact.badge && path.endsWith(".svg") && !path.endsWith(fact.badge)) continue;
      if (!fact.badge && path.endsWith(".svg")) continue;
      files.set(path, replaceFact(text, fact, olds, next));
    }
    report.push(`${fact.label}: ${olds.join(", ")} -> ${next}`);
    nextState.facts[fact.key] = [next];
  }

  const changed = [...files].filter(([p, t]) => original.get(p) !== t).map(([p]) => p);
  const stateChanged = JSON.stringify(nextState) !== JSON.stringify(state);

  if (CHECK) {
    if (changed.length === 0 && !stateChanged) {
      console.log("docs-sync: documented numbers and versions are current.");
      return;
    }
    console.error("docs-sync: documented numbers or versions are out of date.");
    for (const line of report) console.error(`  ${line}`);
    for (const p of changed) console.error(`  would update ${p}`);
    console.error("Run `npm run docs:sync` and commit the result.");
    process.exit(1);
  }

  for (const fact of FACTS) {
    const next = nextState.facts[fact.key]?.[0];
    for (const old of state.facts[fact.key] ?? []) {
      if (!next || old.replace(/\D/g, "") === next.replace(/\D/g, "")) continue;
      const leftover = new RegExp(`(?<![\\w.,])${numberPattern(old)}\\+?(?=[\\s\\u00a0'-]?\\p{L})`, "gu");
      for (const [path, text] of files) {
        if (path.endsWith(".svg")) continue;
        text.split("\n").forEach((line, i) => {
          if (leftover.test(line)) report.push(`check ${fact.label} ${old} left in ${path}:${i + 1}`);
          leftover.lastIndex = 0;
        });
      }
    }
  }

  for (const p of changed) writeFileSync(join(ROOT, p), files.get(p)!, "utf-8");
  if (stateChanged) writeFileSync(join(ROOT, STATE_PATH), JSON.stringify(nextState, null, 2) + "\n", "utf-8");
  for (const line of report) console.log(`docs-sync: ${line}`);
  console.log(`docs-sync: ${changed.length} file(s) updated.`);
}

main();
