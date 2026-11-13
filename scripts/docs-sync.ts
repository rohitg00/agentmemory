import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESSENTIAL_TOOLS, getAllTools } from "../src/mcp/tools-registry.js";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = "scripts/docs-sync.state.json";
const CHECK = process.argv.includes("--check");
const REPO_URL = "https://github.com/rohitg00/agentmemory";

type State = { version: string; engineVersion?: string; facts: Record<string, string[]> };

interface Fact {
  key: string;
  label: string;
  value: () => string | null;
  nouns: string[];
  before?: string;
  badge?: string;
  legacyValues?: string[];
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf-8" })
    .split("\n")
    .filter((f) => f && existsSync(join(ROOT, f)));
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

function countMcpEntries(name: string): string | null {
  const path = "src/mcp/server.ts";
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  const counts: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.every(ts.isObjectLiteralExpression)) counts.push(node.initializer.elements.length);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return counts.length === 1 ? String(counts[0]) : null;
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
  "MCP tools", "MCP-Tools", "memory tools", "tools", "tool", "outils", "herramientas", "ferramentas", "Werkzeuge", "инструмент", "ツール", "个工具", "個工具",
  "工具", "개의 도구", "개 도구", "araç", "टूल", "nástroj", "værktøj", "verktyg", "verktøy", "MCP-verktøy", "MCP-verktyg", "MCP-værktøj", "MCP-työkalu",
  "työkalu", "narzędz", "de instrumente", "instrument", "eszköz", "εργαλεί", "інструмент", "strumenti", "na tool", "tool MCP", "MCP tool",
  "MCP nástroj", "MCP eszköz", "MCP টুল", "MCP ٹول", "ٹول", "أدا", "أدوات", "টি টুল", "টুল", "เครื่องมือ", "הכלים", "כלי",
];

const FACTS: Fact[] = [
  { key: "mcpResources", label: "MCP resources", value: () => countMcpEntries("MCP_RESOURCES"), nouns: ["MCP resources"] },
  { key: "mcpPrompts", label: "MCP prompts", value: () => countMcpEntries("MCP_PROMPTS"), nouns: ["MCP prompts"] },
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
    value: () => String(
      countMatches("src/triggers/api.ts", /api_path:\s*["`]/g) +
      countMatches("src/triggers/viewer-sse.ts", /api_path:\s*["`]/g) +
      countMatches("src/triggers/viewer-streams.ts", /api_path:\s*["`]/g),
    ),
    nouns: [
      "REST endpoints", "REST API endpoints", "endpoints", "endpoint", "Endpunkte", "эндпоинт", "个端点", "個端點", "개 엔드포인트", "개의 엔드포인트", "エンドポイント",
      "uç nokta", "एंडपॉइंट", "endepunkt", "de endpoint", "ендпоінт", "na endpoint", "اینڈ پوائنٹ", "نقطة نهاية", "এন্ডপয়েন্ট", "개",
    ],
  },
  {
    key: "skills",
    label: "skills",
    value: () => String(trackedFiles().filter((f) => /^plugin\/skills\/[^/_][^/]*\/SKILL\.md$/.test(f)).length),
    nouns: [
      "native skills", "skills", "skill", "SKILL", "個の skills", "個 skills", "個 Skills", "개의 skills", "개 skills", "навык", "个 skill", "個 skill",
      "個の skill", "개의 skill", "fichiers SKILL", "ficheros SKILL", "ficheiros SKILL", "arquivos SKILL", "archivos SKILL", "file SKILL", "plików SKILL",
      "fișiere SKILL", "файлов SKILL", "файлів SKILL", "αρχεία SKILL", "nativních skill", "souborů SKILL", "taitoa", "скіл", "اسکل", "مهار",
      "টি স্কিল", "টি SKILL", "স্কিল", "ไฟล์", "ตัว", "na skill", "ה-skill", "קבצי", "skilli",
    ],
  },
  {
    key: "hooks",
    label: "hooks",
    value: () => String(countHookTypes()),
    nouns: [
      "auto hooks", "hooks", "hook", "-hook", "scripts de hooks", "Hook-Skripte", "хук", "скриптов хуков", "フック", "훅", "automatických hook",
      "automatiske hook", "Auto-Hook", "αυτόματα hook", "scripts hooks", "automaattista hook", "automatikus hook", "automatycznych hook",
      "automatiska hook", "автоматичних хук", "خودکار ہکس", "ہکس", "awtomatikong hook", "自動 hook", "个自动 hook", "個自動 hook", "অটো হুক", "হুক",
      "script hook", "خطاف", "ตัว", "hookia", "hooków", "hook-uri",
    ],
    badge: "stat-hooks.svg",
  },
  {
    key: "tests",
    label: "tests",
    legacyValues: ["3000+", "3400+"],
    value: () => {
      const n = countTests();
      return n === null ? null : `${floorTo(n, 100)}+`;
    },
    nouns: [
      "tests passing", "tests", "Tests", "test", "de teste", "个测试", "個測試", "testes", "pruebas", "тест", "テスト", "测试", "測試", "테스트", "bestandene Tests",
      "beståede test", "godkända test", "zaliczonych test", "επιτυχημένες δοκιμ", "δοκιμ", "sikeres teszt", "teszt", "pengujian", "件のテスト", "개",
      "pumapasang test", "na test", "รายการ", "การทดสอบ", "בדיקות", "اختبار", "ٹیسٹس", "টেস্ট", "项测试", "項測試", "testů", "testiä",
    ],
    badge: "stat-tests.svg",
  },
  {
    key: "functions",
    label: "iii functions",
    legacyValues: ["324"],
    value: () => String(sourceFiles().reduce((n, f) => n + (read(f).match(/registerFunction\(/g)?.length ?? 0), 0)),
    nouns: [
      "iii functions", "functions", "funciones", "funções", "fonctions", "Funktionen", "функци", "個函式", "个函数", "개 함수", "개의 함수", "fonksiyon", "funkc",
      "funktion", "funksjon", "funktio", "functie", "funcții", "funzioni", "fungsi", "function", "개", "פונקצי", "دالة", "فنکشن", "ফাংশন",
      "na function", "функц", "de funcții",
    ],
  },
  {
    key: "sourceFiles",
    label: "source files",
    legacyValues: ["242", "246"],
    value: () => String(sourceFiles().length),
    nouns: [
      "source files", "fichiers sources", "ficheros de código", "arquivos de código", "archivos fuente", "arquivos-fonte", "arquivos fonte",
      "fichiers source", "Quelldateien", "исходных файл", "個原始檔", "个源文件", "개 소스 파일", "개의 소스 파일", "ソースファイル", "kaynak dosya", "zdrojových soubor",
      "kildefiler", "αρχεία πηγαίου", "lähdetiedosto", "forrásfájl", "file sorgente", "bronbestand", "plików źródłowych", "ficheiros de código",
      "fișiere sursă", "källkodsfiler", "source file", "na source file", "file source", "вихідних файл", "file sumber", "קבצי מקור", "קובצי מקור", "ملف مصدري",
      "سورس فائل", "সোর্স ফাইল", "개", "pliki źródłowe", "de fișiere sursă",
    ],
  },
  {
    key: "loc",
    label: "lines of code",
    value: () => String(floorTo(sourceFiles().reduce((n, f) => n + read(f).split("\n").length, 0), 1000)),
    nouns: ["LOC", "行程式碼", "行代码", "行のコード", "řádků kódu", "righe di codice", "줄", "سطر برمجي", "لائنز کوڈ"],
    before: "~",
  },
  {
    key: "kvScopes",
    label: "KV scopes",
    legacyValues: ["67"],
    value: () => String(countKvScopes()),
    nouns: [
      "KV scopes", "KV-Scopes", "KV scope", "KV-scope", "scopes KV", "scopes de KV", "escopos KV", "областей KV", "個 KV", "个 KV", "개 KV", "KV スコープ",
      "KV kapsam", "نطاق KV", "KV স্কোপ", "תחומי KV", "KV-hatókör", "scope KV", "개", "zakresów KV", "zakresy KV", "âmbitos de KV", "domenii KV", "de domenii KV", "na KV scope",
      "KV-скоуп", "KV اسکوپ",
    ],
  },
];

const EXCLUDED = [
  /^CHANGELOG\.md$/,
  /^test\//,
  /^benchmark\//,
  /^docs\/benchmarks\//,
  /^docs\/upgrades\//,
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

function syncBadgeNumber(value: string, next: string): string {
  return value.replace(/\d+(?:[,.\u00a0\u202f ]\d{3})*\+?/g, (number) =>
    `${formatLike(number, next)}${next.endsWith("+") ? "+" : ""}`,
  );
}

function syncBadge(text: string, next: string): string {
  return text
    .replace(/>(\d+(?:[,.\u00a0\u202f ]\d{3})*\+?)</g, (_match, number: string) => `>${syncBadgeNumber(number, next)}<`)
    .replace(/(aria-label=")([^"]*)(")/g, (_match, prefix: string, label: string, suffix: string) => `${prefix}${syncBadgeNumber(label, next)}${suffix}`);
}

function currentCount(matched: string, key: string, state: State): string {
  const next = state.facts[key]?.[0];
  if (!next) throw new Error(`Could not compute current ${key}.`);
  return `${formatLike(matched, next)}${next.endsWith("+") ? "+" : ""}`;
}

function currentRegion(text: string, start: RegExp, end: RegExp, update: (body: string) => string): string {
  const match = start.exec(text);
  if (!match) throw new Error(`Missing managed statistics region: ${start.source}`);
  const after = match.index + match[0].length;
  const boundary = text.slice(after).search(end);
  const stop = boundary < 0 ? text.length : after + boundary;
  return text.slice(0, match.index) + update(text.slice(match.index, stop)) + text.slice(stop);
}

function syncCurrentRegions(files: Map<string, string>, state: State): void {
  // These regions describe current inventory; other prose and historical examples keep their own numbers.
  const agents = files.get("AGENTS.md");
  const readme = files.get("README.md");
  if (!agents || !readme) throw new Error("Current statistics documents are missing.");
  const number = "\\d+(?:[,.\\u00a0\\u202f ]\\d{3})*\\+?";
  const counters: Array<[string, string]> = [
    ["mcpTools", "MCP tools"], ["mcpResources", "MCP resources"], ["mcpPrompts", "MCP prompts"],
    ["restEndpoints", "REST endpoints"], ["hooks", "hooks"], ["skills", "skills"],
    ["functions", "iii functions"], ["tests", "tests"], ["coreTools", "essentials"],
  ];
  files.set("AGENTS.md", currentRegion(agents, /^## Current Stats .*$/m, /^## /m, (body) => {
    let next = body.replace(/^## Current Stats \([^)]*\)/m, `## Current Stats (v${state.version})`);
    for (const [key, noun] of counters) next = next.replace(new RegExp(`${number}(?=\\s+${escapeRegex(noun)}\\b)`, "g"), (value) => currentCount(value, key, state));
    return next;
  }));
  let currentReadme = currentRegion(readme, /^<h2 id="mcp-server">.*$/m, /^<h2 /m, (body) => {
    const summary = new RegExp(`^(${number})( tools, )(${number})( resources, )(${number})( prompts, and )(${number})( skills\\.)$`, "m");
    if (!summary.test(body)) throw new Error("Missing managed MCP inventory summary.");
    return body.replace(summary, (_all, tools: string, a: string, resources: string, b: string, prompts: string, c: string, skills: string, d: string) =>
      `${currentCount(tools, "mcpTools", state)}${a}${currentCount(resources, "mcpResources", state)}${b}${currentCount(prompts, "mcpPrompts", state)}${c}${currentCount(skills, "skills", state)}${d}`,
    ).replace(new RegExp(`(?<=^### )${number}(?= Tools$)`, "gm"), (value) => currentCount(value, "mcpTools", state))
      .replace(new RegExp(`(?<=full )${number}(?=-tool surface)`, "g"), (value) => currentCount(value, "mcpTools", state))
      .replace(new RegExp(`(?<=falls back to a )${number}(?=-tool local set)`, "g"), (value) => currentCount(value, "fallbackTools", state))
      .replace(new RegExp(`(?<=see only )${number}(?= tools)`, "g"), (value) => currentCount(value, "fallbackTools", state));
  });
  currentReadme = currentRegion(currentReadme, /^<h2 id="api">.*$/m, /^<h2 /m, (body) => {
    const summary = new RegExp(`^${number}(?= endpoints on port )`, "m");
    if (!summary.test(body)) throw new Error("Missing managed API inventory summary.");
    return body.replace(summary, (value) => currentCount(value, "restEndpoints", state));
  });
  files.set("README.md", currentReadme);
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
      out = out.replace(new RegExp(`(aria-label="[^"]*?)${escapeRegex(old)}\\+?(")`, "g"), `$1${next}$2`);
    }
  }
  return out;
}

const VERSION_FILES: Array<{ file: RegExp; pattern: (v: string) => RegExp; replace: (v: string) => string }> = [
  { file: /(^|\/)(package|plugin|openclaw\.plugin)\.json$/, pattern: (v) => new RegExp(`("version":\\s*")${escapeRegex(v)}(")`), replace: (v) => `$1${v}$2` },
  { file: /^deploy\/.*(Dockerfile|\.ya?ml)$/, pattern: (v) => new RegExp(`(AGENTMEMORY_VERSION[=:]\\s*"?|value:\\s*")${escapeRegex(v)}\\b`, "g"), replace: (v) => `$1${v}` },
  { file: /^src\/version\.ts$/, pattern: (v) => new RegExp(`(VERSION = ")${escapeRegex(v)}(")`), replace: (v) => `$1${v}$2` },
  { file: /^AGENTS\.md$/, pattern: (v) => new RegExp(`(## Current Stats \\(v)${escapeRegex(v)}(\\))`), replace: (v) => `$1${v}$2` },
  { file: /^packages\/mcp\/package\.json$/, pattern: (v) => new RegExp(`("@agentmemory/agentmemory":\\s*"~?)${escapeRegex(v)}(")`), replace: (v) => `$1${v}$2` },
  { file: /^plugin\/\.devin-plugin\/plugin\.json$/, pattern: (v) => new RegExp(`("@agentmemory/mcp@)${escapeRegex(v)}(")`), replace: (v) => `$1${v}$2` },
];

function syncVersion(files: Map<string, string>, from: string, to: string): void {
  for (const [path, text] of files) {
    let next = text;
    for (const rule of VERSION_FILES.filter((r) => r.file.test(path))) next = next.replace(rule.pattern(from), rule.replace(to));
    if (next !== text) files.set(path, next);
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
  const failed: string[] = [];

  const manifest = JSON.parse(read("package.json")) as { version: string; dependencies: Record<string, string> };
  const version = manifest.version;
  const engineVersion = manifest.dependencies["iii-sdk"];
  if (!/^\d+\.\d+\.\d+$/.test(engineVersion) || manifest.dependencies["@iii-dev/helpers"] !== engineVersion) {
    throw new Error("iii-sdk and @iii-dev/helpers must pin the same exact release.");
  }
  const previousEngineVersion = state.engineVersion ?? read("src/version.ts").match(/III_PINNED_VERSION = "([^"]+)"/)?.[1];
  if (!previousEngineVersion) throw new Error("Could not read the previous engine pin.");
  if (engineVersion !== previousEngineVersion) {
    for (const extra of trackedFiles().filter((path) => path === ".env.example" || path === "eval/README.md" || /^examples\/python\/.*\.(py|md)$/.test(path) || path === "deploy/runtime/entrypoint.sh")) {
      if (!files.has(extra)) files.set(extra, read(extra));
      if (!original.has(extra)) original.set(extra, read(extra));
    }
    for (const [path, text] of files) {
      if (path === "website/lib/generated-changelog.json") continue;
      files.set(path, text.replaceAll(previousEngineVersion, engineVersion));
    }
    report.push(`engine: ${previousEngineVersion} -> ${engineVersion}`);
  }
  nextState.engineVersion = engineVersion;
  const ompPath = "integrations/omp/package.json";
  const ompManifest = files.get(ompPath);
  if (ompManifest) {
    files.set(ompPath, ompManifest.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
  }
  for (const path of ["integrations/hermes/plugin.yaml", "integrations/openclaw/plugin.yaml"]) {
    const pluginManifest = files.get(path);
    if (pluginManifest) files.set(path, pluginManifest.replace(/^(version:\s*)[^\r\n]+$/m, `$1${version}`));
  }
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
      failed.push(fact.label);
      continue;
    }
    const olds = [...(state.facts[fact.key] ?? []), ...(fact.legacyValues ?? [])];
    if (olds.length === 1 && olds[0] === next) continue;
    for (const [path, text] of files) {
      if (fact.badge && path.endsWith(".svg") && !path.endsWith(fact.badge)) continue;
      if (!fact.badge && path.endsWith(".svg")) continue;
      files.set(path, replaceFact(text, fact, olds, next));
    }
    report.push(`${fact.label}: ${olds.join(", ")} -> ${next}`);
    nextState.facts[fact.key] = [next];
  }

  syncCurrentRegions(files, nextState);

  // A docs-only edit can corrupt a generated badge while the saved facts stay current.
  for (const fact of FACTS) {
    const badge = fact.badge;
    const next = nextState.facts[fact.key]?.[0];
    if (!badge || !next) continue;
    for (const [path, text] of files) {
      if (path.endsWith(badge)) {
        files.set(path, syncBadge(text, next));
      } else if (text.includes(badge)) {
        files.set(path, text.replace(/<img\b[^>]*>/gi, (tag) => {
          const src = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
          if (!src?.endsWith(badge)) return tag;
          return tag.replace(/(\balt\s*=\s*)(["'])(.*?)\2/gi, (_match, prefix: string, quote: string, label: string) =>
            `${prefix}${quote}${syncBadgeNumber(label, next)}${quote}`,
          );
        }));
      }
    }
  }

  const changed = [...files].filter(([p, t]) => original.get(p) !== t).map(([p]) => p);
  const stateChanged = JSON.stringify(nextState) !== JSON.stringify(state);

  if (CHECK) {
    if (failed.length > 0) {
      console.error(`docs-sync: could not compute ${failed.join(", ")}, so the check is incomplete.`);
      process.exit(1);
    }
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
