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

mkdirSync(output, { recursive: true });
const artifacts = [];
for (const flavor of ["local", "review"]) {
  const name = `agentmemory-codex-${flavor}`;
  const destination = join(output, name);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(join(destination, ".codex-plugin"), { recursive: true });
  mkdirSync(join(destination, "scripts"));
  const manifest = structuredClone(sourceManifest);
  manifest.mcpServers = "./.mcp.json";
  if (flavor === "review") {
    delete manifest.hooks;
    manifest.description = manifest.description.replace(/ Optional capture through .*$/, "");
    manifest.interface.longDescription = manifest.interface.longDescription.replace("Automatic capture requires trusted, supported hooks.", "This review package contains no lifecycle hooks; capture must be configured separately.");
  }
  writeFileSync(join(destination, ".codex-plugin/plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
  cpSync(join(plugin, ".mcp.codex.json"), join(destination, ".mcp.json"));
  cpSync(join(plugin, "scripts/plugin-bridge.mjs"), join(destination, "scripts/plugin-bridge.mjs"));
  for (const directory of ["skills", "assets"]) {
    cpSync(join(plugin, directory), join(destination, directory), { recursive: true });
  }
  cpSync(join(root, "LICENSE"), join(destination, "LICENSE"));
  cpSync(join(root, "docs/plugins/codex-local.md"), join(destination, "README.md"));
  if (flavor === "local") {
    mkdirSync(join(destination, "hooks"));
    cpSync(join(plugin, "hooks/hooks.codex.json"), join(destination, "hooks/hooks.codex.json"));
    const hooks = readFileSync(join(plugin, "hooks/hooks.codex.json"), "utf8");
    cpSync(join(plugin, "scripts/_capture.mjs"), join(destination, "scripts/_capture.mjs"));
    for (const script of new Set([...hooks.matchAll(/scripts\/([\w-]+\.mjs)/g)].map((m) => m[1]))) {
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
console.log(`Built ${artifacts.map((a) => a.archive).join(" and ")} in ${output}`);
console.log("The review archive excludes hooks but still uses local stdio MCP. Public submission requires OpenAI local-MCP eligibility confirmation.");
