#!/usr/bin/env tsx

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
  ".turbo",
  ".vscode",
  ".idea",
]);

const PATTERNS = [/CLAUDE\.md$/i, /MEMORY\.md$/i, /AGENTS\.md$/i];

async function* walk(dir: string, depth = 0, max = 6): AsyncGenerator<string> {
  if (depth > max) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && !ent.name.startsWith(".claude") && !ent.name.startsWith(".config")) continue;
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(full, depth + 1, max);
    } else if (ent.isFile() && PATTERNS.some((re) => re.test(ent.name))) {
      yield full;
    }
  }
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function buildOne(path: string): Promise<{ ok: boolean; err?: string }> {
  try {
    const res = await fetch(`${REST_URL}/agentmemory/outline/build`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, err: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { success?: boolean; error?: string };
    if (body.success === false) return { ok: false, err: body.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, err: String(err) };
  }
}

async function main() {
  const home = homedir();
  const roots = [
    join(home, "CaptainAgent"),
    join(home, ".claude", "projects"),
    home,
  ];

  const seen = new Set<string>();
  const targets: string[] = [];
  for (const root of roots) {
    try {
      await fs.access(root);
    } catch {
      continue;
    }
    const depthCap = root === home ? 2 : 6;
    for await (const f of walk(root, 0, depthCap)) {
      const r = resolve(f);
      if (seen.has(r)) continue;
      seen.add(r);
      targets.push(r);
    }
  }

  console.log(`[outline-backfill] Found ${targets.length} candidate files`);

  let built = 0;
  let failed = 0;
  for (const path of targets) {
    const r = await buildOne(path);
    if (r.ok) {
      built++;
      console.log(`  ok   ${path}`);
    } else {
      failed++;
      console.log(`  FAIL ${path} (${r.err})`);
    }
  }

  console.log(`\n[outline-backfill] built: ${built} / failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`[outline-backfill] fatal:`, err);
  process.exit(1);
});
