#!/usr/bin/env node

import {
  spawn,
  execFileSync,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname, delimiter as PATH_DELIMITER } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import * as p from "@clack/prompts";
import { generateId } from "./state/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const IS_WINDOWS = platform() === "win32";
const IS_VERBOSE = args.includes("--verbose") || args.includes("-v");

function vlog(msg: string): void {
  if (IS_VERBOSE) p.log.info(`[verbose] ${msg}`);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
agentmemory — persistent memory for AI coding agents

Usage: agentmemory [command] [options]

Commands:
  (default)          Start agentmemory worker
  status             Show connection status, memory count, flags, and health
  doctor             Run diagnostic checks (server, flags, graph, providers)
  demo               Seed sample sessions and show recall in action
  upgrade            Upgrade local deps + iii runtime (best effort)
  mcp                Start standalone MCP server (no engine required)
  import-jsonl [p]   Import Claude Code JSONL transcripts (default: ~/.claude/projects)
                     --max-files <N> | --max-files=<N>: override scan cap (default 200, max 1000;
                     out-of-range is rejected; for trees >1000 files, batch by subdirectory)

Options:
  --help, -h         Show this help
  --verbose, -v      Show engine stderr and diagnostic info on startup
  --tools all|core   Tool visibility (default: core = 7 tools)
  --no-engine        Skip auto-starting iii-engine
  --port <N>         Override REST port (default: 3111)

Environment:
  AGENTMEMORY_URL    Full REST base URL (e.g. http://localhost:3111).
                     Honored by status, doctor, and MCP shim commands.

Quick start:
  npx @agentmemory/agentmemory          # start with local iii-engine or Docker
  npx @agentmemory/agentmemory demo     # see semantic recall in 30 seconds
  npx @agentmemory/agentmemory doctor   # diagnose config + feature flags
  npx @agentmemory/agentmemory status   # health + memory count + flags
  npx @agentmemory/agentmemory upgrade  # upgrade agentmemory + iii runtime
  npx @agentmemory/agentmemory mcp      # standalone MCP server (no engine)
  npx @agentmemory/mcp                  # same as above (shim package)
`);
  process.exit(0);
}

const toolsIdx = args.indexOf("--tools");
if (toolsIdx !== -1 && args[toolsIdx + 1]) {
  process.env["AGENTMEMORY_TOOLS"] = args[toolsIdx + 1];
}

const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env["III_REST_PORT"] = args[portIdx + 1];
}

const skipEngine = args.includes("--no-engine");

function getRestPort(): number {
  const url = process.env["AGENTMEMORY_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return parseInt(process.env["III_REST_PORT"] || "3111", 10) || 3111;
}

function getBaseUrl(): string {
  const url = process.env["AGENTMEMORY_URL"];
  if (url) return url.replace(/\/+$/, "");
  return `http://localhost:${getRestPort()}`;
}

function getViewerUrl(): string {
  const envUrl = process.env["AGENTMEMORY_VIEWER_URL"];
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(getBaseUrl());
    const vPort = (parseInt(u.port || "3111", 10) || 3111) + 2;
    return `${u.protocol}//${u.hostname}:${vPort}`;
  } catch {
    return `http://localhost:${getRestPort() + 2}`;
  }
}

async function isEngineRunning(): Promise<boolean> {
  try {
    await fetch(`${getBaseUrl()}/`, {
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

async function isAgentmemoryReady(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/agentmemory/livez`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function findIiiConfig(): string {
  const candidates = [
    join(__dirname, "iii-config.yaml"),
    join(__dirname, "..", "iii-config.yaml"),
    join(process.cwd(), "iii-config.yaml"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "";
}

function whichBinary(name: string): string | null {
  const cmd = IS_WINDOWS ? "where" : "which";
  try {
    const out = execFileSync(cmd, [name], { encoding: "utf-8" });
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return first ?? null;
  } catch {
    return null;
  }
}

function fallbackIiiPaths(): string[] {
  if (IS_WINDOWS) {
    const userProfile = process.env["USERPROFILE"];
    if (!userProfile) return [];
    return [
      join(userProfile, ".local", "bin", "iii.exe"),
      join(userProfile, "bin", "iii.exe"),
    ];
  }
  const home = process.env["HOME"];
  if (!home) return ["/usr/local/bin/iii"];
  return [join(home, ".local", "bin", "iii"), "/usr/local/bin/iii"];
}

type StartupFailure = {
  kind: "no-engine" | "no-docker-compose" | "engine-crashed" | "docker-crashed";
  stderr?: string;
  binary?: string;
};

let startupFailure: StartupFailure | null = null;

// Spawn a background engine and collect any startup stderr for a short
// window. The process is unref'd so the CLI parent can exit cleanly; we
// only care about stderr that shows up BEFORE the health check succeeds,
// which is what surfaces early crash/config-parse errors on all platforms.
function spawnEngineBackground(
  bin: string,
  spawnArgs: string[],
  label: string,
): ChildProcess {
  vlog(`spawn: ${bin} ${spawnArgs.join(" ")}`);
  const child = spawn(bin, spawnArgs, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  const MAX_STDERR_CAPTURE = 16 * 1024;
  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderrBytes >= MAX_STDERR_CAPTURE) return;
    const slice = chunk.subarray(0, MAX_STDERR_CAPTURE - stderrBytes);
    stderrChunks.push(slice);
    stderrBytes += slice.length;
  });
  child.on("exit", (code, signal) => {
    const abnormal =
      (code !== null && code !== 0) || (code === null && signal !== null);
    if (abnormal) {
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      startupFailure = {
        kind: label.includes("Docker") ? "docker-crashed" : "engine-crashed",
        stderr:
          stderr.trim() ||
          (signal
            ? `process killed by signal ${signal}`
            : `process exited with code ${code}`),
        binary: bin,
      };
      vlog(`engine exited early: code=${code} signal=${signal}`);
      if (IS_VERBOSE && stderr.trim()) {
        p.log.error(`engine stderr:\n${stderr}`);
      }
    }
  });
  child.unref();
  return child;
}

async function startEngine(): Promise<boolean> {
  const configPath = findIiiConfig();
  let iiiBin = whichBinary("iii");
  vlog(`iii binary: ${iiiBin ?? "(not on PATH)"}, config: ${configPath || "(not found)"}`);

  if (iiiBin && configPath) {
    const s = p.spinner();
    s.start(`Starting iii-engine: ${iiiBin}`);
    spawnEngineBackground(iiiBin, ["--config", configPath], "iii-engine");
    s.stop("iii-engine process started");
    return true;
  }

  const dockerBin = whichBinary("docker");
  vlog(`docker binary: ${dockerBin ?? "(not on PATH)"}`);
  const dockerComposeCandidates = [
    join(__dirname, "..", "docker-compose.yml"),
    join(__dirname, "docker-compose.yml"),
    join(process.cwd(), "docker-compose.yml"),
  ];
  const composeFile = dockerComposeCandidates.find((c) => existsSync(c));
  vlog(`docker-compose.yml: ${composeFile ?? "(not found)"}`);

  if (dockerBin && composeFile) {
    const s = p.spinner();
    s.start("Starting iii-engine via Docker...");
    spawnEngineBackground(
      dockerBin,
      ["compose", "-f", composeFile, "up", "-d"],
      "iii-engine via Docker",
    );
    s.stop("Docker compose started");
    return true;
  }

  for (const iiiPath of fallbackIiiPaths()) {
    if (existsSync(iiiPath)) {
      p.log.info(`Found iii at: ${iiiPath}`);
      process.env["PATH"] = `${dirname(iiiPath)}${PATH_DELIMITER}${process.env["PATH"] ?? ""}`;
      iiiBin = iiiPath;
      break;
    }
  }

  if (iiiBin && configPath) {
    const s = p.spinner();
    s.start(`Starting iii-engine: ${iiiBin}`);
    spawnEngineBackground(iiiBin, ["--config", configPath], "iii-engine");
    s.stop("iii-engine process started");
    return true;
  }

  if (!iiiBin && (!dockerBin || !composeFile)) {
    startupFailure = { kind: "no-engine" };
  } else if (!composeFile && dockerBin) {
    startupFailure = { kind: "no-docker-compose" };
  }
  return false;
}

async function waitForEngine(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isEngineRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function installInstructions(): string[] {
  if (IS_WINDOWS) {
    return [
      "agentmemory requires the `iii-engine` runtime. Pick one:",
      "",
      "  A) Download the prebuilt Windows binary:",
      "     1. Open https://github.com/iii-hq/iii/releases/latest",
      "     2. Download iii-x86_64-pc-windows-msvc.zip",
      "        (or iii-aarch64-pc-windows-msvc.zip on ARM)",
      "     3. Extract iii.exe and either add its folder to PATH",
      "        or move it to %USERPROFILE%\\.local\\bin\\iii.exe",
      "     4. Re-run: npx @agentmemory/agentmemory",
      "",
      "  B) Docker Desktop:",
      "     1. Install Docker Desktop for Windows",
      "     2. Start Docker Desktop (engine must be running)",
      "     3. Re-run: npx @agentmemory/agentmemory",
      "",
      "Or skip the engine entirely for standalone MCP:",
      "  npx @agentmemory/agentmemory mcp",
    ];
  }
  return [
    "agentmemory requires the `iii-engine` runtime. Pick one:",
    "",
    "  A) curl -fsSL https://install.iii.dev/iii/main/install.sh | sh",
    "     (installs the prebuilt iii binary into ~/.local/bin/iii)",
    "",
    "  B) Docker: install Docker Desktop or docker-ce, then re-run",
    "",
    "Or skip the engine entirely for standalone MCP:",
    "  npx @agentmemory/agentmemory mcp",
    "",
    "Docs: https://iii.dev/docs",
  ];
}

function portInUseDiagnostic(port: number): string {
  return IS_WINDOWS
    ? `  netstat -ano | findstr :${port}`
    : `  lsof -i :${port}   # or: ss -tlnp | grep :${port}`;
}

async function main() {
  p.intro("agentmemory");

  if (skipEngine) {
    p.log.info("Skipping engine check (--no-engine)");
    await import("./index.js");
    return;
  }

  if (await isEngineRunning()) {
    p.log.success("iii-engine is running");
    await import("./index.js");
    return;
  }

  const started = await startEngine();
  if (!started) {
    p.log.error("Could not start iii-engine.");
    const lines = installInstructions();
    if (startupFailure?.kind === "no-docker-compose") {
      lines.unshift(
        "Docker is installed but docker-compose.yml is missing from this",
        "install. Re-install with: npm install -g @agentmemory/agentmemory",
        "",
      );
    }
    p.note(lines.join("\n"), "Setup required");
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Waiting for iii-engine to be ready...");

  const ready = await waitForEngine(15000);
  if (!ready) {
    const port = getRestPort();
    s.stop("iii-engine did not become ready within 15s");

    if (startupFailure?.kind === "engine-crashed" || startupFailure?.kind === "docker-crashed") {
      p.log.error("The iii-engine process crashed on startup.");
      if (startupFailure.binary) {
        p.log.info(`Binary: ${startupFailure.binary}`);
      }
      if (startupFailure.stderr) {
        p.note(startupFailure.stderr, "engine stderr");
      } else {
        p.log.info("No stderr was captured. Re-run with --verbose for more detail.");
      }
      p.note(
        [
          "Common causes:",
          "  - iii-engine version mismatch — reinstall the latest binary",
          "    (sh script on macOS/Linux, GitHub release zip on Windows)",
          "  - Docker Desktop not running (if you're using the Docker path)",
          "  - Port already in use (see below)",
          "",
          "See https://iii.dev/docs for current install instructions.",
        ].join("\n"),
        "Troubleshooting",
      );
    } else {
      p.log.error("The engine process started but the REST API never responded.");
      p.note(
        [
          `Check whether port ${port} is already bound by another process:`,
          portInUseDiagnostic(port),
          "",
          "If it is, free the port or override: agentmemory --port <N>",
          "",
          "If it isn't, a firewall may be blocking 127.0.0.1:" + port + ".",
          "Re-run with --verbose to see engine stderr.",
        ].join("\n"),
        "Troubleshooting",
      );
    }
    process.exit(1);
  }

  s.stop("iii-engine is ready");
  await import("./index.js");
}

async function apiFetch<T = unknown>(base: string, path: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const res = await fetch(`${base}/agentmemory/${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function runStatus() {
  const port = getRestPort();
  const base = getBaseUrl();
  p.intro("agentmemory status");

  const up = await isEngineRunning();
  if (!up) {
    p.log.error(`Not running — no response at ${base}`);
    p.log.info("Start with: npx @agentmemory/agentmemory");
    process.exit(1);
  }

  try {
    const [healthRes, sessionsRes, graphRes, memoriesRes, flagsRes] = await Promise.all([
      apiFetch<any>(base, "health"),
      apiFetch<any>(base, "sessions"),
      apiFetch<any>(base, "graph/stats"),
      apiFetch<any>(base, "export"),
      apiFetch<any>(base, "config/flags"),
    ]);

    const h = healthRes?.health;
    const status = healthRes?.status || "unknown";
    const version = healthRes?.version || "?";
    const sessions = Array.isArray(sessionsRes?.sessions) ? sessionsRes.sessions.length : 0;
    const nodes = Number(graphRes?.totalNodes ?? graphRes?.nodes ?? graphRes?.nodeCount ?? 0);
    const edges = Number(graphRes?.totalEdges ?? graphRes?.edges ?? graphRes?.edgeCount ?? 0);
    const cb = healthRes?.circuitBreaker?.state || "closed";
    const heapMB = h?.memory ? Math.round(h.memory.heapUsed / 1048576) : 0;
    const uptime = h?.uptimeSeconds ? Math.round(h.uptimeSeconds) : 0;

    const obsCount = memoriesRes?.observations?.length || 0;
    const memCount = memoriesRes?.memories?.length || 0;
    const estFullTokens = obsCount * 80;
    const estInjectedTokens = Math.min(obsCount, 50) * 38;
    const tokensSaved = estFullTokens - estInjectedTokens;
    const pctSaved = estFullTokens > 0 ? Math.round((tokensSaved / estFullTokens) * 100) : 0;

    p.log.success(`Connected — v${version} at ${base}`);

    const lines = [
      `Health:       ${status === "healthy" ? "✓ healthy" : status}`,
      `Sessions:     ${sessions}`,
      `Observations: ${obsCount}`,
      `Memories:     ${memCount}`,
      `Graph:        ${nodes} nodes, ${edges} edges`,
      `Circuit:      ${cb}`,
      `Heap:         ${heapMB} MB`,
      `Uptime:       ${uptime}s`,
      `Viewer:       ${getViewerUrl()}`,
    ];

    if (obsCount > 0) {
      lines.push("");
      lines.push(`Token savings: ~${tokensSaved.toLocaleString()} tokens saved (${pctSaved}% reduction)`);
      lines.push(`  Full context: ~${estFullTokens.toLocaleString()} tokens`);
      lines.push(`  Injected:     ~${estInjectedTokens.toLocaleString()} tokens`);
    }

    if (flagsRes) {
      const provider = flagsRes.provider === "llm" ? "✓ llm" : "✗ noop (no key)";
      const embed = flagsRes.embeddingProvider === "embeddings" ? "✓ embeddings" : "bm25-only";
      const flagRows = (flagsRes.flags || []).map((f: { key: string; enabled: boolean; label: string }) =>
        `  ${f.enabled ? "✓" : "✗"} ${f.key.padEnd(32)} ${f.label}`
      );
      lines.push("");
      lines.push(`Provider:     ${provider}`);
      lines.push(`Embeddings:   ${embed}`);
      lines.push(`Flags:`);
      flagRows.forEach((r: string) => lines.push(r));
    }

    p.note(lines.join("\n"), "agentmemory");
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

type DoctorCheck = { name: string; ok: boolean; hint?: string };

function formatChecks(checks: DoctorCheck[]): string {
  return checks
    .map((c) => `${c.ok ? "✓" : "✗"} ${c.name}${c.hint ? `\n   ${c.hint}` : ""}`)
    .join("\n");
}

async function runDoctor() {
  p.intro("agentmemory doctor");
  const base = getBaseUrl();
  const viewerUrl = getViewerUrl();
  const checks: DoctorCheck[] = [];

  const serverUp = await isEngineRunning();
  checks.push({
    name: "Server reachable",
    ok: serverUp,
    hint: serverUp ? undefined : `Start with: npx @agentmemory/agentmemory (tried ${base})`,
  });

  if (!serverUp) {
    p.note(formatChecks(checks), "server unreachable");
    process.exit(1);
  }

  const [health, flags, graph] = await Promise.all([
    apiFetch<any>(base, "health", 3000),
    apiFetch<any>(base, "config/flags", 3000),
    apiFetch<any>(base, "graph/stats", 3000),
  ]);

  const viewerUp = await fetch(viewerUrl, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok)
    .catch(() => false);

  const hasLlm = flags?.provider === "llm";
  const hasEmbed = flags?.embeddingProvider === "embeddings";
  const graphNodeCount = Number(graph?.totalNodes ?? graph?.nodes ?? graph?.nodeCount ?? 0);
  const graphHas = graphNodeCount > 0;

  checks.push(
    {
      name: "Health status",
      ok: health?.status === "healthy",
      hint: health?.status === "healthy" ? undefined : `Status: ${health?.status || "unknown"}`,
    },
    {
      name: "Viewer reachable",
      ok: viewerUp,
      hint: viewerUp ? undefined : `${viewerUrl} not responding`,
    },
    {
      name: "LLM provider",
      ok: hasLlm,
      hint: hasLlm ? undefined : "export ANTHROPIC_API_KEY=sk-ant-... (or GEMINI/OPENROUTER/MINIMAX) then restart",
    },
    {
      name: "Embedding provider",
      ok: hasEmbed,
      hint: hasEmbed ? undefined : "Running BM25-only. Add OPENAI_API_KEY / VOYAGE_API_KEY / COHERE_API_KEY / OLLAMA_HOST for semantic recall",
    },
  );

  for (const f of (flags?.flags || []) as { label: string; enabled: boolean; enableHow: string }[]) {
    checks.push({ name: f.label, ok: f.enabled, hint: f.enabled ? undefined : f.enableHow });
  }

  checks.push({
    name: "Knowledge graph populated",
    ok: graphHas,
    hint: graphHas ? undefined : "Graph is empty. Run a session with GRAPH_EXTRACTION_ENABLED=true, or POST /agentmemory/graph/extract",
  });

  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  p.note(formatChecks(checks), `${passed}/${total} checks passing`);

  if (passed === total) {
    p.outro("✓ All checks passed. agentmemory is healthy.");
  } else {
    p.outro(`${total - passed} issue(s) — follow hints above to fix.`);
    process.exit(1);
  }
}

type DemoObservation = {
  toolName: string;
  toolInput: Record<string, string>;
  toolOutput: string;
};

type DemoSession = {
  id: string;
  title: string;
  observations: DemoObservation[];
};

type SearchResult = { query: string; hits: number; topTitle: string };

function buildDemoSessions(): DemoSession[] {
  return [
    {
      id: generateId("demo"),
      title: "Session 1: JWT auth setup",
      observations: [
        {
          toolName: "Write",
          toolInput: { file_path: "src/middleware/auth.ts" },
          toolOutput:
            "Created JWT middleware using jose library. Tokens expire after 30 days. Chose jose over jsonwebtoken for Edge compatibility.",
        },
        {
          toolName: "Write",
          toolInput: { file_path: "test/auth.test.ts" },
          toolOutput:
            "Added token validation tests covering expired, malformed, and valid cases.",
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          toolOutput: "All 12 auth tests passing.",
        },
      ],
    },
    {
      id: generateId("demo"),
      title: "Session 2: Database migration debugging",
      observations: [
        {
          toolName: "Read",
          toolInput: { file_path: "prisma/schema.prisma" },
          toolOutput:
            "Found N+1 query issue in user relations. Need to add include on posts query.",
        },
        {
          toolName: "Edit",
          toolInput: { file_path: "src/api/users.ts" },
          toolOutput:
            "Fixed N+1 by adding Prisma include. Query time dropped from 450ms to 28ms.",
        },
      ],
    },
    {
      id: generateId("demo"),
      title: "Session 3: Rate limiting",
      observations: [
        {
          toolName: "Write",
          toolInput: { file_path: "src/middleware/ratelimit.ts" },
          toolOutput:
            "Added rate limiting middleware with 100 req/min default. Uses in-memory store for dev, Redis for prod.",
        },
      ],
    },
  ];
}

async function postJson<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

async function postJsonStrict<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const suffix = errBody ? ` — ${errBody.slice(0, 200)}` : "";
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}${suffix}`);
  }
  return (await res.json().catch(() => null)) as T | null;
}

async function seedDemoSession(
  base: string,
  project: string,
  session: DemoSession,
): Promise<number> {
  await postJsonStrict(`${base}/agentmemory/session/start`, {
    sessionId: session.id,
    project,
    cwd: project,
  });

  let stored = 0;
  for (const obs of session.observations) {
    const url = `${base}/agentmemory/observe`;
    const payload = {
      hookType: "post_tool_use",
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      data: {
        tool_name: obs.toolName,
        tool_input: obs.toolInput,
        tool_output: obs.toolOutput,
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        stored++;
      } else {
        const body = await res.text().catch(() => "");
        p.log.warn(
          `observe failed for ${obs.toolName}: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 160)}` : ""}`,
        );
      }
    } catch (err) {
      p.log.warn(
        `observe request failed for ${obs.toolName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await postJsonStrict(`${base}/agentmemory/session/end`, { sessionId: session.id });
  return stored;
}

async function runDemoSearch(base: string, query: string): Promise<SearchResult> {
  const data = await postJson<{ results?: Array<{ title?: string }> }>(
    `${base}/agentmemory/smart-search`,
    { query, limit: 5 },
    10000,
  );
  const items = data?.results ?? [];
  return {
    query,
    hits: items.length,
    topTitle: items[0]?.title ?? "(no results)",
  };
}

async function runDemo() {
  const port = getRestPort();
  const base = `http://localhost:${port}`;
  p.intro("agentmemory demo");

  if (!(await isAgentmemoryReady())) {
    p.log.error(
      `agentmemory worker not reachable on port ${port} (livez probe failed). Something may be on the port but it isn't serving /agentmemory/*.`,
    );
    p.log.info("Start it with: npx @agentmemory/agentmemory");
    process.exit(1);
  }

  const demoProject = "/tmp/agentmemory-demo";
  const sessions = buildDemoSessions();

  const sSeed = p.spinner();
  sSeed.start("Seeding 3 demo sessions with realistic observations...");

  let totalObs = 0;
  for (const session of sessions) {
    totalObs += await seedDemoSession(base, demoProject, session);
  }

  sSeed.stop(`Seeded ${totalObs} observations across ${sessions.length} sessions`);

  const queries = [
    "jwt auth middleware",
    "database performance optimization",
    "rate limiting",
  ];

  const sQuery = p.spinner();
  sQuery.start(`Running ${queries.length} smart-search queries...`);

  const results: SearchResult[] = [];
  for (const query of queries) {
    results.push(await runDemoSearch(base, query));
  }

  sQuery.stop("Search complete");

  const lines = [
    `Project:       ${demoProject}`,
    `Sessions:      ${sessions.length} seeded (${totalObs} observations)`,
    "",
    "Search results:",
    ...results.flatMap((r) => [
      `  "${r.query}"`,
      `    → ${r.hits} hit(s), top: ${r.topTitle.slice(0, 60)}`,
    ]),
    "",
    `Notice: searching "database performance optimization"`,
    `found the N+1 query fix — keyword matching can't do that.`,
    "",
    `Viewer:        ${getViewerUrl()}`,
    `Clean up with: curl -X DELETE "${base}/agentmemory/sessions?project=${demoProject}"`,
  ];

  p.note(lines.join("\n"), "demo complete");
  p.log.success("agentmemory is working. Point your agent at it and get back to coding.");
}

function runCommand(
  command: string,
  commandArgs: string[],
  options: { cwd?: string; label: string; optional?: boolean } = { label: "command" },
): boolean {
  const spinner = p.spinner();
  spinner.start(options.label);
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (result.status === 0) {
    spinner.stop(`${options.label} ✓`);
    return true;
  }

  const stderr = (result.stderr || "").toString().trim();
  const stdout = (result.stdout || "").toString().trim();
  const msg = stderr || stdout || "unknown error";

  if (options.optional) {
    spinner.stop(`${options.label} (skipped)`);
    p.log.warn(msg.slice(0, 300));
    return false;
  }

  spinner.stop(`${options.label} ✗`);
  p.log.error(msg.slice(0, 300));
  return false;
}

async function runUpgrade() {
  p.intro("agentmemory upgrade");

  const cwd = process.cwd();
  const hasPackageJson = existsSync(join(cwd, "package.json"));
  const hasPnpmLock = existsSync(join(cwd, "pnpm-lock.yaml"));

  const pnpmBin = whichBinary("pnpm");
  const npmBin = whichBinary("npm");
  const dockerBin = whichBinary("docker");

  p.log.info(`Working directory: ${cwd}`);
  const requireSuccess = (ok: boolean, label: string): void => {
    if (!ok) {
      p.log.error(`Upgrade aborted: ${label} failed.`);
      process.exit(1);
    }
  };

  if (hasPackageJson) {
    const usePnpm = !!pnpmBin && hasPnpmLock;
    if (usePnpm && pnpmBin) {
      const installOk = runCommand(pnpmBin, ["install"], {
        label: "Refreshing dependencies (pnpm install)",
      });
      requireSuccess(installOk, "pnpm install");
      runCommand(pnpmBin, ["up", "iii-sdk@latest"], {
        label: "Upgrading iii-sdk to latest",
        optional: true,
      });
    } else if (npmBin) {
      const installOk = runCommand(npmBin, ["install"], {
        label: "Refreshing dependencies (npm install)",
      });
      requireSuccess(installOk, "npm install");
      runCommand(npmBin, ["install", "iii-sdk@latest"], {
        label: "Upgrading iii-sdk to latest",
        optional: true,
      });
    } else {
      p.log.warn("No package manager found (pnpm/npm). Skipping JS dependency upgrade.");
    }
  } else {
    p.log.warn("No package.json in current directory. Skipping JS dependency upgrade.");
  }

  const shBin = whichBinary("sh");
  const curlBin = whichBinary("curl");
  if (shBin && curlBin) {
    const upgradeEngine = await p.confirm({
      message: "Re-run the iii-engine install script (curl | sh)?",
      initialValue: true,
    });
    if (p.isCancel(upgradeEngine)) {
      p.cancel("Cancelled.");
      return process.exit(0);
    }
    if (upgradeEngine === true) {
      const installerOk = runCommand(
        shBin,
        ["-c", "curl -fsSL https://install.iii.dev/iii/main/install.sh | sh"],
        { label: "Upgrading iii-engine via installer", optional: true },
      );
      if (!installerOk) {
        p.log.warn(
          "iii-engine installer failed. Fallbacks: Docker (`docker pull iiidev/iii:latest`) or releases at https://github.com/iii-hq/iii/releases/latest.",
        );
      }
    } else {
      p.log.info("Skipped iii-engine installer.");
    }
  } else {
    p.log.warn("curl or sh not found. Skipping iii-engine installer.");
  }

  if (dockerBin) {
    runCommand(dockerBin, ["pull", "iiidev/iii:latest"], {
      label: "Pulling latest iii Docker image",
      optional: true,
    });
  } else {
    p.log.info("Docker not found. Skipping Docker image refresh.");
  }

  p.note(
    [
      "Upgrade flow completed.",
      "",
      "Recommended next steps:",
      "  1) agentmemory status",
      "  2) npm/pnpm test",
      "  3) restart agentmemory process",
    ].join("\n"),
    "agentmemory upgrade",
  );
}

async function runMcp(): Promise<void> {
  await import("./mcp/standalone.js");
}

async function runImportJsonl(): Promise<void> {
  // Long-form flags that take a value. Their value tokens must be
  // consumed alongside the flag so they don't leak into positional
  // args (e.g. `--port 3112 import-jsonl` would otherwise turn
  // 3112 into pathArg).
  const VALUE_FLAGS = new Set(["--port", "--tools"]);
  let maxFiles: number | undefined;
  const tail = args.slice(1);
  const positional: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const a = tail[i]!;
    if (a === "--max-files") {
      const raw = tail[i + 1];
      const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
      if (Number.isInteger(parsed) && parsed > 0) {
        maxFiles = parsed;
      } else if (raw !== undefined) {
        p.log.warn(`Ignoring --max-files ${raw}: expected a positive integer.`);
      }
      i++;
      continue;
    }
    if (a.startsWith("--max-files=")) {
      const raw = a.slice("--max-files=".length);
      const parsed = parseInt(raw, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        maxFiles = parsed;
      } else {
        p.log.warn(`Ignoring --max-files=${raw}: expected a positive integer.`);
      }
      continue;
    }
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  const pathArg = positional[0];

  const port = getRestPort();
  const base = `http://localhost:${port}`;

  let probeOk = false;
  let probeDetail = "";
  try {
    const probe = await fetch(`${base}/agentmemory/livez`, {
      signal: AbortSignal.timeout(2000),
    });
    probeOk = probe.ok;
    if (!probeOk) {
      const probeBody = await probe.text().catch(() => "");
      probeDetail = `reachable but unhealthy (HTTP ${probe.status}${probeBody ? `: ${probeBody.slice(0, 200)}` : ""})`;
    }
  } catch (err) {
    probeOk = false;
    const msg = err instanceof Error ? err.message : String(err);
    probeDetail = `unreachable (${msg})`;
  }
  if (!probeOk) {
    p.log.error(
      `agentmemory livez probe failed on port ${port}: ${probeDetail}. Start it with \`npx @agentmemory/agentmemory\` in another terminal, then re-run this command.`,
    );
    process.exit(1);
  }

  const body: Record<string, unknown> = {};
  if (pathArg) body["path"] = pathArg;
  if (maxFiles !== undefined) body["maxFiles"] = maxFiles;

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env["AGENTMEMORY_SECRET"];
  if (secret) headers["authorization"] = `Bearer ${secret}`;

  p.log.info(`Importing JSONL from ${pathArg || "~/.claude/projects"}…`);
  const spinner = p.spinner();
  spinner.start("scanning files");

  try {
    const res = await fetch(`${base}/agentmemory/replay/import-jsonl`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let json: {
      success?: boolean;
      error?: string;
      imported?: number;
      sessionIds?: string[];
      observations?: number;
      discovered?: number;
      truncated?: boolean;
      traversalCapped?: boolean;
      maxFiles?: number;
      maxFilesUpperBound?: number;
    } = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        spinner.stop("failed");
        p.log.error(
          `server returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
        );
        process.exit(1);
      }
    }
    if (!res.ok || json.success !== true) {
      spinner.stop("failed");
      const detail =
        json.error ||
        (text.length === 0
          ? "empty response body"
          : json.success === undefined
            ? `HTTP ${res.status} (response missing success field)`
            : `HTTP ${res.status}`);
      if (res.status === 401) {
        p.log.error(
          `${detail}. Set AGENTMEMORY_SECRET to match the server's secret and re-run.`,
        );
      } else if (res.status === 404) {
        p.log.error(
          `${detail}. The running agentmemory server does not expose /agentmemory/replay/import-jsonl — upgrade to v0.8.13 or later.`,
        );
      } else {
        p.log.error(detail);
      }
      process.exit(1);
    }
    spinner.stop(
      `imported ${json.imported ?? 0} file(s), ${json.observations ?? 0} observation(s) across ${json.sessionIds?.length || 0} session(s)`,
    );
    if (json.truncated) {
      const cap = json.maxFiles ?? 200;
      const upper = json.maxFilesUpperBound ?? 1000;
      const discovered = json.discovered ?? 0;
      const skipped = discovered - (json.imported ?? 0);
      const discoveredLabel = json.traversalCapped
        ? `${discovered}+ (traversal halted at safety cap)`
        : String(discovered);
      const baseMsg = `Hit the ${cap}-file scan cap; ${skipped} of ${discoveredLabel} discovered file(s) were skipped.`;
      // If we already saw more than the server's hard cap (or the
      // walker stopped early), bumping --max-files won't help on its
      // own — recommend batching by subdirectory.
      if (discovered > upper || json.traversalCapped) {
        p.log.warn(
          `${baseMsg} Tree exceeds the server's --max-files limit of ${upper}; ` +
            `batch by subdirectory (run import-jsonl once per project under ~/.claude/projects).`,
        );
      } else {
        const suggested = Math.min(
          Math.max((discovered || cap) + 100, cap * 2),
          upper,
        );
        p.log.warn(
          `${baseMsg} Re-run with --max-files=${suggested} (max ${upper}) or batch by subdirectory.`,
        );
      }
    }
    if (json.sessionIds && json.sessionIds.length > 0) {
      p.log.info(`View at ${getViewerUrl()} → Replay tab`);
    }
  } catch (err) {
    spinner.stop("failed");
    if (err instanceof Error && err.name === "TimeoutError") {
      p.log.error("import timed out after 2 minutes");
    } else {
      p.log.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

const commands: Record<string, () => Promise<void>> = {
  status: runStatus,
  doctor: runDoctor,
  demo: runDemo,
  upgrade: runUpgrade,
  mcp: runMcp,
  "import-jsonl": runImportJsonl,
};

const handler = commands[args[0] ?? ""] ?? main;
handler().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
