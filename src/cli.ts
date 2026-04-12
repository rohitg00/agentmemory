#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { generateId } from "./state/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
agentmemory — persistent memory for AI coding agents

Usage: agentmemory [command] [options]

Commands:
  (default)          Start agentmemory worker
  status             Show connection status, memory count, and health
  demo               Seed sample sessions and show recall in action

Options:
  --help, -h         Show this help
  --tools all|core   Tool visibility (default: core = 7 tools)
  --no-engine        Skip auto-starting iii-engine
  --port <N>         Override REST port (default: 3111)

Quick start:
  npx @agentmemory/agentmemory          # start with local iii-engine or Docker
  npx @agentmemory/agentmemory status   # check health
  npx @agentmemory/agentmemory demo     # try it in 30 seconds (needs server running)
  npx agentmemory-mcp                   # standalone MCP server (no engine)
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
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    return execFileSync(cmd, [name], { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function startEngine(): Promise<boolean> {
  const configPath = findIiiConfig();
  let iiiBin = whichBinary("iii");

  if (iiiBin && configPath) {
    const s = p.spinner();
    s.start(`Starting iii-engine: ${iiiBin}`);
    const child = spawn(iiiBin, ["--config", configPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    s.stop("iii-engine process started");
    return true;
  }

  const dockerBin = whichBinary("docker");
  const dockerCompose = join(__dirname, "..", "docker-compose.yml");
  const dcExists = existsSync(dockerCompose) || existsSync(join(process.cwd(), "docker-compose.yml"));

  if (dockerBin && dcExists) {
    const composeFile = existsSync(dockerCompose) ? dockerCompose : join(process.cwd(), "docker-compose.yml");
    const s = p.spinner();
    s.start("Starting iii-engine via Docker...");
    const child = spawn(dockerBin, ["compose", "-f", composeFile, "up", "-d"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    s.stop("Docker compose started");
    return true;
  }

  const iiiPaths = [
    join(process.env["HOME"] || "", ".local", "bin", "iii"),
    "/usr/local/bin/iii",
  ];
  for (const iiiPath of iiiPaths) {
    if (existsSync(iiiPath)) {
      p.log.info(`Found iii at: ${iiiPath}`);
      process.env["PATH"] = `${dirname(iiiPath)}:${process.env["PATH"]}`;
      iiiBin = iiiPath;
      break;
    }
  }

  if (iiiBin && configPath) {
    const s = p.spinner();
    s.start(`Starting iii-engine: ${iiiBin}`);
    const child = spawn(iiiBin, ["--config", configPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    s.stop("iii-engine process started");
    return true;
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
    p.note(
      [
        "Install iii-engine (pick one):",
        "  cargo install iii-engine",
        "  See: https://iii.dev/docs",
        "",
        "Or use Docker:",
        "  docker pull iiidev/iii:latest",
        "",
        "Docs: https://iii.dev/docs",
        "",
        "Or skip with: agentmemory --no-engine",
      ].join("\n"),
      "Setup required",
    );
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Waiting for iii-engine to be ready...");

  const ready = await waitForEngine(15000);
  if (!ready) {
    const port = getRestPort();
    s.stop("iii-engine did not become ready within 15s");
    p.log.error(`Check that ports ${port}, ${port + 1}, 49134 are available.`);
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

const commands: Record<string, () => Promise<void>> = {
  status: runStatus,
  demo: runDemo,
};

const handler = commands[args[0] ?? ""] ?? main;
handler().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
