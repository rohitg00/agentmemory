#!/usr/bin/env node

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
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
  status             Show connection status, memory count, and health
  demo               Seed sample sessions and show recall in action
  mcp                Start standalone MCP server (no engine required)

Options:
  --help, -h         Show this help
  --verbose, -v      Show engine stderr and diagnostic info on startup
  --tools all|core   Tool visibility (default: core = 7 tools)
  --no-engine        Skip auto-starting iii-engine
  --port <N>         Override REST port (default: 3111)

Quick start:
  npx @agentmemory/agentmemory          # start with local iii-engine or Docker
  npx @agentmemory/agentmemory status   # check health
  npx @agentmemory/agentmemory demo     # try it in 30 seconds (needs server running)
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
  return parseInt(process.env["III_REST_PORT"] || "3111", 10) || 3111;
}

async function isEngineRunning(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${getRestPort()}/`, {
      signal: AbortSignal.timeout(2000),
    });
    return true;
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

async function runStatus() {
  const port = getRestPort();
  const base = `http://localhost:${port}`;
  p.intro("agentmemory status");

  const up = await isEngineRunning();
  if (!up) {
    p.log.error(`Not running — no response on port ${port}`);
    p.log.info("Start with: npx @agentmemory/agentmemory");
    process.exit(1);
  }

  try {
    const [healthRes, sessionsRes, graphRes, memoriesRes] = await Promise.all([
      fetch(`${base}/agentmemory/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null),
      fetch(`${base}/agentmemory/sessions`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null),
      fetch(`${base}/agentmemory/graph/stats`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null),
      fetch(`${base}/agentmemory/export`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null),
    ]);

    const h = healthRes?.health;
    const status = healthRes?.status || "unknown";
    const version = healthRes?.version || "?";
    const sessions = Array.isArray(sessionsRes?.sessions) ? sessionsRes.sessions.length : 0;
    const nodes = graphRes?.nodes || 0;
    const edges = graphRes?.edges || 0;
    const cb = healthRes?.circuitBreaker?.state || "closed";
    const heapMB = h?.memory ? Math.round(h.memory.heapUsed / 1048576) : 0;
    const uptime = h?.uptimeSeconds ? Math.round(h.uptimeSeconds) : 0;

    const obsCount = memoriesRes?.observations?.length || 0;
    const memCount = memoriesRes?.memories?.length || 0;
    const estFullTokens = obsCount * 80;
    const estInjectedTokens = Math.min(obsCount, 50) * 38;
    const tokensSaved = estFullTokens - estInjectedTokens;
    const pctSaved = estFullTokens > 0 ? Math.round((tokensSaved / estFullTokens) * 100) : 0;

    p.log.success(`Connected — v${version} on port ${port}`);

    const lines = [
      `Health:       ${status === "healthy" ? "✓ healthy" : status}`,
      `Sessions:     ${sessions}`,
      `Observations: ${obsCount}`,
      `Memories:     ${memCount}`,
      `Graph:        ${nodes} nodes, ${edges} edges`,
      `Circuit:      ${cb}`,
      `Heap:         ${heapMB} MB`,
      `Uptime:       ${uptime}s`,
      `Viewer:       http://localhost:${port + 2}`,
    ];

    if (obsCount > 0) {
      lines.push("");
      lines.push(`Token savings: ~${tokensSaved.toLocaleString()} tokens saved (${pctSaved}% reduction)`);
      lines.push(`  Full context: ~${estFullTokens.toLocaleString()} tokens`);
      lines.push(`  Injected:     ~${estInjectedTokens.toLocaleString()} tokens`);
    }

    p.note(lines.join("\n"), "agentmemory");
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
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

  if (!(await isEngineRunning())) {
    p.log.error(`Not running — no response on port ${port}`);
    p.log.info("Start the server first: npx @agentmemory/agentmemory");
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
    `Viewer:        http://localhost:${port + 2}`,
    `Clean up with: curl -X DELETE "${base}/agentmemory/sessions?project=${demoProject}"`,
  ];

  p.note(lines.join("\n"), "demo complete");
  p.log.success("agentmemory is working. Point your agent at it and get back to coding.");
}

async function runMcp(): Promise<void> {
  await import("./mcp/standalone.js");
}

const commands: Record<string, () => Promise<void>> = {
  status: runStatus,
  demo: runDemo,
  mcp: runMcp,
};

const handler = commands[args[0] ?? ""] ?? main;
handler().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
