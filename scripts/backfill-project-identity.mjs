#!/usr/bin/env node
// One-time backfill: consolidate fragmented `project` tags in an agentmemory
// store onto a single canonical identity (e.g. the git-remote id produced by
// AGENTMEMORY_PROJECT_FROM_REMOTE — "github.com/org/repo").
//
// Why this exists: project identity was historically the git-toplevel basename
// (and, in older versions, the full cwd path). The same repo checked out under
// different paths/machines therefore fragments across several `project` values.
// Observations are never lost (recall is global), but project-scoped surfaces —
// session lists, the rolling project profile, and session-start auto-context —
// silo. This re-tags the legacy rows so those surfaces unify too. See issue #733.
//
// Operates on the JSON "standalone" store (the default backend at
// ~/.agentmemory/standalone.json). Run it ON THE MACHINE/STORE that holds the
// fragmented data (typically the server).
//
// Usage:
//   node scripts/backfill-project-identity.mjs --canonical github.com/devon3000/chessboard \
//        --match '(^|/)chessboard$' [--store /path/to/standalone.json] [--apply]
//
//   --canonical <id>   Target identity all matched values collapse onto. (required)
//   --match <regex>    JS regex; any `project` value matching it is re-tagged. Repeatable.
//   --map old=new      Explicit value mapping. Repeatable. Takes priority over --match.
//   --store <path>     Store file. Default: $AGENTMEMORY_DATA/standalone.json or ~/.agentmemory/standalone.json
//   --apply            Write changes. Without it, runs dry (default) and only reports.
//
// Safety: dry-run by default; --apply writes a timestamped .bak beside the store first.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// --- scopes that carry a `.project` value field on each entry ---
const VALUE_SCOPES = ["mem:sessions", "mem:summaries", "mem:memories", "mem:lessons", "mem:actions"];
// --- scope keyed BY the project string (the KEY is the project) ---
const PROFILE_SCOPE = "mem:profiles";

function parseArgs(argv) {
  const out = { match: [], map: new Map(), apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--canonical") out.canonical = argv[++i];
    else if (a === "--store") out.store = argv[++i];
    else if (a === "--match") out.match.push(new RegExp(argv[++i]));
    else if (a === "--map") {
      const eq = argv[++i] ?? "";
      const idx = eq.indexOf("=");
      if (idx === -1) fail(`--map expects old=new, got "${eq}"`);
      out.map.set(eq.slice(0, idx), eq.slice(idx + 1));
    } else fail(`unknown arg: ${a}`);
  }
  return out;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  const dataDir = process.env.AGENTMEMORY_DATA || join(homedir(), ".agentmemory");
  return join(dataDir, "standalone.json");
}

// Map one project value -> canonical, or null if it should stay as-is.
// Explicit --map wins; otherwise --match regexes; the canonical value itself
// always maps to itself (no-op) so it's never reported as "changed".
function targetFor(value, args) {
  if (value === args.canonical) return null;
  if (args.map.has(value)) return args.map.get(value);
  if (args.match.some((re) => re.test(value))) return args.canonical;
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.canonical) fail("--canonical <id> is required");
  if (args.match.length === 0 && args.map.size === 0)
    fail("provide at least one --match <regex> or --map old=new");

  const storePath = resolveStorePath(args.store);
  if (!existsSync(storePath)) fail(`store not found: ${storePath}`);

  const store = JSON.parse(readFileSync(storePath, "utf8"));

  // 1) Pre-flight tally so the operator sees every distinct project value.
  const tally = {};
  const bump = (v) => { const k = v ?? "(none)"; tally[k] = (tally[k] || 0) + 1; };
  for (const scope of VALUE_SCOPES) {
    const map = store[scope];
    if (!map || typeof map !== "object") continue;
    for (const k of Object.keys(map)) bump(map[k]?.project);
  }
  const profiles = store[PROFILE_SCOPE] && typeof store[PROFILE_SCOPE] === "object" ? store[PROFILE_SCOPE] : {};
  const profileKeys = Object.keys(profiles);

  console.log(`store:      ${storePath}`);
  console.log(`canonical:  ${args.canonical}`);
  console.log(`mode:       ${args.apply ? "APPLY" : "dry-run (no writes)"}\n`);
  console.log("current project values (across sessions/summaries/memories/lessons/actions):");
  for (const [v, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    const dst = v === "(none)" ? null : targetFor(v, args);
    console.log(`  ${String(n).padStart(5)}  ${v}${dst ? `  ->  ${dst}` : ""}`);
  }
  console.log(`\nprofiles (${profileKeys.length}): keyed by project string`);
  for (const k of profileKeys) {
    const dst = targetFor(k, args);
    console.log(`  ${k}${dst ? `  ->  ${dst}` : ""}`);
  }

  // 2) Apply value-field rewrites.
  const changes = { ...Object.fromEntries(VALUE_SCOPES.map((s) => [s, 0])), profilesMoved: 0, profilesMerged: 0 };
  for (const scope of VALUE_SCOPES) {
    const map = store[scope];
    if (!map || typeof map !== "object") continue;
    for (const k of Object.keys(map)) {
      const entry = map[k];
      if (!entry || typeof entry !== "object") continue;
      const dst = entry.project == null ? null : targetFor(entry.project, args);
      if (dst) { entry.project = dst; changes[scope]++; }
    }
  }

  // 3) Profiles: rename key old -> canonical. If canonical already exists,
  //    keep whichever has the later updatedAt/generatedAt and drop the other.
  const ts = (p) => new Date(p?.updatedAt || p?.generatedAt || p?.createdAt || 0).getTime();
  for (const k of profileKeys) {
    const dst = targetFor(k, args);
    if (!dst || dst === k) continue;
    if (profiles[dst]) {
      const winner = ts(profiles[k]) > ts(profiles[dst]) ? profiles[k] : profiles[dst];
      profiles[dst] = winner;
      delete profiles[k];
      changes.profilesMerged++;
    } else {
      profiles[dst] = profiles[k];
      delete profiles[k];
      changes.profilesMoved++;
    }
  }

  console.log("\nplanned changes:");
  for (const scope of VALUE_SCOPES) console.log(`  ${scope}: ${changes[scope]} re-tagged`);
  console.log(`  ${PROFILE_SCOPE}: ${changes.profilesMoved} moved, ${changes.profilesMerged} merged`);

  const total = VALUE_SCOPES.reduce((n, s) => n + changes[s], 0) + changes.profilesMoved + changes.profilesMerged;
  if (total === 0) { console.log("\nnothing to do."); return; }

  if (!args.apply) {
    console.log("\ndry-run only — re-run with --apply to write (a .bak is created first).");
    return;
  }

  const bak = `${storePath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(storePath, bak);
  writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(`\napplied. backup: ${bak}`);
  console.log("note: BM25/vector indexes are unaffected (project isn't indexed); profiles regenerate on the next session.");
}

main();
