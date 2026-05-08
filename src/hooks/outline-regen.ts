#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const WHITELIST_PATH = join(
  homedir(),
  ".config",
  "agentmemory",
  "outline-tracked.txt",
);

const DEFAULT_PATTERNS = [/CLAUDE\.md$/i, /MEMORY\.md$/i, /AGENTS\.md$/i];

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

function loadWhitelist(): string[] {
  if (!existsSync(WHITELIST_PATH)) return [];
  try {
    return readFileSync(WHITELIST_PATH, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch {
    return [];
  }
}

function shouldTrack(filePath: string, whitelist: string[]): boolean {
  if (whitelist.length > 0) {
    return whitelist.some((p) => filePath === p || filePath.endsWith(p));
  }
  return DEFAULT_PATTERNS.some((re) => re.test(filePath));
}

function extractFilePath(data: Record<string, unknown>): string | null {
  const toolName = data.tool_name as string | undefined;
  if (toolName !== "Write" && toolName !== "Edit" && toolName !== "MultiEdit") {
    return null;
  }
  const input = data.tool_input as Record<string, unknown> | undefined;
  if (!input) return null;
  const p = input.file_path;
  if (typeof p !== "string" || p.length === 0) return null;
  return p;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  const filePath = extractFilePath(data);
  if (!filePath) return;

  const whitelist = loadWhitelist();
  if (!shouldTrack(filePath, whitelist)) return;

  try {
    await fetch(`${REST_URL}/agentmemory/outline/build`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ path: filePath }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // best effort
  }
}

main();
