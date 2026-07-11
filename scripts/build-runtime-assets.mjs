import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const assets = [
  ["iii-config.yaml", "iii-config.yaml"],
  ["iii-config.docker.yaml", "iii-config.docker.yaml"],
  ["docker-compose.yml", "docker-compose.yml"],
  [".env.example", ".env.example"],
  ["src/viewer/index.html", "viewer/index.html"],
  ["src/viewer/favicon.svg", "viewer/favicon.svg"],
];

async function copyIfPresent(sourceRelative, destinationRelative) {
  const source = join(root, sourceRelative);
  try {
    await stat(source);
  } catch {
    return;
  }
  const destination = join(dist, destinationRelative);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: true, recursive: true });
}

async function sourceCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function sourceDirty() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: root });
    return stdout.trim().length > 0;
  } catch {
    return null;
  }
}

async function hashRuntimeFiles() {
  const hash = createHash("sha256");
  const files = ["index.mjs", "cli.mjs", "iii-config.yaml", "viewer/index.html"];
  for (const file of files) {
    const path = join(dist, file);
    try {
      const content = await readFile(path);
      hash.update(relative(dist, path));
      hash.update(content);
    } catch {
      hash.update(`missing:${basename(path)}`);
    }
  }
  return hash.digest("hex");
}

for (const [source, destination] of assets) {
  await copyIfPresent(source, destination);
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const buildInfo = {
  version: packageJson.version,
  sourceCommit: await sourceCommit(),
  sourceDirty: await sourceDirty(),
  builtAt: new Date().toISOString(),
  artifactHash: await hashRuntimeFiles(),
};
await writeFile(join(dist, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
