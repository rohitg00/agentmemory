#!/usr/bin/env node
// dsh-install.cjs — wire agentmemory into DeepSeek Harness
//   L1: append the mcp-agentmemory MCP bridge to cordis.patch.yml (HMR hot-reload)
//   L2: memory guideline in ~/.dsh/AGENTS.md + agentmemory-sync skill
//   L3: declare @agentmemory/dsh file: dep in the profile package.json + patch entry + pnpm install
// Usage: node scripts/dsh-install.cjs [--dry-run] [--no-plugin]
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const WITH_PLUGIN = !args.includes("--no-plugin");

const repoDir = path.resolve(__dirname, "..");
const pluginDir = path.join(repoDir, "plugin", "dsh");
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profile = process.env.DSH_PROFILE || "web";
const patch = path.join(dshHome, "profiles", profile, "cordis.patch.yml");
const agentsFile = path.join(dshHome, "AGENTS.md");
const skillDir = path.join(dshHome, "skills", "agentmemory-sync");
const profilePkg = path.join(dshHome, "profiles", profile, "package.json");
const url = process.env.AGENTMEMORY_URL || "http://localhost:3111";

const L1 = [
  "",
  "# ── agentmemory L1: MCP bridge (applied by dsh-install.cjs) ──",
  "- insert:",
  "    - id: mcp-agentmemory",
  "      name: '@deepseek-ai/dsh-mcp-client'",
  "      config:",
  "        transport: stdio",
  "        serverName: agentmemory",
  "        command: npx",
  "        args: ['--cache', '/tmp/npmcache-dsh', '-y', '@agentmemory/mcp']",
  "        env:",
  // single-quote the URL in YAML and double any embedded single quotes
  "          AGENTMEMORY_URL: '" + String(url).replace(/'/g, "''") + "'",
  "        toolCallTimeoutMs: 60000",
  "        failOnStartupError: false",
  "",
].join("\n");

const AGENTS_MD = [
  "<!-- agentmemory:start -->",
  fs.readFileSync(path.join(pluginDir, "install", "AGENTS.md"), "utf8").trimEnd(),
  "<!-- agentmemory:end -->",
].join("\n");

const SKILL_MD = fs.readFileSync(path.join(pluginDir, "install", "skills", "agentmemory-sync", "SKILL.md"), "utf8");

function step(msg) { console.log("\n==> " + msg); }

if (DRY_RUN) {
  step("DRY-RUN: the following would happen");
  console.log("  1. append mcp-agentmemory MCP bridge entry -> " + patch);
  console.log("  2. write memory guideline -> " + agentsFile);
  console.log("  3. write agentmemory-sync skill -> " + path.join(skillDir, "SKILL.md"));
  if (WITH_PLUGIN) {
    console.log("  4. declare @agentmemory/dsh -> " + profilePkg);
    console.log("  5. append plugin entry -> " + patch + " (restart dsh to load)");
  }
  console.log("  Prerequisite: agentmemory daemon running, " + url + "/agentmemory/health returns 200");
  process.exit(0);
}

step("0/4 prerequisite check: agentmemory daemon");
{
  const res = spawnSync("curl", ["-sf", "-m", "3", url + "/agentmemory/health"], { encoding: "utf8" });
  if (res.error) {
    // spawnSync does not throw on ENOENT: res.error distinguishes "curl
    // missing" from "daemon unreachable".
    console.log("  warning: cannot probe daemon (curl unavailable: " + res.error.message + ")");
  } else if (res.status !== 0) {
    console.log("  warning: daemon not responding at " + url + " — the MCP shim will fall back to local mode. Start the daemon first (npx @agentmemory/agentmemory)");
  } else {
    console.log("  ok: daemon online");
  }
}

step("1/4 MCP bridge -> " + patch);
fs.mkdirSync(path.dirname(patch), { recursive: true });
if (fs.existsSync(patch) && fs.readFileSync(patch, "utf8").includes("mcp-agentmemory")) {
  console.log("  already present (skipped)");
} else {
  const cur = fs.existsSync(patch) ? fs.readFileSync(patch, "utf8") : "";
  const sep = cur.length === 0 || cur.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(patch, cur + sep + L1, "utf8");
  console.log("  appended (HMR hot-reload, no restart needed)");
}

step("2/4 global guideline -> " + agentsFile);
fs.mkdirSync(dshHome, { recursive: true });
if (fs.existsSync(agentsFile) && fs.readFileSync(agentsFile, "utf8").includes("agentmemory:start")) {
  console.log("  already present (skipped)");
} else {
  const cur = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, "utf8") : "";
  const sep = cur.length === 0 || cur.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(agentsFile, cur + sep + "\n" + AGENTS_MD + "\n", "utf8");
  console.log("  written (dsh-agent-instructions injects it into every session)");
}

step("3/4 memory skill -> " + skillDir);
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_MD, "utf8");
console.log("  written (dsh-skill-filesystem scans <dshHome>/skills)");

if (WITH_PLUGIN) {
  step("4/4 plugin @agentmemory/dsh -> " + profilePkg);
  if (!fs.existsSync(profilePkg)) {
    console.error("  error: " + profilePkg + " not found (profile '" + profile + "' missing? use DSH_PROFILE=<profile>)");
    process.exit(1);
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(profilePkg, "utf8"));
  } catch (err) {
    console.error("  error: " + profilePkg + " is not valid JSON (" + err.message + ") — fix it first");
    process.exit(1);
  }
  const depKey = "@agentmemory/dsh";
  if (pkg.dependencies && pkg.dependencies[depKey]) {
    console.log("  dependency already declared (skipped)");
  } else {
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies[depKey] = "file:" + pluginDir;
    fs.writeFileSync(profilePkg, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    console.log("  package.json now declares file:" + pluginDir);
  }
  const cur = fs.readFileSync(patch, "utf8");
  if (cur.includes("id: agentmemory") && cur.includes("@agentmemory/dsh")) {
    console.log("  plugin entry already present (skipped)");
  } else {
    const L3 = [
      "",
      "# ── agentmemory L3: cordis plugin (applied by dsh-install.cjs) ──",
      "- insert:",
      "    - id: agentmemory",
      "      name: '@agentmemory/dsh'",
      "      config:",
      "        url: '" + String(url).replace(/'/g, "''") + "'",
      "        agentId: dsh",
      "",
    ].join("\n");
    const sep = cur.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(patch, cur + sep + L3, "utf8");
    console.log("  plugin entry appended");
  }
  console.log("");
  console.log("  Next: cd " + path.join(dshHome, "profiles", profile) + " && pnpm install");
  console.log("  then restart dsh (plugin code needs a process restart; config changes hot-reload)");
} else {
  step("4/4 skipping plugin (--no-plugin)");
}

step("Done. Verify: open a new dsh session — the tool list should include mcp__agentmemory__*");
