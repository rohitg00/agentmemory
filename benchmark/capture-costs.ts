import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { createConnection } from "node:net";
import { cpus, homedir, platform, release, tmpdir, totalmem, arch } from "node:os";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { pXX } from "./lib/percentiles.js";
import { CONCEPTS, NOUNS, buildToolCapture, mulberry32, type ToolCapture } from "./lib/corpus.js";

const execFileAsync = promisify(execFile);
const SCHEMA_VERSION = 1;
const PROJECT = "capture-costs";

type ProfileName = "keyless" | "embed" | "embed-llm";

interface Profile {
  name: ProfileName;
  description: string;
  embeddings: boolean;
  llm: boolean;
  autoCompress: boolean;
}

const PROFILES: Record<ProfileName, Profile> = {
  keyless: {
    name: "keyless",
    description: "No provider keys. BM25 only, zero-LLM synthetic compression.",
    embeddings: false,
    llm: false,
    autoCompress: false,
  },
  embed: {
    name: "embed",
    description: "Deterministic fake OpenAI-compatible embeddings, LLM disabled, automatic compression off.",
    embeddings: true,
    llm: false,
    autoCompress: false,
  },
  "embed-llm": {
    name: "embed-llm",
    description: "Fake embeddings plus a fake OpenAI-compatible chat model with AGENTMEMORY_AUTO_COMPRESS=true.",
    embeddings: true,
    llm: true,
    autoCompress: true,
  },
};

type ProviderMode = "fake" | "ollama";
type StateBackend = "file" | "redis";
type Scenario = "standard" | "crash-offline";

interface Config {
  sizes: number[];
  profiles: Profile[];
  provider: ProviderMode;
  upstreamUrl: string | null;
  embedModel: string;
  chatModel: string;
  stateBackend: StateBackend;
  redisUrl: string | null;
  scenario: Scenario;
  killAfterMs: number;
  killSettleMs: number;
  perSession: number;
  hookSample: number;
  concurrency: number;
  outputMin: number;
  outputMax: number;
  seed: number;
  dims: number;
  contextBudget: number;
  searchLimit: number;
  evidenceSample: number;
  restPort: number;
  enginePort: number;
  fakePort: number;
  root: string;
  outDir: string;
  keep: boolean;
  iiiBin: string;
  distDir: string;
  quiesceTimeoutMs: number;
  readyTimeoutMs: number;
  repeats: number;
  budgetsPath: string | null;
  writeBudgetsPath: string | null;
  enforceBudgets: boolean;
}

function intList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return fallback;
  const out = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return out.length > 0 ? out : fallback;
}

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function iiiVersion(bin: string): string | null {
  try {
    const out = execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    return out.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function pinnedIiiVersion(distDir: string): string | null {
  try {
    const src = readFileSync(join(distDir, "cli.mjs"), "utf8");
    return src.match(/IIPINNED_VERSION\s*=\s*[^"']*["'](\d+\.\d+\.\d+)["']/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveIii(distDir: string): string {
  const explicit = process.env["AGENTMEMORY_BENCH_III"];
  if (explicit) return explicit;
  const pinned = pinnedIiiVersion(distDir);
  const candidates = [join(homedir(), ".agentmemory", "bin", "iii"), join(homedir(), ".local", "bin", "iii"), "/usr/local/bin/iii"];
  for (const c of candidates) {
    if (existsSync(c) && (!pinned || iiiVersion(c) === pinned)) return c;
  }
  throw new Error(`no iii binary matching the pinned version ${pinned ?? "?"}; set AGENTMEMORY_BENCH_III`);
}

function loadConfig(): Config {
  const distDir = resolve(process.cwd(), "dist");
  const names = (process.env["BENCH_PROFILES"] || "keyless,embed,embed-llm")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const profiles = names.map((n) => {
    const p = PROFILES[n as ProfileName];
    if (!p) throw new Error(`unknown profile ${n}; valid: ${Object.keys(PROFILES).join(", ")}`);
    return p;
  });
  const [outputMin, outputMax] = intList(process.env["BENCH_OUTPUT_BYTES"], [400, 4000]);
  const restPort = intEnv("BENCH_PORT", 4900);
  const provider = (process.env["BENCH_PROVIDER"] || "fake") as ProviderMode;
  if (provider !== "fake" && provider !== "ollama") throw new Error(`unknown BENCH_PROVIDER ${provider}; valid: fake, ollama`);
  const stateBackend = (process.env["BENCH_STATE_BACKEND"] || "file") as StateBackend;
  if (stateBackend !== "file" && stateBackend !== "redis") throw new Error(`unknown BENCH_STATE_BACKEND ${stateBackend}; valid: file, redis`);
  const redisUrl = process.env["BENCH_REDIS_URL"] || null;
  if (stateBackend === "redis" && !redisUrl) throw new Error("BENCH_STATE_BACKEND=redis needs BENCH_REDIS_URL, a Redis the bench may flush");
  const scenario = (process.env["BENCH_SCENARIO"] || "standard") as Scenario;
  if (scenario !== "standard" && scenario !== "crash-offline") throw new Error(`unknown BENCH_SCENARIO ${scenario}; valid: standard, crash-offline`);
  return {
    sizes: intList(process.env["BENCH_N"], [100, 1000]),
    profiles,
    provider,
    upstreamUrl: provider === "ollama" ? (process.env["BENCH_OLLAMA_URL"] || "http://127.0.0.1:11434").replace(/\/+$/, "") : null,
    embedModel: process.env["BENCH_EMBED_MODEL"] || (provider === "ollama" ? "nomic-embed-text" : "bench-fake-embedding"),
    chatModel: process.env["BENCH_CHAT_MODEL"] || (provider === "ollama" ? "qwen3:4b-instruct-2507-q4_K_M" : "bench-fake-chat"),
    stateBackend,
    redisUrl,
    scenario,
    killAfterMs: intEnv("BENCH_KILL_AFTER_MS", 3000) || 3000,
    killSettleMs: intEnv("BENCH_KILL_SETTLE_MS", 0),
    perSession: intEnv("BENCH_OBS_PER_SESSION", 100) || 100,
    hookSample: intEnv("BENCH_HOOK_SAMPLE", 100),
    concurrency: intEnv("BENCH_CONCURRENCY", 8) || 8,
    outputMin: outputMin ?? 400,
    outputMax: outputMax ?? outputMin ?? 4000,
    seed: intEnv("BENCH_SEED", 12648430),
    dims: intEnv("BENCH_EMBED_DIMS", 768) || 768,
    contextBudget: intEnv("BENCH_CONTEXT_BUDGET", 2000) || 2000,
    searchLimit: intEnv("BENCH_SEARCH_LIMIT", 10) || 10,
    evidenceSample: intEnv("BENCH_EVIDENCE_SAMPLE", 50) || 50,
    restPort,
    enginePort: intEnv("BENCH_ENGINE_PORT", 50100),
    fakePort: intEnv("BENCH_FAKE_PORT", restPort + 50),
    root: process.env["BENCH_ROOT"] || join(tmpdir(), `agentmemory-capture-costs-${Date.now().toString(36)}`),
    outDir: process.env["BENCH_OUT_DIR"] || resolve(process.cwd(), "benchmark", "results"),
    keep: process.env["BENCH_KEEP"] === "1",
    iiiBin: resolveIii(distDir),
    distDir,
    quiesceTimeoutMs: intEnv("BENCH_QUIESCE_TIMEOUT_MS", 600000),
    readyTimeoutMs: intEnv("BENCH_READY_TIMEOUT_MS", 600000),
    repeats: intEnv("BENCH_REPEATS", 1) || 1,
    budgetsPath:
      process.env["BENCH_BUDGETS"] === "off"
        ? null
        : resolve(process.cwd(), process.env["BENCH_BUDGETS"] || join("benchmark", "capture-costs-budgets.json")),
    writeBudgetsPath: process.env["BENCH_WRITE_BUDGETS"] ? resolve(process.cwd(), process.env["BENCH_WRITE_BUDGETS"]) : null,
    enforceBudgets: process.env["BENCH_ENFORCE_BUDGETS"] === "1",
  };
}

interface Check {
  profile: string;
  observations: number;
  repeat: number;
  name: string;
  value: number | null;
  limit: number;
  pass: boolean;
}

interface BudgetMetric {
  path: string;
  headroom: number;
  floor: number;
  kind: "storage" | "memory" | "latency" | "context";
}

const BUDGET_METRICS: Record<string, BudgetMetric> = {
  diskGrowthPerObservationBytes: { path: "diskGrowthPerObservationBytes", headroom: 1.2, floor: 1024, kind: "storage" },
  diskAfterCaptureBytes: { path: "diskAfterCapture.totalBytes", headroom: 1.2, floor: 65536, kind: "storage" },
  diskIndexBytes: { path: "diskAfterCapture.byCategory.index", headroom: 1.25, floor: 16384, kind: "storage" },
  diskDiagnosticBytes: { path: "diskAfterCapture.byCategory.diagnostic", headroom: 1.5, floor: 16384, kind: "storage" },
  capturePeakRssKiB: { path: "capture.rss.peakTotalKiB", headroom: 1.25, floor: 65536, kind: "memory" },
  idleRssKiB: { path: "idle.rssKiB.total", headroom: 1.25, floor: 65536, kind: "memory" },
  recoveryIdleRssKiB: { path: "recovery.rss.idleTotalKiB", headroom: 1.25, floor: 65536, kind: "memory" },
  hookP95Ms: { path: "capture.hookLatencyMs.p95", headroom: 2, floor: 250, kind: "latency" },
  observeP95Ms: { path: "capture.observeLatencyMs.p95", headroom: 3, floor: 150, kind: "latency" },
  recoveryReadyMs: { path: "recovery.readyMs", headroom: 2, floor: 3000, kind: "latency" },
  recoveryIndexReadyMs: { path: "recovery.indexReadyMs", headroom: 2, floor: 3000, kind: "latency" },
  searchFullBytesP50: { path: "agentVisibleContext.endpoints.search_full.bytes.p50", headroom: 1.2, floor: 4096, kind: "context" },
  searchCompactTokensP50: { path: "agentVisibleContext.endpoints.search_compact.serverTokenEstimate.p50", headroom: 1.2, floor: 512, kind: "context" },
  sessionStartInjectOnStdoutBytes: { path: "agentVisibleContext.hookStdout.session_start_inject_on.stdoutBytes", headroom: 1.2, floor: 4096, kind: "context" },
  redisUsedMemoryBytes: { path: "redisAfterCapture.usedMemoryBytes", headroom: 1.2, floor: 4194304, kind: "storage" },
  redisKeys: { path: "redisAfterCapture.keys", headroom: 1.2, floor: 64, kind: "storage" },
};

function variantOf(r: Record<string, unknown>): string {
  return String(r["variant"] ?? r["profile"]);
}

function variantName(profile: Profile, cfg: Config): string {
  let name = profile.name;
  if (cfg.provider !== "fake" && profile.embeddings) name += `+${cfg.provider}`;
  if (cfg.stateBackend !== "file") name += `@${cfg.stateBackend}`;
  if (cfg.scenario !== "standard") name += `:${cfg.scenario}`;
  return name;
}

interface BudgetFile {
  budgets: Record<string, Record<string, Record<string, number>>>;
}

function numberAt(o: unknown, path: string): number | null {
  const v = get(o, path);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function checkInvariants(runs: Record<string, unknown>[]): Check[] {
  const out: Check[] = [];
  for (const r of runs) {
    const n = r["observations"] as number;
    const base = { profile: variantOf(r), observations: n, repeat: (r["repeat"] as number) ?? 1 };
    const eq = (name: string, value: number | null, limit: number) => out.push({ ...base, name, value, limit, pass: value === limit });
    const atMost = (name: string, value: number | null, limit: number) => out.push({ ...base, name, value, limit, pass: value !== null && value <= limit });
    if (r["scenario"] === "crash-offline") {
      const embeds = r["embeddings"] === true;
      out.push({ ...base, name: "hooksSpooledWhileDown", value: numberAt(r, "crash.spoolRecordsWhileDown"), limit: 1, pass: (numberAt(r, "crash.spoolRecordsWhileDown") ?? 0) >= 1 });
      eq("spoolDroppedRecords", numberAt(r, "crash.spoolStats.dropped"), 0);
      eq("hookNonZeroExits", numberAt(r, "crash.hookNonZeroExits"), 0);
      eq("logicalObservationsAfterRecovery", numberAt(r, "evidenceAfterRecovery.logicalObservations"), n);
      eq("sourceTailRetainedAfterRecovery", numberAt(r, "evidenceAfterRecovery.sourceTailRetained"), numberAt(r, "evidenceAfterRecovery.sampled") ?? -1);
      eq("spoolRecordsAfterRecovery", numberAt(r, "recovery.spoolRecordsAfter"), 0);
      if (embeds) {
        eq("killBeforeFirstVectorCheckpoint", numberAt(r, "crash.vectorCheckpointBeforeKill"), 0);
        eq("vectorDocumentsAfterRecovery", numberAt(r, "evidenceAfterRecovery.vectorDocuments"), n);
        atMost("recoveryRepeatEmbedInputs", numberAt(r, "recovery.provider.embedRepeatInputs"), n);
      }
      continue;
    }
    eq("logicalObservationsBeforeKill", numberAt(r, "evidenceBeforeKill.logicalObservations"), n);
    eq("logicalObservationsAfterRecovery", numberAt(r, "evidenceAfterRecovery.logicalObservations"), n);
    const sampled = numberAt(r, "evidenceBeforeKill.sampled") ?? -1;
    eq("sourceTailRetainedBeforeKill", numberAt(r, "evidenceBeforeKill.sourceTailRetained"), sampled);
    eq("sourceTailRetainedAfterRecovery", numberAt(r, "evidenceAfterRecovery.sourceTailRetained"), sampled);
    eq("observeErrors", numberAt(r, "capture.observeErrors"), 0);
    eq("hookStdoutBytesWithInjectionOff", numberAt(r, "capture.hookStdoutBytes.total"), 0);
    eq("sessionStartStdoutBytesWithInjectionOff", numberAt(r, "agentVisibleContext.hookStdout.session_start_inject_off.stdoutBytes"), 0);
    eq("preToolUseStdoutBytesWithInjectionOff", numberAt(r, "agentVisibleContext.hookStdout.pre_tool_use_inject_off.stdoutBytes"), 0);
    const cap = numberAt(r, "agentVisibleContext.declaredContextBudgetTokens") ?? 0;
    const ctxTokens = numberAt(r, "agentVisibleContext.endpoints.context.serverTokenEstimate.max");
    const vecBefore = numberAt(r, "evidenceBeforeKill.vectorDocuments");
    if (vecBefore !== null && vecBefore > 0) eq("vectorDocumentsAfterRecovery", numberAt(r, "evidenceAfterRecovery.vectorDocuments"), vecBefore);
    out.push({ ...base, name: "contextTokensWithinDeclaredCap", value: ctxTokens, limit: cap, pass: ctxTokens !== null && ctxTokens <= cap });
  }
  return out;
}

function checkBudgets(runs: Record<string, unknown>[], file: BudgetFile): Check[] {
  const out: Check[] = [];
  for (const r of runs) {
    const limits = file.budgets?.[variantOf(r)]?.[String(r["observations"])];
    if (!limits) continue;
    for (const [name, limit] of Object.entries(limits)) {
      const metric = BUDGET_METRICS[name];
      if (!metric) continue;
      const value = numberAt(r, metric.path);
      out.push({ profile: variantOf(r), observations: r["observations"] as number, repeat: (r["repeat"] as number) ?? 1, name, value, limit, pass: value !== null && value <= limit });
    }
  }
  return out;
}

function deriveBudgets(runs: Record<string, unknown>[]): BudgetFile {
  const budgets: BudgetFile["budgets"] = {};
  for (const r of runs) {
    if (r["error"] || (r["provider"] ?? "fake") !== "fake" || (r["scenario"] ?? "standard") !== "standard") continue;
    const p = variantOf(r);
    const n = String(r["observations"]);
    const slot = ((budgets[p] ??= {})[n] ??= {});
    for (const [name, metric] of Object.entries(BUDGET_METRICS)) {
      const value = numberAt(r, metric.path);
      if (value === null) continue;
      const limit = Math.ceil(Math.max(value * metric.headroom, metric.floor));
      slot[name] = Math.max(slot[name] ?? 0, limit);
    }
  }
  return { budgets };
}

interface ProviderCounters {
  embedRequests: number;
  embedInputs: number;
  embedRepeatInputs: number;
  chatRequests: number;
  chatRepeatPrompts: number;
  chatPromptTokens: number;
  chatCompletionTokens: number;
  embedUpstreamMs: number;
  chatUpstreamMs: number;
  errors: number;
}

function zeroCounters(): ProviderCounters {
  return {
    embedRequests: 0,
    embedInputs: 0,
    embedRepeatInputs: 0,
    chatRequests: 0,
    chatRepeatPrompts: 0,
    chatPromptTokens: 0,
    chatCompletionTokens: 0,
    embedUpstreamMs: 0,
    chatUpstreamMs: 0,
    errors: 0,
  };
}

function diffCounters(a: ProviderCounters, b: ProviderCounters): ProviderCounters {
  const out = zeroCounters();
  for (const k of Object.keys(out) as (keyof ProviderCounters)[]) out[k] = b[k] - a[k];
  return out;
}

class FakeProvider {
  counters = zeroCounters();
  inFlight = 0;
  private seenInputs = new Set<string>();
  private seenPrompts = new Set<string>();
  private server: Server | null = null;

  constructor(private port: number, private dims: number, private upstream: string | null = null) {}

  reset(): void {
    this.counters = zeroCounters();
    this.seenInputs.clear();
    this.seenPrompts.clear();
  }

  snapshot(): ProviderCounters {
    return { ...this.counters };
  }

  private vector(text: string, dims: number): number[] {
    const out = new Array<number>(dims);
    let seed = createHash("sha256").update(text).digest();
    let norm = 0;
    for (let i = 0; i < dims; i++) {
      if (i % 32 === 0 && i > 0) seed = createHash("sha256").update(seed).digest();
      out[i] = (seed[i % 32]! - 128) / 128;
      norm += out[i]! * out[i]!;
    }
    const scale = norm > 0 ? 1 / Math.sqrt(norm) : 1;
    return out.map((v) => v * scale);
  }

  private chatReply(prompt: string): string {
    const hash = createHash("sha256").update(prompt).digest("hex");
    const words = prompt.match(/[a-z][a-z-]{3,}/g) ?? [];
    const concepts = Array.from(new Set(words.filter((w) => (CONCEPTS as readonly string[]).includes(w)))).slice(0, 4);
    const nouns = Array.from(new Set(words.filter((w) => (NOUNS as readonly string[]).includes(w)))).slice(0, 3);
    const marker = prompt.match(/capmark\d+head/)?.[0] ?? `obs-${hash.slice(0, 8)}`;
    return [
      "<type>command_run</type>",
      `<title>${marker} ${nouns.join(" ") || "tool output"}</title>`,
      `<facts><fact>${marker} recorded ${nouns[0] ?? "work"}</fact><fact>digest ${hash.slice(0, 12)}</fact></facts>`,
      `<narrative>${marker} captured a tool run touching ${nouns.join(", ") || "the workspace"} with ${concepts.join(", ") || "no named concepts"}.</narrative>`,
      `<concepts>${concepts.map((c) => `<concept>${c}</concept>`).join("")}</concepts>`,
      "<files></files>",
      "<importance>5</importance>",
    ].join("\n");
  }

  private count(url: string, payload: Record<string, unknown>): { prompt: string } | null {
    if (url.endsWith("/embeddings")) {
      const inputs = (Array.isArray(payload["input"]) ? payload["input"] : [payload["input"]]).map(String);
      this.counters.embedRequests++;
      this.counters.embedInputs += inputs.length;
      for (const t of inputs) {
        if (this.seenInputs.has(t)) this.counters.embedRepeatInputs++;
        else this.seenInputs.add(t);
      }
      return null;
    }
    const messages = Array.isArray(payload["messages"]) ? (payload["messages"] as { content?: unknown }[]) : [];
    const prompt = messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
    this.counters.chatRequests++;
    if (this.seenPrompts.has(prompt)) this.counters.chatRepeatPrompts++;
    else this.seenPrompts.add(prompt);
    return { prompt };
  }

  private async forward(url: string, raw: Buffer, payload: Record<string, unknown>, res: ServerResponse): Promise<void> {
    const isEmbed = url.endsWith("/embeddings");
    if (!isEmbed && !url.endsWith("/chat/completions")) {
      this.counters.errors++;
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `bench proxy: unsupported ${url}` } }));
      return;
    }
    this.count(url, payload);
    const t0 = performance.now();
    this.inFlight++;
    try {
      const up = await fetch(`${this.upstream}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw.toString("utf8"), signal: AbortSignal.timeout(300000) });
      const text = await up.text();
      const ms = performance.now() - t0;
      if (isEmbed) this.counters.embedUpstreamMs += ms;
      else this.counters.chatUpstreamMs += ms;
      if (!up.ok) this.counters.errors++;
      if (!isEmbed && up.ok) {
        try {
          const usage = (JSON.parse(text) as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
          this.counters.chatPromptTokens += usage?.prompt_tokens ?? 0;
          this.counters.chatCompletionTokens += usage?.completion_tokens ?? 0;
        } catch {}
      }
      res.writeHead(up.status, { "content-type": up.headers.get("content-type") ?? "application/json" });
      res.end(text);
    } catch (err) {
      this.counters.errors++;
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `bench proxy: ${err instanceof Error ? err.message : String(err)}` } }));
    } finally {
      this.inFlight--;
    }
  }

  start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let payload: Record<string, unknown> = {};
        const raw = Buffer.concat(chunks);
        try {
          payload = JSON.parse(raw.toString("utf8") || "{}");
        } catch {}
        const url = req.url ?? "";
        if (this.upstream) {
          void this.forward(url, raw, payload, res);
          return;
        }
        if (url.endsWith("/embeddings")) {
          const inputs = (Array.isArray(payload["input"]) ? payload["input"] : [payload["input"]]).map(String);
          const dims = typeof payload["dimensions"] === "number" ? (payload["dimensions"] as number) : this.dims;
          this.count(url, payload);
          const total = inputs.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: inputs.map((t, index) => ({ object: "embedding", index, embedding: this.vector(t, dims) })),
              model: String(payload["model"] ?? "fake-embedding"),
              usage: { prompt_tokens: total, total_tokens: total },
            }),
          );
          return;
        }
        if (url.endsWith("/chat/completions")) {
          const { prompt } = this.count(url, payload)!;
          const content = this.chatReply(prompt);
          const promptTokens = Math.ceil(prompt.length / 4);
          const completionTokens = Math.ceil(content.length / 4);
          this.counters.chatPromptTokens += promptTokens;
          this.counters.chatCompletionTokens += completionTokens;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              id: `chatcmpl-${createHash("sha256").update(prompt).digest("hex").slice(0, 12)}`,
              object: "chat.completion",
              model: String(payload["model"] ?? "fake-chat"),
              choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
              usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
            }),
          );
          return;
        }
        this.counters.errors++;
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: `fake provider: unsupported ${url}` } }));
      });
    });
    return new Promise((ok, fail) => {
      this.server!.once("error", fail);
      this.server!.listen(this.port, "127.0.0.1", () => ok());
    });
  }

  stop(): Promise<void> {
    return new Promise((ok) => (this.server ? this.server.close(() => ok()) : ok()));
  }
}

interface ProcRow {
  pid: number;
  ppid: number;
  rssKiB: number;
  cpuSec: number;
  comm: string;
}

function parseCpu(raw: string): number {
  const [clock, ...rest] = raw.includes("-") ? raw.split("-").reverse() : [raw];
  const days = rest.length > 0 ? parseInt(rest[0]!, 10) || 0 : 0;
  const parts = clock!.split(":").map((p) => parseFloat(p) || 0);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec + days * 86400;
}

async function psRows(): Promise<ProcRow[]> {
  const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid=,ppid=,rss=,time=,comm="], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  const rows: ProcRow[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    rows.push({ pid: +m[1]!, ppid: +m[2]!, rssKiB: +m[3]!, cpuSec: parseCpu(m[4]!), comm: m[5]! });
  }
  return rows;
}

function treeOf(rows: ProcRow[], roots: number[]): ProcRow[] {
  const byParent = new Map<number, ProcRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.ppid) ?? [];
    list.push(r);
    byParent.set(r.ppid, list);
  }
  const seen = new Set<number>();
  const out: ProcRow[] = [];
  const stack = rows.filter((r) => roots.includes(r.pid));
  while (stack.length > 0) {
    const r = stack.pop()!;
    if (seen.has(r.pid)) continue;
    seen.add(r.pid);
    out.push(r);
    for (const c of byParent.get(r.pid) ?? []) stack.push(c);
  }
  return out;
}

function roleOf(r: ProcRow): "engine" | "worker" | "other" {
  const name = basename(r.comm);
  if (name === "iii" || name.startsWith("iii")) return "engine";
  if (name === "node" || name.includes("node")) return "worker";
  return "other";
}

interface TreeSample {
  totalKiB: number;
  engineKiB: number;
  workerKiB: number;
  cpuSec: number;
  pids: number[];
}

function summarizeTree(tree: ProcRow[]): TreeSample {
  const s: TreeSample = { totalKiB: 0, engineKiB: 0, workerKiB: 0, cpuSec: 0, pids: tree.map((r) => r.pid) };
  for (const r of tree) {
    s.totalKiB += r.rssKiB;
    s.cpuSec += r.cpuSec;
    const role = roleOf(r);
    if (role === "engine") s.engineKiB += r.rssKiB;
    else if (role === "worker") s.workerKiB += r.rssKiB;
  }
  return s;
}

interface RssWindow {
  samples: number;
  peakTotalKiB: number;
  peakEngineKiB: number;
  peakWorkerKiB: number;
  meanTotalKiB: number;
  cpuSecStart: number;
  cpuSecEnd: number;
}

class RssSampler {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private window: RssWindow | null = null;
  private sum = 0;

  constructor(private roots: () => number[], private intervalMs = 250) {}

  async sampleOnce(): Promise<TreeSample> {
    return summarizeTree(treeOf(await psRows(), this.roots()));
  }

  async begin(): Promise<void> {
    const first = await this.sampleOnce();
    this.sum = first.totalKiB;
    this.window = {
      samples: 1,
      peakTotalKiB: first.totalKiB,
      peakEngineKiB: first.engineKiB,
      peakWorkerKiB: first.workerKiB,
      meanTotalKiB: first.totalKiB,
      cpuSecStart: first.cpuSec,
      cpuSecEnd: first.cpuSec,
    };
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.window) return;
    this.busy = true;
    try {
      const s = await this.sampleOnce();
      const w = this.window;
      if (!w) return;
      w.samples++;
      this.sum += s.totalKiB;
      w.peakTotalKiB = Math.max(w.peakTotalKiB, s.totalKiB);
      w.peakEngineKiB = Math.max(w.peakEngineKiB, s.engineKiB);
      w.peakWorkerKiB = Math.max(w.peakWorkerKiB, s.workerKiB);
      w.cpuSecEnd = Math.max(w.cpuSecEnd, s.cpuSec);
    } catch {
    } finally {
      this.busy = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.window = null;
  }

  async end(): Promise<RssWindow & { cpuSec: number }> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.tick();
    const w = this.window!;
    this.window = null;
    w.meanTotalKiB = Math.round(this.sum / w.samples);
    return { ...w, cpuSec: +(w.cpuSecEnd - w.cpuSecStart).toFixed(2) };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const sock = createConnection({ port, host: "127.0.0.1" });
    sock.setTimeout(500);
    sock.once("connect", () => {
      sock.destroy();
      ok(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      ok(false);
    });
    sock.once("error", () => ok(false));
  });
}

interface HttpResult {
  status: number;
  bytes: number;
  ms: number;
  body: unknown;
  text: string;
}

let benchSecretFile: string | null = null;

function benchAuth(): Record<string, string> {
  try {
    const secret = benchSecretFile ? readFileSync(benchSecretFile, "utf8").trim() : "";
    return secret ? { authorization: `Bearer ${secret}` } : {};
  } catch {
    return {};
  }
}

async function http(base: string, method: string, path: string, body?: unknown, timeoutMs = 60000): Promise<HttpResult> {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...benchAuth(), ...(body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return { status: res.status, bytes: Buffer.byteLength(text, "utf8"), ms, body: parsed, text };
}

function dist(values: number[]): { n: number; p50: number; p95: number; p99: number; max: number; mean: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const r = (v: number) => (Number.isFinite(v) ? +v.toFixed(2) : NaN);
  const mean = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : NaN;
  return {
    n: sorted.length,
    p50: r(pXX(sorted, 50)),
    p95: r(pXX(sorted, 95)),
    p99: r(pXX(sorted, 99)),
    max: r(pXX(sorted, 100)),
    mean: r(mean),
  };
}

type Category = "source" | "summary" | "index" | "queue" | "failed_delivery" | "diagnostic" | "config" | "stream" | "other";

function categorize(scope: string): Category {
  if (/dlq|dead|failed/i.test(scope)) return "failed_delivery";
  if (/queue/i.test(scope)) return "queue";
  if (/^mem:(obs|enriched|image-refs|image-embeddings):?/.test(scope) || scope === "mem:sessions") return "source";
  if (/^mem:(index|idx|emb|latent)(:|$)/.test(scope) || /^mem:graph:(name-index|edge-key|node-degree)$/.test(scope)) return "index";
  if (/^mem:(audit|health|metrics|access|recent-searches|retention|diagnostics|signals|sentinels)(:|$)/.test(scope)) return "diagnostic";
  if (/^mem:(config|state)(:|$)/.test(scope)) return "config";
  if (scope.startsWith("mem:")) return "summary";
  return "other";
}

function scopeFamily(scope: string): string {
  return scope
    .replace(/^mem:obs:.+$/, "mem:obs:*")
    .replace(/^mem:enriched:.+$/, "mem:enriched:*")
    .replace(/^mem:idx:obs:\d+$/, "mem:idx:obs:*")
    .replace(/^mem:audit:\d{4}-\d{2}$/, "mem:audit:<month>")
    .replace(/^(mem:index:bm25:vec:).+$/, "$1*")
    .replace(/^mem:emb:.+$/, "mem:emb:*");
}

interface DiskReport {
  totalBytes: number;
  byCategory: Record<Category, number>;
  byFamily: Record<string, number>;
  files: number;
}

function walk(dir: string, visit: (path: string, size: number) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, visit);
    else if (entry.isFile()) {
      try {
        visit(p, statSync(p).size);
      } catch {}
    }
  }
}

function measureDisk(dataDir: string): DiskReport {
  const report: DiskReport = {
    totalBytes: 0,
    byCategory: { source: 0, summary: 0, index: 0, queue: 0, failed_delivery: 0, diagnostic: 0, config: 0, stream: 0, other: 0 },
    byFamily: {},
    files: 0,
  };
  walk(dataDir, (p, size) => {
    report.totalBytes += size;
    report.files++;
    const rel = p.slice(dataDir.length + 1);
    const [top, ...rest] = rel.split("/");
    let scope = rel;
    let category: Category = "other";
    if (top === "state_store.db" && rest.length > 0) {
      scope = decodeURIComponent(rest.join("/").replace(/\.bin$/, ""));
      category = categorize(scope);
    } else if (top === "stream_store") {
      scope = `stream:${decodeURIComponent(rest.join("/").replace(/\.bin$/, ""))}`;
      category = "stream";
    } else if (/\.ya?ml$/.test(rel)) {
      category = "config";
    } else {
      category = categorize(rel);
    }
    report.byCategory[category] += size;
    const fam = scopeFamily(scope);
    report.byFamily[fam] = (report.byFamily[fam] ?? 0) + size;
  });
  return report;
}

function diskDelta(a: DiskReport, b: DiskReport): DiskReport {
  const out: DiskReport = { totalBytes: b.totalBytes - a.totalBytes, byCategory: { ...b.byCategory }, byFamily: {}, files: b.files - a.files };
  for (const k of Object.keys(out.byCategory) as Category[]) out.byCategory[k] = b.byCategory[k] - a.byCategory[k];
  for (const k of new Set([...Object.keys(a.byFamily), ...Object.keys(b.byFamily)])) {
    out.byFamily[k] = (b.byFamily[k] ?? 0) - (a.byFamily[k] ?? 0);
  }
  return out;
}

async function settledDisk(dataDir: string, quietMs = 3000, timeoutMs = 60000): Promise<DiskReport> {
  const start = Date.now();
  let last = measureDisk(dataDir);
  let stableSince = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(1000);
    const now = measureDisk(dataDir);
    if (now.totalBytes !== last.totalBytes || now.files !== last.files) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) {
      return now;
    }
  }
  return last;
}

interface BootLog {
  bm25Docs: number | null;
  bm25RebuildMs: number | null;
  vectorsLoaded: number | null;
  vectorBackfillQueued: number | null;
  vectorBackfillAwaitingOptIn: number | null;
  pendingLogRecoveredVectors: number;
  spoolRecovered: number;
  spoolAlreadyStored: number;
  inboxRecovered: number;
}

function parseBootLog(text: string): BootLog {
  const bm = [...text.matchAll(/Rebuilt BM25 index from stored content \((\d+) docs in (\d+) ms\)/g)].pop();
  const vec = [...text.matchAll(/Loaded persisted vector index \((\d+) vectors\)/g)].pop();
  const back = [...text.matchAll(/(?:Backfilling|Re-embedding) (\d+) (?:missing )?vectors/g)].pop();
  const optIn = [...text.matchAll(/Vector backfill needs (\d+) embeddings/g)].pop();
  const replay = [...text.matchAll(/Recovered (\d+) vectors and \d+ removals written after the last index save/g)].pop();
  const spool = [...text.matchAll(/Capture spool: (\d+) recovered, (\d+) already stored/g)].pop();
  const inbox = [...text.matchAll(/Capture inbox: (\d+) of \d+ unfinished observations stored/g)].pop();
  return {
    bm25Docs: bm ? +bm[1]! : null,
    bm25RebuildMs: bm ? +bm[2]! : null,
    vectorsLoaded: vec ? +vec[1]! : 0,
    vectorBackfillQueued: back ? +back[1]! : 0,
    vectorBackfillAwaitingOptIn: optIn ? +optIn[1]! : 0,
    pendingLogRecoveredVectors: replay ? +replay[1]! : 0,
    spoolRecovered: spool ? +spool[1]! : 0,
    spoolAlreadyStored: spool ? +spool[2]! : 0,
    inboxRecovered: inbox ? +inbox[1]! : 0,
  };
}

interface Instance {
  child: ChildProcess;
  logPath: string;
  logOffset: number;
  base: string;
}

class Harness {
  private instance: Instance | null = null;
  private knownPids = new Set<number>();
  private lastLogPath: string | null = null;
  readonly sampler: RssSampler;
  readonly home: string;
  readonly dataDir: string;
  readonly cwd: string;
  readonly base: string;

  constructor(private cfg: Config, private profile: Profile, private runDir: string) {
    this.home = join(runDir, "home");
    benchSecretFile = join(this.home, ".agentmemory", "secret");
    this.dataDir = join(runDir, "data");
    this.cwd = join(runDir, PROJECT);
    this.base = `http://127.0.0.1:${cfg.restPort}/agentmemory`;
    this.sampler = new RssSampler(() => this.roots());
  }

  roots(): number[] {
    return [...this.knownPids];
  }

  prepare(): void {
    for (const d of [this.home, this.dataDir, this.cwd, join(this.home, ".agentmemory", "bin")]) mkdirSync(d, { recursive: true });
    const target = join(this.home, ".agentmemory", "bin", "iii");
    copyFileSync(this.cfg.iiiBin, target);
    chmodSync(target, 0o755);
  }

  env(): NodeJS.ProcessEnv {
    const keep = ["PATH", "TMPDIR", "LANG", "TERM", "SHELL", "USER", "LOGNAME"];
    const env: NodeJS.ProcessEnv = {};
    for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
    env["PATH"] = `${join(this.home, ".agentmemory", "bin")}:${process.env["PATH"] ?? ""}`;
    Object.assign(env, {
      HOME: this.home,
      CI: "1",
      NO_COLOR: "1",
      XDG_CONFIG_HOME: join(this.home, ".config"),
      XDG_DATA_HOME: join(this.home, ".local", "share"),
      III_ENGINE_PORT: String(this.cfg.enginePort),
      AGENTMEMORY_METRICS_PORT: String(this.cfg.restPort + 3),
      AGENTMEMORY_PROJECT_NAME: PROJECT,
      AGENTMEMORY_AUTO_COMPRESS: this.profile.autoCompress ? "true" : "false",
      AGENTMEMORY_INJECT_CONTEXT: "false",
    });
    if (this.profile.embeddings) {
      Object.assign(env, {
        OPENAI_API_KEY: "bench-fake-key",
        OPENAI_BASE_URL: `http://127.0.0.1:${this.cfg.fakePort}`,
        OPENAI_EMBEDDING_DIMENSIONS: String(this.cfg.dims),
        OPENAI_EMBEDDING_MODEL: this.cfg.embedModel,
        OPENAI_API_KEY_FOR_LLM: this.profile.llm ? "true" : "false",
      });
      if (this.profile.llm) env["OPENAI_MODEL"] = this.cfg.chatModel;
    }
    if (this.cfg.stateBackend === "redis") {
      env["AGENTMEMORY_STATE_BACKEND"] = "redis";
      env["AGENTMEMORY_REDIS_URL"] = this.cfg.redisUrl!;
    }
    return env;
  }

  hookEnv(inject: boolean): NodeJS.ProcessEnv {
    return {
      PATH: process.env["PATH"],
      HOME: this.home,
      AGENTMEMORY_URL: `http://127.0.0.1:${this.cfg.restPort}`,
      AGENTMEMORY_PROJECT_NAME: PROJECT,
      AGENTMEMORY_INJECT_CONTEXT: inject ? "true" : "false",
    };
  }

  async start(label: string): Promise<{ readyMs: number; indexReadyMs: number | null; boot: BootLog }> {
    for (const port of [this.cfg.restPort, this.cfg.restPort + 1, this.cfg.restPort + 2, this.cfg.enginePort]) {
      if (await portOpen(port)) throw new Error(`port ${port} is in use before ${label}; refusing to share it`);
    }
    const logPath = join(this.runDir, `cli-${label}.log`);
    this.lastLogPath = logPath;
    const fd = openSync(logPath, "a");
    const t0 = performance.now();
    const child = spawn(
      process.execPath,
      [join(this.cfg.distDir, "cli.mjs"), "--port", String(this.cfg.restPort), "--data-dir", this.dataDir, "--verbose"],
      { cwd: this.cwd, env: this.env(), stdio: ["ignore", fd, fd] },
    );
    closeSync(fd);
    this.knownPids.add(child.pid!);
    this.instance = { child, logPath, logOffset: 0, base: this.base };
    let readyMs = -1;
    while (performance.now() - t0 < this.cfg.readyTimeoutMs) {
      if (child.exitCode !== null) throw new Error(`cli exited with ${child.exitCode} during ${label}; see ${logPath}`);
      try {
        const r = await http(this.base, "GET", "/livez", undefined, 2000);
        if (r.status === 200) {
          readyMs = performance.now() - t0;
          break;
        }
      } catch {}
      await sleep(100);
    }
    if (readyMs < 0) throw new Error(`instance not ready within ${this.cfg.readyTimeoutMs} ms (${label}); see ${logPath}`);
    let indexReadyMs: number | null = null;
    while (performance.now() - t0 < this.cfg.readyTimeoutMs) {
      if (/Rebuilt BM25 index from stored content/.test(readFileSync(logPath, "utf8"))) {
        indexReadyMs = performance.now() - t0;
        break;
      }
      await sleep(100);
    }
    await this.adoptTree();
    return { readyMs: Math.round(readyMs), indexReadyMs: indexReadyMs === null ? null : Math.round(indexReadyMs), boot: parseBootLog(readFileSync(logPath, "utf8")) };
  }

  bootLog(): BootLog | null {
    return this.lastLogPath && existsSync(this.lastLogPath) ? parseBootLog(readFileSync(this.lastLogPath, "utf8")) : null;
  }

  private spoolFiles(): string[] {
    const files: string[] = [];
    const visit = (dir: string, inSpool: boolean) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) visit(p, inSpool || entry.name === "capture-spool");
        else if (inSpool) files.push(p);
      }
    };
    visit(this.home, false);
    return files;
  }

  spoolRecords(): number {
    return this.spoolFiles()
      .filter((p) => p.endsWith(".jsonl"))
      .reduce((n, p) => n + readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length, 0);
  }

  spoolStats(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.spoolFiles().filter((f) => f.endsWith(".stats.json"))) {
      try {
        for (const [k, v] of Object.entries(JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>)) {
          if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
        }
      } catch {}
    }
    return out;
  }

  async adoptTree(): Promise<void> {
    const rows = await psRows();
    for (const r of treeOf(rows, this.roots())) this.knownPids.add(r.pid);
    const pidfile = join(this.home, ".agentmemory", "iii.pid");
    if (existsSync(pidfile)) {
      const pid = parseInt(readFileSync(pidfile, "utf8").trim(), 10);
      if (Number.isFinite(pid) && rows.some((r) => r.pid === pid && roleOf(r) === "engine")) this.knownPids.add(pid);
    }
  }

  private async alive(): Promise<number[]> {
    const rows = await psRows();
    const live = new Set(rows.map((r) => r.pid));
    return this.roots().filter((p) => live.has(p));
  }

  private async waitPortsFree(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const busy = await Promise.all([this.cfg.restPort, this.cfg.restPort + 1, this.cfg.enginePort].map(portOpen));
      if (!busy.some(Boolean)) return;
      await sleep(250);
    }
  }

  async forceKill(): Promise<void> {
    await this.adoptTree();
    for (const pid of await this.alive()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    await sleep(500);
    this.knownPids.clear();
    this.instance = null;
    await this.waitPortsFree(15000);
  }

  async stop(): Promise<void> {
    await this.adoptTree();
    const cli = this.instance?.child.pid;
    if (cli) {
      try {
        process.kill(cli, "SIGTERM");
      } catch {}
    }
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const left = await this.alive();
      if (left.length === 0) break;
      if (Date.now() > deadline - 12000) {
        for (const pid of left) {
          try {
            process.kill(pid, "SIGTERM");
          } catch {}
        }
      }
      await sleep(500);
    }
    for (const pid of await this.alive()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    this.knownPids.clear();
    this.instance = null;
    await this.waitPortsFree(15000);
  }
}

interface HookRun {
  ms: number;
  stdoutBytes: number;
  stderrBytes: number;
  exitCode: number | null;
}

function runHook(script: string, payload: unknown, env: NodeJS.ProcessEnv, timeoutMs = 15000, cwd?: string): Promise<HookRun> {
  return new Promise((ok) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [script], { env, cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = 0;
    let err = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c: Buffer) => (out += c.length));
    child.stderr.on("data", (c: Buffer) => (err += c.length));
    child.on("close", (code) => {
      clearTimeout(timer);
      ok({ ms: performance.now() - t0, stdoutBytes: out, stderrBytes: err, exitCode: code });
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function sessionIdFor(profile: Profile, n: number, j: number): string {
  return `cc-${profile.name}-${n}-s${j}`;
}

function observeBody(sessionId: string, cwd: string, cap: ToolCapture) {
  return {
    hookType: "post_tool_use",
    sessionId,
    project: PROJECT,
    cwd,
    timestamp: new Date().toISOString(),
    data: { tool_name: cap.toolName, tool_input: cap.toolInput, tool_output: cap.toolOutput },
  };
}

function hookBody(sessionId: string, cwd: string, cap: ToolCapture) {
  return {
    session_id: sessionId,
    transcript_path: "/dev/null",
    cwd,
    hook_event_name: "PostToolUse",
    tool_name: cap.toolName,
    tool_input: cap.toolInput,
    tool_response: cap.toolOutput,
  };
}

async function drive(concurrency: number, total: number, fn: (i: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(total, 1)) }, async () => {
      while (true) {
        const i = next++;
        if (i >= total) return;
        await fn(i);
      }
    }),
  );
}

interface Evidence {
  logicalObservations: number;
  bm25Documents: number | null;
  vectorDocuments: number | null;
  pendingVectorBackfill: number | null;
  sessionsListed: number;
  sampled: number;
  markerSearchHits: number;
  sourceTailRetained: number;
  sourceHeadRetained: number;
}

async function collectEvidence(h: Harness, profile: Profile, n: number, perSession: number, caps: Map<number, ToolCapture>, sample: number[]): Promise<Evidence> {
  const sessions = Math.ceil(n / perSession);
  let logical = 0;
  let listed = 0;
  for (let j = 0; j < sessions; j++) {
    const r = await http(h.base, "GET", `/observations?sessionId=${encodeURIComponent(sessionIdFor(profile, n, j))}&limit=1`, undefined, 120000);
    const body = r.body as { total?: number };
    if (r.status === 200) listed++;
    logical += typeof body?.total === "number" ? body.total : 0;
  }
  let hits = 0;
  let tail = 0;
  let head = 0;
  const replayCache = new Map<number, string>();
  for (const i of sample) {
    const cap = caps.get(i)!;
    const s = await http(h.base, "POST", "/search", { query: cap.headMarker, limit: 5 }, 120000);
    if (s.text.includes(cap.headMarker)) hits++;
    const j = Math.floor(i / perSession);
    if (!replayCache.has(j)) {
      const rl = await http(h.base, "GET", `/replay/load?sessionId=${encodeURIComponent(sessionIdFor(profile, n, j))}`, undefined, 120000);
      replayCache.set(j, rl.text);
    }
    const text = replayCache.get(j)!;
    if (text.includes(cap.tailMarker)) tail++;
    if (text.includes(cap.headMarker)) head++;
  }
  const status = await http(h.base, "GET", "/status", undefined, 120000);
  const index = (status.body as { index?: Record<string, unknown> })?.index ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    logicalObservations: logical,
    bm25Documents: num(index["bm25Documents"]),
    vectorDocuments: num(index["vectorDocuments"]),
    pendingVectorBackfill: num(index["pendingVectorBackfill"]),
    sessionsListed: listed, sampled: sample.length, markerSearchHits: hits, sourceTailRetained: tail, sourceHeadRetained: head };
}

async function quiesce(h: Harness, fake: FakeProvider, timeoutMs: number): Promise<{ ms: number; disk: DiskReport }> {
  const t0 = performance.now();
  let last = JSON.stringify(fake.snapshot());
  let stableSince = Date.now();
  while (performance.now() - t0 < timeoutMs) {
    await sleep(1000);
    const now = JSON.stringify(fake.snapshot());
    if (now !== last || fake.inFlight > 0) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 3000) break;
  }
  const disk = await settledDisk(h.dataDir, 3000, Math.max(10000, timeoutMs - (performance.now() - t0)));
  return { ms: Math.round(performance.now() - t0), disk };
}

function tokensOf(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b["tokens_used"] === "number") return b["tokens_used"] as number;
  if (typeof b["tokens"] === "number") return b["tokens"] as number;
  if (typeof b["tokensUsed"] === "number") return b["tokensUsed"] as number;
  return null;
}

async function measureContext(h: Harness, profile: Profile, n: number, caps: Map<number, ToolCapture>, cfg: Config) {
  const rng = mulberry32(cfg.seed ^ 0x51ed27);
  const queries = Array.from({ length: 8 }, () => `${CONCEPTS[Math.floor(rng() * CONCEPTS.length)]} ${NOUNS[Math.floor(rng() * NOUNS.length)]}`);
  const rows: Record<string, { bytes: number[]; tokens: number[]; ms: number[]; results: number[] }> = {};
  const add = (k: string, r: HttpResult) => {
    const row = (rows[k] ??= { bytes: [], tokens: [], ms: [], results: [] });
    row.bytes.push(r.bytes);
    const t = tokensOf(r.body);
    if (t !== null) row.tokens.push(t);
    row.ms.push(r.ms);
    const results = (r.body as { results?: unknown[] })?.results;
    row.results.push(Array.isArray(results) ? results.length : 0);
  };
  for (const q of queries) {
    add("search_full", await http(h.base, "POST", "/search", { query: q, limit: cfg.searchLimit }, 120000));
    add("search_compact", await http(h.base, "POST", "/search", { query: q, limit: cfg.searchLimit, format: "compact" }, 120000));
    add("search_narrative", await http(h.base, "POST", "/search", { query: q, limit: cfg.searchLimit, format: "narrative" }, 120000));
    add("smart_search", await http(h.base, "POST", "/smart-search", { query: q, limit: cfg.searchLimit }, 120000));
  }
  const ctx = await http(h.base, "POST", "/context", { sessionId: sessionIdFor(profile, n, 0), project: PROJECT, budget: cfg.contextBudget }, 120000);
  add("context", ctx);
  const summarize = (k: string) => {
    const r = rows[k]!;
    return {
      calls: r.bytes.length,
      bytes: dist(r.bytes),
      serverTokenEstimate: r.tokens.length ? dist(r.tokens) : "unknown",
      latencyMs: dist(r.ms),
      results: dist(r.results),
    };
  };
  const hookDir = join(cfg.distDir, "hooks");
  const firstRead = [...caps.values()].find((c) => c.toolName === "Read");
  const preTool = firstRead
    ? { session_id: sessionIdFor(profile, n, 0), cwd: h.cwd, hook_event_name: "PreToolUse", tool_name: "Read", tool_input: firstRead.toolInput }
    : { session_id: sessionIdFor(profile, n, 0), cwd: h.cwd, hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/cache/index.ts" } };
  const hooks: Record<string, HookRun> = {};
  for (const inject of [false, true]) {
    const tag = inject ? "on" : "off";
    hooks[`session_start_inject_${tag}`] = await runHook(
      join(hookDir, "session-start.mjs"),
      { session_id: `cc-${profile.name}-${n}-ctx-${tag}`, cwd: h.cwd, hook_event_name: "SessionStart", source: "startup" },
      h.hookEnv(inject),
    );
    hooks[`pre_tool_use_inject_${tag}`] = await runHook(join(hookDir, "pre-tool-use.mjs"), preTool, h.hookEnv(inject));
  }
  return {
    declaredContextBudgetTokens: cfg.contextBudget,
    searchLimit: cfg.searchLimit,
    queries,
    endpoints: Object.fromEntries(Object.keys(rows).map((k) => [k, summarize(k)])),
    hookStdout: Object.fromEntries(Object.entries(hooks).map(([k, v]) => [k, { stdoutBytes: v.stdoutBytes, ms: Math.round(v.ms), exitCode: v.exitCode }])),
  };
}

async function redisCli(url: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("redis-cli", ["-u", url, ...args], { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function redisStats(url: string): Promise<{ usedMemoryBytes: number | null; keys: number | null; serverRssKiB: number | null }> {
  const info = await redisCli(url, ["INFO"]);
  const field = (k: string) => {
    const m = info.match(new RegExp(`^${k}:(\\d+)`, "m"));
    return m ? +m[1]! : null;
  };
  const keys = parseInt((await redisCli(url, ["DBSIZE"])).trim(), 10);
  const pid = field("process_id");
  const rows = pid === null ? [] : await psRows();
  return { usedMemoryBytes: field("used_memory"), keys: Number.isFinite(keys) ? keys : null, serverRssKiB: rows.find((r) => r.pid === pid)?.rssKiB ?? null };
}

async function providerProcessRssKiB(): Promise<number> {
  return (await psRows()).filter((r) => basename(r.comm).startsWith("ollama")).reduce((s, r) => s + r.rssKiB, 0);
}

async function prepareRun(cfg: Config, profile: Profile, n: number): Promise<{ runDir: string; variant: string; out: Record<string, unknown> }> {
  const variant = variantName(profile, cfg);
  const runDir = join(cfg.root, `${variant.replace(/[^a-z0-9-]+/gi, "_")}-${n}`);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  if (cfg.stateBackend === "redis") await redisCli(cfg.redisUrl!, ["FLUSHALL"]);
  const out: Record<string, unknown> = {
    profile: profile.name,
    variant,
    profileDescription: profile.description,
    observations: n,
    provider: cfg.provider,
    stateBackend: cfg.stateBackend,
    scenario: cfg.scenario,
    embeddings: profile.embeddings,
  };
  return { runDir, variant, out };
}

async function waitDrained(h: Harness, fake: FakeProvider, embeddings: boolean, n: number, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const status = await http(h.base, "GET", "/status", undefined, 120000).catch(() => null);
    const index = (status?.body as { index?: Record<string, unknown> } | undefined)?.index ?? {};
    const vectors = typeof index["vectorDocuments"] === "number" ? (index["vectorDocuments"] as number) : 0;
    if (h.spoolRecords() === 0 && (!embeddings || vectors >= n)) break;
    await sleep(1000);
  }
  await quiesce(h, fake, Math.max(10000, timeoutMs - (Date.now() - t0)));
}

async function runCrashOffline(cfg: Config, profile: Profile, n: number, fake: FakeProvider) {
  const { runDir, variant, out } = await prepareRun(cfg, profile, n);
  const h = new Harness(cfg, profile, runDir);
  h.prepare();
  fake.reset();
  const log = (msg: string) => process.stderr.write(`[capture-costs] ${variant} n=${n} ${msg}\n`);
  try {
    log("cold start");
    out["coldStart"] = await h.start("cold");
    const rng = mulberry32(cfg.seed);
    const caps = new Map<number, ToolCapture>();
    for (let i = 0; i < n; i++) {
      const size = cfg.outputMin + Math.floor(rng() * Math.max(1, cfg.outputMax - cfg.outputMin));
      caps.set(i, buildToolCapture(rng, i, size));
    }
    const sessions = Math.ceil(n / cfg.perSession);
    for (let j = 0; j < sessions; j++) {
      await http(h.base, "POST", "/session/start", { sessionId: sessionIdFor(profile, n, j), project: PROJECT, cwd: h.cwd });
    }
    const hookScript = join(cfg.distDir, "hooks", "post-tool-use.mjs");
    const killCount = Math.max(1, Math.floor(n / 2));
    let done = 0;
    let inFlight = 0;
    let killedAtMs: number | null = null;
    let gate: Promise<void> | null = null;
    let openGate = () => {};
    const online: number[] = [];
    const offline: number[] = [];
    let nonZero = 0;
    const t0 = performance.now();
    log(`capture through hooks, kill after ${killCount} hooks or ${cfg.killAfterMs} ms, settle ${cfg.killSettleMs} ms`);
    const killer = (async () => {
      while (done < killCount && performance.now() - t0 < cfg.killAfterMs) await sleep(10);
      if (cfg.killSettleMs > 0) {
        gate = new Promise<void>((ok) => (openGate = ok));
        while (inFlight > 0) await sleep(10);
        await sleep(cfg.killSettleMs);
      }
      const status = await http(h.base, "GET", "/status", undefined, 5000).catch(() => null);
      const persistence = (status?.body as { indexPersistence?: { vector?: { lastSavedAt?: string | null } | null } } | undefined)?.indexPersistence ?? null;
      const embedded = fake.snapshot();
      const completed = done;
      killedAtMs = performance.now() - t0;
      await h.forceKill();
      openGate();
      const accepted = (readFileSync(join(runDir, "cli-cold.log"), "utf8").match(/Observation captured/g) ?? []).length;
      out["crash"] = {
        killAfterMs: Math.round(killedAtMs),
        settleMs: cfg.killSettleMs,
        hooksCompletedBeforeKill: completed,
        observationsAcceptedBeforeKill: accepted,
        embeddedInputsBeforeKill: embedded.embedInputs,
        chatRequestsBeforeKill: embedded.chatRequests,
        vectorCheckpointBeforeKill: persistence?.vector?.lastSavedAt ? 1 : 0,
        indexPersistenceBeforeKill: persistence,
      };
    })();
    await drive(cfg.concurrency, n, async (i) => {
      if (gate) await gate;
      inFlight++;
      const start = performance.now() - t0;
      const r = await runHook(hookScript, hookBody(sessionIdFor(profile, n, Math.floor(i / cfg.perSession)), h.cwd, caps.get(i)!), h.hookEnv(false), 15000, h.cwd);
      (killedAtMs === null || start < killedAtMs ? online : offline).push(r.ms);
      if (r.exitCode !== 0) nonZero++;
      done++;
      inFlight--;
    });
    await killer;
    const spooled = h.spoolRecords();
    Object.assign(out["crash"] as Record<string, unknown>, {
      captureWallMs: Math.round(performance.now() - t0),
      hookLatencyOnlineMs: dist(online),
      hookLatencyOfflineMs: dist(offline),
      hookNonZeroExits: nonZero,
      spoolRecordsWhileDown: spooled,
      spoolStats: h.spoolStats(),
    });
    log(`${spooled} observations spooled while down; restart`);
    const recBefore = fake.snapshot();
    const recT0 = performance.now();
    const rec = await h.start("recovery");
    await h.sampler.begin();
    await waitDrained(h, fake, profile.embeddings, n, cfg.quiesceTimeoutMs);
    const recRss = await h.sampler.end();
    const recProvider = diffCounters(recBefore, fake.snapshot());
    out["recovery"] = {
      ...rec,
      boot: h.bootLog() ?? rec.boot,
      settledMs: Math.round(performance.now() - recT0),
      spoolRecordsAfter: h.spoolRecords(),
      spoolStatsAfter: h.spoolStats(),
      provider: recProvider,
      rss: { peakTotalKiB: recRss.peakTotalKiB },
      cpuSec: recRss.cpuSec,
    };
    const sampleIdx = Array.from({ length: Math.min(cfg.evidenceSample, n) }, (_, k) => Math.floor((k * n) / Math.min(cfg.evidenceSample, n)));
    log("evidence after recovery");
    out["evidenceAfterRecovery"] = await collectEvidence(h, profile, n, cfg.perSession, caps, sampleIdx);
    await h.stop();
  } catch (err) {
    out["error"] = err instanceof Error ? err.message : String(err);
    log(`error: ${out["error"]}`);
  } finally {
    h.sampler.stop();
    await h.stop().catch(() => {});
    if (!cfg.keep) rmSync(runDir, { recursive: true, force: true });
  }
  return out;
}

function kib(n: number): number {
  return Math.round(n);
}

async function runOne(cfg: Config, profile: Profile, n: number, fake: FakeProvider) {
  const { runDir, variant, out } = await prepareRun(cfg, profile, n);
  const h = new Harness(cfg, profile, runDir);
  h.prepare();
  fake.reset();
  const log = (msg: string) => process.stderr.write(`[capture-costs] ${variant} n=${n} ${msg}\n`);
  try {
    log("cold start");
    const cold = await h.start("cold");
    const baseline = await settledDisk(h.dataDir, 3000, 30000);
    const idleEmpty = await h.sampler.sampleOnce();
    out["coldStart"] = { ...cold, rssKiB: { total: idleEmpty.totalKiB, engine: idleEmpty.engineKiB, worker: idleEmpty.workerKiB } };
    out["diskFixed"] = baseline;

    const rng = mulberry32(cfg.seed);
    const caps = new Map<number, ToolCapture>();
    for (let i = 0; i < n; i++) {
      const size = cfg.outputMin + Math.floor(rng() * Math.max(1, cfg.outputMax - cfg.outputMin));
      caps.set(i, buildToolCapture(rng, i, size));
    }
    const sessions = Math.ceil(n / cfg.perSession);
    const hookDir = join(cfg.distDir, "hooks");
    const before = fake.snapshot();

    log(`capture ${n} observations in ${sessions} sessions`);
    await h.sampler.begin();
    const sessionStart = await runHook(
      join(hookDir, "session-start.mjs"),
      { session_id: sessionIdFor(profile, n, 0), cwd: h.cwd, hook_event_name: "SessionStart", source: "startup" },
      h.hookEnv(false),
    );
    for (let j = 1; j < sessions; j++) {
      await http(h.base, "POST", "/session/start", { sessionId: sessionIdFor(profile, n, j), project: PROJECT, cwd: h.cwd });
    }
    const hookCount = Math.min(cfg.hookSample, n);
    const hookRuns: HookRun[] = [];
    const captureT0 = performance.now();
    for (let i = 0; i < hookCount; i++) {
      const cap = caps.get(i)!;
      hookRuns.push(await runHook(join(hookDir, "post-tool-use.mjs"), hookBody(sessionIdFor(profile, n, Math.floor(i / cfg.perSession)), h.cwd, cap), h.hookEnv(false)));
    }
    const observeMs: number[] = [];
    let observeErrors = 0;
    let deduplicated = 0;
    const errorSamples: string[] = [];
    await drive(cfg.concurrency, n - hookCount, async (k) => {
      const i = hookCount + k;
      const cap = caps.get(i)!;
      try {
        const r = await http(h.base, "POST", "/observe", observeBody(sessionIdFor(profile, n, Math.floor(i / cfg.perSession)), h.cwd, cap), 60000);
        observeMs.push(r.ms);
        if (r.status >= 400) {
          observeErrors++;
          if (errorSamples.length < 5) errorSamples.push(`HTTP ${r.status}: ${r.text.slice(0, 160)}`);
        }
        if ((r.body as { deduplicated?: boolean })?.deduplicated) deduplicated++;
      } catch (err) {
        observeErrors++;
        if (errorSamples.length < 5) errorSamples.push(err instanceof Error ? err.message : String(err));
      }
    });
    const captureWallMs = performance.now() - captureT0;
    const q = await quiesce(h, fake, cfg.quiesceTimeoutMs);
    const captureRss = await h.sampler.end();
    const afterCapture = fake.snapshot();
    out["capture"] = {
      wallMs: Math.round(captureWallMs),
      quiesceMs: q.ms,
      hookSample: hookCount,
      sessionStartHook: { ms: Math.round(sessionStart.ms), stdoutBytes: sessionStart.stdoutBytes, exitCode: sessionStart.exitCode },
      hookLatencyMs: dist(hookRuns.map((r) => r.ms)),
      hookStdoutBytes: { total: hookRuns.reduce((s, r) => s + r.stdoutBytes, 0), max: Math.max(0, ...hookRuns.map((r) => r.stdoutBytes)) },
      hookStderrBytes: hookRuns.reduce((s, r) => s + r.stderrBytes, 0),
      hookNonZeroExits: hookRuns.filter((r) => r.exitCode !== 0).length,
      observeConcurrency: cfg.concurrency,
      observeLatencyMs: dist(observeMs),
      observeErrors,
      observeErrorSamples: errorSamples,
      deduplicatedResponses: deduplicated,
      rss: { peakTotalKiB: kib(captureRss.peakTotalKiB), peakEngineKiB: kib(captureRss.peakEngineKiB), peakWorkerKiB: kib(captureRss.peakWorkerKiB), meanTotalKiB: captureRss.meanTotalKiB, samples: captureRss.samples },
      cpuSec: captureRss.cpuSec,
      provider: diffCounters(before, afterCapture),
    };

    log("idle");
    await sleep(5000);
    const idle = await h.sampler.sampleOnce();
    out["idle"] = { rssKiB: { total: idle.totalKiB, engine: idle.engineKiB, worker: idle.workerKiB } };
    out["diskAfterCapture"] = q.disk;
    out["diskGrowth"] = diskDelta(baseline, q.disk);
    out["diskGrowthPerObservationBytes"] = n > 0 ? Math.round(diskDelta(baseline, q.disk).totalBytes / n) : null;
    if (cfg.stateBackend === "redis") out["redisAfterCapture"] = await redisStats(cfg.redisUrl!);
    if (cfg.provider !== "fake") out["providerProcessRssKiB"] = await providerProcessRssKiB();

    const sampleIdx = Array.from({ length: Math.min(cfg.evidenceSample, n) }, (_, k) => Math.floor((k * n) / Math.min(cfg.evidenceSample, n)));
    log("evidence before kill");
    out["evidenceBeforeKill"] = await collectEvidence(h, profile, n, cfg.perSession, caps, sampleIdx);
    log("context cost");
    const ctxBefore = fake.snapshot();
    out["agentVisibleContext"] = await measureContext(h, profile, n, caps, cfg);
    out["agentVisibleContextProvider"] = diffCounters(ctxBefore, fake.snapshot());

    log("force kill and recover");
    await h.forceKill();
    const recBefore = fake.snapshot();
    const recT0 = performance.now();
    const rec = await h.start("recovery");
    await h.sampler.begin();
    const rq = await quiesce(h, fake, cfg.quiesceTimeoutMs);
    const recRss = await h.sampler.end();
    const recProvider = diffCounters(recBefore, fake.snapshot());
    await sleep(3000);
    const recIdle = await h.sampler.sampleOnce();
    out["recovery"] = {
      ...rec,
      bootAfterSettle: h.bootLog(),
      settledMs: Math.round(performance.now() - recT0),
      reEmbedRequests: recProvider.embedRequests,
      reEmbeddedInputs: recProvider.embedInputs,
      provider: recProvider,
      rss: { peakTotalKiB: recRss.peakTotalKiB, idleTotalKiB: recIdle.totalKiB, idleEngineKiB: recIdle.engineKiB, idleWorkerKiB: recIdle.workerKiB },
      cpuSec: recRss.cpuSec,
      disk: rq.disk,
    };
    log("evidence after recovery");
    out["evidenceAfterRecovery"] = await collectEvidence(h, profile, n, cfg.perSession, caps, sampleIdx);

    log("graceful stop and warm start");
    await h.stop();
    const warmBefore = fake.snapshot();
    const warm = await h.start("warm");
    await quiesce(h, fake, Math.min(cfg.quiesceTimeoutMs, 120000));
    const warmIdle = await h.sampler.sampleOnce();
    out["warmStart"] = { ...warm, provider: diffCounters(warmBefore, fake.snapshot()), rssKiB: { total: warmIdle.totalKiB, engine: warmIdle.engineKiB, worker: warmIdle.workerKiB } };
    await h.stop();
    out["diskFinal"] = await settledDisk(h.dataDir, 2000, 20000);
  } catch (err) {
    out["error"] = err instanceof Error ? err.message : String(err);
    log(`error: ${out["error"]}`);
  } finally {
    h.sampler.stop();
    await h.stop().catch(() => {});
    if (!cfg.keep) rmSync(runDir, { recursive: true, force: true });
  }
  return out;
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
  } catch {
    return "unknown";
  }
}

function fmtBytes(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  if (Math.abs(n) >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MiB`;
  if (Math.abs(n) >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n} B`;
}

function fmtKiB(n: unknown): string {
  return typeof n === "number" ? `${(n / 1024).toFixed(0)} MiB` : "n/a";
}

function get(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), o);
}

function markdown(report: Record<string, unknown>): string {
  const repeated = ((report["config"] as { repeats?: number })?.repeats ?? 1) > 1;
  const all = (report["runs"] as Record<string, unknown>[]).map(
    (r): Record<string, unknown> => ({ ...r, profile: repeated ? `${variantOf(r)} #${r["repeat"]}` : variantOf(r) }),
  );
  const runs = all.filter((r) => (r["scenario"] ?? "standard") === "standard");
  const crashes = all.filter((r) => r["scenario"] === "crash-offline");
  const lines: string[] = [];
  const env = report["environment"] as Record<string, unknown>;
  lines.push(`Commit \`${report["commit"]}\`, ${env["platform"]}, ${env["cpu"]}, ${fmtBytes(env["memoryBytes"])} RAM, Node ${env["node"]}, iii ${env["iii"]}.`, "");
  lines.push("### Disk retention", "");
  lines.push("| profile | N | logical obs | fixed | after capture | growth/obs | source | summary | index | diagnostic | config | stream | queue | failed delivery |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    const g = (k: string) => fmtBytes(get(r, `diskAfterCapture.byCategory.${k}`));
    lines.push(`| ${r["profile"]} | ${r["observations"]} | ${get(r, "evidenceBeforeKill.logicalObservations") ?? "n/a"} | ${fmtBytes(get(r, "diskFixed.totalBytes"))} | ${fmtBytes(get(r, "diskAfterCapture.totalBytes"))} | ${fmtBytes(r["diskGrowthPerObservationBytes"])} | ${g("source")} | ${g("summary")} | ${g("index")} | ${g("diagnostic")} | ${g("config")} | ${g("stream")} | ${g("queue")} | ${g("failed_delivery")} |`);
  }
  lines.push("", "### Resident memory and CPU (engine + worker process tree)", "");
  lines.push("| profile | N | empty idle | capture peak | engine peak | worker peak | idle after capture | after recovery | capture CPU s | recovery CPU s |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    lines.push(`| ${r["profile"]} | ${r["observations"]} | ${fmtKiB(get(r, "coldStart.rssKiB.total"))} | ${fmtKiB(get(r, "capture.rss.peakTotalKiB"))} | ${fmtKiB(get(r, "capture.rss.peakEngineKiB"))} | ${fmtKiB(get(r, "capture.rss.peakWorkerKiB"))} | ${fmtKiB(get(r, "idle.rssKiB.total"))} | ${fmtKiB(get(r, "recovery.rss.idleTotalKiB"))} | ${get(r, "capture.cpuSec") ?? "n/a"} | ${get(r, "recovery.cpuSec") ?? "n/a"} |`);
  }
  lines.push("", "### Capture latency", "");
  lines.push("| profile | N | hook p50 ms | hook p95 ms | hook stdout B | observe p50 ms | observe p95 ms | observe p99 ms | errors | capture wall ms | quiesce ms |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    lines.push(`| ${r["profile"]} | ${r["observations"]} | ${get(r, "capture.hookLatencyMs.p50")} | ${get(r, "capture.hookLatencyMs.p95")} | ${get(r, "capture.hookStdoutBytes.total")} | ${get(r, "capture.observeLatencyMs.p50")} | ${get(r, "capture.observeLatencyMs.p95")} | ${get(r, "capture.observeLatencyMs.p99")} | ${get(r, "capture.observeErrors")} | ${get(r, "capture.wallMs")} | ${get(r, "capture.quiesceMs")} |`);
  }
  lines.push("", "### Startup and recovery", "");
  lines.push("| profile | N | cold ready ms | warm ready ms | recovery ready ms | recovery BM25 rebuild ms (docs) | vectors loaded | vector docs before / after | backfill queued / awaiting opt-in | re-embed requests (inputs) | logical obs before / after | marker hits before / after | source tail before / after |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    lines.push(`| ${r["profile"]} | ${r["observations"]} | ${get(r, "coldStart.readyMs")} | ${get(r, "warmStart.readyMs")} | ${get(r, "recovery.readyMs")} | ${get(r, "recovery.boot.bm25RebuildMs")} (${get(r, "recovery.boot.bm25Docs")}) | ${get(r, "recovery.boot.vectorsLoaded")} | ${get(r, "evidenceBeforeKill.vectorDocuments")} / ${get(r, "evidenceAfterRecovery.vectorDocuments")} | ${get(r, "recovery.boot.vectorBackfillQueued")} / ${get(r, "recovery.boot.vectorBackfillAwaitingOptIn")} | ${get(r, "recovery.reEmbedRequests")} (${get(r, "recovery.reEmbeddedInputs")}) | ${get(r, "evidenceBeforeKill.logicalObservations")} / ${get(r, "evidenceAfterRecovery.logicalObservations")} | ${get(r, "evidenceBeforeKill.markerSearchHits")}/${get(r, "evidenceBeforeKill.sampled")} / ${get(r, "evidenceAfterRecovery.markerSearchHits")}/${get(r, "evidenceAfterRecovery.sampled")} | ${get(r, "evidenceBeforeKill.sourceTailRetained")} / ${get(r, "evidenceAfterRecovery.sourceTailRetained")} |`);
  }
  lines.push("", "### Provider calls (OpenAI-compatible endpoint seen by the bench)", "");
  lines.push("| profile | N | capture embed req (inputs, repeats) | capture chat req (repeats) | chat prompt tok | chat completion tok | upstream embed s | upstream chat s | provider errors | context-phase embed req | recovery embed req | warm-start embed req |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    const p = (k: string) => get(r, `capture.provider.${k}`);
    const secs = (k: string) => (typeof p(k) === "number" ? ((p(k) as number) / 1000).toFixed(1) : "n/a");
    lines.push(`| ${r["profile"]} | ${r["observations"]} | ${p("embedRequests")} (${p("embedInputs")}, ${p("embedRepeatInputs")}) | ${p("chatRequests")} (${p("chatRepeatPrompts")}) | ${p("chatPromptTokens")} | ${p("chatCompletionTokens")} | ${secs("embedUpstreamMs")} | ${secs("chatUpstreamMs")} | ${p("errors")} | ${get(r, "agentVisibleContextProvider.embedRequests")} | ${get(r, "recovery.provider.embedRequests")} | ${get(r, "warmStart.provider.embedRequests")} |`);
  }
  const redisRuns = runs.filter((r) => r["redisAfterCapture"]);
  if (redisRuns.length > 0) {
    lines.push("", "### Redis state store after capture", "");
    lines.push("| profile | N | used memory | keys | redis-server RSS |", "|---|---|---|---|---|");
    for (const r of redisRuns) lines.push(`| ${r["profile"]} | ${r["observations"]} | ${fmtBytes(get(r, "redisAfterCapture.usedMemoryBytes"))} | ${get(r, "redisAfterCapture.keys")} | ${fmtKiB(get(r, "redisAfterCapture.serverRssKiB"))} |`);
  }
  if (crashes.length > 0) {
    lines.push("", "### Force-kill during capture with the service down", "");
    lines.push("| profile | N | killed at ms | hooks before kill | embedded before kill | checkpoint before kill | spooled while down | offline hook p95 ms | spool recovered (dup) | pending-log vectors | recovery embed inputs (repeats) | logical obs after | vectors after | spool left |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of crashes) {
      lines.push(`| ${r["profile"]} | ${r["observations"]} | ${get(r, "crash.killAfterMs")} | ${get(r, "crash.hooksCompletedBeforeKill")} | ${get(r, "crash.embeddedInputsBeforeKill")} | ${get(r, "crash.vectorCheckpointBeforeKill") ? "yes" : "no"} | ${get(r, "crash.spoolRecordsWhileDown")} | ${get(r, "crash.hookLatencyOfflineMs.p95")} | ${get(r, "recovery.boot.spoolRecovered")} (${get(r, "recovery.boot.spoolAlreadyStored")}) | ${get(r, "recovery.boot.pendingLogRecoveredVectors")} | ${get(r, "recovery.provider.embedInputs")} (${get(r, "recovery.provider.embedRepeatInputs")}) | ${get(r, "evidenceAfterRecovery.logicalObservations")} | ${get(r, "evidenceAfterRecovery.vectorDocuments")} | ${get(r, "recovery.spoolRecordsAfter")} |`);
    }
  }
  lines.push("", "### Agent-visible context (server token estimate, not provider billing)", "");
  lines.push("| profile | N | search full B p50 (tok) | compact B p50 (tok) | narrative B p50 (tok) | smart-search B p50 | context B (tok) | SessionStart stdout off / on | PreToolUse stdout off / on |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of runs) {
    const e = (k: string, f: string) => get(r, `agentVisibleContext.endpoints.${k}.${f}`);
    const tok = (k: string) => {
      const t = e(k, "serverTokenEstimate");
      return typeof t === "object" && t ? (t as { p50: number }).p50 : "unknown";
    };
    const hs = (k: string) => get(r, `agentVisibleContext.hookStdout.${k}.stdoutBytes`);
    lines.push(`| ${r["profile"]} | ${r["observations"]} | ${e("search_full", "bytes.p50")} (${tok("search_full")}) | ${e("search_compact", "bytes.p50")} (${tok("search_compact")}) | ${e("search_narrative", "bytes.p50")} (${tok("search_narrative")}) | ${e("smart_search", "bytes.p50")} | ${e("context", "bytes.p50")} (${tok("context")}) | ${hs("session_start_inject_off")} / ${hs("session_start_inject_on")} | ${hs("pre_tool_use_inject_off")} / ${hs("pre_tool_use_inject_on")} |`);
  }
  const checks: [string, Check[]][] = [["Invariants (evidence completeness and default-off injection)", (report["invariants"] as Check[]) ?? []], ["Budgets", ((report["budgets"] as { checks?: Check[] } | undefined)?.checks ?? [])]];
  for (const [title, list] of checks) {
    if (list.length === 0) continue;
    const failed = list.filter((c) => !c.pass);
    lines.push("", `### ${title}`, "", `${list.length - failed.length}/${list.length} checks pass.`);
    if (failed.length > 0) {
      lines.push("", "| profile | N | repeat | check | value | limit |", "|---|---|---|---|---|---|");
      for (const c of failed) lines.push(`| ${c.profile} | ${c.observations} | ${c.repeat} | ${c.name} | ${c.value} | ${c.limit} |`);
    }
  }
  const errors = all.filter((r) => r["error"]);
  if (errors.length > 0) {
    lines.push("", "### Errors", "");
    for (const r of errors) lines.push(`- ${r["profile"]} N=${r["observations"]}: ${r["error"]}`);
  }
  return lines.join("\n") + "\n";
}

function mergeReports(paths: string[], outDir: string, budgetsPath: string | null, writeBudgetsPath: string | null): void {
  const reports = paths.map((p) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>);
  const first = reports[0]!;
  const runs = reports.flatMap((r) => r["runs"] as Record<string, unknown>[]);
  const commits = new Set(reports.map((r) => r["commit"]));
  if (commits.size > 1) throw new Error(`refusing to merge reports from different commits: ${[...commits].join(", ")}`);
  const merged: Record<string, unknown> = {
    ...first,
    finished: reports.map((r) => String(r["finished"])).sort().pop(),
    config: { ...(first["config"] as object), sizes: [...new Set(runs.map((r) => r["observations"] as number))], repeats: Math.max(...reports.map((r) => ((r["config"] as { repeats?: number })?.repeats ?? 1))) },
    mergedFrom: paths.map((p) => basename(p)),
    runs,
  };
  merged["invariants"] = checkInvariants(runs);
  if (budgetsPath && existsSync(budgetsPath)) {
    merged["budgets"] = { file: basename(budgetsPath), checks: checkBudgets(runs, JSON.parse(readFileSync(budgetsPath, "utf8")) as BudgetFile) };
  }
  if (writeBudgetsPath) writeFileSync(writeBudgetsPath, JSON.stringify(deriveBudgets(runs), null, 2) + "\n");
  const short = String(first["commit"]).slice(0, 7);
  writeFileSync(join(outDir, `capture-costs-${short}.json`), JSON.stringify(merged, null, 2) + "\n");
  writeFileSync(join(outDir, `capture-costs-${short}.md`), markdown(merged));
  process.stdout.write(markdown(merged));
}

async function main(): Promise<void> {
  if (process.env["BENCH_MERGE"]) {
    const outDir = process.env["BENCH_OUT_DIR"] || resolve(process.cwd(), "benchmark", "results");
    mkdirSync(outDir, { recursive: true });
    const budgets = process.env["BENCH_BUDGETS"] === "off" ? null : resolve(process.cwd(), process.env["BENCH_BUDGETS"] || join("benchmark", "capture-costs-budgets.json"));
    const write = process.env["BENCH_WRITE_BUDGETS"] ? resolve(process.cwd(), process.env["BENCH_WRITE_BUDGETS"]) : null;
    mergeReports(process.env["BENCH_MERGE"].split(",").map((p) => resolve(process.cwd(), p.trim())), outDir, budgets, write);
    return;
  }
  const cfg = loadConfig();
  if (!existsSync(join(cfg.distDir, "cli.mjs")) || !existsSync(join(cfg.distDir, "hooks", "post-tool-use.mjs"))) {
    throw new Error("dist/ is missing; run npm run build first");
  }
  mkdirSync(cfg.root, { recursive: true });
  mkdirSync(cfg.outDir, { recursive: true });
  const fake = new FakeProvider(cfg.fakePort, cfg.dims, cfg.upstreamUrl);
  await fake.start();
  const commit = gitSha();
  const started = new Date().toISOString();
  const runs: Record<string, unknown>[] = [];
  try {
    for (const n of cfg.sizes) {
      for (let rep = 1; rep <= cfg.repeats; rep++) {
        for (const profile of cfg.profiles) {
          const t0 = performance.now();
          const r = cfg.scenario === "crash-offline" ? await runCrashOffline(cfg, profile, n, fake) : await runOne(cfg, profile, n, fake);
          r["repeat"] = rep;
          r["runWallMs"] = Math.round(performance.now() - t0);
          runs.push(r);
        }
      }
    }
  } finally {
    await fake.stop();
    if (!cfg.keep) rmSync(cfg.root, { recursive: true, force: true });
  }
  const report: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    commit,
    started,
    finished: new Date().toISOString(),
    environment: {
      platform: `${platform()} ${release()} ${arch()}`,
      cpu: `${cpus()[0]?.model ?? "unknown"} x${cpus().length}`,
      memoryBytes: totalmem(),
      node: process.version,
      iii: iiiVersion(cfg.iiiBin),
      stateBackend: cfg.stateBackend,
      ...(cfg.stateBackend === "redis" ? { redis: (await redisCli(cfg.redisUrl!, ["INFO", "server"])).match(/^redis_version:(\S+)/m)?.[1] ?? null } : {}),
    },
    config: {
      sizes: cfg.sizes,
      profiles: cfg.profiles.map((p) => ({ name: p.name, description: p.description })),
      observationsPerSession: cfg.perSession,
      hookSample: cfg.hookSample,
      observeConcurrency: cfg.concurrency,
      toolOutputBytes: [cfg.outputMin, cfg.outputMax],
      seed: cfg.seed,
      embeddingDimensions: cfg.dims,
      contextBudgetTokens: cfg.contextBudget,
      searchLimit: cfg.searchLimit,
      evidenceSample: cfg.evidenceSample,
      repeats: cfg.repeats,
      scenario: cfg.scenario,
      provider: cfg.provider === "fake" ? { mode: "fake" } : { mode: cfg.provider, url: cfg.upstreamUrl, embeddingModel: cfg.embedModel, chatModel: cfg.chatModel },
      ...(cfg.scenario === "crash-offline" ? { killAfterMs: cfg.killAfterMs, killSettleMs: cfg.killSettleMs } : {}),
      ports: { rest: cfg.restPort, streams: cfg.restPort + 1, viewer: cfg.restPort + 2, metrics: cfg.restPort + 3, engine: cfg.enginePort, fakeProvider: cfg.fakePort },
    },
    runs,
  };
  report["invariants"] = checkInvariants(runs);
  if (cfg.budgetsPath && existsSync(cfg.budgetsPath)) {
    report["budgets"] = { file: cfg.budgetsPath, checks: checkBudgets(runs, JSON.parse(readFileSync(cfg.budgetsPath, "utf8")) as BudgetFile) };
  }
  if (cfg.writeBudgetsPath) {
    writeFileSync(cfg.writeBudgetsPath, JSON.stringify(deriveBudgets(runs), null, 2) + "\n");
    process.stderr.write(`[capture-costs] wrote budgets to ${cfg.writeBudgetsPath}\n`);
  }
  const short = commit === "unknown" ? `nogit-${Date.now().toString(36)}` : commit.slice(0, 7);
  const jsonPath = join(cfg.outDir, `capture-costs-${short}.json`);
  const mdPath = join(cfg.outDir, `capture-costs-${short}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(mdPath, markdown(report));
  process.stdout.write(markdown(report));
  process.stderr.write(`[capture-costs] wrote ${jsonPath} and ${mdPath}\n`);
  const failedInvariants = (report["invariants"] as Check[]).some((c) => !c.pass);
  const budgetChecks = ((report["budgets"] as { checks?: Check[] } | undefined)?.checks ?? []);
  const failedBudgets = budgetChecks.some((c) => !c.pass);
  if (runs.some((r) => r["error"]) || failedInvariants) process.exitCode = 1;
  if (failedBudgets && cfg.enforceBudgets) process.exitCode = 2;
}

main().catch((err) => {
  process.stderr.write(`[capture-costs] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
