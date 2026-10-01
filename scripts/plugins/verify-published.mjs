import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

export function publishedCompatibilityErrors(local, publishedCore, publishedShim) {
  const errors = [];
  if (publishedCore.version !== local.version) errors.push("The published runtime version does not match the plugin.");
  for (const dependency of ["iii-sdk", "@iii-dev/helpers"]) {
    if (publishedCore.dependencies?.[dependency] !== local.dependencies[dependency]) {
      errors.push(`Published ${dependency} must match source (${local.dependencies[dependency]}).`);
    }
  }
  if (publishedShim.version !== local.version) errors.push("The published MCP shim version does not match the plugin.");
  if (publishedShim.dependencies?.["@agentmemory/agentmemory"] !== local.version) {
    errors.push("The published MCP shim must pin the exact matching runtime version.");
  }
  return errors;
}

export function verifyPublished() {
  const local = read("package.json");
  for (const path of ["plugin/.codex-plugin/plugin.json", "plugin/.claude-plugin/plugin.json", "plugin/plugin.json", "packages/mcp/package.json"]) {
    if (read(path).version !== local.version) throw new Error(`${path} must match runtime version ${local.version}.`);
  }
  const lookup = (name) => {
    try {
      return JSON.parse(execFileSync("npm", ["view", `${name}@${local.version}`, "version", "dependencies", "--json", "--registry=https://registry.npmjs.org"], {
        encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"],
      }));
    } catch {
      throw new Error(`Cannot verify ${name}@${local.version} on npm. Publish the matching runtime and shim through the release workflow, then retry.`);
    }
  };
  const errors = publishedCompatibilityErrors(local, lookup("@agentmemory/agentmemory"), lookup("@agentmemory/mcp"));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Published runtime and MCP shim match plugin ${local.version} and iii ${local.dependencies["iii-sdk"]}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { verifyPublished(); } catch (error) {
    console.error(`Plugin distribution is not ready:\n${error.message}`);
    process.exitCode = 1;
  }
}
