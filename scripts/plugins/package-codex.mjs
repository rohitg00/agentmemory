import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = join(root, "plugin");
const output = join(root, "dist/plugins");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const sourceManifest = JSON.parse(readFileSync(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
if (sourceManifest.version !== pkg.version) throw new Error("Plugin and runtime versions must match before packaging.");
if (!existsSync(join(plugin, "scripts/plugin-bridge.mjs"))) throw new Error("Run npm run build first.");

const FLAVORS = {
  local: { mcp: true, hooks: true },
  review: { mcp: true, hooks: false },
  skills: { mcp: false, hooks: false },
};

const SKILLS_README = `# Agent Memory skills for Codex

This package carries the 17 Agent Memory skills and no MCP server or lifecycle hooks, so it passes the public directory's skills-only upload path.

The skills call the \`memory_*\` tools of a running Agent Memory daemon. Install and wire it once:

\`\`\`bash
npm install -g @agentmemory/agentmemory
agentmemory
agentmemory connect codex
\`\`\`

\`connect codex\` registers the local MCP server in \`~/.codex/config.toml\`. Add \`--with-hooks\` for automatic capture (trust the hooks in Codex before expecting events). Basic keyword recall needs no model key; embeddings and model-based features are configured in \`~/.agentmemory/.env\`.

Source and documentation: https://github.com/rohitg00/agentmemory
`;

mkdirSync(output, { recursive: true });
const artifacts = [];
for (const [flavor, { mcp, hooks }] of Object.entries(FLAVORS)) {
  const name = `agentmemory-codex-${flavor}`;
  const destination = join(output, name);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(join(destination, ".codex-plugin"), { recursive: true });
  const manifest = structuredClone(sourceManifest);
  if (!hooks) {
    delete manifest.hooks;
    manifest.description = manifest.description.replace(/ Optional capture through .*$/, "");
  }
  if (mcp) {
    manifest.mcpServers = "./.mcp.json";
    if (!hooks) {
      manifest.interface.longDescription = manifest.interface.longDescription.replace("Automatic capture requires trusted, supported hooks.", "This review package contains no lifecycle hooks; capture must be configured separately.");
    }
    mkdirSync(join(destination, "scripts"));
    cpSync(join(plugin, ".mcp.codex.json"), join(destination, ".mcp.json"));
    cpSync(join(plugin, "scripts/plugin-bridge.mjs"), join(destination, "scripts/plugin-bridge.mjs"));
    cpSync(join(root, "docs/plugins/codex-local.md"), join(destination, "README.md"));
  } else {
    delete manifest.mcpServers;
    manifest.description = manifest.description.replace("through 54 MCP tools and 17 skills.", "through 17 skills that use the MCP tools of your own Agent Memory daemon.");
    manifest.interface.longDescription = manifest.interface.longDescription.replace("Automatic capture requires trusted, supported hooks.", "This package contains the skills only. Install the Agent Memory daemon and wire its MCP server with `agentmemory connect codex` so the skills can call the memory tools.");
    writeFileSync(join(destination, "README.md"), SKILLS_README);
  }
  writeFileSync(join(destination, ".codex-plugin/plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const directory of ["skills", "assets"]) {
    cpSync(join(plugin, directory), join(destination, directory), { recursive: true });
  }
  const agentsSkill = join(destination, "skills/agentmemory-agents/SKILL.md");
  writeFileSync(agentsSkill, readFileSync(agentsSkill, "utf8").replace("If unknown, default to `claude-code`.", "If unknown, default to `codex`."));
  cpSync(join(root, "LICENSE"), join(destination, "LICENSE"));
  if (hooks) {
    mkdirSync(join(destination, "hooks"));
    cpSync(join(plugin, "hooks/hooks.codex.json"), join(destination, "hooks/hooks.codex.json"));
    const hookManifest = readFileSync(join(plugin, "hooks/hooks.codex.json"), "utf8");
    cpSync(join(plugin, "scripts/_capture.mjs"), join(destination, "scripts/_capture.mjs"));
    for (const script of new Set([...hookManifest.matchAll(/scripts\/([\w-]+\.mjs)/g)].map((m) => m[1]))) {
      cpSync(join(plugin, "scripts", script), join(destination, "scripts", script));
    }
  }
  const archive = join(output, `${name}-${pkg.version}.zip`);
  rmSync(archive, { force: true });
  // Include dotfiles at the archive root; do not include other hosts' manifests.
  execFileSync("zip", ["-q", "-r", archive, ...readdirSync(destination).sort()], { cwd: destination });
  artifacts.push({ name, archive: archive.slice(output.length + 1), sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") });
}
let revision = "unknown";
try { revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
writeFileSync(join(output, "build-info.json"), JSON.stringify({ version: pkg.version, baseRevision: revision, artifacts }, null, 2) + "\n");
mkdirSync(join(output, ".agents/plugins"), { recursive: true });
writeFileSync(join(output, ".agents/plugins/marketplace.json"), JSON.stringify({
  name: "agentmemory-local-preview",
  interface: { displayName: "Agent Memory Local Preview" },
  plugins: [{ name: "agentmemory", source: { source: "local", path: "./agentmemory-codex-local" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Developer Tools" }],
}, null, 2) + "\n");
console.log(`Built ${artifacts.map((a) => a.archive).join(", ")} in ${output}`);
console.log("The review archive excludes hooks but still uses local stdio MCP, which the public directory accepts only with OpenAI local-MCP support. The skills archive has no MCP server or hooks and fits the skills-only upload path.");
