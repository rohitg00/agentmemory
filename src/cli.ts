#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
agentmemory — persistent memory for AI coding agents

Usage: agentmemory [options]

Options:
  --help, -h         Show this help
  --tools all|core   Tool visibility (default: core = 7 tools)
  --no-engine        Skip auto-starting iii-engine
  --port <N>         Override REST port (default: 3111)

Environment:
  AGENTMEMORY_TOOLS=all    Expose all 41 MCP tools
  AGENTMEMORY_SECRET=xxx   Auth secret for REST/MCP
  CONSOLIDATION_ENABLED=true   Enable auto-consolidation (off by default)
  OBSIDIAN_AUTO_EXPORT=true    Auto-export on consolidation

Quick start:
  npx agentmemory             # auto-starts iii-engine, runs worker
  npx agentmemory-mcp         # standalone MCP server (no engine needed)
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
    const res = await fetch(`http://localhost:${getRestPort()}/agentmemory/livez`, {
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
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    return execFileSync(cmd, [name], { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function startEngine(): Promise<boolean> {
  const configPath = findIiiConfig();

  const iiiBin = whichBinary("iii");
  if (iiiBin && configPath) {
    console.log(`[agentmemory] Starting iii-engine: ${iiiBin} --config ${configPath}`);
    const child = spawn(iiiBin, ["--config", configPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  }

  const dockerCompose = join(__dirname, "..", "docker-compose.yml");
  const dcExists = existsSync(dockerCompose) || existsSync(join(process.cwd(), "docker-compose.yml"));
  const dockerBin = whichBinary("docker");

  if (dockerBin && dcExists) {
    const composeFile = existsSync(dockerCompose) ? dockerCompose : join(process.cwd(), "docker-compose.yml");
    console.log(`[agentmemory] Starting iii-engine via Docker...`);
    const child = spawn(dockerBin, ["compose", "-f", composeFile, "up", "-d"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
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
  if (!skipEngine && !(await isEngineRunning())) {
    const started = await startEngine();
    if (!started) {
      console.error(`
[agentmemory] iii-engine is not running and could not be auto-started.

Install one of:
  1. iii CLI:    npm install -g iii-engine
  2. Docker:     docker compose up -d (with docker-compose.yml)

Or run with --no-engine to connect to a remote engine.
`);
      process.exit(1);
    }

    console.log(`[agentmemory] Waiting for iii-engine to start...`);
    const ready = await waitForEngine(15000);
    if (!ready) {
      const port = getRestPort();
      console.error(`[agentmemory] iii-engine did not become ready within 15s.`);
      console.error(`[agentmemory] Check that ports ${port}, ${port + 1}, 49134 are available.`);
      process.exit(1);
    }
    console.log(`[agentmemory] iii-engine is ready.`);
  }

  await import("./index.js");
}

main().catch((err) => {
  console.error(`[agentmemory] Fatal:`, err);
  process.exit(1);
});
