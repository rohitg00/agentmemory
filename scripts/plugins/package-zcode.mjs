import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "plugin");
const output = process.env.AGENTMEMORY_PLUGIN_OUT_DIR
  ? resolve(process.env.AGENTMEMORY_PLUGIN_OUT_DIR)
  : join(root, "dist/plugins");
const destination = join(output, "agentmemory-zcode");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const original = JSON.parse(readFileSync(join(source, ".claude-plugin/plugin.json"), "utf8"));
if (original.version !== pkg.version) throw new Error("Plugin and runtime versions must match before packaging.");
if (!existsSync(join(source, "scripts/plugin-bridge.mjs"))) throw new Error("Run npm run build first.");
const hooks = readFileSync(join(source, "hooks/hooks.zcode.json"), "utf8");

rmSync(destination, { recursive: true, force: true });
for (const directory of [".zcode-plugin", "hooks", "scripts"]) {
  mkdirSync(join(destination, directory), { recursive: true });
}
const manifest = {
  name: original.name,
  version: pkg.version,
  description: "Persistent local memory for ZCode through six supported hooks, MCP tools and skills.",
  author: original.author,
  license: original.license,
  homepage: original.homepage,
  repository: original.repository,
  skills: ["./skills/"],
};
writeFileSync(join(destination, ".zcode-plugin/plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
// ZCode always reads this conventional file, even with manifest.hooks set.
// Ship only the tailored file here so the generic twelve hooks cannot merge in.
writeFileSync(join(destination, "hooks/hooks.json"), hooks);
writeFileSync(join(destination, ".mcp.json"), JSON.stringify({
  mcpServers: { agentmemory: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/plugin-bridge.mjs"] } },
}, null, 2) + "\n");
cpSync(join(source, "scripts/plugin-bridge.mjs"), join(destination, "scripts/plugin-bridge.mjs"));
cpSync(join(source, "scripts/_capture.mjs"), join(destination, "scripts/_capture.mjs"));
for (const name of new Set([...hooks.matchAll(/scripts\/([\w-]+\.mjs)/g)].map(match => match[1]))) {
  cpSync(join(source, "scripts", name), join(destination, "scripts", name));
}
cpSync(join(source, "skills"), join(destination, "skills"), { recursive: true });
cpSync(join(root, "LICENSE"), join(destination, "LICENSE"));
cpSync(join(root, "docs/plugins/zcode-local.md"), join(destination, "README.md"));
console.log(`Built ZCode plugin directory in ${destination}`);
