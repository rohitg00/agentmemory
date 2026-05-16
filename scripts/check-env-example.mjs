#!/usr/bin/env node
//
// Sync-check: every env var read by `src/` MUST be documented in
// `.env.example`. Runs in CI as a soft guard rail — keeps `.env.example`
// from drifting behind real config-surface additions.
//
// Usage:
//   node scripts/check-env-example.mjs
//
// Returns 0 when in sync, 1 with a diff when out of sync.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const ENV_FILE = join(ROOT, ".env.example");

// Env vars read by the runtime but NOT user-facing config — these are
// either process-injected (HOME, PATH, USERPROFILE), set by the build /
// wrapper (NODE_*, npm_*), or set by tests (VITEST, *_TEST_*). Skipping
// them keeps `.env.example` a documented config surface rather than an
// inventory of every getenv anywhere in the codebase.
const RUNTIME_ONLY = new Set([
  "HOME",
  "PATH",
  "USERPROFILE",
  "NODE_ENV",
  "AGENTMEMORY_SDK_CHILD",
]);

// Walk src/ for .ts / .mts / .mjs / .js files (excluding `.d.ts` declarations
// and dotfile dirs / node_modules). test/ lives outside src/ so it never enters.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (/\.(ts|mts|mjs|js)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

// Multiple patterns:
//   process.env["KEY"]                    — direct access
//   env["KEY"]                            — local alias inside detectProvider, etc.
//   getEnvVar("KEY")                      — helper from src/config.ts
//   env: ProcessEnv → env.KEY             — caught as `env["KEY"]` only; if you add
//   a dotted-access path, extend the regex.
const PATTERNS = [
  // Direct map index: process.env["KEY"], env["KEY"], getMergedEnv()["KEY"].
  // The trailing `]\s*` form covers `…)["KEY"]` and `…env["KEY"]`.
  /\[\s*"([A-Z][A-Z0-9_]+)"\s*\]/g,
  /getEnvVar\(\s*"([A-Z][A-Z0-9_]+)"\s*\)/g,
];
const used = new Set();
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const pat of PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const name = m[1];
      if (!RUNTIME_ONLY.has(name)) used.add(name);
    }
  }
}

const envText = readFileSync(ENV_FILE, "utf8");
const documented = new Set();
for (const line of envText.split("\n")) {
  const m = line.match(/^#?\s*([A-Z][A-Z0-9_]+)=/);
  if (m) documented.add(m[1]);
}

const missing = [...used].filter((k) => !documented.has(k)).sort();
const orphan = [...documented].filter((k) => !used.has(k)).sort();

if (missing.length === 0 && orphan.length === 0) {
  console.log(`env-example: in sync (${used.size} keys documented)`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error(
    `env-example: MISSING from .env.example — add documentation for these keys:`,
  );
  for (const k of missing) console.error(`  - ${k}`);
}
if (orphan.length > 0) {
  console.error(
    `env-example: ORPHAN in .env.example — no longer read by src/, remove or move to runtime-only allowlist:`,
  );
  for (const k of orphan) console.error(`  - ${k}`);
}
process.exit(1);
